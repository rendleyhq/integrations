import {
  JOB_OUTPUT_FIELDS,
  URL_EXPIRY_NOTE,
  clientFor,
  jobOutput,
  jobSample,
  parseParamsJson,
  toUserError,
  type Bundle,
  type Search,
  type ZObject,
} from "../lib/zapier";
import { AGENT_OUTPUT_FIELDS, AGENT_SAMPLE } from "../creates/agentAndExport";
import { isTerminal } from "@rendley/client";

export const getJob: Search<{ job: string }> = {
  key: "get_job",
  noun: "Job",
  display: {
    label: "Get Job Status",
    description:
      "Looks up an AI action or export job by ID and returns its status and, once complete, a fresh download URL. Pair it with a Delay step to finish jobs that outlast a single action.",
  },
  operation: {
    inputFields: [
      {
        key: "job",
        label: "Job ID",
        type: "string",
        required: true,
        helpText: "The Job ID returned by an AI action or the Export Video action.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      try {
        const job = await clientFor(bundle).getJob(bundle.inputData.job.trim());
        return [jobOutput(job)];
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: jobSample(),
    outputFields: JOB_OUTPUT_FIELDS,
  },
};

export const getAgentJob: Search<{ job: string }> = {
  key: "get_agent_job",
  noun: "Agent Edit",
  display: {
    label: "Get Agent Job Status",
    description: "Looks up an AI agent edit by Job ID and returns its status, message and project. When the agent paused to ask something, Is Complete is true, Status is waiting_input and the prompt is in Agent Question.",
  },
  operation: {
    inputFields: [
      {
        key: "job",
        label: "Job ID",
        type: "string",
        required: true,
        helpText: "The Job ID returned by the AI Video Agent action.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      try {
        const job = await clientFor(bundle).getAgentJob(bundle.inputData.job.trim());
        return [
          {
            id: job.job_id,
            job_id: job.job_id,
            project_id: job.project_id ?? null,
            thread_id: job.thread_id ?? null,
            status: job.status,
            is_complete: isTerminal(job.status) || job.status === "waiting_input",
            last_message: job.last_message ?? null,
            question: job.interrupt?.summary ?? null,
            error: job.error ?? null,
            commands_applied: job.commands_applied ?? null,
            commands_failed: job.commands_failed ?? null,
          },
        ];
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: AGENT_SAMPLE,
    outputFields: AGENT_OUTPUT_FIELDS,
  },
};

export const findProject: Search<{ project?: string; name?: string }> = {
  key: "find_project",
  noun: "Project",
  display: {
    label: "Find Project",
    description: "Finds a Rendley project by ID or by a name fragment.",
  },
  operation: {
    inputFields: [
      {
        key: "project",
        label: "Project ID",
        type: "string",
        required: false,
        helpText: "The exact project ID. Takes precedence over the name.",
      },
      {
        key: "name",
        label: "Name Contains",
        type: "string",
        required: false,
        helpText: "Case-insensitive fragment of the project name, for example `teaser`.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const client = clientFor(bundle);
      const { project, name } = bundle.inputData;
      try {
        if (project?.trim()) {
          const found = await client.getProject(project.trim());
          return [{ id: found.id, name: found.name, workspace_id: found.workspace_id }];
        }
        const needle = (name ?? "").trim().toLowerCase();
        const projects = await client.listProjects();
        return projects
          .filter((p) => !needle || String(p.name ?? "").toLowerCase().includes(needle))
          .map((p) => ({ id: p.id, name: p.name, workspace_id: p.workspace_id, created_at: p.created_at ?? null }));
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: {
      id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
      name: "Product launch teaser",
      workspace_id: "3b66b9b6-de8e-44c3-9f27-848a09c79320",
      created_at: "2026-09-01T10:00:00Z",
    },
    outputFields: [
      { key: "id", label: "Project ID" },
      { key: "name", label: "Name" },
      { key: "workspace_id", label: "Workspace ID" },
      { key: "created_at", label: "Created At", type: "datetime" },
    ],
  },
};

export const getMediaUrl: Search<{ project_id: string; media?: string; file_hash?: string }> = {
  key: "get_media_url",
  noun: "Media File",
  display: {
    label: "Get Media Download URL",
    description: "Gets a fresh download URL for a file in a project by its Media ID or File Hash. " + URL_EXPIRY_NOTE,
  },
  operation: {
    inputFields: [
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: true,
        dynamic: "new_project.id.name",
        helpText: "The project the file belongs to.",
      },
      {
        key: "media",
        label: "Media ID",
        type: "string",
        required: false,
        helpText: "The Media ID from an AI action, an upload or a job. Leave empty if you only have the File Hash.",
      },
      {
        key: "file_hash",
        label: "File Hash",
        type: "string",
        required: false,
        helpText: "The File Hash returned alongside the Media ID. Used when the Media ID is empty.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const { project_id, media, file_hash } = bundle.inputData;
      if (!media?.trim() && !file_hash?.trim()) {
        throw new z.errors.Error("Fill in either the Media ID or the File Hash.");
      }
      try {
        const resolved = await clientFor(bundle).getMediaUrl(project_id, {
          mediaId: media?.trim() || undefined,
          fileHash: file_hash?.trim() || undefined,
        });
        return [
          {
            id: resolved.media_id || resolved.file_hash,
            media_id: resolved.media_id || null,
            file_hash: resolved.file_hash ?? null,
            file_name: resolved.original_file_name ?? null,
            mime_type: resolved.mime_type ?? null,
            url: resolved.storage_url,
            project_id,
          },
        ];
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: {
      id: "c448b6e3-2b78-4bda-b369-d1afc6aec07f",
      media_id: "c448b6e3-2b78-4bda-b369-d1afc6aec07f",
      file_hash: "c6c8ec4f9a6fdd9d",
      file_name: "voiceover.mp3",
      mime_type: "audio/mpeg",
      url: "https://storage.rendley.com/user_uploads/1fdfc335/c6c8ec4f9a6fdd9d?signature=abc",
      project_id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
    },
    outputFields: [
      { key: "media_id", label: "Media ID" },
      { key: "file_hash", label: "File Hash" },
      { key: "file_name", label: "File Name" },
      { key: "mime_type", label: "MIME Type" },
      { key: "url", label: "Download URL (signed, expires)" },
      { key: "project_id", label: "Project ID" },
    ],
  },
};

const COST_ACTIONS: Record<string, string> = {
  transcribe: "Transcribe Audio or Video",
  "text-to-speech": "Text to Speech",
  "video-translate": "Dub Video",
  lipsync: "Lip Sync",
  "voice-isolation": "Isolate Voice",
  "voice-changer": "Change Voice",
  "remove-video-background": "Remove Video Background",
  "remove-image-background": "Remove Image Background",
  "upscale-image": "Upscale Image",
  "upscale-video": "Upscale Video",
  "generate-image": "Generate Image",
  "generate-video": "Generate Video",
  "generate-music": "Generate Music",
  "generate-sound-effect": "Generate Sound Effect",
  export: "Export Video",
};

export const estimateCost: Search<{ action: string; project_id: string; model?: string; params_json?: string }> = {
  key: "estimate_cost",
  noun: "Cost Estimate",
  display: {
    label: "Estimate Cost",
    description:
      "Estimates how many Rendley credits an AI action or export would use, without running it. Use it with a Filter step to stay within a budget.",
  },
  operation: {
    inputFields: [
      {
        key: "action",
        label: "Action",
        type: "string",
        required: true,
        choices: COST_ACTIONS,
        helpText: "The action to price.",
      },
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: true,
        dynamic: "new_project.id.name",
        helpText: "The project the action would run in. For Export Video, the project to export.",
      },
      {
        key: "model",
        label: "Model",
        type: "string",
        required: false,
        helpText: "Optional model ID, for AI actions only.",
      },
      {
        key: "params_json",
        label: "Parameters (JSON)",
        type: "text",
        required: false,
        helpText:
          'The parameters you would run with, as JSON. Prices depend on them, for example the script length for Text to Speech or `{"media": "<url>"}` for file actions.',
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const client = clientFor(bundle);
      const { action, project_id, model, params_json } = bundle.inputData;
      try {
        const credits =
          action === "export"
            ? await client.estimateExportCost({ projectId: project_id })
            : await client.estimateAiActionCost(action, {
                projectId: project_id,
                modelId: model || undefined,
                params: parseParamsJson(z, params_json),
              });
        return [{ id: `${action}:${credits}`, action, credits }];
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: { id: "generate-video:85", action: "generate-video", credits: 85 },
    outputFields: [
      { key: "action", label: "Action" },
      { key: "credits", label: "Credits", type: "integer" },
    ],
  },
};
