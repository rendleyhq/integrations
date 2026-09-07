# n8n-nodes-rendley

[![npm](https://img.shields.io/npm/v/n8n-nodes-rendley)](https://www.npmjs.com/package/n8n-nodes-rendley) [![CI](https://github.com/rendleyhq/integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/rendleyhq/integrations/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Rendley for n8n.** AI video editing and generation for n8n: prompt-to-video with the Rendley AI agent, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, media uploads and MP4 rendering.

Create and edit videos with [Rendley](https://rendley.com) from n8n: turn a prompt into
a finished video, generate AI video, images and audio, run natural-language edits,
upload media, read brand kits, and export MP4s.

This is an [n8n community node](https://docs.n8n.io/integrations/community-nodes/). It
has no runtime dependencies, talks only to the Rendley API through n8n's request
helpers, and is marked `usableAsTool`, so an n8n **AI Agent** can call any of its
operations.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations)
· [Following long jobs](#following-long-jobs) · [Templates](#templates)
· [Development](#development) · [Release](#release)

## Installation

- **n8n Cloud and self-hosted 1.94+:** open the nodes panel, search for *Rendley*, and
  install it from the *More from the community* section (available once the package is
  verified by n8n).
- **Self-hosted, any version:** *Settings → Community Nodes → Install* and enter
  `n8n-nodes-rendley`.

Requires an n8n version that supports community nodes and Node.js 20 or newer on
self-hosted instances.

## Credentials

Create a **Rendley API** credential and paste an API key from
[app.rendley.com/settings](https://app.rendley.com/settings). The **API Base URL** is
pre-filled with `https://api.rendley.com/v1`; leave it unless Rendley gave you another
host. The credential test calls `GET /workspaces`.

AI actions, agent runs and exports need an active Rendley subscription and credits.
Free-plan keys receive HTTP 402, which the node reports as "Rendley: payment required".

## Operations

Most operations are asynchronous: the node starts a job and, when **Wait for
Completion** is on (the default), polls until it finishes. **Poll Interval (Seconds)**
(default 10, minimum 5) and **Timeout (Minutes)** (default 60) are set per operation.

| Resource | Operations |
| --- | --- |
| **Agent** | Prompt to Video, Get Job, Cancel Job |
| **Edit** | Remove Filler Words, Auto Edit, Reframe, Add Captions, Create Shorts, Custom Prompt |
| **Video** | Transcribe, Dub, Lip Sync, Isolate Voice, Change Voice, Remove Background, Generate |
| **Image** | Generate, Upscale, Remove Background |
| **Audio** | Text to Speech, Generate Music, Generate Sound Effect |
| **Export** | Render Video, Estimate Cost, Get Job |
| **Media** | Upload, Get Download URL, List |
| **Brand Kit** | Get, Import From Website |
| **Project** | Create, Get, List, Delete |

### Agent

- **Prompt to Video** sends a prompt (plus optional file URLs and a thread ID) to the
  Rendley agent, which edits an existing project or creates one. With **Render MP4 After
  Edit** on, the node exports the project once the edit lands and returns `video_url`.
  Output: `job_id`, `project_id`, `thread_id`, `status`, `last_message`, and when
  rendered `video_url` and `export_job_id`.
- **Get Job** reads an agent job without waiting, for workflows that poll on their own.
- **Cancel Job** stops a running agent job.

The agent runs non-interactively. If it pauses to ask a question the node fails with the
question in the error, so rephrase the prompt to remove the ambiguity.

### Edit

Curated prompts over the same agent, so results are repeatable. Every operation takes
the project, optional files, **Render MP4 After Edit**, and an **Additional
Instructions** option. Reframe takes an aspect ratio (9:16, 1:1, 4:5, 16:9), Create
Shorts takes a count and length bounds, Remove Filler Words a minimum silence.

### Video, Image and Audio

Each AI operation takes a **Project**, an optional **Model** picked from the models that
action supports, its typed options, an **Additional Parameters (JSON)** escape hatch for
model-specific fields, and an **Estimate Cost Only** toggle that returns the credit
price without running anything.

Source files (Transcribe, Dub, Lip Sync, Isolate Voice, Change Voice, Remove Background,
Upscale) accept a **public URL, a media ID, or the file hash** of an upload in the
project. Rendley resolves the reference and probes duration itself.

When the node waits for completion the output carries `download_url` (a fresh signed
URL), `url_expires_at`, `media_id` and `file_hash`. Transcribe returns the transcript in
`result` instead of a file.

### Export

**Render Video** exports a project with **Export Settings** (codec, quality, target
resolution) and returns `video_url` when waiting. **Estimate Cost** returns the credit
price. **Get Job** reads any Rendley job by ID.

### Media

- **Upload** puts a file into a project. **Source** is either **Binary Data** (a file from
  an earlier node such as Google Drive or an email attachment, up to 50 MB) or a public
  **URL**, which Rendley fetches server-side with no size limit through n8n. Returns
  `media_id` and `file_hash`, both usable as the file reference of AI operations.
- **Get Download URL** resolves a media ID or file hash to a fresh signed URL.
- **List** returns every upload in a project with a fresh `download_url`.

Signed URLs expire after a few hours. Copy files to your own storage in the same
workflow rather than saving a Rendley URL for later.

### Brand Kit and Project

Read a workspace brand kit or import one from a public website. Create, get (with a
**Simplify** toggle that leaves out the editor document), list and delete projects.
Leaving the workspace empty uses the account's first workspace.

## Following long jobs

For jobs that can run for many minutes, or for large batches, turn **Wait for
Completion** off and poll yourself: an n8n **Wait** node of 70 seconds or more, then
**Agent > Get Job** or **Export > Get Job**, then an **If** that loops until `status` is
`completed`. n8n offloads waits of that length, so they cost no execution time. Rendley
sends no outbound webhooks.

## Templates

Ready-to-import workflows live in [`templates/`](templates/). Each carries sticky notes
covering the paid-plan requirement, rough credit cost, and the link-expiry warning. See
[`templates/README.md`](templates/README.md).

## Development

```bash
npm install
npm run typecheck   # tsc
npm run lint        # n8n-node lint (the ruleset n8n verifies with)
npm run build       # n8n-node build -> dist/
npm test            # drives the compiled node against a stub of the Rendley API
npm run scan        # @n8n/scan-community-package on the built package
npm run dev         # runs n8n locally with this node linked
```

`npm run test:live` runs the compiled node against a real Rendley API. It needs
`RENDLEY_API_KEY` (a paid-plan key; it spends a few credits) and optionally
`RENDLEY_API_BASE_URL`. See [`docs/TESTING.md`](docs/TESTING.md).

## Release

Publishing goes through GitHub Actions with npm provenance, as n8n requires for
verified community nodes. See [`docs/PUBLISHING.md`](docs/PUBLISHING.md).

## License

[MIT](LICENSE)
