/**
 * Mirrors Rendley's catalog into the Actor so users never have to call the API
 * to find a model, a voice, a language or a model's parameters:
 *
 *   .actor/input_schema.json   model, voice and dubbing language dropdowns
 *
 *   RENDLEY_API_KEY=... node scripts/sync-catalog.mjs
 *   RENDLEY_API_BASE_URL=https://api.example.test/v1   # optional
 *
 * Run it whenever Rendley adds models or voices, then commit the result.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.RENDLEY_API_KEY;
const base = (process.env.RENDLEY_API_BASE_URL || "https://api.rendley.com/v1").replace(/\/+$/, "");
if (!key) {
  console.error("Set RENDLEY_API_KEY.");
  process.exit(1);
}

const get = async (path) => {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return (await res.json()).data;
};

const tools = await get("/ai/tools");
const voices = await get("/ai/text-to-speech/voices?limit=500");
const languages = await get("/ai/video-translate/languages");

const schemaPath = join(root, ".actor", "input_schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const actions = schema.properties.action.enum;
const actionTitle = (a) => schema.properties.action.enumTitles[actions.indexOf(a)].replace(/ \(.*$/, "");
const isDefault = (m) => /default for/i.test(m.description ?? "");
const modelsOf = (action) => tools.find((t) => t.action === action)?.models ?? [];

// ---- shared dropdowns -------------------------------------------------------
const modelEnum = [""];
const modelTitles = ["Rendley's default model for the action"];
for (const action of actions) {
  for (const m of modelsOf(action)) {
    modelEnum.push(m.id);
    modelTitles.push(`${actionTitle(action)}, ${m.name ?? m.id}${isDefault(m) ? " (default)" : ""}`);
  }
}
Object.assign(schema.properties.model_id, {
  editor: "select",
  enum: modelEnum,
  enumTitles: modelTitles,
  description: "Leave on the default to let Rendley pick the model for the action, or choose one. Each model's parameters are listed in the model catalog at https://docs.rendley.com/api/models.",
});
delete schema.properties.model_id.default;

const voiceList = [...voices].sort((a, b) => a.name.localeCompare(b.name));
Object.assign(schema.properties.voice_id, {
  editor: "select",
  enum: ["", ...voiceList.map((v) => v.id)],
  enumTitles: ["Sarah (default)", ...voiceList.map((v) => v.name)],
  description: "For text to speech and voice changes. Leave on the default for Sarah, or pick another voice from the catalog.",
});

Object.assign(schema.properties.output_language, {
  editor: "select",
  enum: ["", ...languages.map((l) => l.id)],
  enumTitles: ["Choose a language", ...languages.map((l) => l.name)],
  description: "For dubbing, the language to dub into.",
});

// Drop any model sections from earlier versions; parameters live in the docs.
schema.properties = Object.fromEntries(Object.entries(schema.properties).filter(([k]) => !k.startsWith("m_")));
writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + "\n");

console.log(`models: ${modelEnum.length - 1}, voices: ${voiceList.length}, languages: ${languages.length}`);
