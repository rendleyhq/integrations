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

/** A project name derived from the prompt, the way the Rendley app names agent projects. */
function agentProjectName(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 59).trimEnd()}…` : oneLine || "AI Video Agent";
}

function agentOutput(job: AgentJob): Record<string, unknown> {
  return {
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
  };
}

export const AGENT_OUTPUT_FIELDS = [
  { key: "job_id", label: "Job ID" },
  { key: "project_id", label: "Project ID" },
  { key: "thread_id", label: "Thread ID" },
  { key: "status", label: "Status" },
  { key: "is_complete", label: "Is Complete", type: "boolean" as const },
  { key: "last_message", label: "Agent Message" },
  { key: "question", label: "Agent Question (when paused)" },
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
  question: null,
  error: null,
  commands_applied: 12,
  commands_failed: 0,
};

export const aiVideoAgent: Create<{
  prompt: string;
  project_id?: string;
  files?: string[];
  thread?: string;
  wait_for_completion?: boolean | string;
}> = {
  key: "ai_video_agent",
  noun: "Agent Job",
  display: {
    label: "AI Video Agent",
    description:
      "Runs the AI agent to create or edit a video from a prompt.",
  },
  operation: {
    inputFields: [
      {
        key: "prompt",
        label: "Prompt",
        type: "text",
        required: true,
        helpText:
          "What the AI agent should create or change, for example `Cut this interview down to a 30-second teaser with captions` or `Add captions styled for TikTok`. " +
          "The agent works on a real editing timeline: it adds captions, cuts bad takes and filler words, reframes, and builds videos from generated media. " +
          "Edits take minutes, so chain a Delay step, then Find Agent Job Status, then Export Video to get the file.",
      },
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: false,
        dynamic: "new_project.id.name",
        helpText: "Leave empty to create a new project. Set it to edit an existing project.",
      },
      {
        key: "files",
        label: "Files",
        type: "string",
        list: true,
        required: false,
        helpText: "Public URLs of clips, images or audio for the agent to work with. Each one is imported into the project before the agent starts.",
      },
      {
        key: "thread",
        label: "Thread",
        type: "string",
        required: false,
        helpText: "Continue a previous agent conversation on the same project. Needs the Project field too.",
      },
      {
        ...WAIT_FIELD,
        helpText:
          "Yes (default): poll for up to about 20 seconds; trivial edits finish in time, most do not and come back with Is Complete = false. Add a Delay step and the Find Agent Job Status search to pick up the result. No: return the job reference immediately.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const { prompt, project_id, files: fileUrls, thread, wait_for_completion } = bundle.inputData;
      const client = clientFor(bundle);
      try {
        const urls = (Array.isArray(fileUrls) ? fileUrls : fileUrls ? [fileUrls] : []).map((u) => String(u).trim()).filter(Boolean);
        // Files go through the API's importer first so every upload is complete
        // before the agent starts, then the agent gets them by media ID. That
        // needs a project, so one is created when none is set.
        let projectId = project_id || undefined;
        if (urls.length && !projectId) {
          projectId = (await client.createProject({ name: agentProjectName(prompt) })).id;
        }
        const files = [];
        for (const url of urls) files.push(await client.importAttachment(projectId as string, url));
        const started = await client.startAgentJob({
          prompt,
          projectId,
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
    label: "Export Video",
    description:
      "Exports a project to a video file and returns the download URL. " + URL_EXPIRY_NOTE,
  },
  operation: {
    inputFields: [
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: true,
        dynamic: "new_project.id.name",
        helpText: "The project to export.",
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
          throw new z.errors.Error(`The export ${job.status}: ${job.error ?? "no details"}`);
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
