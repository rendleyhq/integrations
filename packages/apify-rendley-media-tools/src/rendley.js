// ../rendley-client/src/rendley.ts
var DEFAULT_API_BASE = "https://api.rendley.com/v1";
var DEFAULT_TIMEOUT_MS = 3e4;
var TERMINAL_STATUSES = /* @__PURE__ */ new Set([
  "completed",
  "failed",
  "canceled",
  "cancelled"
]);
var RendleyError = class extends Error {
  code;
  status;
  details;
  constructor(message, options) {
    super(message);
    this.name = "RendleyError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
};
var HINTS = {
  401: {
    code: "UNAUTHORIZED",
    message: "Rendley rejected the API key. Check the key in your connection (create one at app.rendley.com/settings)."
  },
  402: {
    code: "PAYMENT_REQUIRED",
    message: "This operation needs Rendley credits. Add credits at app.rendley.com and try again."
  },
  403: { code: "FORBIDDEN", message: "The API key does not have access to this resource." },
  404: { code: "NOT_FOUND", message: "The requested Rendley resource was not found." },
  429: { code: "RATE_LIMITED", message: "Rendley is rate limiting requests. Wait a moment and retry." }
};
function errorFromResponse(status, body) {
  const apiError = body && typeof body === "object" && "error" in body ? body.error : void 0;
  const hint = HINTS[status];
  const code = apiError?.code || hint?.code || "HTTP_ERROR";
  const message = status === 402 ? `${hint.message} (${apiError?.message ?? "HTTP 402"})` : apiError?.message || hint?.message || `Rendley request failed (HTTP ${status}).`;
  return new RendleyError(message, { code, status, details: body });
}
var RendleyClient = class {
  apiKey;
  baseUrl;
  timeoutMs;
  fetchImpl;
  constructor(options) {
    if (!options.apiKey) {
      throw new RendleyError("A Rendley API key is required.", { code: "MISSING_API_KEY" });
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.apiBaseUrl || DEFAULT_API_BASE).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }
  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------
  /** Authenticated request; unwraps the `{ data }` envelope. */
  async request(method, path, body) {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    let res;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: body === void 0 ? void 0 : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new RendleyError(`Rendley did not answer within ${this.timeoutMs} ms.`, {
          code: "TIMEOUT"
        });
      }
      throw new RendleyError(
        `Could not reach Rendley at ${url}: ${err instanceof Error ? err.message : String(err)}`,
        { code: "NETWORK_ERROR", details: err }
      );
    }
    const text = await res.text();
    const json = text ? safeJsonParse(text) : void 0;
    if (!res.ok) {
      throw errorFromResponse(res.status, json);
    }
    if (json && typeof json === "object" && !Array.isArray(json) && "data" in json) {
      return json.data;
    }
    return json;
  }
  // ---------------------------------------------------------------------------
  // Workspaces and projects
  // ---------------------------------------------------------------------------
  listWorkspaces() {
    return this.request("GET", "/workspaces");
  }
  /** The account's first workspace, for calls that may leave it unspecified. */
  async defaultWorkspaceId() {
    const workspaces = await this.listWorkspaces();
    const first = workspaces?.[0]?.id;
    if (!first) {
      throw new RendleyError("No workspace found for this API key. Create one at app.rendley.com.", {
        code: "NO_WORKSPACE"
      });
    }
    return first;
  }
  async listProjects(workspaceId) {
    const id = workspaceId || await this.defaultWorkspaceId();
    const projects = await this.request(
      "GET",
      `/projects?workspace_id=${encodeURIComponent(id)}`
    );
    return Array.isArray(projects) ? projects : [];
  }
  getProject(projectId) {
    return this.request("GET", `/projects/${encodeURIComponent(projectId)}`);
  }
  async createProject(input) {
    const workspaceId = input.workspaceId || await this.defaultWorkspaceId();
    return this.request("POST", "/projects", {
      name: input.name,
      workspace_id: workspaceId,
      ...input.templateId ? { template_id: input.templateId } : {}
    });
  }
  async deleteProject(projectId) {
    await this.request("DELETE", `/projects/${encodeURIComponent(projectId)}`);
  }
  // ---------------------------------------------------------------------------
  // Jobs (AI actions and exports)
  // ---------------------------------------------------------------------------
  getJob(jobId) {
    return this.request("GET", `/jobs/${encodeURIComponent(jobId)}`);
  }
  /** Jobs created with this API key, newest first. `type` filters by job type. */
  async listJobs(filters = {}) {
    const params = new URLSearchParams({ source_type: "api" });
    if (filters.projectId) params.set("project_id", filters.projectId);
    if (filters.type) params.set("job_type", filters.type);
    const jobs = await this.request("GET", `/jobs?${params.toString()}`);
    return Array.isArray(jobs) ? jobs : [];
  }
  cancelJob(jobId) {
    return this.request("DELETE", `/jobs/${encodeURIComponent(jobId)}`);
  }
  waitForJob(jobId, opts = {}) {
    return pollUntilTerminal(() => this.getJob(jobId), (job) => job.status, opts);
  }
  /**
   * Poll for at most `budgetMs`, then hand back whatever state the job is in.
   * For runtimes with a hard step timeout (Zapier), where waiting forever is
   * not an option.
   */
  async waitForJobBounded(jobId, budgetMs, pollIntervalMs = 2e3) {
    const deadline = Date.now() + budgetMs;
    for (; ; ) {
      const job = await this.getJob(jobId);
      if (TERMINAL_STATUSES.has(job.status)) return { job, done: true };
      if (Date.now() + pollIntervalMs > deadline) return { job, done: false };
      await sleep(pollIntervalMs);
    }
  }
  // ---------------------------------------------------------------------------
  // AI actions
  // ---------------------------------------------------------------------------
  /**
   * Enqueue `POST /ai/{action}`. File inputs go in `params.media` (a public URL,
   * a media ID or a file hash of an upload in the project); lipsync uses
   * `params.video_media` and `params.audio_media`.
   */
  async runAiAction(action, input) {
    const data = await this.request(
      "POST",
      `/ai/${encodeURIComponent(action)}`,
      aiBody(input)
    );
    const jobId = typeof data === "string" ? data : data?.job_id ?? data?.id ?? "";
    if (!jobId) {
      throw new RendleyError(`Rendley did not return a job ID for "${action}".`, {
        code: "NO_JOB_ID",
        details: data
      });
    }
    return { jobId };
  }
  /** Credit price of an AI action without running it. */
  async estimateAiActionCost(action, input) {
    const data = await this.request(
      "POST",
      `/ai/${encodeURIComponent(action)}/cost`,
      aiBody(input)
    );
    return typeof data === "number" ? data : data?.credits ?? 0;
  }
  listAiTools() {
    return this.request("GET", "/ai/tools");
  }
  /** Models offered for one action. The catalog spells actions with underscores. */
  async listModels(action) {
    const tools = await this.listAiTools();
    const tool = (tools || []).find((t) => t.action === action.replace(/-/g, "_"));
    return tool?.models ?? [];
  }
  async listTtsVoices(options = {}) {
    const params = new URLSearchParams();
    if (options.page !== void 0) params.set("page", String(options.page));
    if (options.limit !== void 0) params.set("limit", String(options.limit));
    const q = params.toString();
    const voices = await this.request("GET", `/ai/text-to-speech/voices${q ? `?${q}` : ""}`);
    return Array.isArray(voices) ? voices : [];
  }
  async listTranslateLanguages() {
    const languages = await this.request("GET", "/ai/video-translate/languages");
    return Array.isArray(languages) ? languages : [];
  }
  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  async createExport(input) {
    if (!input.projectId && !input.project) {
      throw new RendleyError("An export needs a project ID or an inline project.", {
        code: "INVALID_INPUT"
      });
    }
    const data = await this.request("POST", "/export", {
      ...input.projectId ? { project_id: input.projectId } : {},
      ...input.project ? { project: input.project } : {},
      ...input.settings && Object.keys(input.settings).length ? { settings: input.settings } : {}
    });
    return { jobId: data.job_id };
  }
  async estimateExportCost(input) {
    const data = await this.request("POST", "/export/cost", {
      ...input.projectId ? { project_id: input.projectId } : {},
      ...input.project ? { project: input.project } : {},
      ...input.settings && Object.keys(input.settings).length ? { settings: input.settings } : {}
    });
    return typeof data === "number" ? data : data?.credits ?? 0;
  }
  // ---------------------------------------------------------------------------
  // Agent
  // ---------------------------------------------------------------------------
  /** Start an agent run. Omit `projectId` to let Rendley create the project. */
  startAgentJob(input) {
    if (!input.prompt?.trim()) {
      throw new RendleyError("A prompt is required.", { code: "INVALID_INPUT" });
    }
    return this.request("POST", "/agent", {
      prompt: input.prompt,
      ...input.projectId ? { project_id: input.projectId } : {},
      ...input.threadId ? { thread_id: input.threadId } : {},
      ...input.files?.length ? { files: input.files } : {}
    });
  }
  getAgentJob(jobId) {
    return this.request("GET", `/agent/jobs/${encodeURIComponent(jobId)}`);
  }
  cancelAgentJob(jobId) {
    return this.request("POST", `/agent/jobs/${encodeURIComponent(jobId)}/cancel`);
  }
  waitForAgentJob(jobId, opts = {}) {
    return pollUntilTerminal(
      () => this.getAgentJob(jobId),
      (job) => {
        if (job.status === "waiting_input") {
          throw new RendleyError(
            `The Rendley agent paused to ask a question${job.interrupt?.summary ? `: ${job.interrupt.summary}` : ""}. Rephrase the prompt so the agent does not need to ask, or answer it in the Rendley app.`,
            { code: "AGENT_WAITING_INPUT", details: job }
          );
        }
        return job.status;
      },
      opts
    );
  }
  async waitForAgentJobBounded(jobId, budgetMs, pollIntervalMs = 2e3) {
    const deadline = Date.now() + budgetMs;
    for (; ; ) {
      const job = await this.getAgentJob(jobId);
      if (TERMINAL_STATUSES.has(job.status) || job.status === "waiting_input") return { job, done: true };
      if (Date.now() + pollIntervalMs > deadline) return { job, done: false };
      await sleep(pollIntervalMs);
    }
  }
  // ---------------------------------------------------------------------------
  // Media
  // ---------------------------------------------------------------------------
  /** Rendley fetches the file itself; no size limit through the integration. */
  importUpload(projectId, input) {
    return this.request("POST", `/projects/${encodeURIComponent(projectId)}/uploads/import`, {
      download_url: input.downloadUrl,
      ...input.fileName ? { file_name: input.fileName } : {},
      ...input.mimeType ? { mime_type: input.mimeType } : {},
      // The editor's hash sync deletes `library` rows the project JSON does not reference.
      role: "pending"
    });
  }
  /**
   * Imports a public URL into the project through the API (Rendley fetches
   * it) and returns it as an agent attachment. This is how files reach the
   * agent reliably: the upload is complete before the agent starts.
   */
  async importAttachment(projectId, url, name) {
    const upload = await this.importUpload(projectId, { downloadUrl: url, fileName: name || fileNameFromUrl(url) });
    return {
      media_id: upload.media_id,
      storage_url: upload.storage_url,
      name: upload.original_file_name ?? name ?? fileNameFromUrl(url),
      file_hash: upload.file_hash
    };
  }
  async listUploads(projectId) {
    const uploads = await this.request(
      "GET",
      `/projects/${encodeURIComponent(projectId)}/uploads`
    );
    return Array.isArray(uploads) ? uploads : [];
  }
  /** Resolve a media ID or file hash to a fresh signed download URL. */
  async getMediaUrl(projectId, ref) {
    const base = `/projects/${encodeURIComponent(projectId)}/uploads`;
    const query = ref.mediaId ? `?media_id=${encodeURIComponent(ref.mediaId)}` : ref.fileHash ? `?hash=${encodeURIComponent(ref.fileHash)}` : "";
    if (!query) {
      throw new RendleyError("A media ID or a file hash is required.", { code: "INVALID_INPUT" });
    }
    const upload = await this.request("GET", `${base}${query}`);
    if (!upload?.storage_url) {
      throw new RendleyError(`No media found in project ${projectId} for ${ref.mediaId ?? ref.fileHash}.`, {
        code: "MEDIA_NOT_FOUND"
      });
    }
    return { ...upload, media_id: upload.media_id ?? ref.mediaId ?? "" };
  }
  // ---------------------------------------------------------------------------
  // Brand kit
  // ---------------------------------------------------------------------------
  async getBrandkit(workspaceId) {
    const id = workspaceId || await this.defaultWorkspaceId();
    return this.request("GET", `/brandkit/${encodeURIComponent(id)}`);
  }
  async importBrandkitFromWebsite(workspaceId, websiteUrl) {
    const id = workspaceId || await this.defaultWorkspaceId();
    return this.request("POST", `/brandkit/${encodeURIComponent(id)}/import`, {
      website_url: websiteUrl
    });
  }
};
function aiBody(input) {
  return {
    ...input.projectId ? { project_id: input.projectId } : {},
    ...input.workspaceId ? { workspace_id: input.workspaceId } : {},
    ...input.modelId ? { model_id: input.modelId } : {},
    params: input.params ?? {}
  };
}
function parseResultData(job) {
  const raw = job?.result_data;
  if (!raw) return void 0;
  if (typeof raw === "object") return raw;
  const parsed = safeJsonParse(raw);
  return parsed && typeof parsed === "object" ? parsed : void 0;
}
function jobDownloadUrl(job) {
  if (job.output?.url) return job.output.url;
  const result = parseResultData(job);
  return typeof result?.storage_url === "string" ? result.storage_url : void 0;
}
function summarizeJob(job) {
  const result = parseResultData(job) ?? {};
  const mediaId = job.output?.media_id ?? result.media_id ?? null;
  const fileHash = job.output?.file_hash ?? result.file_hash ?? null;
  return {
    id: job.id,
    job_id: job.id,
    type: job.type,
    status: job.status,
    is_complete: TERMINAL_STATUSES.has(job.status),
    project_id: job.output?.project_id ?? job.source_id ?? null,
    error: job.error ?? null,
    media_id: mediaId,
    file_hash: fileHash,
    url: jobDownloadUrl(job) ?? null,
    url_expires_at: job.output?.url_expires_at ?? null,
    mime_type: job.output?.mime_type ?? result.mime_type ?? null,
    size: job.output?.size ?? null,
    duration: job.output?.duration ?? null,
    result_data: result
  };
}
function isTerminal(status) {
  return !!status && TERMINAL_STATUSES.has(status);
}
var POLL_MAX_TRANSIENT_FAILURES = 5;
function isTransient(err) {
  if (!(err instanceof RendleyError)) return false;
  if (err.code === "NETWORK_ERROR" || err.code === "TIMEOUT" || err.code === "RATE_LIMITED") return true;
  return typeof err.status === "number" && err.status >= 500;
}
async function pollUntilTerminal(fetchOne, getStatus, opts) {
  const pollIntervalMs = opts.pollIntervalMs ?? 3e3;
  const timeoutMs = opts.timeoutMs ?? 6e5;
  const deadline = Date.now() + timeoutMs;
  let failures = 0;
  for (; ; ) {
    let value;
    try {
      value = await fetchOne();
      failures = 0;
    } catch (err) {
      failures += 1;
      if (!isTransient(err) || failures > POLL_MAX_TRANSIENT_FAILURES || Date.now() >= deadline) throw err;
      await sleep(Math.min(pollIntervalMs * failures, 3e4));
      continue;
    }
    const status = getStatus(value);
    opts.onPoll?.(status);
    if (TERMINAL_STATUSES.has(status)) return value;
    if (Date.now() >= deadline) {
      throw new RendleyError(`Timed out after ${Math.round(timeoutMs / 1e3)} s waiting for the job (last status: ${status}).`, {
        code: "WAIT_TIMEOUT",
        details: value
      });
    }
    await sleep(pollIntervalMs);
  }
}
function fileNameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "file";
  } catch {
    return "file";
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
export {
  DEFAULT_API_BASE,
  RendleyClient,
  RendleyError,
  TERMINAL_STATUSES,
  errorFromResponse,
  fileNameFromUrl,
  isTerminal,
  jobDownloadUrl,
  parseResultData,
  sleep,
  summarizeJob
};
