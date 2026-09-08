#!/usr/bin/env node
/**
 * Push this package to a Make custom app through the SDK Apps REST API.
 *
 *   node scripts/push.mjs                    push everything
 *   node scripts/push.mjs --only modules     just the modules
 *   node scripts/push.mjs --module getJob    just these modules (repeatable)
 *   node scripts/push.mjs --prune            also delete anything Make has that the
 *                                              manifest does not (makes Make match the repo)
 *   node scripts/push.mjs --publish-modules   make every module visible (new modules are
 *                                              created hidden, so an invite link shows nothing)
 *   node scripts/push.mjs --readme           also push README.md as the app's readme
 *   node scripts/push.mjs --dry-run          print what would happen, change nothing
 *   node scripts/push.mjs --status           list what Make currently holds
 *   node scripts/push.mjs --verify           compare Make against makecomapp.json
 *
 * Target and credentials come from makecomapp.json's first origin: `appId`,
 * `appVersion`, `baseUrl` and `apikeyFile`. The token is read from that file and
 * never printed. Create one at Profile -> API access with the scopes
 * `sdk-apps:read` and `sdk-apps:write`.
 *
 * Three things this script exists to get right, all learned the hard way:
 *
 *  1. Make sits behind Cloudflare, which answers a default scripting user agent
 *     with `403 / error code: 1010`. Every request below sends a real UA.
 *  2. `POST /connections` is NOT idempotent - it creates a duplicate connection
 *     instead of failing - so connections are looked up before being created.
 *  3. A module's mappable parameters belong to the `expect` section. Make's
 *     `parameters` section is static config, so sending them there turns every
 *     mapped field into a fixed setting.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(ROOT, 'makecomapp.json'), 'utf8'));
const origin = manifest.origins[0];
const { appId: APP, appVersion: VERSION } = origin;
const API = `${origin.baseUrl.replace(/\/$/, '')}/v2/sdk/apps`;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i === -1 ? null : argv[i + 1]; };
const many = (f) => argv.flatMap((a, i) => (a === f ? [argv[i + 1]] : []));

const DRY = has('--dry-run');
const PRUNE = has('--prune');
const PUBLISH = has('--publish-modules');
const ONLY = val('--only');
const PICK = many('--module');
const wants = (part) => (ONLY ? ONLY === part : true);

// module section in Make  <-  key in makecomapp.json
const MODULE_SECTIONS = [
  ['api', 'communication'],
  ['expect', 'mappableParams'],
  ['parameters', 'staticParams'],
  ['interface', 'interface'],
  ['samples', 'samples'],
  ['scope', 'scope'],
];
const TYPE_ID = { trigger: 1, action: 4, search: 9, instant_trigger: 10, responder: 11, universal: 12 };
const TYPE_NAME = Object.fromEntries(Object.entries(TYPE_ID).map(([k, v]) => [v, k]));

function token() {
  const path = join(ROOT, origin.apikeyFile);
  if (!existsSync(path)) {
    console.error(`No API token at ${origin.apikeyFile}.`);
    console.error('Create one in Make: avatar -> Profile -> API access -> Add token,');
    console.error('with the scopes sdk-apps:read and sdk-apps:write, then save it there.');
    process.exit(1);
  }
  const t = readFileSync(path, 'utf8').trim();
  if (!t) { console.error(`${origin.apikeyFile} is empty.`); process.exit(1); }
  return t;
}
const TOKEN = token();

let failures = [];

async function call(method, path, body, contentType = 'application/json') {
  const headers = {
    Authorization: `Token ${TOKEN}`,
    Accept: 'application/json',
    // Cloudflare rejects default scripting user agents with 403 / error 1010.
    'User-Agent': 'rendley-make-push/1.0',
  };
  if (body !== undefined) headers['Content-Type'] = contentType;
  const payload = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + path, { method, headers, body: payload });
    const text = await res.text();
    const parsed = text.trim().startsWith('{') || text.trim().startsWith('[')
      ? JSON.parse(text) : text;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      continue;
    }
    return { status: res.status, ok: res.ok, body: parsed };
  }
}

const file = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function putSection(path, rel, label) {
  if (!rel) return true;
  if (DRY) { console.log(`      would put ${label}  <- ${rel}`); return true; }
  const { status, ok, body } = await call('PUT', path, file(rel), 'application/jsonc');
  console.log(`      ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(11)} [${status}]${ok ? '' : ` ${JSON.stringify(body)}`}`);
  if (!ok) failures.push(`${path} (${label})`);
  return ok;
}

async function pushBase() {
  console.log('base');
  if (DRY) { console.log('      would put base.imljson'); return; }
  const { status, ok, body } = await call('PUT', `/${APP}/${VERSION}/base`, file('base.imljson'), 'application/jsonc');
  console.log(`      ${ok ? 'ok  ' : 'FAIL'} base        [${status}]${ok ? '' : ` ${JSON.stringify(body)}`}`);
  if (!ok) failures.push('base');
}

async function pushConnections() {
  const map = {};
  for (const [key, c] of Object.entries(manifest.components.connection ?? {})) {
    console.log(`connection ${key}  "${c.label}"`);
    // POST is not idempotent here, so look before creating.
    const list = await call('GET', `/${APP}/connections`);
    const existing = (list.body?.appConnections ?? []).filter((x) => x.label === c.label);
    let name;
    if (existing.length) {
      name = existing.map((x) => x.name).sort()[0];
      console.log(`      reusing ${name}${existing.length > 1 ? `   WARNING: ${existing.length} connections share this label` : ''}`);
    } else if (DRY) {
      console.log('      would create'); map[key] = key; continue;
    } else {
      const r = await call('POST', `/${APP}/connections`, { label: c.label, type: c.connectionType });
      if (!r.ok) { console.log(`      FAIL create [${r.status}] ${JSON.stringify(r.body)}`); failures.push(key); continue; }
      name = r.body.appConnection?.name ?? r.body.name;
      console.log(`      created ${name}`);
    }
    map[key] = name;
    await putSection(`/connections/${name}/api`, c.codeFiles?.communication, 'api');
    await putSection(`/connections/${name}/parameters`, c.codeFiles?.params, 'parameters');
    await putSection(`/connections/${name}/common`, c.codeFiles?.common, 'common');
  }
  return map;
}

async function pushModules(connMap) {
  for (const [name, m] of Object.entries(manifest.components.module ?? {})) {
    if (PICK.length && !PICK.includes(name)) continue;
    console.log(`module ${name}  (${m.moduleType})  "${m.label}"`);
    const meta = { name, label: m.label, typeId: TYPE_ID[m.moduleType] };
    if (meta.typeId === undefined) { console.log(`      FAIL unknown moduleType ${m.moduleType}`); failures.push(name); continue; }
    if (m.description) meta.description = m.description;
    if (m.connection) meta.connection = connMap[m.connection] ?? m.connection;
    if (m.actionCrud) meta.crud = m.actionCrud;

    if (DRY) { console.log(`      would create/update ${JSON.stringify(meta)}`); continue; }
    const created = await call('POST', `/${APP}/${VERSION}/modules`, meta);
    if (created.ok) {
      console.log(`      created [${created.status}]`);
    } else {
      const { name: _drop, ...patch } = meta;
      const updated = await call('PATCH', `/${APP}/${VERSION}/modules/${name}`, patch);
      if (!updated.ok) {
        console.log(`      FAIL [${created.status} then ${updated.status}] ${JSON.stringify(updated.body)}`);
        failures.push(name); continue;
      }
      console.log(`      updated [${updated.status}]`);
    }
    for (const [section, key] of MODULE_SECTIONS) {
      await putSection(`/${APP}/${VERSION}/modules/${name}/${section}`, m.codeFiles?.[key], section);
    }
  }
}

async function pushRpcs(connMap) {
  for (const [name, r] of Object.entries(manifest.components.rpc ?? {})) {
    console.log(`rpc ${name}  "${r.label}"`);
    const meta = { name, label: r.label };
    if (r.connection) meta.connection = connMap[r.connection] ?? r.connection;
    if (DRY) { console.log(`      would create/update ${JSON.stringify(meta)}`); continue; }
    const created = await call('POST', `/${APP}/${VERSION}/rpcs`, meta);
    if (created.ok) {
      console.log(`      created [${created.status}]`);
    } else {
      const updated = await call('PATCH', `/${APP}/${VERSION}/rpcs/${name}`, { label: r.label });
      if (!updated.ok) {
        console.log(`      FAIL [${created.status} then ${updated.status}] ${JSON.stringify(updated.body)}`);
        failures.push(name); continue;
      }
      console.log(`      updated [${updated.status}]`);
    }
    await putSection(`/${APP}/${VERSION}/rpcs/${name}/api`, r.codeFiles?.communication, 'api');
    await putSection(`/${APP}/${VERSION}/rpcs/${name}/parameters`, r.codeFiles?.params, 'parameters');
  }
}

async function pushReadme() {
  console.log('readme');
  if (DRY) { console.log('      would put README.md'); return; }
  const { status, ok, body } = await call('PUT', `/${APP}/${VERSION}/readme`, file('README.md'), 'text/markdown');
  console.log(`      ${ok ? 'ok  ' : 'FAIL'} readme      [${status}]${ok ? '' : ` ${JSON.stringify(body)}`}`);
  if (!ok) failures.push('readme');
}

async function prune(connMap) {
  const s = await remoteState();
  const wantModules = manifest.components.module ?? {};
  const wantRpcs = manifest.components.rpc ?? {};
  const keepConnections = new Set(Object.values(connMap));

  const orphans = [
    ...s.modules.filter((m) => !wantModules[m.name]).map((m) => ({ kind: 'module', name: m.name, path: `/${APP}/${VERSION}/modules/${m.name}` })),
    ...s.rpcs.filter((r) => !wantRpcs[r.name]).map((r) => ({ kind: 'rpc', name: r.name, path: `/${APP}/${VERSION}/rpcs/${r.name}` })),
    ...s.connections.filter((c) => !keepConnections.has(c.name)).map((c) => ({ kind: 'connection', name: c.name, path: `/connections/${c.name}` })),
  ];

  if (!orphans.length) { console.log('prune\n      nothing to remove'); return; }

  console.log('prune');
  if (!PRUNE) {
    for (const o of orphans) console.log(`      orphan  ${o.kind.padEnd(11)} ${o.name}`);
    console.log('      not removed - re-run with --prune to delete these from Make');
    return;
  }
  for (const o of orphans) {
    if (DRY) { console.log(`      would delete ${o.kind} ${o.name}`); continue; }
    const { status, ok, body } = await call('DELETE', o.path);
    console.log(`      ${ok ? 'deleted' : 'FAIL   '} ${o.kind.padEnd(11)} ${o.name} [${status}]${ok ? '' : ` ${JSON.stringify(body)}`}`);
    if (!ok) {
      failures.push(`delete ${o.kind} ${o.name}`);
      if (status === 400 || status === 409) console.log('              (Make refuses to delete a component that a scenario still uses)');
    }
  }
}

async function publishModules() {
  const s = await remoteState();
  const hidden = s.modules.filter((m) => !m.public);
  if (!hidden.length) { console.log('visibility\n      all modules visible'); return; }
  console.log('visibility');
  if (!PUBLISH) {
    for (const m of hidden) console.log(`      hidden  ${m.name}`);
    console.log('      Make creates modules hidden - an invite link shows "no modules" until they are public.');
    console.log('      re-run with --publish-modules to make them visible');
    return;
  }
  for (const m of hidden) {
    if (DRY) { console.log(`      would publish ${m.name}`); continue; }
    // Undocumented, but it is what the Apps Editor's per-module "hidden" toggle calls.
    const { status, ok } = await call('POST', `/${APP}/${VERSION}/modules/${m.name}/public`, '');
    console.log(`      ${ok ? 'visible' : 'FAIL   '} ${m.name} [${status}]`);
    if (!ok) failures.push(`publish ${m.name}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function remoteState() {
  const [cons, mods, rpcs] = await Promise.all([
    call('GET', `/${APP}/connections`),
    call('GET', `/${APP}/${VERSION}/modules`),
    call('GET', `/${APP}/${VERSION}/rpcs`),
  ]);
  if (!cons.ok || !mods.ok || !rpcs.ok) {
    console.error(`Could not read the app. [${cons.status}/${mods.status}/${rpcs.status}]`);
    console.error('A 403 with "error code: 1010" is Cloudflare; a 401 means the token lacks sdk-apps scopes.');
    process.exit(1);
  }
  return {
    connections: cons.body.appConnections ?? [],
    modules: mods.body.appModules ?? [],
    rpcs: rpcs.body.appRpcs ?? [],
  };
}

async function status() {
  const s = await remoteState();
  console.log(`app ${APP} v${VERSION}  (${origin.baseUrl})\n`);
  console.log(`connections (${s.connections.length})`);
  for (const c of s.connections) console.log(`   ${c.name.padEnd(24)} ${c.type}  "${c.label}"`);
  console.log(`\nmodules (${s.modules.length})`);
  for (const m of s.modules) {
    console.log(`   ${m.name.padEnd(24)} ${(TYPE_NAME[m.typeId] ?? m.typeId).padEnd(10)} ${m.connection ? '' : 'NO CONNECTION  '}"${m.label}"`);
  }
  console.log(`\nrpcs (${s.rpcs.length})`);
  for (const r of s.rpcs) console.log(`   ${r.name.padEnd(24)} "${r.label}"`);
}

async function verify() {
  const s = await remoteState();
  const problems = [];
  const wantModules = manifest.components.module ?? {};
  const wantRpcs = manifest.components.rpc ?? {};
  const wantConns = manifest.components.connection ?? {};

  for (const [name, m] of Object.entries(wantModules)) {
    const live = s.modules.find((x) => x.name === name);
    if (!live) { problems.push(`module ${name}: missing in Make`); continue; }
    if (live.typeId !== TYPE_ID[m.moduleType]) {
      problems.push(`module ${name}: type is ${TYPE_NAME[live.typeId] ?? live.typeId}, manifest says ${m.moduleType}`);
    }
    if (m.connection && !live.connection) problems.push(`module ${name}: no connection attached`);
    if (live.label !== m.label) problems.push(`module ${name}: label "${live.label}" != "${m.label}"`);
  }
  for (const name of Object.keys(wantRpcs)) {
    if (!s.rpcs.find((x) => x.name === name)) problems.push(`rpc ${name}: missing in Make`);
  }
  for (const c of Object.values(wantConns)) {
    const hits = s.connections.filter((x) => x.label === c.label);
    if (!hits.length) problems.push(`connection "${c.label}": missing in Make`);
    if (hits.length > 1) problems.push(`connection "${c.label}": ${hits.length} duplicates (${hits.map((h) => h.name).join(', ')})`);
  }
  for (const m of s.modules) {
    if (!wantModules[m.name]) problems.push(`module ${m.name}: in Make but not in the manifest`);
  }
  for (const r of s.rpcs) {
    if (!wantRpcs[r.name]) problems.push(`rpc ${r.name}: in Make but not in the manifest`);
  }

  console.log(`manifest: ${Object.keys(wantConns).length} connection(s), ${Object.keys(wantModules).length} modules, ${Object.keys(wantRpcs).length} rpcs`);
  console.log(`Make:     ${s.connections.length} connection(s), ${s.modules.length} modules, ${s.rpcs.length} rpcs\n`);
  if (!problems.length) { console.log('in sync'); return; }
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log(`   ${p}`);
  process.exitCode = 1;
}

const t0 = Date.now();
if (has('--status')) {
  await status();
} else if (has('--verify')) {
  await verify();
} else {
  console.log(`${DRY ? 'DRY RUN - ' : ''}pushing to ${APP} v${VERSION}\n`);
  let connMap = {};
  if (wants('base')) await pushBase();
  // Connections are always resolved: modules need the real connection name.
  connMap = await pushConnections();
  if (wants('modules')) await pushModules(connMap);
  if (wants('rpcs')) await pushRpcs(connMap);
  if (has('--readme')) await pushReadme();
  // Renames land here too: the new name was just created above, the old one is an orphan.
  if (!ONLY && !PICK.length) await publishModules();
  if (!ONLY && !PICK.length) await prune(connMap);
  else if (PRUNE) console.log('\nprune skipped: it only runs on a full push, not with --only or --module');

  console.log(`\n${failures.length ? `FAILED (${failures.length}):\n   ${failures.join('\n   ')}` : 'all components pushed'}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failures.length) process.exitCode = 1;
  else if (!DRY) console.log('\nNext: npm run push:verify');
}
