/**
 * Rendley AI Media Tools (Apify Actor).
 *
 * One run is one Rendley AI action: generate an image, a video clip, music, a
 * sound effect or speech, or transform existing media (upscale, remove the
 * background, change or isolate a voice, lip sync, dub, transcribe).
 *
 * Each action has its own form fields, which map by name onto the parameters
 * of Rendley's default model for that action. Model, voice and language
 * dropdowns are generated from Rendley's catalog by scripts/sync-catalog.mjs.
 * Fields of other models go into the "Extra model parameters" JSON, documented
 * in the model catalog on docs.rendley.com. Before any credits are spent the
 * Actor checks the parameters against the chosen model's schema.
 *
 * The result lands in the workspace library by default, or in a project when
 * `project_id` is set.
 *
 * The work happens on Rendley, not in this container, so by default a run only
 * starts the job and exits within seconds. The result is picked up by a later
 * run with `job_id` set, or the same run waits when `wait_for_completion` is
 * on. Either way every run pushes one item to the default dataset, and the
 * file is streamed into the run's key-value store as OUTPUT_MEDIA (transcripts
 * as OUTPUT_TRANSCRIPT), because Rendley's download URLs expire after a few
 * hours.
 */
import { Actor, log } from "apify";

import { isTerminal, jobDownloadUrl, parseResultData } from "./rendley.js";
import {
  URL_EXPIRY_NOTE,
  compact,
  createClient,
  describeError,
  budgetNote,
  ensureProject,
  hasCode,
  pendingNote,
  resolveWorkspace,
  storeJson,
  storeOutput,
  text,
  toObject,
  toStringArray,
  truncate,
  waitOpts,
  waitWithinBudget,
} from "./lib.js";

const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
const FALLBACK_PROJECT_NAME = "Apify media";
const RESUME = "Run this Actor again with that ID in job_id to pick up the result, with wait_for_completion on if that run should wait for it.";

/**
 * Every action the Actor offers. `params` builds the request parameters from
 * the form fields using the parameter names of Rendley's default model for
 * that action, as documented on the action's page at docs.rendley.com/api.
 * "Extra model parameters" is merged on top, which is how fields of other
 * models are set. `required` names the form fields the action cannot run
 * without.
 */
const ACTIONS = {
  generate_image: {
    endpoint: "generate-image",

    required: ["prompt"],
    params: (i) => ({ prompt: text(i.prompt), aspect_ratio: text(i.aspect_ratio), image_inputs: list(i.reference_images) }),
  },
  generate_video: {
    endpoint: "generate-video",

    required: ["prompt"],
    params: (i) => ({ prompt: text(i.prompt), aspect_ratio: text(i.aspect_ratio), duration: i.duration, start_image: first(i.reference_images) }),
  },
  generate_music: {
    endpoint: "generate-music",

    required: ["prompt"],
    params: (i) => ({ prompt: text(i.prompt), duration_seconds: i.duration }),
  },
  generate_sound_effect: {
    endpoint: "generate-sound-effect",

    required: ["prompt"],
    params: (i) => ({ prompt: text(i.prompt), duration_seconds: i.duration }),
  },
  text_to_speech: {
    endpoint: "text-to-speech",

    required: ["prompt"],
    params: (i) => ({ prompt: text(i.prompt), voice_id: text(i.voice_id) || DEFAULT_VOICE_ID }),
  },
  voice_changer: {
    endpoint: "voice-changer",

    required: ["media", "voice_id"],
    params: (i) => ({ media: text(i.media), voice_id: text(i.voice_id) }),
  },
  voice_isolation: { endpoint: "voice-isolation", required: ["media"], params: (i) => ({ media: text(i.media) }) },
  upscale_image: { endpoint: "upscale-image", required: ["media"], params: (i) => ({ media: text(i.media) }) },
  upscale_video: { endpoint: "upscale-video", required: ["media"], params: (i) => ({ media: text(i.media) }) },
  remove_image_background: { endpoint: "remove-image-background", required: ["media"], params: (i) => ({ media: text(i.media) }) },
  remove_video_background: { endpoint: "remove-video-background", required: ["media"], params: (i) => ({ media: text(i.media) }) },
  lipsync: {
    endpoint: "lipsync",

    required: ["media", "audio_media"],
    params: (i) => ({ video_media: text(i.media), audio_media: text(i.audio_media) }),
  },
  video_translate: {
    endpoint: "video-translate",

    required: ["media", "output_language"],
    params: (i) => ({ media: text(i.media), output_language: text(i.output_language), mode: text(i.dubbing_mode) }),
  },
  transcribe: {
    endpoint: "transcribe",

    required: ["media"],
    params: (i) => ({ media: text(i.media), start_time: i.start_time, end_time: i.end_time }),
  },
};

/** The form's title for an input, for error messages. */
const FIELD_LABELS = {
  prompt: "Prompt or script",
  media: "Source media",
  audio_media: "Audio track (lip sync)",
  voice_id: "Voice",
  output_language: "Target language (dubbing)",
};

