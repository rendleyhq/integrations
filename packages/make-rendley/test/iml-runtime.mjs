/**
 * A small interpreter for the subset of Make's IML used by this app, so the
 * module definitions can be exercised against a real Rendley API without the
 * Make platform. It is not Make: it evaluates `{{ }}` templates, runs the
 * request(s) a communication file describes, and applies `response.output`,
 * `iterate`, `limit` and `temp`, which is enough to prove the request bodies
 * and response mappings match the API.
 *
 * Supported expressions: `a.b.c`, `a[1]` (1-based, as in Make), string
 * literals, numbers, true/false/undefined, `+`, `/`, `=`, `OR`, `!x`, and the
 * functions if(), ifempty(), contains(), get(), array(), substring(), toCollection().
 */

export class ImlRuntime {
  constructor({ baseUrl, apiKey, fetchImpl = fetch }) {
    this.base = JSON.parse(readBase(baseUrl));
    this.connection = { apiKey };
    this.fetchImpl = fetchImpl;
    this.calls = [];
  }

  /** Run a module or RPC communication (object or array of steps). */
  async run(communication, parameters = {}) {
    const steps = Array.isArray(communication) ? communication : [communication];
    const ctx = { parameters, connection: this.connection, temp: {} };
    let output;
    for (const step of steps) {
      if (step.condition !== undefined && !truthy(this.template(step.condition, ctx))) continue;
      const url = this.evalDeep(step.url, ctx);
      const method = (this.evalDeep(step.method, ctx) || "GET").toUpperCase();
      const qs = compact(this.evalDeep(step.qs, ctx));
      const headers = { ...(this.base.headers || {}), ...(step.headers || {}) };
      const body = compact(this.evalDeep(step.body, ctx));
      const full = new URL(/^https?:\/\//.test(url) ? url : this.base.baseUrl + url);
      for (const [k, v] of Object.entries(qs || {})) if (v !== undefined) full.searchParams.set(k, String(v));
      const resolvedHeaders = this.evalDeep(headers, ctx);
      const init = { method, headers: { ...resolvedHeaders, "content-type": "application/json" } };
      if (body !== undefined && method !== "GET") init.body = JSON.stringify(body);
      const res = await this.fetchImpl(full.toString(), init);
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = text; }
      this.calls.push({ method, url: full.pathname + full.search, status: res.status, body });
      const rctx = { ...ctx, body: json, statusCode: res.status, headers: Object.fromEntries(res.headers) };
      const response = step.response || {};
      if (!res.ok) {
        // Make picks a status-keyed block (`"401": {...}`) before the generic type/message.
        const errRoot = response.error || this.base.response?.error || {};
        const errSpec = errRoot[String(res.status)] || errRoot;
        const type = this.evalDeep(errSpec.type, rctx);
        const message = this.evalDeep(errSpec.message, rctx);
        throw new Error(`[${type ?? res.status}] ${message ?? text}`);
      }
      if (response.temp) Object.assign(ctx.temp, this.evalDeep(response.temp, rctx));
      if (response.iterate !== undefined) {
        const items = this.template(response.iterate, rctx) || [];
        let rows = items.map((item) => this.evalDeep(response.output, { ...rctx, item }));
        const limit = response.limit !== undefined ? Number(this.template(response.limit, rctx)) : undefined;
        if (limit) rows = rows.slice(0, limit);
        output = rows;
      } else if (response.output !== undefined) {
        output = this.evalDeep(response.output, rctx);
      }
    }
    return output;
  }

  evalDeep(node, ctx) {
    if (typeof node === "string") return this.template(node, ctx);
    if (Array.isArray(node)) return node.map((n) => this.evalDeep(n, ctx));
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = this.evalDeep(v, ctx);
      return out;
    }
    return node;
  }

  /** A template is either a single `{{expr}}` (typed value) or text with interpolations. */
  template(str, ctx) {
    const single = str.match(/^\{\{([\s\S]*)\}\}$/);
    if (single) return this.eval(single[1], ctx);
    return str.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
      const v = this.eval(expr, ctx);
      return v === undefined || v === null ? "" : String(v);
    });
  }

  eval(expr, ctx) {
    return new Parser(expr.trim(), ctx).parseExpression();
  }
}

