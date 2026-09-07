// Offline checks that mirror Pipedream's component guidelines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import app from "../components/rendley/rendley.app.mjs";
import * as ai from "../components/rendley/actions/ai-actions.mjs";
import * as core from "../components/rendley/actions/core-actions.mjs";
import * as sources from "../components/rendley/sources/sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const components = [...Object.values(ai), ...Object.values(core), ...Object.values(sources)];

test("app file declares the app slug and prop definitions with options", () => {
  assert.equal(app.type, "app");
  assert.equal(app.app, "rendley");
  for (const [key, def] of Object.entries(app.propDefinitions)) {
    assert.ok(def.type && def.label && def.description, key);
  }
  assert.equal(typeof app.methods._makeRequest, "function");
});

test("every component follows the key, version, description and annotation conventions", () => {
  const keys = new Set();
  for (const c of components) {
    assert.match(c.key, /^rendley-[a-z0-9-]+$/, c.key);
    assert.ok(!keys.has(c.key), `duplicate ${c.key}`);
    keys.add(c.key);
    assert.match(c.version, /^\d+\.\d+\.\d+$/, c.key);
    assert.ok(c.name && /^[A-Z]/.test(c.name), `${c.key} name`);
    assert.ok(c.description.includes("[See the documentation](https://docs.rendley.com)"), `${c.key} docs link`);
    assert.equal(typeof c.run, "function", c.key);
    assert.ok(c.props.rendley === app, `${c.key} references the app`);
    for (const [name, prop] of Object.entries(c.props)) {
      if (name === "rendley" || name === "db" || name === "timer") continue;
      if (prop.propDefinition) {
        const [refApp, defName] = prop.propDefinition;
        assert.equal(refApp, app, `${c.key}.${name} app ref`);
        assert.ok(app.propDefinitions[defName], `${c.key}.${name} -> ${defName}`);
      } else {
        assert.ok(prop.type && prop.label && prop.description, `${c.key}.${name}`);
      }
    }
    if (c.type === "action") {
      assert.ok(c.annotations && "destructiveHint" in c.annotations && "readOnlyHint" in c.annotations, `${c.key} annotations`);
    } else {
      assert.equal(c.type, "source");
      assert.equal(c.dedupe, "unique", c.key);
      assert.ok(c.sampleEmit && typeof c.sampleEmit === "object", `${c.key} sampleEmit`);
      assert.equal(c.props.timer.type, "$.interface.timer", `${c.key} timer`);
    }
  }
  assert.ok(components.length >= 20);
});

test("package.json matches the registry layout", () => {
  const pkg = JSON.parse(readFileSync(join(root, "components/rendley/package.json"), "utf8"));
  assert.equal(pkg.name, "@pipedream/rendley");
  assert.equal(pkg.main, "rendley.app.mjs");
  assert.ok(pkg.keywords.includes("pipedream") && pkg.keywords.includes("rendley"));
  assert.ok(pkg.dependencies["@pipedream/platform"]);
  assert.equal(pkg.publishConfig.access, "public");
});
