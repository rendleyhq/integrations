/**
 * Rendley AI Video Agent (Apify Actor).
 *
 * One run is one agent job: the Rendley AI agent creates or edits a project
 * from a prompt and optional files, then the project is exported to a video
 * file. A project is created automatically when `project_id` is empty, in the
 * workspace picked by `workspace_id` (the account's first workspace by default).
 *
 * The work happens on Rendley, not in this container; the run polls until
 * it is done and returns the video. Should the run reach its own Apify
 * timeout first, it reports the job as running with its IDs, and a later run
 * with `job_id` set to the agent job or the export job picks the result up.
 * The export is started once per agent job and remembered, so picking the
 * same agent job up again never exports twice.
 *
 * Every run pushes one item to the default dataset, and the video is streamed
 * into the run's key-value store as OUTPUT_VIDEO, because Rendley's download
 * URLs expire after a few hours.
 */
import { Actor, log } from "apify";

import { isTerminal, jobDownloadUrl, parseResultData } from "./rendley.js";
import {
  URL_EXPIRY_NOTE,
  compact,
  createClient,
  describeError,
  hasCode,
  orNull,
  parseJson,
  resolveWorkspace,
  storeOutput,
  text,
  toStringArray,
  truncate,
  waitOrHandOff,
} from "./lib.js";

/** Named store in the account that maps an agent job to the export started for it. */
const EXPORTS_STORE = "rendley-ai-video-agent-exports";

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const saveToKvs = input.save_to_kvs !== false;
const render = input.render !== false;

try {
  const client = createClient(input);
  const jobId = text(input.job_id);
  await (jobId ? resume(client, jobId) : start(client));
  log.info("Done.");
  await Actor.exit();
} catch (err) {
  const message = describeError(err);
  log.exception(err instanceof Error ? err : new Error(String(err)), message);
  await Actor.pushData({ status: "failed", error: message });
  await Actor.fail(truncate(message, 480));
}

// -----------------------------------------------------------------------------

/** Starts a new agent job from the prompt and waits for it. */
async function start(client) {
  const prompt = text(input.prompt);
  if (!prompt) {
    throw new Error("A prompt is required: tell the agent what video to create or how to edit the project. To check on an earlier run, set job_id instead.");
  }
  const threadId = text(input.thread_id);

  // Where the agent works: an existing project, or a new one in the chosen workspace.
  let projectId = text(input.project_id);
  let workspaceId;
  let createdProject = false;
  if (projectId) {
    const project = await client.getProject(projectId);
    workspaceId = project.workspace_id;
    log.info(`Editing project "${project.name}" (${projectId}).`);
    if (text(input.workspace_id) && text(input.workspace_id) !== workspaceId) {
      log.warning("workspace_id is ignored because project_id already determines the workspace.");
    }
  } else {
    if (threadId) {
      throw new Error("thread_id continues a conversation on an existing project, so project_id is required with it.");
    }
    workspaceId = (await resolveWorkspace(client, input.workspace_id)).id;
    let project;
    try {
      project = await client.createProject({ name: projectName(prompt), workspaceId });
    } catch (err) {
      if (hasCode(err, "PLAN_LIMIT_REACHED")) {
        throw new Error(
          "The project limit of your Rendley plan is reached, so no project could be created. Delete a project in the Rendley app or set project_id to edit an existing one.",
        );
      }
      throw err;
    }
    projectId = project.id;
    createdProject = true;
    log.info(`Created project "${project.name}" (${projectId}).`);
  }

  // Files go through the API's importer first, so every upload is complete
  // before the agent starts; the agent then gets them by media ID.
  const files = [];
  for (const url of toStringArray(input.files)) {
    const file = await client.importAttachment(projectId, url);
    log.info(`Imported ${file.name} (${file.media_id}).`);
    files.push(file);
  }

  const started = await client.startAgentJob({
    prompt,
    projectId,
    ...(threadId ? { threadId } : {}),
    ...(files.length ? { files } : {}),
  });
  log.info(`Agent job ${started.job_id} started.`);
  const item = {
    project_id: projectId,
    workspace_id: workspaceId,
    created_project: createdProject,
    thread_id: started.thread_id ?? threadId ?? null,
    agent_job_id: started.job_id,
  };
  const agentJob = await waitOrHandOff("agent", (opts) => client.waitForAgentJob(started.job_id, opts), item);
  if (agentJob) await finishAgent(client, agentJob, item);
}

/** Picks up an agent job or an export job that an earlier run had to leave at its timeout. */
async function resume(client, jobId) {
  log.info(`Checking job ${jobId}.`);
  let agentJob = await orNull(client.getAgentJob(jobId));
  if (agentJob) {
    const item = {
      project_id: agentJob.project_id ?? null,
      workspace_id: await workspaceOf(client, agentJob.project_id),
      created_project: false,
      thread_id: agentJob.thread_id ?? null,
      agent_job_id: jobId,
    };
    if (!isTerminal(agentJob.status) && agentJob.status !== "waiting_input") {
      log.info(`Agent job ${jobId} is ${agentJob.status}.`);
      agentJob = await waitOrHandOff("agent", (opts) => client.waitForAgentJob(jobId, opts), item);
      if (!agentJob) return;
    }
    return finishAgent(client, agentJob, item);
  }

  let job = await orNull(client.getJob(jobId));
  if (!job) throw new Error(`No agent job or export job with the ID ${jobId} exists on this account.`);
  // An export job names its project in input_data.
  const projectId = job.project_id ?? parseJson(job.input_data)?.project_id ?? null;
  const item = {
    project_id: projectId,
    workspace_id: await workspaceOf(client, projectId),
    created_project: false,
    thread_id: null,
    agent_job_id: null,
    job_id: jobId,
  };
  if (!isTerminal(job.status)) {
    log.info(`Export job ${jobId} is ${job.status}.`);
    job = await waitOrHandOff("export", (opts) => client.waitForJob(jobId, opts), item);
    if (!job) return;
  }
  return finishExport(client, job, item);
}

