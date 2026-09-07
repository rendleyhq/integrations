/**
 * Runs every Pipedream component against a real Rendley account, mounting
 * each component the way Pipedream does: the app's `$auth`, prop values as
 * `this.<prop>`, and a `$` with `export`. Uses `@pipedream/platform` axios.
 *
 *   RENDLEY_API_KEY=... npm run test:live
 *   RENDLEY_API_BASE_URL=https://api.staging.example/v1   # optional
 */
import assert from "node:assert/strict";
import rendleyApp from "../components/rendley/rendley.app.mjs";
import * as ai from "../components/rendley/actions/ai-actions.mjs";
import * as core from "../components/rendley/actions/core-actions.mjs";
import * as sources from "../components/rendley/sources/sources.mjs";

const key = process.env.RENDLEY_API_KEY;
if (!key) {
  console.error("Set RENDLEY_API_KEY (a paid-plan key; the run spends a few credits).");
  process.exit(1);
}

/** Bind an app or component object the way the Pipedream runtime does. */
function mount(component, propValues = {}, extras = {}) {
  const instance = { ...extras };
  for (const [name, fn] of Object.entries(component.methods || {})) instance[name] = fn.bind(instance);
  Object.assign(instance, propValues);
  if (component.run) instance.run = component.run.bind(instance);
  return instance;
}
const app = mount(rendleyApp, {}, {
  $auth: { api_key: key, api_base_url: process.env.RENDLEY_API_BASE_URL || "" },
});
const $ = { export: (k, v) => ($.exports[k] = v), exports: {} };
const runAction = (action, props) => mount(action, { rendley: app, ...props }).run({ $ });
const runSource = async (source, props) => {
  const emitted = [];
  const inst = mount(source, { rendley: app, ...props }, { $emit: (data, meta) => emitted.push({ data, meta }) });
  await inst.run();
  return emitted;
};

const results = [];
const step = async (name, fn) => {
  try {
    const extra = await fn();
    results.push(`PASS ${name} ${extra ?? ""}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
};

let projectId;
let mediaId;
await step("app methods: workspaces, voices, languages, tools", async () => {
  const ws = await app.listWorkspaces();
  assert.ok(ws.length > 0);
  const voices = await app.listVoices({ params: { limit: 5 } });
  assert.ok(voices.length > 0);
  const langs = await app.listTranslateLanguages();
  assert.ok(langs.length > 0);
  const tools = await app.listAiTools();
  assert.ok(tools.some((t) => t.action === "generate_video"));
});
await step("propDefinition options load", async () => {
  const opts = rendleyApp.propDefinitions;
  const projects = await opts.projectId.options.call(app, {});
  assert.ok(Array.isArray(projects));
  const voices = await opts.voiceId.options.call(app, { page: 0 });
  assert.ok(voices.length > 0 && voices[0].value && voices[0].label);
  const models = await opts.modelId.options.call(app, { action: "generate-video" });
  assert.ok(models.length > 0);
  return `${models.length} video models`;
});
await step("create-project", async () => {
  const out = await runAction(core.createProject, { name: "pipedream-live-test" });
  projectId = out.id;
  assert.ok(projectId);
  return projectId;
});
await step("upload-media then get-media-url", async () => {
  const up = await runAction(core.uploadMedia, { projectId, fileUrl: "https://download.samplelib.com/mp3/sample-3s.mp3" });
  mediaId = up.media_id;
  assert.ok(mediaId && up.download_url);
  const byId = await runAction(core.getMediaUrl, { projectId, mediaId });
  assert.ok(byId.download_url.startsWith("https://"));
  const byHash = await runAction(core.getMediaUrl, { projectId, fileHash: up.file_hash });
  assert.ok(byHash.download_url.startsWith("https://"));
});
await step("estimate-cost AI and export", async () => {
  const ai1 = await runAction(core.estimateCost, { action: "voice-isolation", projectId, params: { media: mediaId } });
  assert.ok(ai1.credits > 0);
  const exp = await runAction(core.estimateCost, { action: "export", projectId });
  assert.ok(exp.credits >= 0);
  return `voice-isolation=${ai1.credits} export=${exp.credits}`;
});
await step("generate-sound-effect waits and returns a download URL", async () => {
  const out = await runAction(ai.generateSoundEffect, { projectId, prompt: "a single soft rain drop", durationSeconds: "2", timeoutSeconds: 120 });
  assert.equal(out.status, "completed");
  assert.ok(out.download_url);
  const res = await fetch(out.download_url);
  assert.equal(res.status, 200);
  assert.match($.exports.$summary, /completed/);
  return `job=${out.job_id}`;
});
await step("transcribe by media id", async () => {
  const out = await runAction(ai.transcribe, { projectId, media: mediaId, timeoutSeconds: 120 });
  assert.equal(out.status, "completed");
  assert.equal(typeof out.text, "string");
});
await step("no-wait path and get-job", async () => {
  const out = await runAction(ai.generateSoundEffect, { projectId, prompt: "short click", durationSeconds: "1", waitForCompletion: false });
  assert.equal(out.is_complete, false);
  const job = await runAction(core.getJob, { jobId: out.job_id });
  assert.equal(job.job_id, out.job_id);
});
await step("edit-video-with-ai-agent (trivial), get-agent-job, cancel", async () => {
  const out = await runAction(core.editWithAgent, { projectId, prompt: "Reply with the single word OK and make no changes.", timeoutSeconds: 240 });
  assert.equal(out.status, "completed");
  assert.equal(out.project_id, projectId);
  const status = await runAction(core.getAgentJob, { jobId: out.job_id });
  assert.equal(status.job_id, out.job_id);
  const second = await runAction(core.editWithAgent, { projectId, prompt: "Reply with the single word OK and make no changes.", waitForCompletion: false });
  const canceled = await runAction(core.cancelAgentJob, { jobId: second.job_id });
  assert.ok(["canceled", "cancelled", "completed"].includes(canceled.status));
});
await step("render-video no-wait", async () => {
  const out = await runAction(core.renderVideo, { projectId, targetResolution: "720p", waitForCompletion: false });
  assert.ok(out.job_id);
  await app._makeRequest({ method: "DELETE", path: `/jobs/${out.job_id}` }).catch(() => {});
});
await step("sources: new-completed-job and new-project emit with ids", async () => {
  const jobs = await runSource(sources.newCompletedJob, { jobType: "generate_sound_effect" });
  assert.ok(jobs.length > 0 && jobs.every((e) => e.meta.id && e.data.status === "completed"));
  const projects = await runSource(sources.newProject, {});
  assert.ok(projects.some((e) => e.meta.id === projectId));
  return `${jobs.length} jobs, ${projects.length} projects`;
});
await step("component metadata is consistent", async () => {
  const all = [...Object.values(ai), ...Object.values(core), ...Object.values(sources)];
  for (const c of all) {
    assert.match(c.key, /^rendley-[a-z0-9-]+$/, c.key);
    assert.ok(c.name && c.description.includes("[See the documentation]"), c.key);
    assert.match(c.version, /^\d+\.\d+\.\d+$/, c.key);
    assert.ok(["action", "source"].includes(c.type), c.key);
    if (c.type === "source") assert.ok(c.sampleEmit && c.dedupe === "unique", c.key);
  }
  return `${all.length} components`;
});
await step("cleanup: delete project", async () => {
  await app.deleteProject({ projectId });
});

console.log("\n" + results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} pass / ${failed} fail`);
process.exit(failed ? 1 : 0);
