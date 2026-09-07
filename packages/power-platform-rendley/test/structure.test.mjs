// Validates the connector files offline: OpenAPI 2.0 validity plus the rules
// from Microsoft's certification submission requirements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swagger = JSON.parse(readFileSync(join(root, "apiDefinition.swagger.json"), "utf8"));
const props = JSON.parse(readFileSync(join(root, "apiProperties.json"), "utf8"));
const BANNED = /Power Automate|Power Apps|Copilot Studio|Logic Apps/i;

test("apiDefinition is valid OpenAPI 2.0", async () => {
  await SwaggerParser.validate(structuredClone(swagger));
  assert.equal(swagger.swagger, "2.0");
  assert.deepEqual(swagger.schemes, ["https"]);
  assert.equal(swagger.host, "api.rendley.com");
});

test("title and description follow the certification rules", () => {
  assert.ok(swagger.info.title.length <= 30 && !/API|Connector/i.test(swagger.info.title));
  assert.ok(swagger.info.description.length > 30 && swagger.info.description.length < 500);
  assert.ok(!BANNED.test(swagger.info.description));
});

test("every operation has an id, a short summary, a sentence description, visibility and exact responses", () => {
  const ids = new Set();
  for (const [path, methods] of Object.entries(swagger.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const where = `${method.toUpperCase()} ${path}`;
      assert.ok(op.operationId && !ids.has(op.operationId), `${where} unique operationId`);
      ids.add(op.operationId);
      assert.ok(op.summary.length <= 80 && /^[A-Za-z0-9 ()]+$/.test(op.summary), `${where} summary`);
      assert.ok(/[.!?]$/.test(op.description) && !BANNED.test(op.description), `${where} description`);
      assert.ok(["important", "advanced", "internal"].includes(op["x-ms-visibility"]), `${where} visibility`);
      assert.ok(!op.responses.default, `${where} no default response`);
      for (const [code, res] of Object.entries(op.responses)) {
        assert.ok(res.description && res.schema && Object.keys(res.schema.properties ?? {}).length > 0, `${where} ${code} exact schema`);
      }
      for (const p of op.parameters ?? []) {
        assert.ok(p.description && /[.!?]$/.test(p.description), `${where} param ${p.name} description`);
        if (p.in !== "body") assert.ok(p["x-ms-summary"] && p["x-ms-summary"].length <= 80, `${where} param ${p.name} x-ms-summary`);
        if (p.in === "path") assert.equal(p["x-ms-url-encoding"], "single", `${where} path param ${p.name} encoding`);
      }
    }
  }
});

test("every schema property has a description and x-ms-summary", () => {
  const walk = (schema, where) => {
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      assert.ok(prop.description && /[.!?]$/.test(prop.description), `${where}.${key} description`);
      assert.ok(prop["x-ms-summary"], `${where}.${key} x-ms-summary`);
      if (prop.type === "object") walk(prop, `${where}.${key}`);
      if (prop.type === "array" && prop.items) walk(prop.items, `${where}.${key}[]`);
    }
  };
  for (const [path, methods] of Object.entries(swagger.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      for (const p of op.parameters ?? []) if (p.in === "body") walk(p.schema, `${op.operationId} body`);
      for (const res of Object.values(op.responses)) walk(res.schema, `${op.operationId} response`);
    }
  }
});

test("dynamic values point at existing operations", () => {
  const ids = new Set(Object.values(swagger.paths).flatMap((m) => Object.values(m).map((o) => o.operationId)));
  const text = JSON.stringify(swagger);
  for (const m of text.matchAll(/"operationId":"([A-Za-z]+)","value-path"/g)) assert.ok(ids.has(m[1]), `dynamic values operation ${m[1]}`);
});

test("apiProperties declares the API key parameter and the Bearer policy", () => {
  const key = props.properties.connectionParameters.api_key;
  assert.equal(key.type, "securestring");
  assert.equal(key.uiDefinition.constraints.required, "true");
  assert.equal(key.uiDefinition.constraints.clearText, false);
  const policy = props.properties.policyTemplateInstances.find((p) => p.templateId === "setheader");
  assert.equal(policy.parameters["x-ms-apimTemplateParameter.name"], "Authorization");
  assert.match(policy.parameters["x-ms-apimTemplateParameter.value"], /^Bearer @connectionParameters\('api_key'\)$/);
  assert.match(props.properties.iconBrandColor, /^#[0-9a-f]{6}$/i);
  assert.notEqual(props.properties.iconBrandColor.toLowerCase(), "#007ee5");
  assert.equal(swagger.securityDefinitions.api_key.name, "Authorization");
});
