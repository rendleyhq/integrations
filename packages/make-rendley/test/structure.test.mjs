// Offline checks: every file parses, the manifest references existing files,
// every module has the five tabs, search modules have a limit, and no
// component still references removed features.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { ImlRuntime } from "./iml-runtime.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

test("every JSON and IMLJSON file parses", () => {
  const files = execSync("find . -name '*.imljson' -o -name '*.json' | grep -v node_modules", { cwd: root }).toString().trim().split("\n");
  for (const f of files) assert.doesNotThrow(() => read(f), f);
  assert.ok(files.length > 50);
});

test("manifest references existing files and every folder is registered", () => {
  const m = read("makecomapp.json");
  const walk = (o, out = []) => { for (const v of Object.values(o)) { if (v && typeof v === "object") walk(v, out); else if (typeof v === "string" && /\.(imljson|md)$/.test(v)) out.push(v); } return out; };
  for (const ref of walk(m)) assert.ok(existsSync(join(root, ref)), `${ref} exists`);
  for (const d of readdirSync(join(root, "modules"))) assert.ok(m.components.module[d], `module ${d} registered`);
  for (const d of readdirSync(join(root, "rpcs"))) assert.ok(m.components.rpc[d], `rpc ${d} registered`);
  assert.equal(Object.keys(m.components.webhook).length, 0, "no webhook components");
});

test("each module has communication, parameters, interface, samples and metadata", () => {
  for (const d of readdirSync(join(root, "modules"))) {
    for (const f of ["communication", "mappable-parameters", "interface", "samples", "metadata"]) {
      assert.ok(existsSync(join(root, "modules", d, `${f}.imljson`)), `${d}/${f}`);
    }
    const md = read(`modules/${d}/metadata.imljson`);
    assert.ok(md.label && md.description.length > 20, `${d} label and description`);
    const sample = read(`modules/${d}/samples.imljson`);
    const declared = read(`modules/${d}/interface.imljson`).map((x) => x.name);
    const sampleObj = Array.isArray(sample) ? sample[0] : sample;
    for (const k of Object.keys(sampleObj)) assert.ok(declared.includes(k), `${d} sample key ${k} declared in interface`);
  }
});

test("search modules and RPCs paginate with a limit", () => {
  const m = read("makecomapp.json");
  for (const [name, comp] of Object.entries(m.components.module)) {
    if (comp.moduleType !== "search") continue;
    const params = read(`modules/${name}/mappable-parameters.imljson`);
    assert.ok(params.some((p) => p.name === "limit"), `${name} has limit`);
  }
});

test("no component references removed features", () => {
  const files = execSync("find modules rpcs connections base.imljson -name '*.imljson'", { cwd: root }).toString().trim().split("\n");
  for (const f of files) {
    const text = readFileSync(join(root, f), "utf8");
    assert.ok(!/webhook_url|end_user_id|mcp\.rendley\.com|video-avatars|parseJSON|file_hash": "\{\{if|video_file_url/.test(text), `${f} clean`);
  }
});

test("IML runtime evaluates the expressions the app uses", () => {
  const rt = new ImlRuntime({ baseUrl: "https://example.test/v1", apiKey: "k" });
  const ctx = { parameters: { source: "https://x/y.mp4", host: "agent", jobId: "j1", action: "export", fileUrl: "https://x/a.mp4", fileName: "A" }, body: { data: [{ id: "w1" }, { id: "w2" }] } };
  assert.equal(rt.eval("if(parameters.host = 'agent', '/agent/jobs/' + parameters.jobId, '/jobs/' + parameters.jobId)", ctx), "/agent/jobs/j1");
  assert.equal(rt.eval("body.data[1].id", ctx), "w1");
  assert.equal(rt.eval("if(parameters.action = 'export', '/export/cost', '/ai/' + parameters.action + '/cost')", ctx), "/export/cost");
  assert.deepEqual(rt.eval("if(parameters.fileUrl, array({url: parameters.fileUrl, name: parameters.fileName}), undefined)", ctx), [{ url: "https://x/a.mp4", name: "A" }]);
  assert.equal(rt.eval("ifempty(parameters.missing, 'fallback')", ctx), "fallback");
  assert.equal(rt.eval("contains(parameters.source, '://')", ctx), true);
  assert.equal(rt.eval("!parameters.missing", ctx), true);
});