await Actor.init();

const input = (await Actor.getInput()) ?? {};
// Waiting is what an Apify run pays for, so it is off by default: the run
// starts the job and exits, and a later run with job_id collects the result.
const waitForCompletion = input.wait_for_completion === true;
const saveToKvs = input.save_to_kvs !== false;
const action = text(input.action);
// IDs learned so far, so a failed item still says which job it concerns.
const known = {};

try {
  const client = createClient(input);
  const resumeJobId = text(input.job_id);
  if (resumeJobId) {
    await resume(client, resumeJobId);
    await Actor.exit();
  }
  const def = ACTIONS[action];
  if (!def) {
    throw new Error(`Unknown action "${action}". Expected one of: ${Object.keys(ACTIONS).join(", ")}.`);
  }

  for (const field of def.required) {
    if (!text(input[field])) throw new Error(`${action} needs the "${FIELD_LABELS[field] ?? field}" input.`);
  }
  const params = { ...compact(def.params(input)), ...toObject(input.params, "params") };
  const requestedModel = text(input.model_id) || undefined;
  const model = await findModel(client, action, requestedModel);
  checkParams(model, params);
  const modelId = model?.id ?? requestedModel;

  // Where the result lands: a project, or the workspace library.
  const projectId = text(input.project_id) || undefined;
  let workspaceId;
  if (projectId) {
    log.info(`Saving the result to project ${projectId}.`);
    if (text(input.workspace_id)) log.warning("workspace_id is ignored because project_id already determines the workspace.");
  } else {
    workspaceId = (await resolveWorkspace(client, input.workspace_id)).id;
    log.info("Saving the result to the workspace library.");
  }
  const target = { projectId, workspaceId, modelId: requestedModel, params };
  const base = { action, model_id: modelId ?? null, project_id: projectId ?? null, workspace_id: workspaceId ?? null };

  if (input.estimate_only) {
    const credits = await client.estimateAiActionCost(def.endpoint, target);
    log.info(`${action} would cost ${credits} credits.`);
    await Actor.pushData({ status: "completed", ...base, estimate_only: true, credits });
    await Actor.exit();
  }

  let jobId;
  try {
    ({ jobId } = await client.runAiAction(def.endpoint, target));
  } catch (err) {
    // Accounts without library access keep media in projects.
    if (!projectId && hasCode(err, "SUBSCRIPTION_REQUIRED")) {
      log.warning("The workspace library is not available on this account; saving the result to a project instead.");
      const project = await ensureProject(client, workspaceId, FALLBACK_PROJECT_NAME);
      target.projectId = project.id;
      target.workspaceId = undefined;
      base.project_id = project.id;
      ({ jobId } = await client.runAiAction(def.endpoint, target));
    } else {
      throw err;
    }
  }
  if (!waitForCompletion) {
    await Actor.pushData({ status: "started", ...base, job_id: jobId, note: pendingNote("started", RESUME) });
    log.info(`${action} started as job ${jobId} on Rendley. Not waiting; pass it as job_id to a later run.`);
    await Actor.exit();
  }

  Object.assign(known, base, { job_id: jobId });
  log.info(`${action} started as job ${jobId}.`);
  const job = await waitWithinBudget(() => client.waitForJob(jobId, waitOpts(action)));
  if (!job) {
    await Actor.pushData({ status: "running", ...base, job_id: jobId, note: budgetNote(RESUME) });
  } else {
    await finish(job, base);
  }
  log.info("Done.");
  await Actor.exit();
} catch (err) {
  const message = describeError(err);
  log.exception(err instanceof Error ? err : new Error(String(err)), message);
  await Actor.pushData({ status: "failed", ...(action ? { action } : {}), ...known, error: message });
  await Actor.fail(truncate(message, 480));
}

// -----------------------------------------------------------------------------

/** Picks up a job from an earlier run by its ID, waiting for it when asked to. */
async function resume(client, jobId) {
  log.info(`Checking job ${jobId}.`);
  let job;
  try {
    job = await client.getJob(jobId);
  } catch (err) {
    if (err?.status === 404) throw new Error(`No job with the ID ${jobId} exists on this account.`);
    throw err;
  }
  const inputData = parseJson(job.input_data) ?? {};
  const base = {
    action: job.type ?? null,
    model_id: inputData.model_id ?? null,
    project_id: job.project_id ?? inputData.project_id ?? null,
    workspace_id: inputData.workspace_id ?? null,
  };
  Object.assign(known, base, { job_id: jobId });
  if (!isTerminal(job.status)) {
    if (!waitForCompletion) {
      await Actor.pushData({ status: "running", ...base, job_id: jobId, note: pendingNote("running", RESUME) });
      log.info(`Job ${jobId} is ${job.status}. Not waiting.`);
      return;
    }
    log.info(`Job ${jobId} is ${job.status}.`);
    job = await waitWithinBudget(() => client.waitForJob(jobId, waitOpts(base.action ?? "job")));
    if (!job) {
      await Actor.pushData({ status: "running", ...base, job_id: jobId, note: budgetNote(RESUME) });
      return;
    }
  }
  await finish(job, base);
}

