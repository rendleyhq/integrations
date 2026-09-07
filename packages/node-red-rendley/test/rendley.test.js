/**
 * Runs the node inside Node-RED's test helper. Offline tests always run; the
 * live suite runs when RENDLEY_API_KEY is set and spends a few credits.
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const helper = require("node-red-node-test-helper");
const configNode = require("../nodes/rendley-config.js");
const rendleyNode = require("../nodes/rendley.js");

helper.init(require.resolve("node-red"));

const KEY = process.env.RENDLEY_API_KEY;
const BASE = process.env.RENDLEY_API_BASE_URL || "https://api.rendley.com/v1";

function flow(operation, extra = {}) {
  return [
    { id: "cfg", type: "rendley-config", name: "test", baseUrl: BASE },
    { id: "n1", type: "rendley", name: "rendley", rendley: "cfg", operation, wait: true, timeout: 240, wires: [["n2"]], ...extra },
    { id: "n2", type: "helper" },
  ];
}
const credentials = { cfg: { apiKey: KEY || "not-a-key" } };

/** Load a flow, send one message, and resolve with the output or the error. */
function runOnce(operation, payload, extra) {
  return new Promise((resolve, reject) => {
    helper.load([configNode, rendleyNode], flow(operation, extra), credentials, () => {
      const n1 = helper.getNode("n1");
      const n2 = helper.getNode("n2");
      n2.on("input", (msg) => resolve(msg));
      n1.on("call:error", (call) => reject(new Error(String(call.args[0]?.message || call.args[0]))));
      n1.receive({ payload });
    });
  });
}

describe("rendley node", () => {
  before(() => helper.startServer());
  after(() => helper.stopServer());

  test("loads with its config node and defaults", (t, done) => {
    helper.load([configNode, rendleyNode], flow("listWorkspaces"), credentials, () => {
      const n1 = helper.getNode("n1");
      assert.equal(n1.name, "rendley");
      assert.equal(n1.operation, "listWorkspaces");
      assert.equal(n1.wait, true);
      helper.unload().then(() => done());
    });
  });

  test("rejects an unknown operation", async () => {
    await assert.rejects(runOnce("nope", {}), /Unknown Rendley operation/);
    await helper.unload();
  });

  test("reports a missing required field", async () => {
    await assert.rejects(runOnce("getJob", {}), /msg\.payload\.job_id is required/);
    await helper.unload();
  });

  describe("live", { skip: KEY ? false : "set RENDLEY_API_KEY" }, () => {
    let projectId;
    let mediaId;

    test("listWorkspaces", async () => {
      const msg = await runOnce("listWorkspaces", {});
      assert.ok(Array.isArray(msg.payload) && msg.payload.length > 0);
      await helper.unload();
    });

    test("createProject", async () => {
      const msg = await runOnce("createProject", { name: "node-red-live-test" });
      projectId = msg.payload.id;
      assert.ok(projectId);
      await helper.unload();
    });

    test("uploadMedia and getMediaUrl (project from node field)", async () => {
      const up = await runOnce("uploadMedia", { file_url: "https://download.samplelib.com/mp3/sample-3s.mp3" }, { projectId });
      mediaId = up.payload.media_id;
      assert.ok(mediaId);
      await helper.unload();
      const url = await runOnce("getMediaUrl", { media_id: mediaId }, { projectId });
      assert.ok(url.payload.storage_url.startsWith("https://"));
      await helper.unload();
    });

    test("estimateCost", async () => {
      const msg = await runOnce("estimateCost", { project_id: projectId, action: "voice-isolation", params: { media: mediaId } });
      assert.ok(msg.payload.credits > 0);
      await helper.unload();
    });

    test("aiAction generate-sound-effect with wait", async () => {
      const msg = await runOnce("aiAction", { project_id: projectId, action: "generate-sound-effect", params: { prompt: "a single soft rain drop", duration_seconds: 2 } });
      assert.equal(msg.payload.status, "completed");
      assert.ok(msg.payload.download_url);
      assert.equal(msg.rendley.job_id, msg.payload.job_id);
      await helper.unload();
    });

    test("aiAction without wait, then getJob and waitForJob", async () => {
      const started = await runOnce("aiAction", { project_id: projectId, action: "transcribe", params: { media: mediaId } }, { wait: false });
      assert.equal(started.payload.is_complete, false);
      await helper.unload();
      const status = await runOnce("getJob", { job_id: started.payload.job_id });
      assert.equal(status.payload.job_id, started.payload.job_id);
      await helper.unload();
      const done = await runOnce("waitForJob", { job_id: started.payload.job_id });
      assert.equal(done.payload.status, "completed");
      assert.equal(typeof done.payload.result.text, "string");
      await helper.unload();
    });

    test("agentEdit (trivial) with wait, then getAgentJob; second job cancelled", async () => {
      const msg = await runOnce("agentEdit", { project_id: projectId, prompt: "Reply with the single word OK and make no changes." });
      assert.equal(msg.payload.status, "completed");
      await helper.unload();
      const status = await runOnce("getAgentJob", { job_id: msg.payload.job_id });
      assert.equal(status.payload.job_id, msg.payload.job_id);
      await helper.unload();
      const second = await runOnce("agentEdit", { project_id: projectId, prompt: "Reply with the single word OK and make no changes." }, { wait: false });
      await helper.unload();
      const canceled = await runOnce("cancelAgentJob", { job_id: second.payload.job_id });
      assert.ok(["canceled", "cancelled", "completed"].includes(canceled.payload.status));
      await helper.unload();
    });

    test("render without wait returns a job id", async () => {
      const msg = await runOnce("render", { project_id: projectId, settings: { target_resolution: "720p" } }, { wait: false });
      assert.ok(msg.payload.job_id);
      await helper.unload();
    });

    test("a wrong API key surfaces a clear error", async () => {
      await assert.rejects(
        new Promise((resolve, reject) => {
          helper.load([configNode, rendleyNode], flow("listWorkspaces"), { cfg: { apiKey: "not-a-key" } }, () => {
            const n1 = helper.getNode("n1");
            n1.on("call:error", (call) => reject(new Error(String(call.args[0]?.message || call.args[0]))));
            helper.getNode("n2").on("input", resolve);
            n1.receive({ payload: {} });
          });
        }),
        /rejected the API key|UNAUTHORIZED/,
      );
      await helper.unload();
    });

    test("deleteProject (cleanup)", async () => {
      const msg = await runOnce("deleteProject", { project_id: projectId });
      assert.equal(msg.payload.deleted, true);
      await helper.unload();
    });
  });
});
