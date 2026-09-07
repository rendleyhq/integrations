# Rendley for Pipedream

**AI video editing and generation for Pipedream: prompt-to-video with the Rendley AI agent, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, media uploads and MP4 rendering.**

Rendley components for [Pipedream](https://pipedream.com), laid out exactly as the public registry expects (`components/rendley/`) so the folder can be dropped into a pull request against [PipedreamHQ/pipedream](https://github.com/PipedreamHQ/pipedream).

## Components

**App** (`rendley.app.mjs`): API key auth (`$auth.api_key`, optional `$auth.api_base_url`), request helper over `https://api.rendley.com/v1`, and prop definitions with async options for projects, workspaces, voices, dubbing languages and models.

**Actions** (`actions/`):

| Key | What it does |
| --- | --- |
| `rendley-edit-video-with-ai-agent` | Sends a prompt to the Rendley AI agent to create or edit a project. |
| `rendley-render-video` | Renders a project to MP4. |
| `rendley-create-project`, `rendley-upload-media`, `rendley-get-media-url` | Projects and media library. |
| `rendley-get-job`, `rendley-get-agent-job`, `rendley-cancel-agent-job`, `rendley-estimate-cost` | Job follow-up and pricing. |
| `rendley-text-to-speech`, `rendley-transcribe`, `rendley-dub-video`, `rendley-lip-sync`, `rendley-isolate-voice`, `rendley-change-voice`, `rendley-remove-video-background`, `rendley-remove-image-background`, `rendley-upscale-image`, `rendley-generate-image`, `rendley-generate-video`, `rendley-generate-music`, `rendley-generate-sound-effect` | The Rendley AI actions. |

**Sources** (`sources/`, polling, `dedupe: "unique"`): `rendley-new-completed-job` and `rendley-new-project`.

Job-starting actions have **Wait for Completion** (default on) with a **Timeout**; Pipedream workflows can wait minutes, so most jobs finish in-step and return a fresh `download_url`. Turn waiting off for long renders or agent edits and follow up with **Get Job Status**. File inputs accept a public URL, a media ID or a file hash.

## Testing

```bash
npm install
npm test                                 # structure checks against Pipedream's guidelines
RENDLEY_API_KEY=... npm run test:live    # mounts every component like the Pipedream runtime and runs it
```

The live harness binds each component (`$auth`, props as `this.<prop>`, a `$` with `export`) and exercises every action, both sources and every dynamic prop against a real account. It spends a few credits and deletes the project it creates.

## Publishing

Pipedream components are published by pull request to the registry:

1. Fork [PipedreamHQ/pipedream](https://github.com/PipedreamHQ/pipedream), copy `components/rendley/` into the fork's `components/` folder.
2. Run the registry's linter: `npx eslint components/rendley` (the registry's ESLint config applies).
3. Open a pull request. The Pipedream team reviews components and publishes them; the app itself (`rendley`) must exist in Pipedream's app catalog with API key auth, which the team creates on request during review, or ahead of time through [Pipedream's partner form](https://pipedream.com/docs/apps/contributing).

See [docs/PUBLISHING.md](docs/PUBLISHING.md).

## License

[MIT](LICENSE)
