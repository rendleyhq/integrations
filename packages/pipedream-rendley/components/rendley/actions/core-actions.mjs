import rendley from "../rendley.app.mjs";
import { parseObject } from "../common/ai-action.mjs";
import constants from "../common/constants.mjs";

const DOCS = "[See the documentation](https://docs.rendley.com)";

export const createProject = {
  key: "rendley-create-project",
  name: "Create Project",
  description: `Creates a new Rendley project, optionally from a template. ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  props: {
    rendley,
    name: {
      type: "string",
      label: "Name",
      description: "The project name shown in Rendley.",
    },
    workspaceId: {
      propDefinition: [
        rendley,
        "workspaceId",
      ],
    },
    templateId: {
      type: "string",
      label: "Template ID",
      description: "Optional Rendley template to start from.",
      optional: true,
    },
  },
  async run({ $ }) {
    const workspaceId = this.workspaceId || (await this.rendley.defaultWorkspaceId({
      $,
    }));
    const project = await this.rendley.createProject({
      $,
      data: {
        name: this.name,
        workspace_id: workspaceId,
        ...(this.templateId
          ? {
            template_id: this.templateId,
          }
          : {}),
      },
    });
    $.export("$summary", `Created project ${project.id}`);
    return project;
  },
};

export const uploadMedia = {
  key: "rendley-upload-media",
  name: "Upload Media From URL",
  description: `Adds a file from a public URL to a project's media library; Rendley fetches the file itself. ${constants.URL_EXPIRY_NOTE} ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  props: {
    rendley,
    projectId: {
      propDefinition: [
        rendley,
        "projectId",
      ],
    },
    fileUrl: {
      type: "string",
      label: "File URL",
      description: "A publicly reachable URL of the video, audio or image.",
    },
    fileName: {
      type: "string",
      label: "File Name",
      description: "Optional name shown in the project library.",
      optional: true,
    },
  },
  async run({ $ }) {
    const upload = await this.rendley.importUpload({
      $,
      projectId: this.projectId,
      data: {
        download_url: this.fileUrl,
        ...(this.fileName
          ? {
            file_name: this.fileName,
          }
          : {}),
        role: "pending",
      },
    });
    $.export("$summary", `Uploaded ${upload.original_file_name || this.fileUrl}`);
    return {
      project_id: this.projectId,
      media_id: upload.media_id,
      file_hash: upload.file_hash,
      file_name: upload.original_file_name,
      mime_type: upload.mime_type,
      status: upload.status,
      download_url: upload.storage_url,
    };
  },
};

