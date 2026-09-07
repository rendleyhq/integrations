# Testing the Rendley Make app

Make has no local runtime, so this repository ships two layers of tests plus the manual checks Make's review asks for.

## 1. Structure (offline)

```bash
npm test
```

Parses every JSON and IMLJSON file, checks that `makecomapp.json` references only files that exist and that every module and RPC folder is registered, that each module has the five tabs, that samples only use keys declared in the interface, that search modules have a `limit`, and that no component still references webhooks, the old agent host or legacy field names. It also unit-tests the IML interpreter on the expressions the app uses.

## 2. Live (real Rendley account)

```bash
RENDLEY_API_KEY=... npm run test:live
RENDLEY_API_BASE_URL=https://api.staging.example/v1   # optional
```

`test/iml-runtime.mjs` is a small interpreter for the subset of Make's IML the app uses (`{{ }}` templates, `if`, `ifempty`, `contains`, `get`, `array`, `toCollection`, 1-based indexing, `+`, `=`, `OR`, `!`). `test/live.mjs` runs each communication file through it exactly as written: the connection check (valid and invalid key), all three RPCs, Create Project, List Projects and List Workspaces with `limit`, Upload Media from URL, Get Media URL by media ID and by hash with a real download, Estimate Cost, the request bodies of every file-input module against the `/cost` twins, Generate Sound Effect and Transcribe polled through Get Job Status, Start Prompt to Video polled through Get Job Status (Rendley Agent), Start Export, Make an API Call, and the error mapping. It creates one project and deletes it. Expect a handful of credits per run.

This proves the request bodies and response mappings match the API. It does not replace a run inside Make: the interpreter is deliberately small and does not model Make's UI, mapping panel or error display.

## 3. In Make

After deploying, build the scenarios Make's review requires (one per module), run the search modules with a `limit`, and keep execution logs free of personal data. See `docs/PUBLISHING.md`.
