# Rendley for Make

**AI video editing and generation for Make (make.com): prompt-to-video with the Rendley AI agent, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, media uploads and MP4 rendering.**

The Rendley custom app for [Make](https://www.make.com): IMLJSON components for the Make Apps Editor and the Make Apps SDK (VS Code), plus a test runtime that exercises every module against the real Rendley API.

Modules let scenarios turn a prompt into an edited video with the Rendley AI agent, run every Rendley AI action (speech, transcription, dubbing, image, video and music generation, background removal, voice isolation, lip sync), upload media, render MP4s, and read job results.

## Modules

| Folder | Label | Type | What it does |
| --- | --- | --- | --- |
| `promptToVideo` | Start Prompt to Video | Action | The AI agent creates or edits a project from a prompt. Returns an agent `job_id`. |
| `getJob` | Get Job Status | Action | Reads any job (AI action, render, or agent edit) and returns `is_complete`, a fresh `download_url`, `media_id`, `result_data`, `last_message`. |
| `renderVideo` | Start Export (Render MP4) | Action | Renders a project. Returns an export `job_id`. |
| `uploadMedia` | Upload Media from URL | Action | Adds a file from a public URL to a project (Rendley fetches it). |
| `getMediaUrl` | Get Media URL | Action | Media ID or file hash to a fresh signed download URL. |
| `estimateCost` | Estimate Cost | Action | Credits an AI action or a render would consume. |
| `transcribe`, `textToSpeech`, `translateVideo`, `lipSync`, `isolateVoice`, `removeVideoBackground`, `removeImageBackground`, `upscaleImage`, `generateImage`, `generateVideo`, `generateMusic`, `generateSoundEffect` | AI actions | Action | Start an AI job. Return a `job_id`. |
| `createProject` | Create Project | Action | Creates a project. |
| `listProjects` | List Projects | Search | Projects, optionally by workspace, with `limit`. |
| `getWorkspaces` | List Workspaces | Search | Workspaces, with `limit`. |
| `makeApiCall` | Make an API Call | Universal | Any authenticated Rendley request. |

RPCs (dynamic dropdowns): `listProjects`, `listVoices`, `listLanguages`.

Source files for AI modules accept a **public URL, a media ID, or a file hash** of a file in the project (see Upload Media from URL). Lip sync takes a video source and an audio source.

## Following a job

Every job-starting module returns a `job_id` and finishes immediately; Rendley sends no webhooks, so a scenario polls:

```
Generate Video ─▶ Repeater ─▶ Sleep (10 s) ─▶ Get Job Status ─▶ Router
                                                              ├─ is_complete = true  → use download_url
                                                              └─ else               → next iteration
```

Use **Get Job Status** with *Rendley Agent* for `promptToVideo` jobs and *Rendley API* for everything else. Agent edits take minutes: for those, a **Break/Resume** or a second scenario on a schedule that calls Get Job Status is more economical than a long Repeater.

Download URLs are signed and expire after a few hours. Copy files to your own storage in the same scenario; **Get Media URL** mints a fresh link at any time.

## Plans and credits

The agent and renders need a paid Rendley plan, and AI actions consume credits. Rendley's HTTP 402 surfaces through the Base error block with its code and message. **Estimate Cost** with a Filter keeps a scenario inside a budget.

## Layout

```
base.imljson                 base URL, auth header, global error mapping
connections/rendley/         connection Communication (verifies the key) and Parameters
rpcs/<name>/                 dynamic dropdown RPCs
modules/<name>/              communication, mappable-parameters, interface, samples, metadata
makecomapp.json              manifest for the Make Apps SDK (VS Code)
test/                        offline structure tests and a live harness with a small IML interpreter
```

## Development and testing

```bash
npm test                                   # every file parses, manifest is consistent, samples match interfaces
RENDLEY_API_KEY=... npm run test:live      # runs every module and RPC against a real account
```

The live harness evaluates the IML templates of each communication file, sends the requests, and checks the mapped outputs against the module interfaces. It covers the connection, all RPCs, every action and search, the error mapping, and the universal module.

## License

[MIT](LICENSE)
