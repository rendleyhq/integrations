import { axios } from "@pipedream/platform";
import constants from "./common/constants.mjs";

export default {
  type: "app",
  app: "rendley",
  propDefinitions: {
    projectId: {
      type: "string",
      label: "Project",
      description: "The Rendley project the media is stored in. Create one with the **Create Project** action.",
      async options() {
        const projects = await this.listProjects();
        return projects.map(({ id, name }) => ({
          value: id,
          label: name || id,
        }));
      },
    },
    workspaceId: {
      type: "string",
      label: "Workspace",
      description: "Optional. Defaults to your first workspace.",
      optional: true,
      async options() {
        const workspaces = await this.listWorkspaces();
        return workspaces.map(({ id, name }) => ({
          value: id,
          label: name || id,
        }));
      },
    },
    voiceId: {
      type: "string",
      label: "Voice",
      description: "A voice from Rendley's text-to-speech catalog.",
      async options({ page }) {
        const voices = await this.listVoices({
          params: {
            page: page + 1,
            limit: 100,
          },
        });
        return voices.map(({ id, name }) => ({
          value: id,
          label: name || id,
        }));
      },
    },
    outputLanguage: {
      type: "string",
      label: "Target Language",
      description: "The language to dub the spoken audio into.",
      async options() {
        const languages = await this.listTranslateLanguages();
        return languages.map(({ id, name }) => ({
          value: id,
          label: name || id,
        }));
      },
    },
    modelId: {
      type: "string",
      label: "Model",
      description: "Optional model for this action. Leave empty for Rendley's default.",
      optional: true,
      async options({ action }) {
        const tools = await this.listAiTools();
        const tool = tools.find(({ action: name }) => name === String(action).replace(/-/g, "_"));
        return (tool?.models || []).map(({ id, name }) => ({
          value: id,
          label: name || id,
        }));
      },
    },
    media: {
      type: "string",
      label: "Source File",
      description: "A public URL, or the Media ID or File Hash of a file already uploaded to the project (see **Upload Media From URL**).",
    },
    paramsJson: {
      type: "object",
      label: "Extra Parameters",
      description: "Optional model-specific parameters merged into the request, for example `{ \"aspect_ratio\": \"9:16\" }`. Schemas: `GET /v1/ai/models/{model_id}`.",
      optional: true,
    },
    waitForCompletion: {
      type: "boolean",
      label: "Wait for Completion",
      description: "Poll until the job finishes (up to the **Timeout**) and return the result with a fresh download URL. Turn off to return the Job ID immediately and follow it with **Get Job Status**.",
      optional: true,
      default: true,
    },
    timeoutSeconds: {
      type: "integer",
      label: "Timeout (Seconds)",
      description: "How long to wait for the job when **Wait for Completion** is on. Keep it under your workflow's execution timeout.",
      optional: true,
      default: 240,
      min: 10,
      max: 3600,
    },
    jobId: {
      type: "string",
      label: "Job ID",
      description: "The Job ID returned by an AI action or the **Render Video** action.",
    },
    agentJobId: {
      type: "string",
      label: "Agent Job ID",
      description: "The Job ID returned by **Edit Video With AI Agent**.",
    },
  },
  methods: {
    _baseUrl() {
      return (this.$auth.api_base_url || constants.BASE_URL).replace(/\/+$/, "");
    },
    _headers(headers = {}) {
      return {
        ...headers,
        Authorization: `Bearer ${this.$auth.api_key}`,
        Accept: "application/json",
      };
    },
    /** Every Rendley response is wrapped in `{ data }`; return the payload. */
    async _makeRequest(opts = {}) {
      const {
        $ = this,
        path,
        headers,
        ...otherOpts
      } = opts;
      const response = await axios($, {
        url: `${this._baseUrl()}${path}`,
        headers: this._headers(headers),
        ...otherOpts,
      });
      return response && typeof response === "object" && "data" in response
        ? response.data
        : response;
    },
    listWorkspaces(args = {}) {
      return this._makeRequest({
        path: "/workspaces",
        ...args,
      });
    },
    async listProjects({
      workspaceId, ...args
    } = {}) {
      const id = workspaceId || (await this.defaultWorkspaceId(args));
      return this._makeRequest({
        path: "/projects",
        params: {
          workspace_id: id,
        },
        ...args,
      });
    },
    async defaultWorkspaceId(args = {}) {
      const workspaces = await this.listWorkspaces(args);
      const first = workspaces?.[0]?.id;
      if (!first) {
        throw new Error("No workspace found for this Rendley API key.");
      }
      return first;
    },
    getProject({
      projectId, ...args
    }) {
      return this._makeRequest({
        path: `/projects/${encodeURIComponent(projectId)}`,
        ...args,
      });
    },
    createProject(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/projects",
        ...args,
      });
    },
    deleteProject({
      projectId, ...args
    }) {
      return this._makeRequest({
        method: "DELETE",
        path: `/projects/${encodeURIComponent(projectId)}`,
        ...args,
      });
    },
    importUpload({
      projectId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/projects/${encodeURIComponent(projectId)}/uploads/import`,
        ...args,
      });
    },
    getUpload({
      projectId, ...args
    }) {
      return this._makeRequest({
        path: `/projects/${encodeURIComponent(projectId)}/uploads`,
        ...args,
      });
    },
    runAiAction({
      action, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/ai/${encodeURIComponent(action)}`,
        ...args,
      });
    },
    estimateAiActionCost({
      action, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/ai/${encodeURIComponent(action)}/cost`,
        ...args,
      });
    },
    listAiTools(args = {}) {
      return this._makeRequest({
        path: "/ai/tools",
        ...args,
      });
    },
    listVoices(args = {}) {
      return this._makeRequest({
        path: "/ai/text-to-speech/voices",
        ...args,
      });
    },
    listTranslateLanguages(args = {}) {
      return this._makeRequest({
        path: "/ai/video-translate/languages",
        ...args,
      });
    },
    createExport(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/export",
        ...args,
      });
    },
    estimateExportCost(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/export/cost",
        ...args,
      });
    },
    getJob({
      jobId, ...args
    }) {
      return this._makeRequest({
        path: `/jobs/${encodeURIComponent(jobId)}`,
        ...args,
      });
    },
    listJobs(args = {}) {
      return this._makeRequest({
        path: "/jobs",
        ...args,
      });
    },
    startAgentJob(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/agent",
        ...args,
      });
    },
    getAgentJob({
      jobId, ...args
    }) {
      return this._makeRequest({
        path: `/agent/jobs/${encodeURIComponent(jobId)}`,
        ...args,
      });
    },
    cancelAgentJob({
      jobId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/agent/jobs/${encodeURIComponent(jobId)}/cancel`,
        ...args,
      });
    },
    /** Poll a REST job (AI action or render) until it is terminal or the timeout passes. */
    async waitForJob({
      jobId, timeoutSeconds = 240, intervalMs = 4000, $,
    }) {
      const deadline = Date.now() + timeoutSeconds * 1000;
      for (;;) {
        const job = await this.getJob({
          jobId,
          $,
        });
        if (constants.TERMINAL_STATUSES.includes(job.status)) {
          return job;
        }
        if (Date.now() + intervalMs > deadline) {
          throw new Error(`Rendley job ${jobId} did not finish within ${timeoutSeconds} seconds (last status: ${job.status}). Follow it with the Get Job Status action.`);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    },
    /** Poll an agent job until it is terminal, fails fast when it pauses for input. */
    async waitForAgentJob({
      jobId, timeoutSeconds = 240, intervalMs = 4000, $,
    }) {
      const deadline = Date.now() + timeoutSeconds * 1000;
      for (;;) {
        const job = await this.getAgentJob({
          jobId,
          $,
        });
        if (job.status === "waiting_input") {
          throw new Error(`The Rendley agent paused to ask a question${job.interrupt?.summary
            ? `: ${job.interrupt.summary}`
            : ""}. Rephrase the prompt so it does not need to ask.`);
        }
        if (constants.TERMINAL_STATUSES.includes(job.status)) {
          return job;
        }
        if (Date.now() + intervalMs > deadline) {
          throw new Error(`Rendley agent job ${jobId} did not finish within ${timeoutSeconds} seconds (last status: ${job.status}). Follow it with the Get Agent Job Status action.`);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    },
    /** Flatten a job into the shape every action returns. */
    summarizeJob(job) {
      let result = {};
      if (typeof job.result_data === "string") {
        try {
          result = JSON.parse(job.result_data);
        } catch {
          result = {};
        }
      } else if (job.result_data && typeof job.result_data === "object") {
        result = job.result_data;
      }
      const output = job.output || {};
      return {
        job_id: job.id,
        type: job.type,
        status: job.status,
        is_complete: constants.TERMINAL_STATUSES.includes(job.status),
        project_id: output.project_id || job.source_id || null,
        error: job.error || null,
        media_id: output.media_id || result.media_id || null,
        file_hash: output.file_hash || result.file_hash || null,
        download_url: output.url || result.storage_url || null,
        url_expires_at: output.url_expires_at || null,
        mime_type: output.mime_type || result.mime_type || null,
        result,
      };
    },
  },
};
