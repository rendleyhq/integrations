/**
 * Runs the Actor locally through `apify run` against a real Rendley account.
 *
 *   RENDLEY_API_KEY=... npm run test:live
 *   RENDLEY_API_BASE_URL=https://api.example.test/v1   # optional
 *   RENDLEY_SKIP_RENDER=1                                # optional, for hosts without a render worker
 *
 * Spends credits: one short agent edit on a new project plus one export, and
 * a second edit. The first edit goes through the default flow, start without
 * waiting and pick the job up by job_id.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.RENDLEY_API_KEY;
const base = process.env.RENDLEY_API_BASE_URL || "https://api.rendley.com/v1";
if (!key) {
  console.error("Set RENDLEY_API_KEY (a paid-plan key; the run spends credits).");
  process.exit(1);
}
const skipRender = process.env.RENDLEY_SKIP_RENDER === "1";
rmSync(join(root, "storage"), { recursive: true, force: true });
const { RendleyClient } = await import("../src/rendley.js");
const client = new RendleyClient({ apiKey: key, apiBaseUrl: base });

function runActor(input, { expectFailure = false } = {}) {
  // Only the default stores are reset between runs; the named store that
  // remembers exports per agent job must survive, as it does on the platform.
  rmSync(join(root, "storage", "datasets"), { recursive: true, force: true });
  rmSync(join(root, "storage", "key_value_stores", "default"), { recursive: true, force: true });
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

const results = [];
const step = async (name, fn) => {
  try {
    const extra = await fn();
    results.push(`PASS ${name} ${extra ?? ""}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
};

let createdProjectId;
let agentJobId;
let exportJobId;
await step("missing prompt and job_id fails cleanly", async () => {
  const item = runActor({ prompt: "" }, { expectFailure: true });
  assert.equal(item.status, "failed");
  assert.match(item.error, /prompt/i);
});

await step("prompt to video starts the agent and exits without waiting (the default)", async () => {
  const item = runActor({
    prompt: "Create a 4-second 16:9 video: dark background, the text \"Hello from Apify\" centered in white, no music.",
    resolution: "720p",
    quality: "low",
  });
  createdProjectId = item.project_id;
  agentJobId = item.agent_job_id;
  assert.equal(item.status, "started", item.error);
  assert.ok(item.project_id, "project_id");
  assert.equal(item.created_project, true);
  assert.ok(item.workspace_id, "workspace_id");
  assert.ok(item.agent_job_id, "agent_job_id");
  assert.match(item.note ?? "", /job_id/);
  return `project=${item.project_id} agent_job=${item.agent_job_id}`;
});

await step("pick the agent job up without waiting reports running, started (export) or completed", async () => {
  assert.ok(agentJobId, "needs the previous step");
  const item = runActor({ job_id: agentJobId, resolution: "720p", quality: "low", ...(skipRender ? { render: false } : {}) });
  assert.ok(["running", "started", "completed"].includes(item.status), `status ${item.status}: ${item.error}`);
  assert.equal(item.agent_job_id, agentJobId);
  assert.equal(item.project_id, createdProjectId);
  if (item.status === "started") exportJobId = item.job_id;
  return `status=${item.status}`;
});

await step(`pick the agent job up and wait (export ${skipRender ? "off" : "on"})`, async () => {
  assert.ok(agentJobId, "needs the previous step");
  const item = runActor({
    job_id: agentJobId,
    wait_for_completion: true,
    resolution: "720p",
    quality: "low",
    ...(skipRender ? { render: false } : {}),
  });
  assert.equal(item.status, "completed", item.error);
  assert.equal(item.agent_job_id, agentJobId);
  assert.equal(item.project_id, createdProjectId);
  assert.ok(item.workspace_id, "workspace_id from the project");
  assert.ok(item.last_message, "last_message");
  if (skipRender) {
    assert.ok(item.note, "note about export off");
  } else {
    assert.ok(item.url, "url");
    assert.ok(item.job_id, "export job_id");
    exportJobId = item.job_id;
    const kvs = join(root, "storage", "key_value_stores", "default");
    assert.ok(readdirSync(kvs).some((f) => f.startsWith("OUTPUT_VIDEO")), "OUTPUT_VIDEO stored");
  }
  return `commands_applied=${item.commands_applied}${item.duration ? ` duration=${item.duration}` : ""}`;
});

if (!skipRender) {
  await step("pick the agent job up again reuses the remembered export instead of starting another", async () => {
    assert.ok(exportJobId, "needs the previous step");
    const item = runActor({ job_id: agentJobId });
    assert.equal(item.status, "completed", item.error);
    assert.equal(item.job_id, exportJobId, "same export job");
    assert.ok(item.url, "url");
    return `export_job=${item.job_id}`;
  });

  await step("pick the export job up by its job_id", async () => {
    assert.ok(exportJobId, "needs the previous step");
    const item = runActor({ job_id: exportJobId, wait_for_completion: true });
    assert.equal(item.status, "completed", item.error);
    assert.equal(item.job_id, exportJobId);
    assert.equal(item.project_id, createdProjectId);
    assert.ok(item.url, "url");
    assert.ok(item.export_job, "export_job");
    return `size=${item.size}`;
  });
}

await step("edit the same project again in one waiting run with export off", async () => {
  assert.ok(createdProjectId, "needs the previous step");
  const item = runActor({
    prompt: "Change the text color to yellow.",
    project_id: createdProjectId,
    render: false,
    wait_for_completion: true,
  });
  assert.equal(item.status, "completed", item.error);
  assert.equal(item.project_id, createdProjectId);
  assert.equal(item.created_project, false);
  assert.ok(item.note, "note about export off");
});

await step("unknown job_id fails cleanly", async () => {
  const item = runActor({ job_id: "00000000-0000-0000-0000-000000000000" }, { expectFailure: true });
  assert.equal(item.status, "failed");
  assert.match(item.error, /No agent job or export job/);
});

if (createdProjectId) {
  try {
    await client.deleteProject(createdProjectId);
  } catch (err) {
    results.push(`WARN could not delete test project ${createdProjectId}: ${err.message}`);
  }
}
console.log("\n" + results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
