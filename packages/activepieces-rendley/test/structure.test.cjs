// Offline checks on the built piece: metadata, names, props and triggers.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { rendley } = require("../dist/src/index.js");

test("piece metadata", () => {
  assert.equal(rendley.displayName, "Rendley");
  assert.ok(rendley.description.length > 30);
  assert.ok(rendley.logoUrl.startsWith("https://"));
  assert.ok(rendley.auth && rendley.auth.required);
  assert.match(rendley.minimumSupportedRelease, /^\d+\.\d+\.\d+$/);
});

test("every action has a snake_case name, display name, description and props", () => {
  const actions = Object.values(rendley.actions());
  assert.ok(actions.length >= 20);
  for (const action of actions) {
    if (action.name === "custom_api_call") continue; // provided by the framework
    assert.match(action.name, /^[a-z0-9_]+$/, action.name);
    assert.ok(action.displayName && action.description.endsWith("."), action.name);
    for (const [key, prop] of Object.entries(action.props)) {
      assert.ok(prop.displayName, `${action.name}.${key} displayName`);
      assert.ok(prop.description !== undefined, `${action.name}.${key} description`);
    }
  }
  const names = actions.map((a) => a.name);
  assert.equal(new Set(names).size, names.length, "unique action names");
});

test("triggers are polling with sample data", () => {
  const triggers = Object.values(rendley.triggers());
  assert.equal(triggers.length, 2);
  for (const trigger of triggers) {
    assert.equal(trigger.type, "POLLING");
    assert.ok(trigger.sampleData && typeof trigger.sampleData === "object", trigger.name);
    assert.equal(typeof trigger.run, "function");
    assert.equal(typeof trigger.test, "function");
  }
});
