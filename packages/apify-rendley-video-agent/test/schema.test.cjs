// Offline checks: the Actor definition is consistent, the shared copies are fresh and main.js loads.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
const lib = fs.readFileSync(path.join(root, "src", "lib.js"), "utf8");

test("actor.json points at files that exist", () => {
  const actor = read(".actor/actor.json");
  assert.equal(actor.actorSpecification, 1);
  assert.equal(actor.name, "rendley-ai-video-agent");
  for (const rel of [actor.input, actor.output, actor.dockerfile, actor.readme, actor.changelog, actor.storages.dataset]) {
    assert.ok(fs.existsSync(path.join(root, ".actor", rel)), `${rel} exists`);
  }
  assert.match(actor.version, /^\d+\.\d+$/);
});

test("input schema: only the key is required (a prompt or a job_id is checked at run time)", () => {
  const schema = read(".actor/input_schema.json");
  assert.deepEqual(schema.required, ["rendley_api_key"]);
  assert.equal(schema.properties.wait_for_completion, undefined);
  assert.equal(schema.properties.job_id.type, "string");
  assert.deepEqual(read(".actor/dataset_schema.json").fields.properties.status.enum, ["running", "completed", "failed"]);
  assert.equal(schema.properties.rendley_api_key.isSecret, true);
  assert.equal(schema.properties.project_id.default, undefined);
  assert.equal(schema.properties.workspace_id.default, undefined);
  for (const [key, prop] of Object.entries(schema.properties)) {
    assert.ok(prop.title && prop.description, `${key} has title and description`);
  }
});

test("dataset schema declares every field main.js pushes", () => {
  const dataset = read(".actor/dataset_schema.json");
  for (const field of [
    "status", "error", "project_id", "workspace_id", "created_project", "thread_id", "agent_job_id", "last_message", "agent_job",
    "commands_applied", "commands_failed", "note", "job_id", "url", "url_expires_at", "media_id", "file_hash",
    "mime_type", "size", "width", "height", "duration", "result_data", "export_job", "kvs_key", "kvs_url", "url_expiry",
  ]) {
    assert.ok(dataset.fields.properties[field], `dataset declares ${field}`);
    assert.ok(main.includes(field) || lib.includes(field), `main.js or lib.js emits ${field}`);
  }
});

test("src/lib.js and src/rendley.js are the committed copies of the shared sources", () => {
  const source = fs.readFileSync(path.join(root, "..", "apify-common", "lib.js"), "utf8");
  assert.equal(lib, source, "src/lib.js is stale: run npm run build:client");
  assert.ok(fs.existsSync(path.join(root, "src", "rendley.js")), "src/rendley.js exists: run npm run build:client");
});

test("main.js only imports apify and the bundled helpers", () => {
  const imports = [...main.matchAll(/^import[\s\S]*?from "([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./lib.js", "./rendley.js", "apify"]);
});
