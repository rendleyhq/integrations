/**
 * Rendley AI Video Editor (Apify Actor).
 *
 * One run performs one operation, chosen by the `operation` input:
 *   prompt_to_video   let the Rendley AI agent edit or create a project from a prompt, then render it
 *   ai_action         run any Rendley AI action (text to speech, dubbing, image or video generation, ...)
 *   transcribe        speech to timed text
 *   dub_video         translate and dub a video into another language
 *   export            render an existing project to MP4
 *   estimate_cost     credit price of an AI action or a render, without running it
 *
 * Every run pushes one item to the default dataset. Output files are written to
 * the run's key-value store as well (OUTPUT_VIDEO / OUTPUT_MEDIA / OUTPUT_TRANSCRIPT),
 * because Rendley's download URLs are signed and expire after a few hours.
 */
import { Actor, log } from "apify";

import { RendleyClient, RendleyError, jobDownloadUrl, parseResultData } from "./rendley.js";

const AGENT_TIMEOUT_MS = 20 * 60_000;
const EXPORT_TIMEOUT_MS = 15 * 60_000;
const AI_TIMEOUT_MS = 10 * 60_000;
const POLL_INTERVAL_MS = 5_000;
const URL_EXPIRY_NOTE = "Download URLs are signed and expire after a few hours; use the key-value store copy (kvs_url) for a durable link.";

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const operation = input.operation || "prompt_to_video";
const saveToKvs = input.save_to_kvs !== false;

try {
  if (!input.rendley_api_key) {
    throw new Error(
      "Missing rendley_api_key. Create an API key at https://app.rendley.com/settings and paste it into the Actor input.",
    );
  }
  const client = new RendleyClient({
    apiKey: input.rendley_api_key,
    apiBaseUrl: input.api_base_url || undefined,
  });

  const handlers = {
    prompt_to_video: runPromptToVideo,
    ai_action: runAiAction,
    transcribe: runTranscribe,
    dub_video: runDubVideo,
    export: runExport,
    estimate_cost: runEstimateCost,
  };
  const handler = handlers[operation];
  if (!handler) {
    throw new Error(`Unknown operation "${operation}". Expected one of: ${Object.keys(handlers).join(", ")}.`);
  }

  log.info(`Rendley: running operation "${operation}"`);
  const item = await handler(client);
  await Actor.pushData({ operation, status: "completed", ...item });
  log.info("Done.", { operation });
  await Actor.exit();
} catch (err) {
  const message = describeError(err);
  log.exception(err instanceof Error ? err : new Error(String(err)), message);
  await Actor.pushData({ operation, status: "failed", error: message });
  await Actor.fail(truncate(message, 480));
}

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

async function runPromptToVideo(client) {
  const prompt = (input.prompt ?? "").trim();
  if (!prompt) throw new Error('Operation "prompt_to_video" requires a prompt.');

  const files = toStringArray(input.file_urls).map((url) => ({ url }));
  const started = await client.startAgentJob({
    prompt,
    ...(input.project_id ? { projectId: input.project_id } : {}),
    ...(input.thread_id ? { threadId: input.thread_id } : {}),
    ...(files.length ? { files } : {}),
  });
  log.info(`Agent job ${started.job_id} started on project ${started.project_id}. Waiting up to 20 minutes.`);

  const agentJob = await client.waitForAgentJob(started.job_id, waitOpts(AGENT_TIMEOUT_MS, "agent"));
  if (agentJob.status !== "completed") {
    throw new Error(`The agent edit ${agentJob.status}: ${agentJob.error ?? agentJob.last_message ?? "no details"}`);
  }

  const base = {
    project_id: agentJob.project_id ?? started.project_id,
    thread_id: agentJob.thread_id ?? started.thread_id ?? null,
    agent_job_id: started.job_id,
    agent_message: agentJob.last_message ?? null,
    commands_applied: agentJob.commands_applied ?? null,
    commands_failed: agentJob.commands_failed ?? null,
  };

  if (input.render === false) {
    return { ...base, note: "render was disabled; run the export operation on project_id to get an MP4." };
  }
  const exported = await exportProject(client, base.project_id);
  const stored = await storeOutput("OUTPUT_VIDEO", exported.video_url);
  return { ...base, ...exported, ...stored, url_expiry: URL_EXPIRY_NOTE };
}