/** The finished agent job becomes the item, then the project is exported when wanted. */
async function finishAgent(client, agentJob, context) {
  if (agentJob.status === "waiting_input") {
    throw new Error(
      `The agent paused to ask a question${agentJob.interrupt?.summary ? `: ${agentJob.interrupt.summary}` : ""}. Rephrase the prompt so it does not need to ask, and run again.`,
    );
  }
  if (agentJob.status !== "completed") {
    throw new Error(`The agent edit ${agentJob.status}: ${agentJob.error ?? agentJob.last_message ?? "no details"}`);
  }
  // The item mirrors the API: the agent job's fields under their own names
  // (its job_id as agent_job_id, since the export job also has one) and the
  // raw agent job as `agent_job`.
  const item = {
    ...context,
    thread_id: agentJob.thread_id ?? context.thread_id,
    last_message: agentJob.last_message ?? null,
    commands_applied: agentJob.commands_applied ?? null,
    commands_failed: agentJob.commands_failed ?? null,
    agent_job: agentJob,
  };
  if (!render) {
    return Actor.pushData({
      status: "completed",
      ...item,
      note: "Exporting was turned off; the edited project is ready in Rendley. Run again with Export a video file on, or export it from the app.",
    });
  }
  if (!item.commands_applied) {
    // Nothing changed on the timeline, so an export would only produce an empty video.
    return Actor.pushData({
      status: "completed",
      ...item,
      note: "The agent made no changes to the project, so nothing was exported. Its message says why.",
    });
  }

  // One export per agent job: reuse the one remembered for it, else start one.
  const exports = await Actor.openKeyValueStore(EXPORTS_STORE);
  let jobId = await exports.getValue(context.agent_job_id);
  let job = jobId ? await orNull(client.getJob(jobId)) : null;
  if (job) {
    log.info(`Export job ${jobId} was already started for this agent job.`);
  } else {
    ({ jobId } = await client.createExport({
      projectId: context.project_id,
      settings: compact({
        target_resolution: input.resolution || "1080p",
        quality: input.quality || "high",
        codec: input.codec || "h264",
      }),
    }));
    await exports.setValue(context.agent_job_id, jobId);
    log.info(`Export job ${jobId} started.`);
  }
  if (!isTerminal(job?.status)) {
    job = await waitOrHandOff("export", (opts) => client.waitForJob(jobId, opts), { ...item, job_id: jobId });
    if (!job) return;
  }
  return finishExport(client, job, item);
}

/** The finished export's output, flattened, the raw job as `export_job`, and the key-value store copy. */
async function finishExport(client, job, item) {
  if (job.status !== "completed") {
    throw new Error(`The export ${job.status}: ${job.error ?? "no details"}`);
  }
  const resultData = parseResultData(job) ?? {};
  let output = job.output ?? {};
  if (!output.url && item.project_id && (resultData.media_id || resultData.file_hash)) {
    // A job read back later may come without its signed URL; mint a fresh one.
    try {
      const media = await client.getMediaUrl(item.project_id, { mediaId: resultData.media_id, fileHash: resultData.file_hash });
      output = { ...output, url: media.storage_url, media_id: media.media_id };
    } catch (err) {
      log.warning(`Could not mint a fresh download URL: ${describeError(err)}`);
    }
  }
  const url = output.url ?? jobDownloadUrl(job);
  if (!url) throw new Error("The export completed but Rendley returned no video URL.");
  const stored = await storeOutput("OUTPUT_VIDEO", url, saveToKvs);
  await Actor.pushData({
    status: "completed",
    ...item,
    job_id: job.id,
    url,
    url_expires_at: output.url_expires_at ?? null,
    media_id: output.media_id ?? resultData.media_id ?? null,
    file_hash: output.file_hash ?? resultData.file_hash ?? null,
    mime_type: output.mime_type ?? resultData.mime_type ?? null,
    size: output.size ?? resultData.size ?? null,
    width: resultData.width ?? null,
    height: resultData.height ?? null,
    duration: output.duration ?? resultData.duration ?? null,
    result_data: resultData,
    export_job: job,
    ...stored,
    url_expiry: URL_EXPIRY_NOTE,
  });
}

/** The workspace of a project, or null when the project cannot be read. */
async function workspaceOf(client, projectId) {
  if (!projectId) return null;
  return (await orNull(client.getProject(projectId)))?.workspace_id ?? null;
}

/** A project name derived from the prompt, the way the Rendley app names agent projects. */
function projectName(prompt) {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  const short = oneLine.length > 60 ? `${oneLine.slice(0, 59).trimEnd()}…` : oneLine;
  return short || "Apify agent run";
}
