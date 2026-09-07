# Rendley for Activepieces

[![npm](https://img.shields.io/npm/v/@activepieces/piece-rendley)](https://www.npmjs.com/package/@activepieces/piece-rendley) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**AI video editing and generation for Activepieces: prompt-to-video with the Rendley AI agent, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, media uploads and MP4 rendering.**

The Rendley piece for [Activepieces](https://www.activepieces.com): AI video editing with the Rendley agent, AI actions (speech, transcription, dubbing, image, video and music generation, background removal, voice isolation, lip sync), media uploads, MP4 rendering, and two polling triggers.

The folder is laid out like a community piece in the Activepieces monorepo (`packages/pieces/community/rendley`), with `package.json` named `@activepieces/piece-rendley`, so it can be copied into a fork for a pull request.

## Actions and triggers

| Action | What it does |
| --- | --- |
| Edit Video With AI Agent | Sends a prompt to the Rendley AI agent to create or edit a project. |
| Render Video | Renders a project to MP4. |
| Text to Speech, Generate Image, Generate Video, Generate Music, Generate Sound Effect, Transcribe Audio or Video, Dub Video, Lip Sync, Isolate Voice, Change Voice, Remove Video Background, Remove Image Background, Upscale Image | The Rendley AI actions. |
| Upload Media From URL, Get Media Download URL, Create Project | Projects and media library. |
| Get Job Status, Get Agent Job Status, Cancel Agent Job, Estimate Credit Cost | Job follow-up and pricing. |
| Custom API Call | Any authenticated Rendley request. |

Triggers (polling, deduplicated by id): **New Completed Job** (optional job type and project filters) and **New Project**.

Job-starting actions have **Wait for Completion** (default on) with a **Timeout**; most jobs finish in-step and return a fresh `download_url`. Turn waiting off for long renders or agent edits and follow up with **Get Job Status**. File inputs accept a public URL, a media ID or a file hash. Dropdowns load projects, workspaces, voices, dubbing languages and models from the account.

## Development and testing

```bash
npm install
npm run typecheck
npm test                                 # builds, then checks metadata, names, props and triggers
RENDLEY_API_KEY=... npm run test:live    # runs every action, dropdown and trigger against a real account
```

The live harness calls each action's `run` with a minimal Activepieces context and drives the polling triggers through `pollingHelper` with an in-memory store, so dedupe is exercised too. It spends a few credits and deletes the project it creates.

## Publishing

Community pieces ship through the Activepieces repository:

1. Fork [activepieces/activepieces](https://github.com/activepieces/activepieces) and copy this folder to `packages/pieces/community/rendley` (replace the npm versions of `@activepieces/pieces-framework` and `@activepieces/pieces-common` in `package.json` with `workspace:*`, as the other pieces do, and add a `project.json` copied from a neighbouring piece).
2. Upload a 512×512 logo and set `logoUrl` to the CDN path the maintainers assign (`https://cdn.activepieces.com/pieces/rendley.png`).
3. Run `npx nx build pieces-rendley` and `npx nx lint pieces-rendley`, then open a pull request following the contribution guide at <https://www.activepieces.com/docs/developers/overview>.

Private deployments can instead build with `npm run build` and load `dist/` as a custom piece. See [docs/PUBLISHING.md](docs/PUBLISHING.md).

## License

[MIT](LICENSE)
