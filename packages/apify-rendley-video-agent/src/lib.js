/**
 * Helpers shared by the Rendley Apify Actors.
 *
 * Source of truth: packages/apify-common/lib.js. Each Actor copies it into
 * src/lib.js with `npm run build:client` so the Actor stays self-contained;
 * CI fails when a copy is stale.
 */
import { Readable } from "node:stream";

import { Actor, log } from "apify";

import { RendleyClient, RendleyError } from "./rendley.js";

export const POLL_INTERVAL_MS = 10_000;
export const URL_EXPIRY_NOTE =
  "Download URLs are signed and expire after a few hours; use the key-value store copy (kvs_url) for a durable link.";

/** A client for the account behind `rendley_api_key`, pointed at `api_base_url` when set. */
export function createClient(input) {
  if (!input.rendley_api_key) {
    throw new Error(
      "Missing rendley_api_key. Create an API key at https://app.rendley.com/settings and paste it into the Actor input.",
    );
  }
  return new RendleyClient({
    apiKey: String(input.rendley_api_key).trim(),
    apiBaseUrl: input.api_base_url ? String(input.api_base_url).trim() : undefined,
  });
}

/**
 * Picks the workspace a run works in. `requested` may be a workspace ID or a
 * workspace name; empty means the account's first workspace. The alternatives
 * are logged so the user can point the next run at another one.
 */
export async function resolveWorkspace(client, requested) {
  const workspaces = (await client.listWorkspaces()) ?? [];
  if (workspaces.length === 0) {
    throw new Error("No workspace found for this API key. Create one at https://app.rendley.com.");
  }
  const wanted = String(requested ?? "").trim();
  if (wanted) {
    const match =
      workspaces.find((w) => w.id === wanted) ??
      workspaces.find((w) => String(w.name ?? "").toLowerCase() === wanted.toLowerCase());
    if (!match) {
      throw new Error(`No workspace with the ID or name "${wanted}". Available: ${describeWorkspaces(workspaces)}.`);
    }
    log.info(`Workspace: ${match.name} (${match.id}).`);
    return match;
  }
  const first = workspaces[0];
  if (workspaces.length > 1) {
    log.warning(
      `Using the first workspace "${first.name}" (${first.id}). Set workspace_id to use another one: ${describeWorkspaces(workspaces)}.`,
    );
  } else {
    log.info(`Workspace: ${first.name} (${first.id}).`);
  }
  return first;
}

function describeWorkspaces(workspaces) {
  return workspaces.map((w) => `"${w.name}" (${w.id})`).join(", ");
}

/** Whether `err` is a Rendley API error with the given code (for example PLAN_LIMIT_REACHED). */
export function hasCode(err, code) {
  return err instanceof RendleyError && err.code === code;
}

/**
 * The project named `name` in the workspace, created when missing. A plan's
 * project limit becomes a clear error instead of a 403.
 */
export async function ensureProject(client, workspaceId, name) {
  const projects = await client.listProjects(workspaceId);
  const existing = projects.find((p) => p.name === name);
  if (existing) {
    log.info(`Using project "${name}" (${existing.id}).`);
    return existing;
  }
  try {
    const project = await client.createProject({ name, workspaceId });
    log.info(`Created project "${name}" (${project.id}).`);
    return project;
  } catch (err) {
    if (hasCode(err, "PLAN_LIMIT_REACHED")) {
      throw new Error(
        "The project limit of your Rendley plan is reached, so no project could be created. Delete a project in the Rendley app or set project_id to reuse one.",
      );
    }
    throw err;
  }
}

/** Time kept free at the end of a run for copying the file and writing the item. */
const WAIT_MARGIN_MS = 2 * 60_000;
/** How long a run waits when the platform gives it no deadline, as when run locally. */
const WAIT_FALLBACK_MS = 6 * 60 * 60_000;

/**
 * How long this run may still wait for a job: until two minutes before Apify
 * stops the run (its timeout, one hour by default and settable per run), so
 * a waiting run never fails on a limit of its own.
 */