export const getMediaUrl = {
  key: "rendley-get-media-url",
  name: "Get Media Download URL",
  description: `Gets a fresh download URL for a file in a project by Media ID or File Hash. ${constants.URL_EXPIRY_NOTE} ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: true,
  },
  props: {
    rendley,
    projectId: {
      propDefinition: [
        rendley,
        "projectId",
      ],
    },
    mediaId: {
      type: "string",
      label: "Media ID",
      description: "The Media ID from an AI action, an upload or a job. Leave empty to look up by File Hash.",
      optional: true,
    },
    fileHash: {
      type: "string",
      label: "File Hash",
      description: "Used when the Media ID is empty.",
      optional: true,
    },
  },
  async run({ $ }) {
    if (!this.mediaId && !this.fileHash) {
      throw new Error("Fill in either the Media ID or the File Hash.");
    }
    const upload = await this.rendley.getUpload({
      $,
      projectId: this.projectId,
      params: this.mediaId
        ? {
          media_id: this.mediaId,
        }
        : {
          hash: this.fileHash,
        },
    });
    $.export("$summary", `Resolved ${this.mediaId || this.fileHash}`);
    return {
      project_id: this.projectId,
      media_id: upload.media_id || this.mediaId || null,
      file_hash: upload.file_hash,
      file_name: upload.original_file_name || null,
      mime_type: upload.mime_type || null,
      download_url: upload.storage_url,
    };
  },
};

export const renderVideo = {
  key: "rendley-render-video",
  name: "Render Video",
  description: `Renders a project to an MP4 and returns the download URL. Requires a paid Rendley plan. ${constants.URL_EXPIRY_NOTE} ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  props: {
    rendley,
    projectId: {
      propDefinition: [
        rendley,
        "projectId",
      ],
    },
    codec: {
      type: "string",
      label: "Codec",
      description: "Defaults to H.264.",
      optional: true,
      options: [
        "h264",
        "vp8",
      ],
    },
    targetResolution: {
      type: "string",
      label: "Resolution",
      description: "Defaults to 1080p.",
      optional: true,
      options: [
        "720p",
        "1080p",
        "4K",
      ],
    },
    quality: {
      type: "string",
      label: "Quality",
      description: "Defaults to high.",
      optional: true,
      options: [
        "high",
        "medium",
        "low",
      ],
    },
    waitForCompletion: {
      propDefinition: [
        rendley,
        "waitForCompletion",
      ],
    },
    timeoutSeconds: {
      propDefinition: [
        rendley,
        "timeoutSeconds",
      ],
    },
  },
  async run({ $ }) {
    const settings = {
      ...(this.codec
        ? {
          codec: this.codec,
        }
        : {}),
      ...(this.targetResolution
        ? {
          target_resolution: this.targetResolution,
        }
        : {}),
      ...(this.quality
        ? {
          quality: this.quality,
        }
        : {}),
    };
    const started = await this.rendley.createExport({
      $,
      data: {
        project_id: this.projectId,
        ...(Object.keys(settings).length
          ? {
            settings,
          }
          : {}),
      },
    });
    const jobId = started.job_id;
    if (this.waitForCompletion === false) {
      $.export("$summary", `Started render job ${jobId}`);
      return {
        job_id: jobId,
        project_id: this.projectId,
        status: "queued",
        is_complete: false,
      };
    }
    const job = await this.rendley.waitForJob({
      $,
      jobId,
      timeoutSeconds: this.timeoutSeconds,
    });
    if (job.status !== "completed") {
      throw new Error(`Render ${jobId} ${job.status}: ${job.error || "no details"}`);
    }
    const summary = this.rendley.summarizeJob(job);
    summary.project_id = summary.project_id || this.projectId;
    summary.video_url = summary.download_url;
    $.export("$summary", `Rendered project ${this.projectId}`);
    return summary;
  },
};

export const editWithAgent = {
  key: "rendley-edit-video-with-ai-agent",
  name: "Edit Video With AI Agent",
  description: `Sends a prompt to the Rendley AI agent, which creates or edits a video project (cuts, captions, reframing, generated media). Requires a paid Rendley plan. ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  props: {
    rendley,
    prompt: {
      type: "string",
      label: "Prompt",
      description: "What the agent should create or change.",
    },
    projectId: {
      propDefinition: [
        rendley,
        "projectId",
      ],
      optional: true,
      description: "Optional existing project to edit. Leave empty to let the agent create one.",
    },
    fileUrls: {
      type: "string[]",
      label: "Media URLs",
      description: "Optional public URLs of clips, images or audio for the agent to work with.",
      optional: true,
    },
    threadId: {
      type: "string",
      label: "Thread ID",
      description: "Optional. Continue a previous agent conversation on the same project.",
      optional: true,
    },
    waitForCompletion: {
      propDefinition: [
        rendley,
        "waitForCompletion",
      ],
    },
    timeoutSeconds: {
      propDefinition: [
        rendley,
        "timeoutSeconds",
      ],
      default: 600,
    },
  },
  async run({ $ }) {
    const started = await this.rendley.startAgentJob({
      $,
      data: {
        prompt: this.prompt,
        ...(this.projectId
          ? {
            project_id: this.projectId,
          }
          : {}),
        ...(this.threadId
          ? {
            thread_id: this.threadId,
          }
          : {}),
        ...(this.fileUrls?.length
          ? {
            files: this.fileUrls.map((url) => ({
              url,
            })),
          }
          : {}),
      },
    });
    const shape = (job) => ({
      job_id: job.job_id,
      project_id: job.project_id || null,
      thread_id: job.thread_id || started.thread_id || null,
      status: job.status,
      is_complete: constants.TERMINAL_STATUSES.includes(job.status),
      last_message: job.last_message || null,
      error: job.error || null,
      commands_applied: job.commands_applied ?? null,
      commands_failed: job.commands_failed ?? null,
    });
    if (this.waitForCompletion === false) {
      $.export("$summary", `Started agent job ${started.job_id}`);
      return shape(started);
    }
    const job = await this.rendley.waitForAgentJob({
      $,
      jobId: started.job_id,
      timeoutSeconds: this.timeoutSeconds,
    });
    if (job.status !== "completed") {
      throw new Error(`Agent job ${started.job_id} ${job.status}: ${job.error || job.last_message || "no details"}`);
    }
    $.export("$summary", `Agent finished editing project ${job.project_id}`);
    return shape(job);
  },
};

export const getJob = {
  key: "rendley-get-job",
  name: "Get Job Status",
  description: `Looks up an AI action or render job and returns its status and, once complete, a fresh download URL. ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: true,
  },
  props: {
    rendley,
    jobId: {
      propDefinition: [
        rendley,
        "jobId",
      ],
    },
  },
  async run({ $ }) {
    const job = await this.rendley.getJob({
      $,
      jobId: this.jobId,
    });
    $.export("$summary", `Job ${this.jobId} is ${job.status}`);
    return this.rendley.summarizeJob(job);
  },
};

