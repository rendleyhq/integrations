# Testing the Rendley Zapier integration

## Offline

```bash
npm run typecheck
npm run validate     # bundles and runs `zapier validate --without-style`
npm test             # bundles and runs test/app.test.js structural checks
```

The structural checks assert what Zapier's automated review checks: every operation has a label, a description ending with a period, a sample that covers its output fields, help text on every input, trigger descriptions that start with "Triggers when", dynamic dropdowns that point at existing triggers, and no credential-like input fields.

## Live

```bash
RENDLEY_API_KEY=... npm run test:live
RENDLEY_API_BASE_URL=https://api.staging.example/v1   # optional
```

Runs every operation through `zapier-platform-core`'s app tester against a real account: authentication test and label, all dropdown triggers, Find Project, Upload Media From URL, Get Media Download URL by media ID and by hash (with a real download), Estimate Credit Cost, Generate Sound Effect with the inline wait, Transcribe, the no-wait path, New Completed Job, the agent edit with Get Agent Job Status and a cancel, Render Video without waiting, and a wrong-key error. It creates one project and deletes it afterwards. Expect a handful of credits per run.

## In Zapier

After `npm run push`, build one Zap per operation and run it once; Zapier's review requires a successful run for every visible trigger, action and search. Long jobs: use Wait for Completion = No, a Delay step, then Get Job Status.