class Parser {
  constructor(src, ctx) { this.s = src; this.i = 0; this.ctx = ctx; }
  peek(n = 0) { return this.s[this.i + n]; }
  ws() { while (/\s/.test(this.s[this.i] || "")) this.i++; }
  parseExpression() { return this.parseOr(); }
  parseOr() {
    let left = this.parseEquality();
    for (;;) { this.ws(); if (this.s.slice(this.i, this.i + 2).toUpperCase() === "OR" && /\s/.test(this.s[this.i + 2] || "")) { this.i += 2; const right = this.parseEquality(); left = truthy(left) || truthy(right); } else return left; }
  }
  parseEquality() {
    let left = this.parseAdditive();
    for (;;) { this.ws(); if (this.peek() === "=" ) { this.i++; const right = this.parseAdditive(); left = looseEq(left, right); } else return left; }
  }
  parseAdditive() {
    let left = this.parseUnary();
    for (;;) {
      this.ws();
      const c = this.peek();
      if (c === "+") { this.i++; const right = this.parseUnary(); left = typeof left === "number" && typeof right === "number" ? left + right : `${left ?? ""}${right ?? ""}`; }
      else if (c === "/") { this.i++; const right = this.parseUnary(); left = Number(left) / Number(right); }
      else return left;
    }
  }
  parseUnary() { this.ws(); if (this.peek() === "!") { this.i++; return !truthy(this.parseUnary()); } return this.parsePrimary(); }
  parsePrimary() {
    this.ws();
    const c = this.peek();
    if (c === "'" || c === '"') { const q = c; this.i++; let out = ""; while (this.peek() !== q) { if (this.peek() === "\\") this.i++; out += this.s[this.i++]; } this.i++; return out; }
    if (c === "{") return this.parseObjectLiteral();
    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(this.peek(1)))) { const m = this.s.slice(this.i).match(/^-?\d+(\.\d+)?/); this.i += m[0].length; return Number(m[0]); }
    if (c === "(") { this.i++; const v = this.parseExpression(); this.ws(); this.i++; return v; }
    const ident = this.s.slice(this.i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (!ident) throw new Error(`IML parse error at ${this.i} in: ${this.s}`);
    this.i += ident[0].length;
    const name = ident[0];
    this.ws();
    if (this.peek() === "(") { this.i++; const args = []; this.ws(); if (this.peek() !== ")") { for (;;) { args.push(this.parseExpression()); this.ws(); if (this.peek() === ",") { this.i++; continue; } break; } } this.ws(); this.i++; return this.call(name, args); }
    let value = name === "true" ? true : name === "false" ? false : name === "undefined" || name === "null" ? undefined : this.ctx[name];
    return this.parseAccessors(value);
  }
  parseAccessors(value) {
    for (;;) {
      if (this.peek() === ".") { this.i++; const m = this.s.slice(this.i).match(/^[A-Za-z_][A-Za-z0-9_]*/); this.i += m[0].length; value = value == null ? undefined : value[m[0]]; }
      else if (this.peek() === "[") { this.i++; const idx = this.parseExpression(); this.ws(); this.i++; value = value == null ? undefined : Array.isArray(value) ? value[Number(idx) - 1] : value[idx]; }
      else return value;
    }
  }
  parseObjectLiteral() {
    this.i++; const out = {}; this.ws();
    while (this.peek() !== "}") { const key = this.s.slice(this.i).match(/^[A-Za-z_][A-Za-z0-9_]*/)[0]; this.i += key.length; this.ws(); this.i++; out[key] = this.parseExpression(); this.ws(); if (this.peek() === ",") { this.i++; this.ws(); } }
    this.i++; return out;
  }
  call(name, args) {
    switch (name) {
      case "if": return truthy(args[0]) ? args[1] : args[2];
      case "ifempty": return isEmpty(args[0]) ? args[1] : args[0];
      case "contains": return typeof args[0] === "string" && args[0].includes(String(args[1]));
      case "get": return String(args[1]).split(".").reduce((v, k) => (v == null ? undefined : v[k]), args[0]);
      case "array": return args;
      case "substring": return String(args[0] ?? "").substring(Number(args[1] ?? 0), args[2] === undefined ? undefined : Number(args[2]));
      case "toCollection": { const out = {}; for (const row of args[0] || []) out[row[args[1]]] = row[args[2]]; return out; }
      default: throw new Error(`IML function not supported by the test runtime: ${name}`);
    }
  }
}

function truthy(v) { return !(v === undefined || v === null || v === false || v === "" || v === 0); }
function isEmpty(v) { return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0); }
function looseEq(a, b) { return String(a ?? "") === String(b ?? ""); }
function compact(v) {
  if (Array.isArray(v)) return v.map(compact);
  if (v && typeof v === "object") { const out = {}; for (const [k, val] of Object.entries(v)) { const c = compact(val); if (c !== undefined && c !== "") out[k] = c; } return out; }
  return v;
}
function readBase(baseUrl) {
  return JSON.stringify({ baseUrl, headers: { Authorization: "Bearer {{connection.apiKey}}" }, response: { error: { type: "{{if(body.error, body.error.code, statusCode)}}", message: "{{if(body.error, body.error.message, 'Rendley request failed')}}" } } });
}
