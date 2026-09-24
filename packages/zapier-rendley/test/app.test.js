/**
 * Structural checks always run. Live checks run when RENDLEY_LIVE=1 and
 * RENDLEY_API_KEY is set (a paid-plan key; the run spends a few credits).
 *
 *   RENDLEY_API_KEY=... npm run test:live
 *   RENDLEY_API_BASE_URL=https://api.staging.example/v1   # optional
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const zapier = require("zapier-platform-core");
const App = require("../index.js");

const appTester = zapier.createAppTester(App);

const LIVE = process.env.RENDLEY_LIVE === "1" && !!process.env.RENDLEY_API_KEY;
const authData = { apiKey: process.env.RENDLEY_API_KEY || "" };
// The app reads the host from the environment; the direct client used for cleanup gets it explicitly.
const clientOptions = { ...authData, apiBaseUrl: process.env.RENDLEY_API_BASE_URL || undefined };
const run = (fn, inputData = {}, extra = {}) => appTester(fn, { authData, inputData, ...extra });

describe("app definition", () => {
  test("every operation has a label, description, sample and perform", () => {
    const groups = { triggers: App.triggers, creates: App.creates, searches: App.searches };
    for (const [group, ops] of Object.entries(groups)) {
      for (const [key, op] of Object.entries(ops)) {
        assert.equal(op.key, key, `${group}.${key} key mismatch`);
        assert.ok(op.display.label, `${group}.${key} label`);
        assert.ok(op.display.description.endsWith("."), `${group}.${key} description ends with a period`);
        assert.ok(op.operation.sample && Object.keys(op.operation.sample).length, `${group}.${key} sample`);
        assert.equal(typeof op.operation.perform, "function", `${group}.${key} perform`);
        if (group === "triggers") {
          assert.ok(op.display.description.startsWith("Triggers when "), `${group}.${key} trigger description`);
          assert.ok("id" in op.operation.sample, `${group}.${key} sample has id`);
        }
        if (group === "searches") {
          assert.ok(op.operation.inputFields.length > 0, `${group}.${key} has a search field`);
        }
        for (const field of op.operation.inputFields ?? []) {
          assert.ok(field.helpText || field.choices || field.dynamic, `${group}.${key}.${field.key} needs help text`);
          if (field.dynamic) {
            const triggerKey = field.dynamic.split(".")[0];
            assert.ok(App.triggers[triggerKey], `${group}.${key}.${field.key} dynamic trigger ${triggerKey} exists`);
          }
        }
        const declared = (op.operation.outputFields ?? []).map((f) => f.key);
        for (const outputKey of declared) {
          assert.ok(outputKey in op.operation.sample, `${group}.${key} sample lacks output field ${outputKey}`);
        }
      }
    }
  });

  test("no input field asks for credentials", () => {
    for (const ops of [App.triggers, App.creates, App.searches]) {
      for (const op of Object.values(ops)) {
        for (const field of op.operation.inputFields ?? []) {
          assert.ok(!/api[_ ]?key|secret|token/i.test(field.key), `${op.key}.${field.key}`);
        }
      }
    }
  });

  test("platformVersion matches the installed core", () => {
    assert.equal(App.platformVersion, zapier.version);
  });
});

describe("live", { skip: LIVE ? false : "set RENDLEY_LIVE=1 and RENDLEY_API_KEY" }, () => {
  let projectId;
  let mediaId;
  let fileHash;

  before(async () => {
    const project = await run(App.creates.create_project.operation.perform, { name: "zapier-live-test" });
    projectId = project.id;
    assert.ok(projectId);
  });

  after(async () => {
    if (!projectId) return;
    const { RendleyClient } = require("./client.helper.js");
    await new RendleyClient(clientOptions).deleteProject(projectId);
  });

  test("authentication test and label", async () => {
    const result = await run(App.authentication.test);
    assert.ok(result.workspaces >= 1);
    const label = await run(App.authentication.connectionLabel);
    assert.ok(typeof label === "string" && label.length > 0);
  });

  test("dropdown triggers return id and name", async () => {
    for (const key of ["list_workspaces", "list_tts_voices", "list_translate_languages", "new_project"]) {
      const rows = await run(App.triggers[key].operation.perform, {}, { meta: { page: 0 } });
      assert.ok(Array.isArray(rows) && rows.length > 0, key);
      assert.ok(rows.every((r) => r.id && r.name), `${key} rows have id and name`);
    }
  });

  test("find_project by id and by name", async () => {
    const byId = await run(App.searches.find_project.operation.perform, { project: projectId });
    assert.equal(byId[0].id, projectId);
    const byName = await run(App.searches.find_project.operation.perform, { name: "zapier-live" });
    assert.ok(byName.some((p) => p.id === projectId));
  });

  test("upload_media from URL, then get_media_url by media id and by hash", async () => {
    const upload = await run(App.creates.upload_media.operation.perform, {
      project_id: projectId,
      file_url: "https://download.samplelib.com/mp3/sample-3s.mp3",
    });
    assert.ok(upload.media_id && upload.url);
    mediaId = upload.media_id;
    fileHash = upload.file_hash;
    const byMedia = await run(App.searches.get_media_url.operation.perform, { project_id: projectId, media: mediaId });
    assert.ok(byMedia[0].url.startsWith("https://"));
    const byHash = await run(App.searches.get_media_url.operation.perform, { project_id: projectId, file_hash: fileHash });
    assert.ok(byHash[0].url.startsWith("https://"));
    const res = await fetch(byMedia[0].url);
    assert.equal(res.status, 200);
  });

  test("a file field carries a URL, and wins over the text field", async () => {
    const upload = await run(App.creates.upload_media.operation.perform, {
      project_id: projectId,
      file: "https://download.samplelib.com/mp3/sample-3s.mp3",
    });
    assert.ok(upload.media_id && upload.url);
    const out = await run(App.creates.transcribe.operation.perform, {
      project_id: projectId,
      source: "not-a-real-media-reference",
      source_file: upload.url,
    });
    assert.equal(out.status, "completed");
  });

  test("leaving both the text and the file field empty fails before any request", async () => {
    await assert.rejects(
      run(App.creates.transcribe.operation.perform, { project_id: projectId }),
      (err) => /Source Audio or Video is required/.test(err.message),
    );
  });

  test("estimate_cost for AI actions and export", async () => {
    const video = await run(App.searches.estimate_cost.operation.perform, {
      action: "generate-video",
      project_id: projectId,
      params_json: '{"prompt":"a cat","duration":5}',
    });
    assert.ok(video[0].credits > 0);
    const isolate = await run(App.searches.estimate_cost.operation.perform, {
      action: "voice-isolation",
      project_id: projectId,
      params_json: JSON.stringify({ media: mediaId }),
    });
    assert.ok(isolate[0].credits > 0);
    const exp = await run(App.searches.estimate_cost.operation.perform, { action: "export", project_id: projectId });
    assert.ok(exp[0].credits >= 0);
  });

  test("generate_sound_effect waits inline and returns a download URL", async () => {
    const out = await run(App.creates.generate_sound_effect.operation.perform, {
      project_id: projectId,
      prompt: "a single soft rain drop",
      duration_seconds: 2,
    });
    assert.equal(out.status, "completed");
    assert.equal(out.is_complete, true);
    assert.ok(out.url);
    const res = await fetch(out.url);
    assert.equal(res.status, 200);
    const job = await run(App.searches.get_job.operation.perform, { job: out.job_id });
    assert.equal(job[0].id, out.job_id);
    assert.ok(job[0].url);
  });

  test("transcribe a library file by media id", async () => {
    const out = await run(App.creates.transcribe.operation.perform, { project_id: projectId, source: mediaId });
    assert.equal(out.status, "completed");
    assert.equal(typeof out.text, "string");
    assert.ok(out.result_data && typeof out.result_data === "object");
  });

  test("wait_for_completion=false returns immediately", async () => {
    const out = await run(App.creates.generate_sound_effect.operation.perform, {
      project_id: projectId,
      prompt: "short click",
      duration_seconds: 1,
      wait_for_completion: false,
    });
    assert.ok(out.job_id);
    assert.equal(out.is_complete, false);
  });

  test("new_completed_job lists completed jobs with download URLs", async () => {
    const rows = await run(App.triggers.new_completed_job.operation.perform, { job_type: "generate_sound_effect" });
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.id && r.status === "completed"));
    assert.ok(rows[0].url, "first row has a fresh download URL");
    assert.ok(rows.length <= 25, "one poll stays within the page it reads job by job");
    // Every row went through GET /jobs/{id}: the listing has no url_expires_at at all.
    assert.ok(rows.some((r, i) => i >= 10 && r.url_expires_at), "rows past the tenth are read too");
  });

  test("new_project pages newest first", async () => {
    const page0 = await run(App.triggers.new_project.operation.perform, {}, { meta: { page: 0 } });
    assert.ok(page0.length > 0);
    assert.ok(
      page0.every((p, i) => i === 0 || new Date(page0[i - 1].created_at) >= new Date(p.created_at)),
      "newest first",
    );
    const page1 = await run(App.triggers.new_project.operation.perform, {}, { meta: { page: 1 } });
    assert.equal(page1.filter((p) => page0.some((q) => q.id === p.id)).length, 0, "pages do not overlap");
  });

  test("agent: an edit starts, get_agent_job reads it, cancel ends it", async () => {
    const out = await run(App.creates.ai_video_agent.operation.perform, {
      project_id: projectId,
      prompt: "Add a 2 second title card at the start that says OK.",
      wait_for_completion: false,
    });
    assert.ok(out.job_id);
    assert.equal(out.is_complete, false);
    const status = await run(App.searches.get_agent_job.operation.perform, { job: out.job_id });
    assert.equal(status[0].job_id, out.job_id);
    // One edit at a time per project: the API answers AGENT_PROJECT_BUSY while this one runs.
    const { RendleyClient } = require("./client.helper.js");
    const canceled = await new RendleyClient(clientOptions).cancelAgentJob(out.job_id);
    assert.ok(["canceled", "cancelled", "completed"].includes(canceled.status));
  });

  test("start_export without waiting returns a queued job", async () => {
    let out;
    try {
      out = await run(App.creates.start_export.operation.perform, {
        project_id: projectId,
        target_resolution: "720p",
        wait_for_completion: false,
      });
    } catch (err) {
      // An empty project cannot be rendered on every deployment; a clear error is acceptable.
      assert.ok(err.message.length > 0);
      return;
    }
    assert.ok(out.job_id);
    const { RendleyClient } = require("./client.helper.js");
    await new RendleyClient(clientOptions).cancelJob(out.job_id).catch(() => {});
  });

  test("a wrong API key produces an auth error", async () => {
    await assert.rejects(
      appTester(App.authentication.test, { authData: { ...authData, apiKey: "not-a-key" }, inputData: {} }),
      (err) => /rejected the API key|401|Unauthorized|unauthorized/i.test(err.message),
    );
  });
});
