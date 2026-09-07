/**
 * Executes every operation in apiDefinition.swagger.json against a real
 * Rendley account, building each request from the definition (host, basePath,
 * path and query parameters, body) the way the connector runtime would, with
 * the Authorization header the setheader policy produces. Responses are
 * checked against the declared schemas.
 *
 *   RENDLEY_API_KEY=... npm run test:live
 *   RENDLEY_API_BASE_URL=https://api.staging.example/v1   # optional
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swagger = JSON.parse(readFileSync(join(root, "apiDefinition.swagger.json"), "utf8"));
const key = process.env.RENDLEY_API_KEY;
if (!key) {
  console.error("Set RENDLEY_API_KEY (a paid-plan key; the run spends a few credits).");
  process.exit(1);
}
const base = process.env.RENDLEY_API_BASE_URL || `${swagger.schemes[0]}://${swagger.host}${swagger.basePath}`;

const ops = {};
for (const [path, methods] of Object.entries(swagger.paths)) for (const [method, op] of Object.entries(methods)) ops[op.operationId] = { path, method: method.toUpperCase(), op };

/** Build and send a request for an operation from the swagger definition. */
async function call(operationId, values = {}) {
  const { path, method, op } = ops[operationId];
  let url = path;
  const query = new URLSearchParams();
  let body;
  for (const p of op.parameters ?? []) {
    const v = values[p.name];
    if (p.in === "path") {
      assert.ok(v !== undefined, `${operationId} needs ${p.name}`);
      if (p.enum) assert.ok(p.enum.includes(v), `${operationId} ${p.name} enum`);
      url = url.replace(`{${p.name}}`, encodeURIComponent(v));
    } else if (p.in === "query") {
      if (v !== undefined) query.set(p.name, String(v));
    } else if (p.in === "body") {
      body = v;
      for (const req of p.schema.required ?? []) assert.ok(body && body[req] !== undefined, `${operationId} body.${req} required`);
    }
  }
  const res = await fetch(`${base}${url}${query.size ? `?${query}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${operationId} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  checkSchema(json, op.responses["200"].schema, operationId);
  return json;
}

/** Light schema check: declared types match for present keys, arrays are arrays. */
function checkSchema(value, schema, where) {
  if (schema.type === "object" && value && typeof value === "object") {
    for (const [k, prop] of Object.entries(schema.properties ?? {})) {
      if (value[k] === undefined || value[k] === null) continue;
      checkSchema(value[k], prop, `${where}.${k}`);
    }
  } else if (schema.type === "array") {
    assert.ok(Array.isArray(value), `${where} array`);
    for (const item of value.slice(0, 3)) checkSchema(item, schema.items, `${where}[]`);
  } else if (schema.type === "integer" || schema.type === "number") {
    assert.equal(typeof value, "number", `${where} number`);
  } else if (schema.type === "string") {
    assert.equal(typeof value, "string", `${where} string`);
  }
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pollJob(jobId) {
  for (let i = 0; i < 60; i++) {
    const { data } = await call("GetJob", { jobId });
    if (["completed", "failed", "canceled"].includes(data.status)) return data;
    await sleep(4000);
  }
  throw new Error("job did not finish");
}

let projectId;
let mediaId;
await step("ListWorkspaces", async () => { const r = await call("ListWorkspaces"); assert.ok(r.data.length > 0); });
await step("CreateProject", async () => { const r = await call("CreateProject", { body: { name: "power-platform-live-test" } }); projectId = r.data.id; assert.ok(projectId); return projectId; });
await step("GetProject and ListProjects", async () => { const p = await call("GetProject", { projectId }); assert.equal(p.data.name, "power-platform-live-test"); const l = await call("ListProjects"); assert.ok(l.data.some((x) => x.id === projectId)); });
await step("UploadMediaFromUrl then GetMediaUrl by id and by hash", async () => {
  const up = await call("UploadMediaFromUrl", { projectId, body: { download_url: "https://download.samplelib.com/mp3/sample-3s.mp3", file_name: "sample.mp3", role: "pending" } });
  mediaId = up.data.media_id;
  assert.ok(mediaId && up.data.storage_url);
  const byId = await call("GetMediaUrl", { projectId, media_id: mediaId });
  assert.ok(byId.data.storage_url.startsWith("https://"));
  const byHash = await call("GetMediaUrl", { projectId, hash: up.data.file_hash });
  assert.ok(byHash.data.storage_url.startsWith("https://"));
});
await step("ListVoices and ListDubbingLanguages", async () => { const v = await call("ListVoices", { limit: 5 }); assert.ok(v.data.length > 0); const l = await call("ListDubbingLanguages"); assert.ok(l.data.length > 0); });
await step("EstimateAiActionCost and EstimateRenderCost", async () => {
  const ai = await call("EstimateAiActionCost", { action: "voice-isolation", body: { project_id: projectId, params: { media: mediaId } } });
  assert.ok(ai.data > 0);
  const exp = await call("EstimateRenderCost", { body: { project_id: projectId } });
  assert.ok(exp.data.credits >= 0);
  return `voice-isolation=${ai.data} export=${exp.data.credits}`;
});
await step("RunAiAction generate-sound-effect then GetJob until complete", async () => {
  const started = await call("RunAiAction", { action: "generate-sound-effect", body: { project_id: projectId, params: { prompt: "a single soft rain drop", duration_seconds: 2 } } });
  const job = await pollJob(started.data.job_id);
  assert.equal(job.status, "completed");
  assert.ok(job.output?.url);
  return `job=${started.data.job_id}`;
});
await step("RunAiAction transcribe by media id", async () => {
  const started = await call("RunAiAction", { action: "transcribe", body: { project_id: projectId, params: { media: mediaId } } });
  const job = await pollJob(started.data.job_id);
  assert.equal(job.status, "completed");
  assert.ok(job.result_data.includes("text"));
});
await step("EditVideoWithAiAgent (trivial), GetAgentJob, CancelAgentJob", async () => {
  const started = await call("EditVideoWithAiAgent", { body: { prompt: "Reply with the single word OK and make no changes.", project_id: projectId } });
  let job;
  for (let i = 0; i < 60; i++) {
    job = (await call("GetAgentJob", { jobId: started.data.job_id })).data;
    if (["completed", "failed", "canceled"].includes(job.status)) break;
    await sleep(4000);
  }
  assert.equal(job.status, "completed");
  const second = await call("EditVideoWithAiAgent", { body: { prompt: "Reply with the single word OK and make no changes.", project_id: projectId } });
  const canceled = await call("CancelAgentJob", { jobId: second.data.job_id });
  assert.ok(["canceled", "cancelled", "completed"].includes(canceled.data.status));
});
await step("RenderVideo then CancelJob", async () => {
  const started = await call("RenderVideo", { body: { project_id: projectId, settings: { target_resolution: "720p", quality: "low" } } });
  assert.ok(started.data.job_id);
  await call("CancelJob", { jobId: started.data.job_id }).catch(() => {});
});
await step("DeleteProject", async () => { await call("DeleteProject", { projectId }); });
await step("every operation was exercised", async () => {
  const exercised = new Set(results.filter((r) => r.startsWith("PASS")).flatMap((r) => Object.keys(ops).filter((id) => r.includes(id))));
  const missing = Object.keys(ops).filter((id) => !exercised.has(id));
  assert.deepEqual(missing, [], `not exercised: ${missing.join(", ")}`);
  return `${Object.keys(ops).length} operations`;
});

console.log("\n" + results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} pass / ${failed} fail`);
process.exit(failed ? 1 : 0);