async function runAiAction(client) {
  const action = input.action;
  if (!action) throw new Error('Operation "ai_action" requires an action.');
  requireProjectId("ai_action");
  const params = toObject(input.params, "params");
  const media = await runAiAndResolve(client, action, {
    projectId: input.project_id,
    ...(input.model_id ? { modelId: input.model_id } : {}),
    params,
  });
  if (media.download_url) {
    const stored = await storeOutput("OUTPUT_MEDIA", media.download_url);
    return { action, ...media, ...stored, url_expiry: URL_EXPIRY_NOTE };
  }
  return { action, ...media };
}

async function runTranscribe(client) {
  if (!input.media) throw new Error('Operation "transcribe" requires media (a public URL, media ID or file hash).');
  requireProjectId("transcribe");
  const params = { media: String(input.media).trim() };
  if (input.start_time !== undefined && input.start_time !== null) params.start_time = input.start_time;
  if (input.end_time !== undefined && input.end_time !== null) params.end_time = input.end_time;

  const { jobId } = await client.runAiAction("transcribe", {
    projectId: input.project_id,
    ...(input.model_id ? { modelId: input.model_id } : {}),
    params,
  });
  log.info(`Transcription job ${jobId} started. Waiting up to 10 minutes.`);
  const job = await client.waitForJob(jobId, waitOpts(AI_TIMEOUT_MS, "transcribe"));
  if (job.status !== "completed") throw new Error(`Transcription ${job.status}: ${job.error ?? "no details"}`);
  const transcript = parseResultData(job) ?? {};

  let stored = {};
  if (saveToKvs) {
    await Actor.setValue("OUTPUT_TRANSCRIPT", transcript);
    stored = { kvs_key: "OUTPUT_TRANSCRIPT", kvs_url: await publicKvsUrl("OUTPUT_TRANSCRIPT") };
  }
  return {
    project_id: input.project_id,
    job_id: jobId,
    text: typeof transcript.text === "string" ? transcript.text : null,
    language_code: typeof transcript.language_code === "string" ? transcript.language_code : null,
    transcript,
    ...stored,
  };
}

async function runDubVideo(client) {
  if (!input.media) throw new Error('Operation "dub_video" requires media (a public URL, media ID or file hash).');
  if (!input.output_language) {
    throw new Error(
      'Operation "dub_video" requires output_language (for example "es"). The list is at https://api.rendley.com/v1/ai/video-translate/languages.',
    );
  }
  requireProjectId("dub_video");
  const dubbed = await runAiAndResolve(client, "video-translate", {
    projectId: input.project_id,
    ...(input.model_id ? { modelId: input.model_id } : {}),
    params: {
      media: String(input.media).trim(),
      output_language: input.output_language,
      ...(input.mode ? { mode: input.mode } : {}),
    },
  });
  const stored = await storeOutput("OUTPUT_VIDEO", dubbed.download_url);
  return {
    ...dubbed,
    video_url: dubbed.download_url,
    output_language: input.output_language,
    ...stored,
    url_expiry: URL_EXPIRY_NOTE,
  };
}

async function runExport(client) {
  requireProjectId("export");
  const exported = await exportProject(client, input.project_id);
  const stored = await storeOutput("OUTPUT_VIDEO", exported.video_url);
  return { project_id: input.project_id, ...exported, ...stored, url_expiry: URL_EXPIRY_NOTE };
}

async function runEstimateCost(client) {
  const action = input.action;
  if (!action) throw new Error('Operation "estimate_cost" requires an action (an AI action name or "export").');
  requireProjectId("estimate_cost");
  const credits =
    action === "export"
      ? await client.estimateExportCost({ projectId: input.project_id, settings: exportSettings() })
      : await client.estimateAiActionCost(action, {
          projectId: input.project_id,
          ...(input.model_id ? { modelId: input.model_id } : {}),
          params: toObject(input.params, "params"),
        });
  return { action, project_id: input.project_id, credits, estimated_usd: Math.round(credits) / 100 };
}

// -----------------------------------------------------------------------------
// Building blocks
// -----------------------------------------------------------------------------

function exportSettings() {
  return {
    target_resolution: input.resolution || "1080p",
    quality: input.quality || "high",
    codec: input.codec || "h264",
  };
}