/**
 * The finished job becomes the dataset item: the fields of `output`
 * flattened under their own names, `result_data` parsed, and the raw job as
 * `job`. A transcript is stored as JSON, anything else as the file itself.
 */
async function finish(job, base) {
  if (job.status !== "completed") {
    throw new Error(`${base.action ?? "The job"} ${job.status}: ${job.error ?? "no details"}`);
  }
  const resultData = parseResultData(job) ?? {};
  const output = job.output ?? {};
  const url = jobDownloadUrl(job) ?? null;
  if (!url && typeof resultData.text === "string") {
    const stored = await storeJson("OUTPUT_TRANSCRIPT", resultData, saveToKvs);
    await Actor.pushData({
      status: "completed",
      ...base,
      job_id: job.id,
      text: resultData.text,
      language_code: typeof resultData.language_code === "string" ? resultData.language_code : null,
      result_data: resultData,
      job,
      ...stored,
    });
    return;
  }
  const stored = await storeOutput("OUTPUT_MEDIA", url, saveToKvs);
  await Actor.pushData({
    status: "completed",
    ...base,
    job_id: job.id,
    media_id: output.media_id ?? resultData.media_id ?? null,
    file_hash: output.file_hash ?? resultData.file_hash ?? null,
    url,
    url_expires_at: output.url_expires_at ?? null,
    mime_type: output.mime_type ?? resultData.mime_type ?? null,
    size: output.size ?? null,
    duration: output.duration ?? null,
    result_data: resultData,
    job,
    ...stored,
    url_expiry: URL_EXPIRY_NOTE,
  });
}

/** A JSON string as a value, or undefined when it is not JSON. */
function parseJson(value) {
  if (typeof value !== "string") return value ?? undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * The model this run uses, from Rendley's catalog: the requested one, or the
 * action's default. A model that is not offered for the action is reported
 * with the ones that are. Returns null when the catalog cannot be read.
 */
async function findModel(client, actionName, requested) {
  let tools;
  try {
    tools = await client.listAiTools();
  } catch (err) {
    log.warning(`Could not read the model catalog (${describeError(err)}); running without parameter checks.`);
    return null;
  }
  const models = (tools ?? []).find((t) => t.action === actionName)?.models ?? [];
  if (requested) {
    const model = models.find((m) => m.id === requested);
    if (!model) {
      throw new Error(`Model "${requested}" is not available for ${actionName}. Available models are ${models.map((m) => m.id).join(", ")}.`);
    }
    return model;
  }
  return models.find((m) => /default for/i.test(m.description ?? "")) ?? models[0] ?? null;
}

/**
 * Checks the parameters against the model's schema from Rendley's catalog and
 * stops with a readable message before any credits are spent. Values arriving
 * as strings from dropdowns are sent in the type the model declares.
 */
function checkParams(model, params) {
  const props = model?.schema?.properties;
  if (!props) return;
  const has = (name) => Object.prototype.hasOwnProperty.call(props, name);
  const accepted = Object.keys(props);
  const unknown = Object.keys(params).filter((k) => !has(k));
  if (unknown.length) {
    throw new Error(`Model ${model.id} does not accept ${unknown.join(", ")}. It accepts ${accepted.join(", ")}. See https://docs.rendley.com/api/models.`);
  }
  const missing = (model.schema.required ?? []).filter((k) => params[k] === undefined || params[k] === "");
  if (missing.length) {
    throw new Error(`Model ${model.id} needs ${missing.join(", ")}. Set it in Extra model parameters, or pick the default model for the action.`);
  }
  for (const [name, value] of Object.entries(params)) {
    params[name] = coerce(props[name], value);
    const allowed = props[name].enum;
    if (allowed && !allowed.map(String).includes(String(params[name]))) {
      throw new Error(`${name} must be one of ${allowed.join(", ")} for model ${model.id}, not "${value}".`);
    }
  }
  log.info(`Model ${model.id} with ${Object.keys(params).join(", ")}.`);
}

/** Form values arrive as strings from dropdowns; send them in the type the model declares. */
function coerce(prop, value) {
  if (Array.isArray(value)) return toStringArray(value);
  if (typeof value !== "string") return value;
  if (prop.type === "integer" || prop.type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (prop.type === "boolean") return value === "true" ? true : value === "false" ? false : value;
  return value;
}

/** A list input as an array of trimmed strings, or undefined when empty. */
function list(value) {
  const values = toStringArray(value);
  return values.length ? values : undefined;
}

/** The first entry of a list input, or undefined. */
function first(value) {
  return toStringArray(value)[0];
}