export const getAgentJob = {
  key: "rendley-get-agent-job",
  name: "Get Agent Job Status",
  description: `Looks up an AI agent edit by Job ID. ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: true,
  },
  props: {
    rendley,
    jobId: {
      propDefinition: [
        rendley,
        "agentJobId",
      ],
    },
  },
  async run({ $ }) {
    const job = await this.rendley.getAgentJob({
      $,
      jobId: this.jobId,
    });
    $.export("$summary", `Agent job ${this.jobId} is ${job.status}`);
    return {
      ...job,
      is_complete: constants.TERMINAL_STATUSES.includes(job.status),
    };
  },
};

export const cancelAgentJob = {
  key: "rendley-cancel-agent-job",
  name: "Cancel Agent Job",
  description: `Stops a running AI agent edit. ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: true,
    openWorldHint: true,
    readOnlyHint: false,
  },
  props: {
    rendley,
    jobId: {
      propDefinition: [
        rendley,
        "agentJobId",
      ],
    },
  },
  async run({ $ }) {
    const job = await this.rendley.cancelAgentJob({
      $,
      jobId: this.jobId,
    });
    $.export("$summary", `Agent job ${this.jobId} is ${job.status}`);
    return job;
  },
};

export const estimateCost = {
  key: "rendley-estimate-cost",
  name: "Estimate Credit Cost",
  description: `Estimates how many Rendley credits an AI action or render would consume, without running it. ${DOCS}`,
  version: "0.1.0",
  type: "action",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: true,
  },
  props: {
    rendley,
    action: {
      type: "string",
      label: "Action",
      description: "The action to price.",
      options: [
        ...Object.entries(constants.AI_ACTIONS).map(([
          value,
          label,
        ]) => ({
          value,
          label,
        })),
        {
          value: "export",
          label: "Render Video",
        },
      ],
    },
    projectId: {
      propDefinition: [
        rendley,
        "projectId",
      ],
    },
    modelId: {
      propDefinition: [
        rendley,
        "modelId",
        (c) => ({
          action: c.action,
        }),
      ],
    },
    params: {
      propDefinition: [
        rendley,
        "paramsJson",
      ],
      label: "Parameters",
      description: "The parameters you would run with, as a JSON object. Prices depend on them.",
    },
  },
  async run({ $ }) {
    const credits = this.action === "export"
      ? (await this.rendley.estimateExportCost({
        $,
        data: {
          project_id: this.projectId,
        },
      }))?.credits
      : await this.rendley.estimateAiActionCost({
        $,
        action: this.action,
        data: {
          project_id: this.projectId,
          ...(this.modelId
            ? {
              model_id: this.modelId,
            }
            : {}),
          params: parseObject(this.params),
        },
      });
    const value = typeof credits === "number"
      ? credits
      : credits?.credits ?? 0;
    $.export("$summary", `${this.action} would cost ${value} credits`);
    return {
      action: this.action,
      credits: value,
      usd: value / 100,
    };
  },
};
