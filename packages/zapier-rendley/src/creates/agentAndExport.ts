import {
  JOB_OUTPUT_FIELDS,
  URL_EXPIRY_NOTE,
  WAIT_BUDGET_MS,
  WAIT_FIELD,
  clientFor,
  jobOutput,
  jobSample,
  toUserError,
  wantsWait,
  type Bundle,
  type Create,
  type ZObject,
} from "../lib/zapier";
import { isTerminal, type AgentJob } from "@rendley/client";

function agentOutput(job: AgentJob): Record<string, unknown> {
  return {
    id: job.job_id,
    job_id: job.job_id,
    project_id: job.project_id ?? null,
    thread_id: job.thread_id ?? null,
    status: job.status,
    is_complete: isTerminal(job.status),
    last_message: job.last_message ?? null,
    error: job.error ?? null,
    commands_applied: job.commands_applied ?? null,
    commands_failed: job.commands_failed ?? null,
  };
}

export const AGENT_OUTPUT_FIELDS = [
  { key: "job_id", label: "Job ID" },
  { key: "project_id", label: "Project ID" },
  { key: "thread_id", label: "Thread ID" },
  { key: "status", label: "Status" },
  { key: "is_complete", label: "Is Complete", type: "boolean" as const },
  { key: "last_message", label: "Agent Message" },
  { key: "error", label: "Error" },
  { key: "commands_applied", label: "Commands Applied", type: "integer" as const },
  { key: "commands_failed", label: "Commands Failed", type: "integer" as const },
];

export const AGENT_SAMPLE = {
  id: "7cfc4eb0-5f20-4ab4-91cb-cf2eb3ea775b",
  job_id: "7cfc4eb0-5f20-4ab4-91cb-cf2eb3ea775b",
  project_id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
  thread_id: "76011197-d09b-49b0-bbab-b8862e50dfdd",
  status: "completed",
  is_complete: true,
  last_message: "Added the three clips, cut the pauses and burned in captions.",
  error: null,
  commands_applied: 12,
  commands_failed: 0,
};

export const startPromptToVideo: Create<{
  prompt: string;
  project_id?: string;
  file_urls?: string[];
  thread?: string;
  wait_for_completion?: boolean | string;
}> = {
  key: "start_prompt_to_video",
  noun: "Agent Edit",
  display: {
    label: "Edit Video With AI Agent",
    description:
      "Sends a prompt to the Rendley AI agent, which creates or edits a video project: cuts, captions, reframing, generated media and more. Edits take minutes; chain a Delay step, Get Agent Job Status, and Render Video to get the MP4. Requires a paid Rendley plan.",
  },
  operation: {
    inputFields: [
      {
        key: "prompt",
        label: "Prompt",
        type: "text",
        required: true,
        helpText: "What the agent should create or change, for example `Cut this interview down to a 30-second teaser with captions`.",
      },
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: false,
        dynamic: "new_project.id.name",
        helpText: "Optional: an existing project to edit. Leave empty to let the agent create one.",
      },
      {
        key: "file_urls",
        label: "Media URLs",
        type: "string",
        list: true,
        required: false,
        helpText: "Optional public URLs of clips, images or audio for the agent to work with.",
      },
      {
        key: "thread",
        label: "Thread ID",
        type: "string",
        required: false,
        helpText: "Optional: continue a previous agent conversation on the same project. Requires the Project field.",
      },
      {
        ...WAIT_FIELD,
        helpText:
          "Yes (default): poll for up to about 20 seconds; trivial edits finish in time, most do not and come back with Is Complete = false. Add a Delay step and the Get Agent Job Status search to pick up the result. No: return the Job ID immediately.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const { prompt, project_id, file_urls, thread, wait_for_completion } = bundle.inputData;
      const client = clientFor(bundle);
      try {
        const files = (Array.isArray(file_urls) ? file_urls : file_urls ? [file_urls] : [])
          .map((u) => String(u).trim())
          .filter(Boolean)
          .map((url) => ({ url }));
        const started = await client.startAgentJob({
          prompt,
          projectId: project_id || undefined,
          threadId: thread || undefined,
          files,
        });
        if (!wantsWait(wait_for_completion)) return agentOutput(started);

        const { job } = await client.waitForAgentJobBounded(started.job_id, WAIT_BUDGET_MS);
        if (job.status === "waiting_input") {
          throw new z.errors.Error(
            `The Rendley agent paused to ask a question${job.interrupt?.summary ? `: ${job.interrupt.summary}` : ""}. Rephrase the prompt so it does not need to ask.`,
          );
        }
        if (isTerminal(job.status) && job.status !== "completed") {
          throw new z.errors.Error(`The agent edit ${job.status}: ${job.error ?? job.last_message ?? "no details"}`);
        }
        return agentOutput({ ...job, thread_id: job.thread_id ?? started.thread_id });
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: AGENT_SAMPLE,
    outputFields: AGENT_OUTPUT_FIELDS,
  },
};

export const startExport: Create<{
  project_id: string;
  codec?: "h264" | "vp8";
  target_resolution?: "720p" | "1080p" | "4K";
  quality?: "high" | "medium" | "low";
  wait_for_completion?: boolean | string;
}> = {
  key: "start_export",
  noun: "Export",
  display: {
    label: "Render Video",
    description:
      "Renders a project to an MP4 and returns the download URL. Renders take a minute or more; with Wait for Completion the step returns Is Complete = false when the render is still running, so add a Delay step and Get Job Status. Requires a paid Rendley plan. " +
      URL_EXPIRY_NOTE,
  },
  operation: {
    inputFields: [
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: true,
        dynamic: "new_project.id.name",
        helpText: "The project to render.",
      },
      {
        key: "codec",
        label: "Codec",
        type: "string",
        required: false,
        choices: { h264: "H.264 (MP4)", vp8: "VP8 (WebM)" },
        helpText: "Defaults to H.264.",
      },
      {
        key: "target_resolution",
        label: "Resolution",
        type: "string",
        required: false,
        choices: { "720p": "720p", "1080p": "1080p", "4K": "4K" },
        helpText: "Defaults to 1080p.",
      },
      {
        key: "quality",
        label: "Quality",
        type: "string",
        required: false,
        choices: { high: "High", medium: "Medium", low: "Low" },
        helpText: "Higher quality produces larger files. Defaults to high.",
      },
      WAIT_FIELD,
    ],
    perform: async (z: ZObject, bundle) => {
      const { project_id, codec, target_resolution, quality, wait_for_completion } = bundle.inputData;
      const client = clientFor(bundle);
      try {
        const { jobId } = await client.createExport({
          projectId: project_id,
          settings: {
            ...(codec ? { codec } : {}),
            ...(target_resolution ? { target_resolution } : {}),
            ...(quality ? { quality } : {}),
          },
        });
        if (!wantsWait(wait_for_completion)) {
          return jobOutput({ id: jobId, type: "export_video", status: "queued" }, project_id);
        }
        const { job } = await client.waitForJobBounded(jobId, WAIT_BUDGET_MS);
        if (isTerminal(job.status) && job.status !== "completed") {
          throw new z.errors.Error(`The render ${job.status}: ${job.error ?? "no details"}`);
        }
        return jobOutput(job, project_id);
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: jobSample({ type: "export_video", mime_type: "video/mp4" }),
    outputFields: JOB_OUTPUT_FIELDS,
  },
};
