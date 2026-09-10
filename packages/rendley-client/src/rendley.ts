/**
 * Minimal Rendley API client shared by the Rendley automation integrations.
 *
 * One host (`https://api.rendley.com/v1`), one credential
 * (`Authorization: Bearer <apiKey>`), every response wrapped in `{ data }`.
 * Everything that does work is asynchronous: the call returns a job id and the
 * job is polled with `getJob` (AI actions, exports) or `getAgentJob` (agent
 * runs). Rendley sends no outbound webhooks.
 */

export const DEFAULT_API_BASE = "https://api.rendley.com/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

/** Terminal states of an AI, export or agent job. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "canceled",
  "cancelled",
]);

export interface RendleyClientOptions {
  apiKey: string;
  /** Default `https://api.rendley.com/v1`. */
  apiBaseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface Workspace {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  thumbnail_url?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** A REST job (`GET /jobs/{id}`): AI actions and exports. */
export interface Job {
  id: string;
  type: string;
  status: "queued" | "processing" | "completed" | "failed" | "canceled" | string;
  input_data?: string;
  /** JSON string. Use {@link parseResultData}. */
  result_data?: string | null;
  error?: string | null;
  acknowledged?: boolean;
  source_type?: string;
  source_id?: string;
  /** Present on a completed job fetched by id: a fresh signed download URL. */
  output?: {
    media_id?: string;
    file_hash?: string;
    project_id?: string;
    mime_type?: string;
    size?: number;
    duration?: number;
    url?: string;
    url_expires_at?: string;
    expires_at?: string;
  };
}

/** An agent job (`POST /agent`, `GET /agent/jobs/{id}`). */
export interface AgentJob {
  job_id: string;
  project_id: string;
  thread_id?: string;
  status: "pending" | "running" | "waiting_input" | "completed" | "failed" | "canceled" | string;
  reason?: string;
  last_message?: string;
  error?: string;
  commands_applied?: number;
  commands_failed?: number;
  interrupt?: { id?: string; type?: string; summary?: string };
  created_at?: number;
  updated_at?: number;
}

export interface ExportSettings {
  codec?: "h264" | "vp8";
  target_resolution?: "360p" | "480p" | "720p" | "1080p" | "2K" | "4K";
  quality?: "high" | "medium" | "low";
}

export interface AiModel {
  id: string;
  name: string;
  description?: string;
  action: string;
}

export interface AiTool {
  action: string;
  description?: string;
  models: AiModel[];
}

export interface TtsVoice {
  id: string;
  name: string;
  model_id?: string;
  preview_audio_url?: string;
}

export interface TranslateLanguage {
  id: string;
  name: string;
}

/** One row of the project uploads listing. */
export interface Upload {
  storage_url: string;
  file_hash: string;
  status: string;
  mime_type?: string;
  role?: string;
  original_file_name?: string;
  duration?: number;
  media_id?: string;
}

export interface Brandkit {
  id: string;
  workspace_id: string;
  website_url?: string | null;
  onboarded?: boolean;
  [key: string]: unknown;
}

/**
 * A file handed to the agent. Attach uploads that already exist in the project
 * by `media_id` (plus `storage_url`, `name` and `file_hash`, the shape the
 * Rendley app sends); {@link RendleyClient.importAttachment} produces that
 * from a public URL. A bare `url` is accepted by the API but its ingestion by
 * the editor service is not reliable, so prefer importing first.
 */
export interface AgentFile {
  url?: string;
  media_id?: string;
  storage_url?: string;
  name?: string;
  file_hash?: string;
}

/** Target and parameters of an AI action. Omit both IDs to use the account's only workspace. */
export interface AiActionInput {
  projectId?: string;
  workspaceId?: string;
  modelId?: string;
  params: Record<string, unknown>;
}

export interface WaitOptions {
  /** Poll interval in milliseconds. Default 3000. */
  pollIntervalMs?: number;
  /** Give up after this long. Default 600000. */
  timeoutMs?: number;
  onPoll?: (status: string) => void;
}

/** A normalized error with a stable `code` and the HTTP status when known. */
export class RendleyError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options: { code: string; status?: number; details?: unknown }) {
    super(message);
    this.name = "RendleyError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

const HINTS: Record<number, { code: string; message: string }> = {
  401: {
    code: "UNAUTHORIZED",
    message:
      "Rendley rejected the API key. Check the key in your connection (create one at app.rendley.com/settings).",
  },
  402: {
    code: "PAYMENT_REQUIRED",
    message:
      "This operation needs Rendley credits. Add credits at app.rendley.com and try again.",
  },
  403: { code: "FORBIDDEN", message: "The API key does not have access to this resource." },
  404: { code: "NOT_FOUND", message: "The requested Rendley resource was not found." },
  429: { code: "RATE_LIMITED", message: "Rendley is rate limiting requests. Wait a moment and retry." },
};

export function errorFromResponse(status: number, body: unknown): RendleyError {
  const apiError =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: { code?: string; message?: string } }).error
      : undefined;
  const hint = HINTS[status];
  const code = apiError?.code || hint?.code || "HTTP_ERROR";
  const message =
    status === 402
      ? `${hint!.message} (${apiError?.message ?? "HTTP 402"})`
      : apiError?.message || hint?.message || `Rendley request failed (HTTP ${status}).`;
  return new RendleyError(message, { code, status, details: body });
}

