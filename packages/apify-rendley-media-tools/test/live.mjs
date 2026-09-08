/**
 * Runs the Actor locally through `apify run` against a real Rendley account.
 *
 *   RENDLEY_API_KEY=... npm run test:live
 *   RENDLEY_API_BASE_URL=https://api.example.test/v1   # optional
 *
 * Spends a few credits: a short text-to-speech clip, its transcription, one
 * image, and a cost estimate. Everything is saved to the workspace library.
 * The speech clip goes through the default flow, start without waiting and
 * pick the job up by job_id; the rest waits inside one run.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.RENDLEY_API_KEY;
const base = process.env.RENDLEY_API_BASE_URL || "https://api.rendley.com/v1";
if (!key) {
  console.error("Set RENDLEY_API_KEY (a paid-plan key; the run spends a few credits).");
  process.exit(1);
}

function runActor(input, { expectFailure = false } = {}) {
  rmSync(join(root, "storage"), { recursive: true, force: true });
  const full = { rendley_api_key: key, api_base_url: base, ...input };
  try {
    execFileSync("npx", ["apify", "run", "--purge", "--input", JSON.stringify(full)], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, APIFY_LOG_LEVEL: "INFO" },
    });
    assert.ok(!expectFailure, "the run should have failed");
  } catch (err) {
    if (!expectFailure) throw err;
  }
  const datasetDir = join(root, "storage", "datasets", "default");
  const items = readdirSync(datasetDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(datasetDir, f), "utf8")));
  assert.equal(items.length, 1, "exactly one dataset item");
  return items[0];
}

const kvsFile = (name) => readdirSync(join(root, "storage", "key_value_stores", "default")).find((f) => f.startsWith(name));

const results = [];
const step = async (name, fn) => {
  try {
    const extra = await fn();
    results.push(`PASS ${name} ${extra ?? ""}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
};

await step("missing source media fails cleanly", async () => {
  const item = runActor({ action: "upscale_image" }, { expectFailure: true });
  assert.equal(item.status, "failed");
  assert.match(item.error, /media/);
});

await step("estimate_only generate_video", async () => {
  const item = runActor({ action: "generate_video", prompt: "a cat", duration: 5, estimate_only: true });
  assert.equal(item.status, "completed", item.error);
  assert.equal(item.estimate_only, true);
  assert.ok(item.credits > 0, "credits");
  return `credits=${item.credits}`;
});

let speechMediaId;
let speechJobId;
await step("text_to_speech starts the job and exits without waiting (the default)", async () => {
  const item = runActor({ action: "text_to_speech", prompt: "Hello from Apify. This is a Rendley test." });
  assert.equal(item.status, "started", item.error);
  assert.ok(item.job_id, "job_id");
  assert.ok(item.workspace_id, "workspace_id (library destination)");
  assert.ok(item.project_id == null, "no project when saving to the library");
  assert.match(item.note ?? "", /job_id/);
  assert.ok(!kvsFile("OUTPUT_MEDIA"), "nothing stored yet");
  speechJobId = item.job_id;
  return `job_id=${item.job_id}`;
});

await step("pick the job up by job_id without waiting reports running or completed", async () => {
  assert.ok(speechJobId, "needs the previous step");
  const item = runActor({ job_id: speechJobId });
  assert.ok(["running", "completed"].includes(item.status), `status ${item.status}: ${item.error}`);
  assert.equal(item.job_id, speechJobId);
  assert.equal(item.action, "text_to_speech");
  return `status=${item.status}`;
});

await step("pick the job up by job_id and wait, with the KVS copy streamed", async () => {
  assert.ok(speechJobId, "needs the previous step");
  const item = runActor({ job_id: speechJobId, wait_for_completion: true });
  assert.equal(item.status, "completed", item.error);
  assert.equal(item.job_id, speechJobId);
  assert.ok(item.url, "url");
  assert.ok(item.media_id, "media_id");
  assert.ok(item.workspace_id, "workspace_id from the job");
  assert.ok(kvsFile("OUTPUT_MEDIA"), "OUTPUT_MEDIA stored");
  speechMediaId = item.media_id;
  return `media_id=${item.media_id} mime=${item.mime_type}`;
});

await step("transcribe the generated speech by media_id", async () => {
  assert.ok(speechMediaId, "needs the previous step");
  const item = runActor({ action: "transcribe", media: speechMediaId, wait_for_completion: true });
  assert.equal(item.status, "completed", item.error);
  assert.match(item.text ?? "", /apify/i);
  assert.ok(kvsFile("OUTPUT_TRANSCRIPT"), "OUTPUT_TRANSCRIPT stored");
  return `text="${item.text}"`;
});

await step("generate_image with an aspect ratio", async () => {
  const item = runActor({ action: "generate_image", prompt: "a red circle on a white background, flat vector", aspect_ratio: "1:1", wait_for_completion: true });
  assert.equal(item.status, "completed", item.error);
  assert.ok(item.url, "url");
  assert.match(item.mime_type ?? "", /image/);
  return `media_id=${item.media_id}`;
});

await step("unknown job_id fails cleanly", async () => {
  const item = runActor({ job_id: "00000000-0000-0000-0000-000000000000" }, { expectFailure: true });
  assert.equal(item.status, "failed");
  assert.match(item.error, /No job/);
});

await step("unknown workspace name fails with the list of workspaces", async () => {
  const item = runActor({ action: "generate_sound_effect", prompt: "whoosh", workspace_id: "no-such-workspace" }, { expectFailure: true });
  assert.equal(item.status, "failed");
  assert.match(item.error, /Available/);
});

console.log("\n" + results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