async function exportProject(client, projectId) {
  const { jobId } = await client.createExport({ projectId, settings: exportSettings() });
  log.info(`Export job ${jobId} started. Waiting up to 15 minutes.`);
  const job = await client.waitForJob(jobId, waitOpts(EXPORT_TIMEOUT_MS, "export"));
  if (job.status !== "completed") throw new Error(`The render ${job.status}: ${job.error ?? "no details"}`);
  const url = jobDownloadUrl(job);
  if (!url) throw new Error("The render completed but Rendley returned no video URL.");
  const result = parseResultData(job) ?? {};
  return {
    job_id: jobId,
    video_url: url,
    url_expires_at: job.output?.url_expires_at ?? null,
    media_id: job.output?.media_id ?? result.media_id ?? null,
    file_hash: job.output?.file_hash ?? result.file_hash ?? null,
    mime_type: job.output?.mime_type ?? result.mime_type ?? null,
    size: job.output?.size ?? result.size ?? null,
    width: result.width ?? null,
    height: result.height ?? null,
    duration: job.output?.duration ?? result.duration ?? null,
  };
}

/** Run one AI action, wait, and hand back a flat item with a fresh download URL. */
async function runAiAndResolve(client, action, actionInput) {
  const { jobId } = await client.runAiAction(action, actionInput);
  log.info(`AI action "${action}" started as job ${jobId}. Waiting up to 10 minutes.`);
  const job = await client.waitForJob(jobId, waitOpts(AI_TIMEOUT_MS, action));
  if (job.status !== "completed") throw new Error(`AI action "${action}" ${job.status}: ${job.error ?? "no details"}`);
  const result = parseResultData(job) ?? {};
  return {
    project_id: actionInput.projectId,
    job_id: jobId,
    media_id: job.output?.media_id ?? result.media_id ?? null,
    file_hash: job.output?.file_hash ?? result.file_hash ?? null,
    download_url: jobDownloadUrl(job) ?? null,
    url_expires_at: job.output?.url_expires_at ?? null,
    mime_type: job.output?.mime_type ?? result.mime_type ?? null,
    result,
  };
}

/** Copy the file behind a signed URL into the run's key-value store. */
async function storeOutput(key, fileUrl) {
  if (!saveToKvs || !fileUrl) return {};
  const download = await downloadFile(fileUrl);
  if (!download) {
    log.warning("Could not copy the output file to the key-value store; the signed URL in the dataset still works for a few hours.");
    return {};
  }
  await Actor.setValue(key, download.buffer, { contentType: download.contentType });
  log.info(`Output saved to the key-value store as ${key} (${download.buffer.length} bytes).`);
  return { kvs_key: key, kvs_url: await publicKvsUrl(key) };
}

async function publicKvsUrl(key) {
  const store = await Actor.openKeyValueStore();
  if (typeof store.getPublicUrl === "function") return await store.getPublicUrl(key);
  return `https://api.apify.com/v2/key-value-stores/${store.id}/records/${key}`;
}

async function downloadFile(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warning(`Downloading the output file failed with HTTP ${res.status}.`);
      return null;
    }
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  } catch (err) {
    log.warning(`Downloading the output file failed: ${err?.message ?? err}`);
    return null;
  }
}

function waitOpts(timeoutMs, label) {
  let last = "";
  return {
    timeoutMs,
    pollIntervalMs: POLL_INTERVAL_MS,
    onPoll: (status) => {
      if (status !== last) {
        last = status;
        log.info(`[${label}] status: ${status}`);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Input coercion and errors
// -----------------------------------------------------------------------------

function requireProjectId(op) {
  if (!input.project_id) {
    throw new Error(
      `Operation "${op}" requires project_id: generated media is stored in a Rendley project. Create one at app.rendley.com or with POST /v1/projects.`,
    );
  }
}

function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function toObject(value, name) {
  if (value == null || value === "") return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  throw new Error(`Input "${name}" must be a JSON object.`);
}

function describeError(err) {
  if (err instanceof RendleyError) {
    return `${err.message} (code: ${err.code}${err.status ? `, HTTP ${err.status}` : ""})`;
  }
  return err instanceof Error ? err.message : String(err);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