export class RendleyClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RendleyClientOptions) {
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
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new RendleyError(`Rendley did not answer within ${this.timeoutMs} ms.`, {
          code: "TIMEOUT",
        });
      }
      throw new RendleyError(
        `Could not reach Rendley at ${url}: ${err instanceof Error ? err.message : String(err)}`,
        { code: "NETWORK_ERROR", details: err },
      );
    }
    const text = await res.text();
    const json: unknown = text ? safeJsonParse(text) : undefined;
    if (!res.ok) {
      throw errorFromResponse(res.status, json);
    }
    if (json && typeof json === "object" && !Array.isArray(json) && "data" in json) {
      return (json as { data: T }).data;
    }
    return json as T;
  }

  // ---------------------------------------------------------------------------
  // Workspaces and projects
  // ---------------------------------------------------------------------------

  listWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>("GET", "/workspaces");
  }

  /** The account's first workspace, for calls that may leave it unspecified. */
  async defaultWorkspaceId(): Promise<string> {
    const workspaces = await this.listWorkspaces();
    const first = workspaces?.[0]?.id;
    if (!first) {
      throw new RendleyError("No workspace found for this API key. Create one at app.rendley.com.", {
        code: "NO_WORKSPACE",
      });
    }
    return first;
  }

  async listProjects(workspaceId?: string): Promise<Project[]> {
    const id = workspaceId || (await this.defaultWorkspaceId());
    const projects = await this.request<Project[]>(
      "GET",
      `/projects?workspace_id=${encodeURIComponent(id)}`,
    );
    return Array.isArray(projects) ? projects : [];
  }

  getProject(projectId: string): Promise<Project> {
    return this.request<Project>("GET", `/projects/${encodeURIComponent(projectId)}`);
  }

  async createProject(input: { name: string; workspaceId?: string; templateId?: string }): Promise<Project> {
    const workspaceId = input.workspaceId || (await this.defaultWorkspaceId());
    return this.request<Project>("POST", "/projects", {
      name: input.name,
      workspace_id: workspaceId,
      ...(input.templateId ? { template_id: input.templateId } : {}),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request<unknown>("DELETE", `/projects/${encodeURIComponent(projectId)}`);
  }

  // ---------------------------------------------------------------------------
  // Jobs (AI actions and exports)
  // ---------------------------------------------------------------------------

  getJob(jobId: string): Promise<Job> {
    return this.request<Job>("GET", `/jobs/${encodeURIComponent(jobId)}`);
  }

  /** Jobs created with this API key, newest first. `type` filters by job type. */
  async listJobs(filters: { projectId?: string; type?: string } = {}): Promise<Job[]> {
    const params = new URLSearchParams({ source_type: "api" });
    if (filters.projectId) params.set("project_id", filters.projectId);
    if (filters.type) params.set("job_type", filters.type);
    const jobs = await this.request<Job[]>("GET", `/jobs?${params.toString()}`);
    return Array.isArray(jobs) ? jobs : [];
  }

  cancelJob(jobId: string): Promise<unknown> {
    return this.request<unknown>("DELETE", `/jobs/${encodeURIComponent(jobId)}`);
  }

  waitForJob(jobId: string, opts: WaitOptions = {}): Promise<Job> {
    return pollUntilTerminal(() => this.getJob(jobId), (job) => job.status, opts);
  }

  /**
   * Poll for at most `budgetMs`, then hand back whatever state the job is in.
   * For runtimes with a hard step timeout (Zapier), where waiting forever is
   * not an option.
   */
  async waitForJobBounded(
    jobId: string,
    budgetMs: number,
    pollIntervalMs = 2000,
  ): Promise<{ job: Job; done: boolean }> {
    const deadline = Date.now() + budgetMs;
    for (;;) {
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
  async runAiAction(
    action: string,
    input: AiActionInput,
  ): Promise<{ jobId: string }> {
    const data = await this.request<string | { job_id?: string; id?: string }>(
      "POST",
      `/ai/${encodeURIComponent(action)}`,
      aiBody(input),
    );
    const jobId = typeof data === "string" ? data : data?.job_id ?? data?.id ?? "";
    if (!jobId) {
      throw new RendleyError(`Rendley did not return a job ID for "${action}".`, {
        code: "NO_JOB_ID",
        details: data,
      });
    }
    return { jobId };
  }

  /** Credit price of an AI action without running it. */
  async estimateAiActionCost(
    action: string,
    input: AiActionInput,
  ): Promise<number> {
    const data = await this.request<number | { credits?: number }>(
      "POST",
      `/ai/${encodeURIComponent(action)}/cost`,
      aiBody(input),
    );
    return typeof data === "number" ? data : data?.credits ?? 0;
  }

  listAiTools(): Promise<AiTool[]> {
    return this.request<AiTool[]>("GET", "/ai/tools");
  }

  /** Models offered for one action. The catalog spells actions with underscores. */
  async listModels(action: string): Promise<AiModel[]> {
    const tools = await this.listAiTools();
    const tool = (tools || []).find((t) => t.action === action.replace(/-/g, "_"));
    return tool?.models ?? [];
  }

  async listTtsVoices(options: { page?: number; limit?: number } = {}): Promise<TtsVoice[]> {
    const params = new URLSearchParams();
    if (options.page !== undefined) params.set("page", String(options.page));
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    const q = params.toString();
    const voices = await this.request<TtsVoice[]>("GET", `/ai/text-to-speech/voices${q ? `?${q}` : ""}`);
    return Array.isArray(voices) ? voices : [];
  }

  async listTranslateLanguages(): Promise<TranslateLanguage[]> {
    const languages = await this.request<TranslateLanguage[]>("GET", "/ai/video-translate/languages");
    return Array.isArray(languages) ? languages : [];
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  async createExport(input: {
    projectId?: string;
    project?: unknown;
    settings?: ExportSettings;
  }): Promise<{ jobId: string }> {
    if (!input.projectId && !input.project) {
      throw new RendleyError("An export needs a project ID or an inline project.", {
        code: "INVALID_INPUT",
      });
    }
    const data = await this.request<{ job_id: string }>("POST", "/export", {
      ...(input.projectId ? { project_id: input.projectId } : {}),
      ...(input.project ? { project: input.project } : {}),
      ...(input.settings && Object.keys(input.settings).length ? { settings: input.settings } : {}),
    });
    return { jobId: data.job_id };
  }

  async estimateExportCost(input: {
    projectId?: string;
    project?: unknown;
    settings?: ExportSettings;
  }): Promise<number> {
    const data = await this.request<{ credits: number } | number>("POST", "/export/cost", {
      ...(input.projectId ? { project_id: input.projectId } : {}),
      ...(input.project ? { project: input.project } : {}),
      ...(input.settings && Object.keys(input.settings).length ? { settings: input.settings } : {}),
    });
    return typeof data === "number" ? data : data?.credits ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Agent
  // ---------------------------------------------------------------------------

  /** Start an agent run. Omit `projectId` to let Rendley create the project. */
  startAgentJob(input: {
    prompt: string;
    projectId?: string;
    threadId?: string;
    files?: AgentFile[];
  }): Promise<AgentJob> {
    if (!input.prompt?.trim()) {
      throw new RendleyError("A prompt is required.", { code: "INVALID_INPUT" });
    }
    return this.request<AgentJob>("POST", "/agent", {
      prompt: input.prompt,
      ...(input.projectId ? { project_id: input.projectId } : {}),
      ...(input.threadId ? { thread_id: input.threadId } : {}),
      ...(input.files?.length ? { files: input.files } : {}),
    });
  }

  getAgentJob(jobId: string): Promise<AgentJob> {
    return this.request<AgentJob>("GET", `/agent/jobs/${encodeURIComponent(jobId)}`);
  }

  cancelAgentJob(jobId: string): Promise<AgentJob> {
    return this.request<AgentJob>("POST", `/agent/jobs/${encodeURIComponent(jobId)}/cancel`);
  }

  waitForAgentJob(jobId: string, opts: WaitOptions = {}): Promise<AgentJob> {
    return pollUntilTerminal(
      () => this.getAgentJob(jobId),
      (job) => {
        if (job.status === "waiting_input") {
          throw new RendleyError(
            `The Rendley agent paused to ask a question${
              job.interrupt?.summary ? `: ${job.interrupt.summary}` : ""
            }. Rephrase the prompt so the agent does not need to ask, or answer it in the Rendley app.`,
            { code: "AGENT_WAITING_INPUT", details: job },
          );
        }
        return job.status;
      },
      opts,
    );
  }

  async waitForAgentJobBounded(
    jobId: string,
    budgetMs: number,
    pollIntervalMs = 2000,
  ): Promise<{ job: AgentJob; done: boolean }> {
    const deadline = Date.now() + budgetMs;
    for (;;) {
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
  importUpload(
    projectId: string,
    input: { downloadUrl: string; fileName?: string; mimeType?: string },
  ): Promise<Upload> {
    return this.request<Upload>("POST", `/projects/${encodeURIComponent(projectId)}/uploads/import`, {
      download_url: input.downloadUrl,
      ...(input.fileName ? { file_name: input.fileName } : {}),
      ...(input.mimeType ? { mime_type: input.mimeType } : {}),
      // The editor's hash sync deletes `library` rows the project JSON does not reference.
      role: "pending",
    });
  }

  /**
   * Imports a public URL into the project through the API (Rendley fetches
   * it) and returns it as an agent attachment. This is how files reach the
   * agent reliably: the upload is complete before the agent starts.
   */
  async importAttachment(projectId: string, url: string, name?: string): Promise<AgentFile> {
    const upload = await this.importUpload(projectId, { downloadUrl: url, fileName: name || fileNameFromUrl(url) });
    return {
      media_id: upload.media_id,
      storage_url: upload.storage_url,
      name: upload.original_file_name ?? name ?? fileNameFromUrl(url),
      file_hash: upload.file_hash,
    };
  }

  async listUploads(projectId: string): Promise<Upload[]> {
    const uploads = await this.request<Upload[]>(
      "GET",
      `/projects/${encodeURIComponent(projectId)}/uploads`,
    );
    return Array.isArray(uploads) ? uploads : [];
  }

  /** Resolve a media ID or file hash to a fresh signed download URL. */
  async getMediaUrl(
    projectId: string,
    ref: { mediaId?: string; fileHash?: string },
  ): Promise<Upload & { media_id: string }> {
    const base = `/projects/${encodeURIComponent(projectId)}/uploads`;
    const query = ref.mediaId
      ? `?media_id=${encodeURIComponent(ref.mediaId)}`
      : ref.fileHash
        ? `?hash=${encodeURIComponent(ref.fileHash)}`
        : "";
    if (!query) {
      throw new RendleyError("A media ID or a file hash is required.", { code: "INVALID_INPUT" });
    }
    const upload = await this.request<Upload>("GET", `${base}${query}`);
    if (!upload?.storage_url) {
      throw new RendleyError(`No media found in project ${projectId} for ${ref.mediaId ?? ref.fileHash}.`, {
        code: "MEDIA_NOT_FOUND",
      });
    }
    return { ...upload, media_id: upload.media_id ?? ref.mediaId ?? "" };
  }

  // ---------------------------------------------------------------------------
  // Brand kit
  // ---------------------------------------------------------------------------

  async getBrandkit(workspaceId?: string): Promise<Brandkit> {
    const id = workspaceId || (await this.defaultWorkspaceId());
    return this.request<Brandkit>("GET", `/brandkit/${encodeURIComponent(id)}`);
  }

  async importBrandkitFromWebsite(workspaceId: string | undefined, websiteUrl: string): Promise<Brandkit> {
    const id = workspaceId || (await this.defaultWorkspaceId());
    return this.request<Brandkit>("POST", `/brandkit/${encodeURIComponent(id)}/import`, {
      website_url: websiteUrl,
    });
  }
}

// -----------------------------------------------------------------------------
// Free helpers
// -----------------------------------------------------------------------------

/**
 * Body of an AI action call. With `projectId` the result lands in that project;
 * without it Rendley stores it in the workspace library (`workspaceId`, or the
 * account's only workspace when omitted).
 */
function aiBody(input: AiActionInput) {
  return {
    ...(input.projectId ? { project_id: input.projectId } : {}),
    ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
    ...(input.modelId ? { model_id: input.modelId } : {}),
    params: input.params ?? {},
  };
}

/** `result_data` is a JSON string; returns it as an object, or undefined. */
export function parseResultData(job: Pick<Job, "result_data"> | undefined): Record<string, unknown> | undefined {
  const raw = job?.result_data;
  if (!raw) return undefined;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  const parsed = safeJsonParse(raw);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
}

/** The download URL of a completed job: `output.url`, presigned fresh by the API on every read. */
export function jobDownloadUrl(job: Job): string | undefined {
  return job.output?.url || undefined;
}

/** Flat summary of a job for automation outputs. Field names follow the API: the job's `output` fields under their own names, `result_data` parsed. */
export function summarizeJob(job: Job): Record<string, unknown> {
  const result = parseResultData(job) ?? {};
  const mediaId = job.output?.media_id ?? (result.media_id as string | undefined) ?? null;
  const fileHash = job.output?.file_hash ?? (result.file_hash as string | undefined) ?? null;
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
    mime_type: job.output?.mime_type ?? (result.mime_type as string | undefined) ?? null,
    size: job.output?.size ?? null,
    duration: job.output?.duration ?? null,
    result_data: result,
  };
}

export function isTerminal(status: string | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

/** Consecutive poll failures tolerated before the wait gives up. */
const POLL_MAX_TRANSIENT_FAILURES = 5;

/** Network drops, timeouts, rate limits and server errors, which a later poll may not hit. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof RendleyError)) return false;
  if (err.code === "NETWORK_ERROR" || err.code === "TIMEOUT" || err.code === "RATE_LIMITED") return true;
  return typeof err.status === "number" && err.status >= 500;
}

async function pollUntilTerminal<T>(
  fetchOne: () => Promise<T>,
  getStatus: (value: T) => string,
  opts: WaitOptions,
): Promise<T> {
  const pollIntervalMs = opts.pollIntervalMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const deadline = Date.now() + timeoutMs;
  let failures = 0;
  for (;;) {
    let value: T;
    try {
      value = await fetchOne();
      failures = 0;
    } catch (err) {
      // A dropped connection or a busy server while a job runs is not a
      // result; retry a few times before giving up.
      failures += 1;
      if (!isTransient(err) || failures > POLL_MAX_TRANSIENT_FAILURES || Date.now() >= deadline) throw err;
      await sleep(Math.min(pollIntervalMs * failures, 30_000));
      continue;
    }
    const status = getStatus(value);
    opts.onPoll?.(status);
    if (TERMINAL_STATUSES.has(status)) return value;
    if (Date.now() >= deadline) {
      throw new RendleyError(`Timed out after ${Math.round(timeoutMs / 1000)} s waiting for the job (last status: ${status}).`, {
        code: "WAIT_TIMEOUT",
        details: value,
      });
    }
    await sleep(pollIntervalMs);
  }
}

/** The last path segment of a URL, without the query string, as a file name. */
export function fileNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "file";
  } catch {
    return "file";
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
