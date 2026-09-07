/**
 * Runs the Actor locally through `apify run` against a real Rendley account.
 *
 *   RENDLEY_API_KEY=... npm run test:live
 *   RENDLEY_API_BASE_URL=https://api.staging.example/v1   # optional
 *
 * Spends a few credits (a sound effect, a transcription, a trivial agent run).
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
const { RendleyClient } = await import("../src/rendley.js");
const client = new RendleyClient({ apiKey: key, apiBaseUrl: base });

function runActor(input) {
  rmSync(join(root, "storage"), { recursive: true, force: true });
  const full = { rendley_api_key: key, api_base_url: base, ...input };
  execFileSync("npx", ["apify", "run", "--purge", "--input", JSON.stringify(full)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, APIFY_LOG_LEVEL: "INFO" },
  });
  const datasetDir = join(root, "storage", "datasets", "default");
  const items = readdirSync(datasetDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(datasetDir, f), "utf8")));
  assert.equal(items.length, 1, "exactly one dataset item");
  return items[0];
}

const results = [];
const step = async (name, fn) => {
  try {
    const extra = await fn();
    results.push(`PASS ${name} ${extra ?? ""}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
};

const project = await client.createProject({ name: "apify-live-test" });
try {
  await step("estimate_cost generate-video", async () => {
    const item = runActor({ operation: "estimate_cost", project_id: project.id, action: "generate-video", params: { prompt: "a cat", duration: 5 } });
    assert.equal(item.status, "completed");
    assert.ok(item.credits > 0);
    return `credits=${item.credits}`;
  });

  await step("ai_action generate-sound-effect (2 s) with KVS copy", async () => {
    const item = runActor({ operation: "ai_action", project_id: project.id, action: "generate-sound-effect", params: { prompt: "a single soft rain drop", duration_seconds: 2 } });
    assert.equal(item.status, "completed");
    assert.ok(item.download_url && item.media_id);
    assert.equal(item.kvs_key, "OUTPUT_MEDIA");
    const kvs = join(root, "storage", "key_value_stores", "default");
    assert.ok(existsSync(kvs) && readdirSync(kvs).some((f) => f.startsWith("OUTPUT_MEDIA")), "OUTPUT_MEDIA stored locally");
    return `job=${item.job_id}`;
  });

  let mediaId;
  await step("transcribe an imported URL by media id", async () => {
    const upload = await client.importUpload(project.id, { downloadUrl: "https://download.samplelib.com/mp3/sample-3s.mp3", fileName: "sample.mp3" });
    mediaId = upload.media_id;
    const item = runActor({ operation: "transcribe", project_id: project.id, media: mediaId });
    assert.equal(item.status, "completed");
    assert.equal(typeof item.text, "string");
    assert.equal(item.kvs_key, "OUTPUT_TRANSCRIPT");
    return `text="${item.text.slice(0, 40)}"`;
  });

  await step("prompt_to_video without render (trivial prompt)", async () => {
    const item = runActor({ operation: "prompt_to_video", project_id: project.id, prompt: "Reply with the single word OK and make no changes.", render: false });
    assert.equal(item.status, "completed");
    assert.equal(item.project_id, project.id);
    assert.ok(item.agent_job_id);
    return `message="${item.agent_message}"`;
  });

  await step("failure path: missing project_id is reported cleanly", async () => {
    let item;
    try {
      item = runActor({ operation: "transcribe", media: "x" });
    } catch {
      // apify run exits non-zero on Actor.fail; read the dataset item anyway.
      const datasetDir = join(root, "storage", "datasets", "default");
      item = JSON.parse(readFileSync(join(datasetDir, readdirSync(datasetDir).find((f) => f.endsWith(".json"))), "utf8"));
    }
    assert.equal(item.status, "failed");
    assert.match(item.error, /project_id/);
  });
} finally {
  await client.deleteProject(project.id).catch(() => {});
}

console.log("\n" + results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} pass / ${failed} fail`);
process.exit(failed ? 1 : 0);
