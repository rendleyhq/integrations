// Offline checks: the Actor definition is consistent and main.js loads.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

test("actor.json points at files that exist", () => {
  const actor = read(".actor/actor.json");
  assert.equal(actor.actorSpecification, 1);
  for (const rel of [actor.input, actor.dockerfile, actor.readme, actor.changelog, actor.storages.dataset]) {
    assert.ok(fs.existsSync(path.join(root, ".actor", rel)), `${rel} exists`);
  }
  assert.match(actor.version, /^\d+\.\d+$/);
});

test("input schema: every operation-specific field names its operations", () => {
  const schema = read(".actor/input_schema.json");
  assert.deepEqual(schema.required, ["rendley_api_key", "operation"]);
  assert.equal(schema.properties.rendley_api_key.isSecret, true);
  const ops = schema.properties.operation.enum;
  assert.deepEqual(ops, ["prompt_to_video", "ai_action", "transcribe", "dub_video", "export", "estimate_cost"]);
  for (const [key, prop] of Object.entries(schema.properties)) {
    assert.ok(prop.title && prop.description, `${key} has title and description`);
  }
});

test("dataset schema fields match what main.js pushes", () => {
  const dataset = read(".actor/dataset_schema.json");
  const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  for (const field of ["operation", "status", "error", "project_id", "job_id", "video_url", "download_url", "kvs_url", "credits", "text"]) {
    assert.ok(dataset.fields.properties[field], `dataset declares ${field}`);
    assert.ok(main.includes(field), `main.js emits ${field}`);
  }
});

test("main.js parses and only imports apify and the client", () => {
  const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  const imports = [...main.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./rendley.js", "apify"]);
});
