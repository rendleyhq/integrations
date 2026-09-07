# Testing n8n-nodes-rendley

Ordered from free and fast to paid and slow.

## 1. Static checks (no API key)

```bash
npm run typecheck
npm run lint      # n8n-node lint: @n8n/eslint-plugin-community-nodes + eslint-plugin-n8n-nodes-base
npm run build
npm run scan      # @n8n/scan-community-package on package.json + dist, same gate n8n runs
```

## 2. Stubbed API run (no API key)

```bash
npm test
```

`test/node.test.cjs` loads the compiled node from `dist/`, gives it a fake n8n execution
context, and drives every resource and operation against a local HTTP stub whose
response shapes mirror the Rendley API. It checks request bodies (for example that a
source file lands in `params.media`), polling, error mapping (402, failed jobs, paused
agent jobs), `continueOnFail`, `pairedItem`, and every dropdown loader.

## 3. Live run (paid-plan API key, spends a few credits)

```bash
RENDLEY_API_KEY=... npm run test:live
# optional: RENDLEY_API_BASE_URL=https://api.staging.example/v1
```

`test/live.test.cjs` runs the same compiled node against the real API: dropdowns,
project create/get/list/delete, binary and URL uploads, media resolution with a real
download, cost estimates for every file-input action, a 2-second sound effect and a
short transcription with **Wait for Completion**, a trivial agent job (wait, get, cancel),
and cleanup of everything it created. Expect roughly 2 to 5 credits per run.

## 4. Inside n8n

```bash
npm run dev          # starts n8n on http://localhost:5678 with this node linked
```

1. Create a **Rendley API** credential and click *Test*.
2. Import every file in `templates/` and confirm none reports an unknown node.
3. Run the *Prompt to Video* template with a short prompt and **Render MP4 After Edit**
   on; the output must include a `video_url` that downloads.
4. Turn **Wait for Completion** off on any AI operation, then follow the job with
   **Export > Get Job** behind a **Wait** node, to exercise the polling pattern.
5. With a free-plan key, confirm a 402 reads as "Rendley: payment required".
