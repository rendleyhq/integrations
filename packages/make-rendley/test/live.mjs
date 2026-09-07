/**
 * Exercises every module and RPC of the app against a real Rendley account,
 * through a small IML interpreter (test/iml-runtime.mjs) that runs each
 * communication file the way Make would: template evaluation, the request,
 * error mapping and the response mapping.
 *
 *   RENDLEY_API_KEY=... npm run test:live
 *   RENDLEY_API_BASE_URL=https://api.staging.example/v1   # optional
 *
 * Spends a few credits (a sound effect, a transcription, a trivial agent run).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { ImlRuntime } from "./iml-runtime.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.RENDLEY_API_KEY;
const base = (process.env.RENDLEY_API_BASE_URL || JSON.parse(readFileSync(join(root, "base.imljson"), "utf8")).baseUrl).replace(/\/+$/, "");
if (!key) {
  console.error("Set RENDLEY_API_KEY (a paid-plan key; the run spends a few credits).");
  process.exit(1);
}
const rt = new ImlRuntime({ baseUrl: base, apiKey: key });
const load = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const module_ = (name) => load(`modules/${name}/communication.imljson`);
const rpc = (name) => load(`rpcs/${name}/communication.imljson`);
const iface = (name) => load(`modules/${name}/interface.imljson`).map((f) => f.name);

const results = [];
const step = async (name, fn) => {
  try {
    const extra = await fn();
    results.push(`PASS ${name} ${extra ?? ""}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
};
/** Output keys must be a subset of the interface (Make hides undeclared keys). */
const checkInterface = (name, output) => {
  const declared = iface(name);
  for (const k of Object.keys(output)) assert.ok(declared.includes(k), `${name} output "${k}" missing from interface.imljson`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pollJob(host, jobId, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const out = await rt.run(module_("getJob"), { host, jobId });
    if (out.is_complete) return out;
    if (Date.now() > deadline) throw new Error(`job ${jobId} still ${out.status}`);
    await sleep(4000);
  }
}

// Connection: the communication verifies the key.
await step("connection verifies the key", async () => {
  const conn = load("connections/rendley/connection.imljson");
  const out = await rt.run({ ...conn, headers: undefined }, { apiKey: key });
  return out === undefined ? "ok" : "ok";
});
await step("connection rejects a wrong key", async () => {
  const bad = new ImlRuntime({ baseUrl: base, apiKey: "not-a-key" });
  await assert.rejects(bad.run(load("connections/rendley/connection.imljson"), { apiKey: "not-a-key" }), /\[(401|UNAUTHORIZED|[A-Z_]+)\]/);
});

let projectId;
let mediaId;
let fileHash;
await step("createProject (default workspace)", async () => {
  const out = await rt.run(module_("createProject"), { name: "make-live-test" });
  projectId = out.id;
  assert.ok(projectId);
  return projectId;
});
await step("rpc listProjects / listVoices / listLanguages", async () => {
  const projects = await rt.run(rpc("listProjects"), {});
  assert.ok(projects.some((p) => p.value === projectId));
  const voices = await rt.run(rpc("listVoices"), {});
  assert.ok(voices.length > 0 && voices.every((v) => v.label && v.value));
  const langs = await rt.run(rpc("listLanguages"), {});
  assert.ok(langs.length > 0);
  return `${projects.length} projects, ${voices.length} voices, ${langs.length} languages`;
});
await step("listProjects and getWorkspaces honour limit", async () => {
  const projects = await rt.run(module_("listProjects"), { limit: 2 });
  assert.equal(projects.length, 2);
  checkInterface("listProjects", projects[0]);
  const ws = await rt.run(module_("getWorkspaces"), { limit: 1 });
  assert.equal(ws.length, 1);
  checkInterface("getWorkspaces", ws[0]);
});
await step("uploadMedia from URL", async () => {
  const out = await rt.run(module_("uploadMedia"), { projectId, fileUrl: "https://download.samplelib.com/mp3/sample-3s.mp3", fileName: "sample.mp3" });
  checkInterface("uploadMedia", out);
  assert.ok(out.media_id && out.file_url);
  mediaId = out.media_id;
  fileHash = out.file_hash;
  return `media_id=${mediaId}`;
});
await step("getMediaUrl by media id and by file hash", async () => {
  const byId = await rt.run(module_("getMediaUrl"), { projectId, mediaId });
  checkInterface("getMediaUrl", byId);
  assert.ok(byId.file_url.startsWith("https://"));
  const byHash = await rt.run(module_("getMediaUrl"), { projectId, fileHash });
  assert.ok(byHash.file_url.startsWith("https://"));
  const res = await fetch(byId.file_url);
  assert.equal(res.status, 200);
});
await step("estimateCost for an AI action and for export", async () => {
  const ai = await rt.run(module_("estimateCost"), { action: "voice-isolation", projectId, params: { media: mediaId } });
  checkInterface("estimateCost", ai);
  assert.ok(ai.credits > 0);
  const exp = await rt.run(module_("estimateCost"), { action: "export", projectId, params: { target_resolution: "720p" } });
  assert.ok(exp.credits >= 0);
  return `voice-isolation=${ai.credits} export=${exp.credits}`;
});
await step("cost bodies for every file-input module are accepted", async () => {
  // Same bodies the modules send, against the /cost twin so nothing is spent.
  const cases = [
    ["transcribe", { projectId, source: mediaId }],
    ["translateVideo", { projectId, source: mediaId, outputLanguage: "es" }],
    ["isolateVoice", { projectId, source: mediaId }],
    ["removeVideoBackground", { projectId, source: "https://download.samplelib.com/mp4/sample-5s.mp4" }],
    ["removeImageBackground", { projectId, source: "https://download.samplelib.com/png/sample-red-400x300.png" }],
    ["upscaleImage", { projectId, source: "https://download.samplelib.com/png/sample-red-400x300.png", scale: 2 }],
    ["lipSync", { projectId, videoSource: "https://download.samplelib.com/mp4/sample-5s.mp4", audioSource: mediaId }],
  ];
  const prices = [];
  for (const [name, params] of cases) {
    const comm = module_(name);
    const cost = { ...comm, url: `${comm.url}/cost`, response: { output: { credits: "{{body.data}}" } } };
    const out = await rt.run(cost, params);
    assert.equal(typeof out.credits, "number", `${name} cost`);
    prices.push(`${name}=${out.credits}`);
  }
  return prices.join(" ");
});
await step("generateSoundEffect then getJob (Rendley API) until complete", async () => {
  const started = await rt.run(module_("generateSoundEffect"), { projectId, prompt: "a single soft rain drop", duration: 2 });
  assert.ok(started.job_id);
  const job = await pollJob("api", started.job_id);
  checkInterface("getJob", job);
  assert.equal(job.status, "completed");
  assert.ok(job.download_url && job.media_id);
  const res = await fetch(job.download_url);
  assert.equal(res.status, 200);
  return `job=${started.job_id}`;
});
await step("transcribe by media id then getJob exposes result_data", async () => {
  const started = await rt.run(module_("transcribe"), { projectId, source: mediaId });
  const job = await pollJob("api", started.job_id);
  assert.equal(job.status, "completed");
  assert.ok(typeof job.result_data === "string" && job.result_data.includes("text"));
});
await step("promptToVideo (trivial) then getJob (Rendley Agent)", async () => {
  const started = await rt.run(module_("promptToVideo"), { projectId, prompt: "Reply with the single word OK and make no changes." });
  checkInterface("promptToVideo", started);
  assert.ok(started.job_id && started.thread_id);
  const job = await pollJob("agent", started.job_id, 240_000);
  assert.equal(job.status, "completed");
  assert.equal(job.project_id, projectId);
  return `message="${(job.last_message || "").slice(0, 30)}"`;
});
await step("renderVideo returns a job id (then cancelled)", async () => {
  const out = await rt.run(module_("renderVideo"), { projectId, codec: "h264", targetResolution: "720p", quality: "low" });
  assert.ok(out.job_id);
  await rt.run(module_("makeApiCall"), { url: `/jobs/${out.job_id}`, method: "DELETE", query: [], headers: [] }).catch(() => {});
});
await step("makeApiCall GET /workspaces", async () => {
  const out = await rt.run(module_("makeApiCall"), { url: "/workspaces", method: "GET", query: [], headers: [] });
  assert.equal(out.statusCode, 200);
  assert.ok(Array.isArray(out.body.data));
});
await step("error mapping: 404 becomes a typed error", async () => {
  await assert.rejects(rt.run(module_("getJob"), { host: "api", jobId: "does-not-exist" }), /\[[A-Z_0-9]+\] /);
});
await step("deleteProject (cleanup via makeApiCall)", async () => {
  const out = await rt.run(module_("makeApiCall"), { url: `/projects/${projectId}`, method: "DELETE", query: [], headers: [] });
  assert.equal(out.statusCode, 200);
});

console.log("\n" + results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} pass / ${failed} fail (${rt.calls.length} requests)`);
process.exit(failed ? 1 : 0);