export function waitBudgetMs() {
  const timeoutAt = Actor.getEnv().timeoutAt;
  if (!timeoutAt) return WAIT_FALLBACK_MS;
  return Math.max(new Date(timeoutAt).getTime() - Date.now() - WAIT_MARGIN_MS, 1_000);
}

/** Poll options that wait for the rest of the run's budget and log every status change. */
export function waitOpts(label) {
  let last = "";
  const timeoutMs = waitBudgetMs();
  const budget = timeoutMs >= 60_000 ? `${Math.round(timeoutMs / 60_000)} minutes` : `${Math.round(timeoutMs / 1000)} seconds`;
  log.info(`[${label}] waiting up to ${budget}, the rest of this run's time.`);
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

/**
 * Runs a wait and returns its result, or null when the run's time budget ran
 * out first. The job itself keeps running on Rendley, so the caller reports
 * it as running instead of failing.
 */
export async function waitWithinBudget(wait) {
  try {
    return await wait();
  } catch (err) {
    if (hasCode(err, "WAIT_TIMEOUT")) {
      log.warning("This run's time budget ended before the job finished. The job continues on Rendley.");
      return null;
    }
    throw err;
  }
}

/** The dataset item text for a job that outlived the run's time budget. */
export function budgetNote(resume) {
  return `The job is still running on Rendley; this run waited as long as its timeout allowed. ${resume} A longer run timeout lets one run wait longer.`;
}

/**
 * Copies the file behind a signed URL into the run's key-value store under
 * `key` and returns `{ kvs_key, kvs_url }`, or `{}` when disabled or the copy
 * fails (the signed URL in the dataset still works for a few hours). The file
 * is streamed from Rendley straight into the store, so a run never holds it
 * in memory and the smallest Apify memory setting is enough.
 */
export async function storeOutput(key, fileUrl, enabled = true) {
  if (!enabled || !fileUrl) return {};
  // A streamed upload cannot be retried by the client, so the whole copy is
  // retried from a fresh download instead.
  let reason = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(fileUrl);
      if (!res.ok || !res.body) {
        reason = `HTTP ${res.status} from the download URL`;
        break;
      }
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const size = res.headers.get("content-length");
      await Actor.setValue(key, Readable.fromWeb(res.body), { contentType });
      log.info(`Output copied to the key-value store as ${key}${size ? ` (${size} bytes)` : ""}.`);
      return { kvs_key: key, kvs_url: await publicKvsUrl(key) };
    } catch (err) {
      reason = err?.message ?? String(err);
      if (attempt === 1) log.warning(`Copying the output file to the key-value store failed (${reason}); retrying once.`);
    }
  }
  log.warning(`Could not copy the output file to the key-value store (${reason}). The signed URL in the dataset still works for a few hours.`);
  return {};
}

/** Stores a JSON value under `key` and returns `{ kvs_key, kvs_url }`. */
export async function storeJson(key, value, enabled = true) {
  if (!enabled) return {};
  await Actor.setValue(key, value);
  return { kvs_key: key, kvs_url: await publicKvsUrl(key) };
}

export async function publicKvsUrl(key) {
  const store = await Actor.openKeyValueStore();
  if (typeof store.getPublicUrl === "function") return await store.getPublicUrl(key);
  return `https://api.apify.com/v2/key-value-stores/${store.id}/records/${key}`;
}

/**
 * The dataset item for a job that is still running on Rendley, pushed when the
 * run does not wait. `resume` says how to pick the result up later.
 */
export function pendingNote(status, resume) {
  return status === "started"
    ? `The job was started on Rendley and this run did not wait for it. ${resume}`
    : `The job is still running on Rendley. ${resume}`;
}

/** A one-line description of an error for the dataset and the run status. */
export function describeError(err) {
  if (err instanceof RendleyError) {
    return `${err.message} (code: ${err.code}${err.status ? `, HTTP ${err.status}` : ""})`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Accepts a string list, a single string, or nothing. */
export function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/** Accepts an object or a JSON string of one; empty means `{}`. */
export function toObject(value, name) {
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

/** Drops keys whose value is undefined, null or an empty string. */
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

/** Trimmed string input, or an empty string. */
export function text(value) {
  return value == null ? "" : String(value).trim();
}
