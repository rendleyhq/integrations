<p align="center">
  <a href="https://rendley.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-light-text.png">
      <img src="https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-dark-text.png" alt="Rendley" width="340">
    </picture>
  </a>
</p>

# Rendley for Zapier

[Rendley](https://rendley.com) lets you **create, edit, and automate video**. This integration puts Rendley in your Zaps. The **AI Video Agent** turns a plain-language prompt and your footage into a finished video on a real editing timeline. Around it, a set of AI media tools generate video, images, music and speech and transform existing media, and a few utility steps upload files, export MP4s and follow jobs.

[AI Video Agent](#ai-video-agent) · [AI media tools](#ai-media-tools) · [Projects, media and exports](#projects-media-and-exports) · [Following jobs](#following-jobs) · [Outputs and credits](#outputs-and-credits) · [Development](#development)

## AI Video Agent

The **AI Video Agent** action is the heart of the integration. Give it a prompt and, optionally, some files, and the agent edits like a person would, on a real timeline it can keep editing later.

- Turn raw footage into a social clip, reframed to 9:16 with captions and music.
- Cut bad takes, silences and filler words out of an interview or a talking-head recording.
- Add styled captions, titles and b-roll.
- Build a video from scratch from generated clips, images, voiceover and music.
- Reframe one video for several platforms.
- Apply any edit you can describe, and continue the conversation on the same project with a thread ID.

**Inputs**

| Field | What it does |
| --- | --- |
| **Prompt** | What to create or change, in plain language. |
| **Files** | Public URLs of clips, images or audio. Each one is imported into the project before the agent starts. |
| **Project** | Leave empty to create a new project. Pick one to edit an existing project. |
| **Thread ID** | Continue a previous agent conversation on the same project. |
| **Wait for Completion?** | Polls for about 20 seconds. Edits take minutes, so most runs come back with **Is Complete = false** and the **Job ID**. |

**A complete Zap**

1. **Trigger** of your choice, for example a new file in Google Drive or a new row in a sheet.
2. **AI Video Agent** with the file URL in **Files** and a prompt such as `Resize this video to 9:16 and add captions`.
3. **Delay** for a few minutes.
4. **Get Agent Job Status** with the **Job ID**. Loop with a Filter until **Is Complete** is true, or use the **New Completed Job** trigger in a second Zap.
5. **Export Video** with the **Project ID** from the agent, then **Delay** and **Get Job Status** the same way.
6. Send the **url** of the export wherever it needs to go.

The agent returns `job_id`, `project_id`, `thread_id`, `status`, `last_message`, `commands_applied` and `commands_failed`. When it pauses to ask a question the step fails with the question in the error, so rephrase the prompt to remove the ambiguity.

## AI media tools

Each of these actions runs one Rendley AI job. They cover the media the agent works with, and they are useful on their own.

| Action | What it does |
| --- | --- |
| **Generate Video** | An AI video clip from a prompt, optionally animating a start image. |
| **Generate Image** | An AI image from a prompt, optionally from reference images. |
| **Generate Music** | Music from a description of genre, tempo and mood. |
| **Generate Sound Effect** | A sound effect from a description. |
| **Text to Speech** | A voiceover from a script, with a voice picked from Rendley's catalog. |
| **Transcribe Audio or Video** | Speech to text with word-level timestamps. |
| **Dub Video** | Dubs a video into another language in the original voice. |
| **Lip Sync** | Syncs a speaker's lips to a new audio track. |
| **Change Voice** | Re-voices audio or video with another voice. |
| **Isolate Voice** | Removes noise and music and keeps the voice. |
| **Remove Video Background**, **Remove Image Background** | A transparent background. |
| **Upscale Video**, **Upscale Image** | Higher resolution with AI super-resolution, video up to 4K. |

Source files accept a **public URL, a media ID, or a file hash** of a file already in Rendley. Voices, languages, projects and workspaces are dynamic dropdowns. Every action has an optional **Model** dropdown listing the models Rendley offers for it, and a **Parameters (JSON)** field for model-specific settings documented in the [model catalog](https://docs.rendley.com/api/models).

Results are saved to your workspace library by default, with a **Workspace** dropdown for accounts that have several. Set **Project** to save into a specific project instead, for example the project the agent is working on.

## Projects, media and exports

| Type | Name | What it does |
| --- | --- | --- |
| Action | **Export Video** | Exports a project to a video file, with codec, resolution and quality settings. |
| Action | **Create Project** | Creates a project, optionally from a template. |
| Action | **Upload Media From URL** | Adds a file from a public URL to a project. Rendley fetches it. |
| Search | **Find Project** | Finds a project by ID or by a fragment of its name. |
| Search | **Get Media Download URL** | A fresh download link for a media ID or file hash. |
| Search | **Estimate Cost** | The credits an AI action or an export would use, without running it. |

## Following jobs

Zapier stops an action after 30 seconds and Rendley sends no webhooks, so every job-starting action has a **Wait for Completion?** toggle.

- **Yes** (default) polls for about 20 seconds and returns the finished result when the job completes in time. Speech, sound effects, transcription and image operations usually do.
- Longer jobs (agent edits, video generation, dubbing, exports) come back with **Is Complete = false** and the **Job ID**. Add a **Delay** step, then a status search, optionally in a loop with a Filter.
- **No** returns the Job ID immediately.

| Type | Name | What it does |
| --- | --- | --- |
| Search | **Get Agent Job Status** | Reads an AI Video Agent job. Returns `is_complete`, `status`, `last_message` and the `project_id` to export. |
| Search | **Get Job Status** | Reads an AI or export job and returns a fresh `url` when it is complete. |
| Trigger | **New Completed Job** | Fires when one of the account's API-created jobs completes, with a fresh download URL. Optional job type and project filters. Start jobs in one Zap and react to completions in another. |
| Trigger | **New Project** | Fires when a project is created. Also powers the Project dropdowns. |

## Outputs and credits

Output fields follow the Rendley API. The download link is `url`, the parsed job result is `result_data`, and jobs also carry `media_id`, `file_hash`, `mime_type`, `size` and `duration`. Download URLs are signed and expire after a few hours, so use them in the next steps of the Zap rather than storing them. **Get Media Download URL** mints a fresh one at any time.

The agent, the AI media tools and exports use Rendley credits. When an operation cannot run, Rendley answers with HTTP 402 and the error carries its message. **Estimate Cost** with a Filter step keeps a Zap inside a budget.

## Development

```bash
npm install
npm run typecheck                        # tsc
npm run validate                         # build + zapier validate (schema)
npm test                                 # build + structural tests
RENDLEY_API_KEY=... npm run test:live    # runs every operation against a real account
```

The connection form asks only for the API key. To point a version at another Rendley host, for testing, set `RENDLEY_API_BASE_URL` as an environment variable of that version with `zapier env:set`, or in the shell when running the tests.

`npm run build` bundles `src/` into `index.js`, which is what Zapier loads. `zapier-platform-core` stays external and is provided by the Zapier runtime.

## License

[MIT](LICENSE)
