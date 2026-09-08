# Rendley for Zapier

**AI video editing and generation for Zapier: prompt-to-video with the Rendley AI agent, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, media uploads and MP4 rendering.**

The Rendley integration for the [Zapier Platform](https://platform.zapier.com/) (CLI, TypeScript, bundled with esbuild). It lets Zaps create and edit videos with the Rendley AI agent, run Rendley's AI actions (transcription, dubbing, speech, image, video and music generation, background removal, lip sync), upload media, render MP4s, and react when jobs finish.

## Triggers, actions and searches

| Type | Name | What it does |
| --- | --- | --- |
| Trigger | **New Completed Job** | Polls the account's API-created jobs and fires when one completes, with a fresh download URL. Optional job type and project filters. |
| Trigger | New Project | Fires when a project is created. Also powers the Project dropdowns. |
| Action | **Edit Video With AI Agent** | Sends a prompt to the Rendley agent to create or edit a project. |
| Action | **Render Video** | Renders a project to MP4. |
| Action | Create Project | Creates a project, optionally from a template. |
| Action | Upload Media From URL | Adds a file from a public URL to a project's library (Rendley fetches it). |
| Action | Transcribe Audio or Video, Text to Speech, Dub Video, Lip Sync, Isolate Voice, Change Voice, Remove Video Background, Remove Image Background, Upscale Image, Generate Image, Generate Video, Generate Music, Generate Sound Effect | The Rendley AI actions. |
| Search | Get Job Status | Reads an AI or render job and returns a fresh download URL when complete. |
| Search | Get Agent Job Status | Reads an agent edit. |
| Search | Find Project | By ID or name fragment. |
| Search | Get Media Download URL | By media ID or file hash. |
| Search | Estimate Credit Cost | Prices an AI action or render without running it. |

File inputs accept a **public URL, a media ID, or a file hash** of an upload in the project. Voices, languages, projects and workspaces are dynamic dropdowns.

## How waiting works

Zapier stops an action after 30 seconds and Rendley has no outbound webhooks, so every job-starting action has a **Wait for Completion?** toggle:

- **Yes** (default): the action polls for about 20 seconds and returns the finished result when the job completes in time. Speech, sound effects, transcription and image operations usually do.
- Longer jobs (video generation, dubbing, renders, agent edits) come back with **Is Complete = false** and the **Job ID**. Add a **Delay** step, then the **Get Job Status** (or **Get Agent Job Status**) search, optionally in a loop with a Filter.
- **No**: return the Job ID immediately.

The **New Completed Job** trigger is the other way to pick up long jobs: start them in one Zap and react to completions in another.

Download URLs are signed and expire after a few hours. Use them in the next steps of the Zap rather than storing them; **Get Media Download URL** mints a fresh one at any time.

## Plans and credits

The agent and renders need a paid Rendley plan, and AI actions consume credits. A 402 surfaces as a clear "upgrade or top up" error. **Estimate Credit Cost** with a Filter step keeps a Zap inside a budget.

## Development

```bash
npm install
npm run typecheck                        # tsc
npm run validate                         # build + zapier validate (schema)
npm test                                 # build + structural tests
RENDLEY_API_KEY=... npm run test:live    # runs every operation against a real account
```

`npm run build` bundles `src/` into `index.js`, which is what Zapier loads. `zapier-platform-core` stays external and is provided by the Zapier runtime.

## License

[MIT](LICENSE)
