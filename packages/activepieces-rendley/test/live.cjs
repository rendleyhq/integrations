/**
 * Runs every action and trigger of the built piece against a real Rendley
 * account with a minimal Activepieces context (auth, propsValue, an in-memory
 * store for the polling helper).
 *
 *   RENDLEY_API_KEY=... npm run test:live
 */
const assert = require("node:assert/strict");
const { rendley } = require("../dist/src/index.js");

const key = process.env.RENDLEY_API_KEY;
if (!key) {
  console.error("Set RENDLEY_API_KEY (a paid-plan key; the run spends a few credits).");
  process.exit(1);
}
if (process.env.RENDLEY_API_BASE_URL) {
  require("../dist/src/lib/common/client.js").setBaseUrl(process.env.RENDLEY_API_BASE_URL);
}

const auth = { secret_text: key };
const memory = new Map();
const store = {
  get: async (k) => (memory.has(k) ? memory.get(k) : null),
  put: async (k, v) => { memory.set(k, v); return v; },
  delete: async (k) => { memory.delete(k); },
};
const ctx = (propsValue = {}) => ({ auth, propsValue, store, files: {}, run: { id: "test", stop: () => {}, pause: () => {} }, project: { id: "p", externalId: async () => "p" }, connections: { get: async () => null }, tags: { add: async () => {} }, server: { apiUrl: "", publicUrl: "", token: "" } });
const actions = Object.fromEntries(rendley.actions().map ? rendley.actions().map((a) => [a.name, a]) : Object.values(rendley.actions()).map((a) => [a.name, a]));
const triggers = Object.fromEntries(Object.values(rendley.triggers()).map((t) => [t.name, t]));
const run = (name, props) => actions[name].run(ctx(props));

const results = [];
const step = async (name, fn) => {
  try {
    const extra = await fn();
    results.push(`PASS ${name} ${extra ?? ""}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
};

(async () => {
  let projectId;
  let mediaId;
  await step("auth validate accepts the key and rejects a bad one", async () => {
    assert.deepEqual(await rendley.auth.validate({ auth: key }), { valid: true });
    const bad = await rendley.auth.validate({ auth: "not-a-key" });
    assert.equal(bad.valid, false);
  });
  await step("dropdown options load", async () => {
    const projects = await actions.text_to_speech.props.projectId.options({ auth }, ctx());
    assert.ok(Array.isArray(projects.options));
    const voices = await actions.text_to_speech.props.voiceId.options({ auth }, ctx());
    assert.ok(voices.options.length > 0);
    const models = await actions.generate_video.props.modelId.options({ auth }, ctx());
    assert.ok(models.options.length > 0);
    const disabled = await actions.text_to_speech.props.voiceId.options({ auth: undefined }, ctx());
    assert.equal(disabled.disabled, true);
    return `${models.options.length} video models`;
  });
  await step("create_project", async () => {
    const out = await run("create_project", { name: "activepieces-live-test" });
    projectId = out.id;
    assert.ok(projectId);
    return projectId;
  });
  await step("upload_media then get_media_url", async () => {
    const up = await run("upload_media", { projectId, fileUrl: "https://download.samplelib.com/mp3/sample-3s.mp3" });
    mediaId = up.media_id;
    assert.ok(mediaId && up.download_url);
    const byId = await run("get_media_url", { projectId, mediaId });
    assert.ok(byId.download_url.startsWith("https://"));
    const byHash = await run("get_media_url", { projectId, fileHash: up.file_hash });
    assert.ok(byHash.download_url.startsWith("https://"));
  });
  await step("estimate_cost", async () => {
    const ai = await run("estimate_cost", { action: "voice-isolation", projectId, params: { media: mediaId } });
    assert.ok(ai.credits > 0);
    const exp = await run("estimate_cost", { action: "export", projectId });
    assert.ok(exp.credits >= 0);
    return `voice-isolation=${ai.credits} export=${exp.credits}`;
  });
  await step("generate_sound_effect waits and returns a download URL", async () => {
    const out = await run("generate_sound_effect", { projectId, prompt: "a single soft rain drop", durationSeconds: 2, wait: true, timeout: 120 });
    assert.equal(out.status, "completed");
    assert.ok(out.download_url);
    assert.equal((await fetch(out.download_url)).status, 200);
    return `job=${out.job_id}`;
  });
  await step("transcribe by media id", async () => {
    const out = await run("transcribe", { projectId, media: mediaId, wait: true, timeout: 120 });
    assert.equal(out.status, "completed");
    assert.equal(typeof out.text, "string");
  });
  await step("wait=false then get_job", async () => {
    const out = await run("generate_sound_effect", { projectId, prompt: "short click", durationSeconds: 1, wait: false });
    assert.equal(out.is_complete, false);
    const job = await run("get_job", { jobId: out.job_id });
    assert.equal(job.job_id, out.job_id);
  });
  await step("edit_video_with_ai_agent (trivial), get_agent_job, cancel", async () => {
    const out = await run("edit_video_with_ai_agent", { projectId, prompt: "Reply with the single word OK and make no changes.", wait: true, timeout: 240 });
    assert.equal(out.status, "completed");
    assert.equal(out.project_id, projectId);
    const status = await run("get_agent_job", { jobId: out.job_id });
    assert.equal(status.job_id, out.job_id);
    const second = await run("edit_video_with_ai_agent", { projectId, prompt: "Reply with the single word OK and make no changes.", wait: false });
    const canceled = await run("cancel_agent_job", { jobId: second.job_id });
    assert.ok(["canceled", "cancelled", "completed"].includes(canceled.status));
  });
  await step("render_video wait=false", async () => {
    const out = await run("render_video", { projectId, targetResolution: "720p", wait: false });
    assert.ok(out.job_id);
  });
  await step("triggers: test() returns items, poll() dedupes by id", async () => {
    const jobs = await triggers.new_completed_job.test(ctx({ jobType: "generate_sound_effect" }));
    assert.ok(jobs.length > 0 && jobs.every((j) => j.status === "completed"));
    await triggers.new_completed_job.onEnable(ctx({ jobType: "generate_sound_effect" }));
    const first = await triggers.new_completed_job.run(ctx({ jobType: "generate_sound_effect" }));
    const again = await triggers.new_completed_job.run(ctx({ jobType: "generate_sound_effect" }));
    assert.equal(again.length, 0, "second poll emits nothing new");
    const projects = await triggers.new_project.test(ctx({}));
    assert.ok(projects.some((p) => p.id === projectId));
    return `${jobs.length} jobs in test(), ${first.length} on first poll`;
  });
  await step("custom API call action exists", async () => {
    assert.ok(actions.custom_api_call);
  });
  await step("cleanup: delete project", async () => {
    const { rendleyApiCall } = require("../dist/src/lib/common/client.js");
    await rendleyApiCall({ apiKey: key, method: "DELETE", resourceUri: `/projects/${projectId}` });
  });

  console.log("\n" + results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed} pass / ${failed} fail`);
  process.exit(failed ? 1 : 0);
})();
