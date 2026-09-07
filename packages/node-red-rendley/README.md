# @rendley/node-red-rendley

[![npm](https://img.shields.io/npm/v/@rendley/node-red-rendley)](https://www.npmjs.com/package/@rendley/node-red-rendley) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Rendley for Node-RED.** AI video editing and generation for Node-RED: prompt-to-video with the Rendley AI agent, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, media uploads and MP4 rendering.

[Node-RED](https://nodered.org) nodes for [Rendley](https://rendley.com): AI video editing with the Rendley agent, AI actions (speech, transcription, dubbing, image, video and music generation, background removal, voice isolation, lip sync), media uploads, and MP4 rendering.

## Install

From the Node-RED palette manager, search for `@rendley/node-red-rendley`, or in your Node-RED user directory:

```bash
npm install @rendley/node-red-rendley
```

Node.js 20 or newer, Node-RED 3 or newer.

## Nodes

- **rendley-config** (configuration): holds the API key from [app.rendley.com/settings](https://app.rendley.com/settings).
- **rendley**: one node, one operation per instance (or per message via `msg.operation`). Inputs come from `msg.payload`; the result replaces `msg.payload` and `msg.rendley` carries `{ operation, job_id }`.

| Operation | Payload fields |
| --- | --- |
| `aiAction` | `action` (for example `text-to-speech`, `generate-video`, `transcribe`), `params` (file inputs in `params.media`; lip sync uses `video_media` and `audio_media`), optional `model_id` |
| `agentEdit` | `prompt`, optional `project_id`, `file_urls`, `thread_id` |
| `render` | `project_id`, optional `settings` (`codec`, `target_resolution`, `quality`) |
| `estimateCost` | `action` (AI action or `export`), `params` |
| `uploadMedia` | `file_url`, optional `file_name` |
| `getMediaUrl` | `media_id` or `file_hash` |
| `getJob`, `waitForJob`, `getAgentJob`, `waitForAgentJob`, `cancelAgentJob` | `job_id` |
| `createProject`, `getProject`, `deleteProject`, `listProjects`, `listWorkspaces` | `name`, `project_id`, `workspace_id` as applicable |

`project_id` defaults to the node's Project ID field. With **Wait** on, job operations poll until the job finishes (or the timeout) and return the result with a fresh `download_url`; with it off they return the job id for **Get job status** or **Wait for job**. Download URLs are signed and expire after a few hours. The agent and renders need a paid Rendley plan; AI actions consume credits.

## Example flow

```
inject ─▶ change (set msg.payload = { action: "text-to-speech", params: { voice_id: "...", prompt: "Hello" } })
       ─▶ rendley (aiAction, Wait on) ─▶ http request (GET msg.payload.download_url) ─▶ file
```

## Development and testing

```bash
npm install
npm test                                 # loads the nodes in Node-RED's test helper
RENDLEY_API_KEY=... npm run test:live    # runs every operation through real flows against a real account
```

`nodes/lib/rendley.js` is the bundled API client (`npm run build:client` regenerates it from the shared TypeScript source). See [docs/PUBLISHING.md](docs/PUBLISHING.md) for publishing to npm and the Node-RED Flow Library.

## License

[MIT](LICENSE)
