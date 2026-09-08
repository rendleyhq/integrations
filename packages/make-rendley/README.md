<p align="center">
  <a href="https://rendley.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-light-text.png">
      <img src="https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-dark-text.png" alt="Rendley" width="340">
    </picture>
  </a>
</p>

# Rendley for Make

[Rendley](https://rendley.com) lets you **create, edit, and automate video**. This app puts Rendley in your Make scenarios. The **AI Video Agent** turns a plain-language prompt and your footage into a finished video on a real editing timeline. Around it, AI media modules generate video, images, music and speech and transform existing media, and utility modules upload files, export MP4s and follow jobs.

The app is built as IMLJSON components for the Make Apps Editor and the Make Apps SDK, with a test runtime that exercises every module against the real Rendley API.

## AI Video Agent

The **AI Video Agent** module is the heart of the app. Give it a prompt and, optionally, a file, and the agent edits like a person would, on a real timeline it can keep editing later.

- Turn raw footage into a social clip, reframed to 9:16 with captions and music.
- Cut bad takes, silences and filler words out of an interview or a talking-head recording.
- Add styled captions, titles and b-roll.
- Build a video from scratch from generated clips, images, voiceover and music.
- Reframe one video for several platforms.
- Apply any edit you can describe, and continue the conversation on the same project with a thread ID.

**Inputs** are the **Prompt**, an optional **File URL** (a public URL, imported into the project before the agent starts), an optional **Project ID** (leave it empty to create one, with a **Workspace** dropdown for accounts that have several) and an optional **Thread ID**. The module returns the agent `job_id`, `project_id` and `thread_id` and finishes immediately.

**A complete scenario**

```
Watch files ─▶ AI Video Agent ─▶ Repeater ─▶ Sleep (60 s) ─▶ Get Job Status (Rendley Agent) ─▶ Router
                                                                                    ├─ is_complete = true → Export Video ─▶ Repeater ─▶ Sleep ─▶ Get Job Status ─▶ use url
                                                                                    └─ else               → next iteration
```

When the agent completes, **Get Job Status** returns `last_message` and `commands_applied`. When it pauses to ask a question it reports `status` = `waiting_input` with `is_complete` = true and the prompt in `question`, so a Filter can route it instead of polling forever.

## AI media modules

Each of these modules starts one Rendley AI job and returns a `job_id`.

| Label | What it does |
| --- | --- |
| **Generate Video** | An AI video clip from a prompt, optionally animating a start image. |
| **Generate Image** | An AI image from a prompt, optionally from reference images. |
| **Generate Music** | Music from a description of genre, tempo and mood. |
| **Generate Sound Effect** | A sound effect from a description. |
| **Text to Speech** | A voiceover from a script, with a voice picked from Rendley's catalog. |
| **Transcribe Audio or Video** | Speech to text with word-level timestamps. |
| **Dub Video** | Dubs a video into another language in the original voice. |
| **Lip Sync** | Syncs a speaker's lips to a new audio track. Takes a video source and an audio source. |
| **Change Voice** | Re-voices audio or video with another voice. |
| **Isolate Voice** | Removes noise and music and keeps the voice. |
| **Remove Video Background**, **Remove Image Background** | A transparent background. |
| **Upscale Video**, **Upscale Image** | Higher resolution with AI super-resolution, video up to 4K. |

Source files accept a **public URL, a media ID, or a file hash** of a file already in Rendley. Voices, languages, projects and workspaces are dynamic dropdowns. Model-specific parameters are documented in the [model catalog](https://docs.rendley.com/api/models).

Results are saved to the workspace library by default, with a **Workspace** dropdown for accounts that have several. Set **Project ID** to save into a specific project instead, for example the project the agent is working on.

## Projects, media and exports

| Label | Type | What it does |
| --- | --- | --- |
| **Export Video** | Action | Exports a project to a video file. Returns an export `job_id`. |
| **Get Job Status** | Action | Reads any job (AI action, export, or agent edit) and returns `is_complete`, a fresh `url`, `media_id`, `result_data` and `last_message`. |
| **Upload Media from URL** | Action | Adds a file from a public URL to a project. Rendley fetches it. |
| **Get Media Download URL** | Action | A fresh signed download URL for a media ID or file hash. |
| **Estimate Cost** | Action | The credits an AI action or an export would use, without running it. |
| **Create Project** | Action | Creates a project. |
| **Get Project** | Action | Reads a project by ID, with `thumbnail_url`, `fit_duration` and `version`. |
| **List Projects** | Search | Projects, optionally by workspace, with `limit`. |
| **List Workspaces** | Search | Workspaces, with `limit`. |
| **Make an API Call** | Universal | Any authenticated Rendley request. |

Module folders under `modules/` carry the camel-cased label (`aiVideoAgent`, `renderVideo` for Export Video, `translateVideo` for Dub Video). RPCs for dynamic dropdowns are `listProjects`, `listWorkspaces`, `listVoices` and `listLanguages`.

## Following a job

Every job-starting module returns a `job_id` and finishes immediately. Rendley sends no webhooks, so a scenario polls.

```
Generate Video ─▶ Repeater ─▶ Sleep (10 s) ─▶ Get Job Status ─▶ Router
                                                              ├─ is_complete = true  → use url
                                                              └─ else               → next iteration
```

Use **Get Job Status** with *Rendley Agent* for AI Video Agent jobs and *Rendley API* for everything else. Agent edits take minutes, so for those a **Break/Resume** or a second scenario on a schedule that calls Get Job Status is more economical than a long Repeater.

Download URLs are signed and expire after a few hours. Copy files to your own storage in the same scenario; **Get Media Download URL** mints a fresh link at any time.

## Credits

The agent, AI actions and renders use Rendley credits. When an operation cannot run, Rendley answers with HTTP 402 and the Base error block passes its message through. **Estimate Cost** with a Filter keeps a scenario inside a budget.

## Layout

```
base.imljson                 base URL, auth header, global error mapping
connections/rendley/         connection Communication (verifies the key) and Parameters
rpcs/<name>/                 dynamic dropdown RPCs
modules/<name>/              communication, mappable-parameters, interface, samples, metadata
makecomapp.json              manifest: the source of truth for what gets pushed
scripts/push.mjs           pushes every component to Make over the REST API
test/                        offline structure tests and a live harness with a small IML interpreter
```

## Publishing to Make

`makecomapp.json` is the source of truth. `scripts/push.mjs` pushes every component to
Make over the SDK Apps REST API, so the whole app ships in one command instead of being
pasted into the Apps Editor by hand. No VS Code extension needed.

One-time setup happens in Make under avatar, **Profile**, **API access**, **Add token**, with the
scopes `sdk-apps:read` and `sdk-apps:write`. Save the token as the only line of
`.secrets/make-apikey` (gitignored). The target app and region come from `makecomapp.json`'s
first origin.

```bash
npm run push          # push base, connection, modules and RPCs; report anything orphaned
npm run push:sync     # same, and delete from Make whatever the manifest no longer has
npm run push:dry      # print the plan, change nothing
npm run push:verify   # compare Make against the manifest
npm run push:status   # list what Make currently holds
```

Pushes are idempotent. Components that exist are updated in place, so re-running is safe.

**Module visibility.** Make creates every module *hidden*. A hidden module does not appear
to anyone opening the app's invite link. The page says "No modules have been created in
the app yet or they have a private status". `npm run push` lists any hidden modules;
`npm run push:sync` makes them visible (`POST .../modules/{name}/public`, which is what the
Apps Editor's per-module toggle calls, and it is not in Make's API docs).

**Renames and deletions.** Make identifies a component by its name, so renaming a module in
the manifest creates a new one and leaves the old behind. `npm run push` lists these
orphans but does not touch them; `npm run push:sync` deletes them, which is what makes
Make match the repo. The delete step is opt-in on purpose, because removing a module that a live
scenario still uses breaks that scenario, and Make refuses the delete in that case.

Narrow a push while iterating.

```bash
node scripts/push.mjs --only modules
node scripts/push.mjs --module getJob --module renderVideo
node scripts/push.mjs --readme          # push this README as the app's readme
```

Three details the script exists to get right, each of which silently breaks a hand-rolled
push.

- A module's mappable parameters belong to Make's `expect` section. Its `parameters` section
  is static config, so sending them there turns every mapped field into a fixed setting.
- `POST /connections` is not idempotent. It creates a duplicate rather than failing, so the
  script looks a connection up before creating it.
- Make sits behind Cloudflare, which answers a default scripting user agent with
  `403 / error code: 1010`.

Connection communication does **not** inherit `base.imljson`, so its URL must be absolute, and
`response.error.type` must be one of Make's error classes (`RuntimeError`, `DataError`,
`RateLimitError`, `OutOfSpaceError`, `ConnectionError`, `InvalidConfigurationError`,
`InvalidAccessTokenError`, `IncompleteDataError`, `DuplicateDataError`), never a status code.

## Development and testing

```bash
npm test                                   # every file parses, manifest is consistent, samples match interfaces
RENDLEY_API_KEY=... npm run test:live      # runs every module and RPC against a real account
```

The live harness evaluates the IML templates of each communication file, sends the requests, and checks the mapped outputs against the module interfaces. It covers the connection, all RPCs, every action and search, the error mapping, and the universal module.

## License

[MIT](LICENSE)
