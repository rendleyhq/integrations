# Rendley AI Video Editor

Turn a **text prompt into an edited, rendered video**, or run any of Rendley's AI video tools from Apify: **AI video generation, text to speech, transcription, AI dubbing, lip sync, image and music generation, background removal, voice isolation** and **MP4 export**. Every run performs one operation, waits for Rendley to finish, and returns a download link plus a durable copy in the run's key-value store.

Because it runs on Apify you get **scheduling, an API for every run, integrations with Zapier, Make and n8n**, monitoring, and a dataset you can query. The Actor itself is thin: all the work happens in your Rendley account through the [Rendley API](https://docs.rendley.com).

## What can the Rendley AI Video Editor Actor do?

| Operation | What it does | Needs |
| --- | --- | --- |
| `prompt_to_video` | The **Rendley AI agent** creates or edits a project from your prompt (cuts, captions, reframing, generated media), then the Actor **renders it to MP4**. | `prompt`; optional `project_id`, `file_urls`, `thread_id`, `render` |
| `ai_action` | Any Rendley AI action with raw parameters: text to speech, AI image generation, AI video generation, music, sound effects, upscaling, background removal, voice changing, lip sync. | `project_id`, `action`, `params`; optional `model_id` |
| `transcribe` | **Speech to text** with word-level timestamps. | `project_id`, `media`; optional `start_time`, `end_time` |
| `dub_video` | **AI dubbing**: translate and re-voice a video into another language. | `project_id`, `media`, `output_language`; optional `mode` |
| `export` | **Render an existing project to MP4**. | `project_id`; optional `resolution`, `quality`, `codec` |
| `estimate_cost` | Credit price of an AI action or a render, without running it. | `project_id`, `action`; optional `params`, `model_id` |

`media` and the `media` key inside `params` accept a **public URL**, a **media ID** or a **file hash** of a file already in the project. Lip sync uses `video_media` and `audio_media`.

## What do you need to run it?

- A [Rendley](https://rendley.com) account and an **API key** from [app.rendley.com/settings](https://app.rendley.com/settings).
- **Credits** for AI actions, and an **active subscription** for the AI agent and renders. Rendley answers with HTTP 402 otherwise, which the Actor reports as a clear error.

## How to generate a video from a text prompt

1. Open the Actor and paste your **Rendley API key**.
2. Pick **Operation** `prompt_to_video`, write the prompt, and optionally add clip URLs in **Media URLs**.
3. Run it. When the agent finishes, the Actor renders the project and the dataset item carries `video_url`, plus `kvs_url` for a copy that does not expire.

### Example input: prompt to video

```json
{
  "rendley_api_key": "YOUR_KEY",
  "operation": "prompt_to_video",
  "prompt": "Create a 15-second product teaser from these clips with upbeat captions.",
  "file_urls": ["https://example.com/clip-1.mp4", "https://example.com/clip-2.mp4"],
  "resolution": "1080p"
}
```

## How to run text to speech, image generation and other AI actions

Pick `ai_action`, set `action` to the Rendley action name and pass its parameters as JSON. The model catalog with every parameter schema is at `https://api.rendley.com/v1/ai/tools`.

```json
{
  "rendley_api_key": "YOUR_KEY",
  "operation": "ai_action",
  "project_id": "1fdfc335-a483-4f8d-8466-8dae94175cc6",
  "action": "generate-sound-effect",
  "params": { "prompt": "whoosh transition", "duration_seconds": 2 }
}
```

### Example output

```json
{
  "operation": "ai_action",
  "status": "completed",
  "action": "generate-sound-effect",
  "project_id": "1fdfc335-a483-4f8d-8466-8dae94175cc6",
  "job_id": "6e272dc1-f178-4e27-bbce-a45407f17339",
  "media_id": "8657cd30-a174-4491-be92-0a9775cf6677",
  "file_hash": "635864eaa9f9e714",
  "download_url": "https://storage.rendley.com/...signed...",
  "url_expires_at": "2026-09-05T12:39:05Z",
  "mime_type": "audio/mpeg",
  "kvs_key": "OUTPUT_MEDIA",
  "kvs_url": "https://api.apify.com/v2/key-value-stores/.../records/OUTPUT_MEDIA"
}
```

A failed run pushes `{ "operation": "...", "status": "failed", "error": "..." }` and exits with an error, so schedules and integrations can react.

## How much does it cost to generate a video with Rendley on Apify?

The Actor uses very little Apify compute: it mostly waits for Rendley. The real cost is **Rendley credits**, charged to your Rendley account: sound effects and speech cost a few credits, image generation about one, AI video generation tens of credits per clip, renders one credit. Use the `estimate_cost` operation to get the exact number before running anything.

## Output files and expiring links

Rendley's `download_url` and `video_url` are signed links that **expire after a few hours**. With **Copy output files to the key-value store** on (the default), the Actor also stores the file as `OUTPUT_VIDEO`, `OUTPUT_MEDIA` or `OUTPUT_TRANSCRIPT` and returns a durable `kvs_url`.

## Tips for automating video production

- Create a project once (in the Rendley app or with `POST /v1/projects`) and reuse its ID; generated media is stored in it.
- `prompt_to_video` with `render` off leaves the edited project ready in Rendley without spending render credits.
- Continue a conversation with the agent by passing back the `thread_id` from a previous run together with the same `project_id`.
- Agent edits can take several minutes; the Actor waits up to 20 minutes, renders up to 15 minutes, and AI actions up to 10 minutes.
- Schedule the Actor or call it from the Apify API to produce videos in bulk, and chain runs with the Apify integrations for Zapier, Make and n8n.

## FAQ

**Which AI models are available?** Rendley picks a default per action; pass `model_id` to choose. The catalog with parameter schemas is at `https://api.rendley.com/v1/ai/tools` (Bearer authenticated).

**Can I chain operations?** Yes: use the `project_id` and `media_id` from one run as input to the next, or drive the Actor from Zapier, Make or n8n with the Apify integrations.

**Is my API key stored?** It is a secret input field: Apify encrypts it and it never appears in logs or the dataset.

**Does it work with the Rendley MCP server?** The Actor uses the REST API. For conversational editing from an AI assistant, use Rendley's MCP server instead.

## Support

Rendley documentation: <https://docs.rendley.com>. Issues with the Actor: open a ticket on the Actor's Issues tab.
