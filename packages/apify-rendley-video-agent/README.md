[![Rendley](https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-light.png)](https://rendley.com)

# Rendley AI Video Agent

[Rendley](https://rendley.com) lets you **create, edit, and automate video**. This Actor puts the Rendley AI agent in your Apify workflows. Describe the edit or the video you want, add your files, and the agent does the work on a real editing timeline. It has access to Rendley's full set of video editing tools and AI models, so any prompt that describes an edit or a video is fair game.

No setup in Rendley is needed. Each run creates a project for you, or edits one you name. Keep **Export a video file** on to get a finished video file, or turn it off to keep the edited project and continue working on it in Rendley Studio. The run waits for the agent and returns the finished video. The work happens on Rendley, so the run only polls while it waits, which costs cents an hour at the Actor's 128 MB.

## What can the Rendley AI Video Agent do?

Anything you would ask a video editor. Some examples:

- **Add captions** to a video, styled for social platforms.
- **Cut bad takes, filler words and long pauses** out of a recording.
- **Resize or reframe** a video for another aspect ratio, keeping the subject in frame.
- **Create a video from a prompt**, with generated footage, images, voiceover, music and text assembled into a finished edit.
- **Turn a long recording into shorts**, pick the strongest moments, add b-roll, or apply your brand kit.
- **Any other edit** you can describe, such as trims, transitions, overlays, translations, dubbing and sound design.

You can start from nothing, from your own media, or from an existing project. With only a prompt, the agent creates a new project and builds the video from generated media, text and music. Add files and it works with your clips, images and audio instead. Give it a project ID to edit a project you already have in Rendley, and pass along the thread ID from an earlier run to continue that conversation.

With **Export a video file** on (the default) the run ends with a video file and a durable download link. With it off, the edited project is ready in Rendley Studio, where you can keep editing it by hand or with the agent.

## What do you need to run it?

- A [Rendley](https://rendley.com) account and an **API key** from [app.rendley.com/settings](https://app.rendley.com/settings).
- An **active Rendley subscription with credits**. The agent and renders are billed in Rendley credits; without them Rendley answers with HTTP 402, which the Actor reports as a clear error.

## How to generate a video from a text prompt

1. Paste your **Rendley API key**.
2. Write the **Prompt**. Add **Files** if the agent should work with your own clips, images or audio.
3. Run it. The Actor creates a project in your first workspace, waits for the agent, exports the video when **Export a video file** is on, and returns the download link.

### Example input

```json
{
  "rendley_api_key": "YOUR_KEY",
  "prompt": "Create a short, engaging social-media video using high-quality stock footage. Use an interesting, modern layout with dynamic cuts, varied framing, and smooth transitions. Add bold, clean text overlays on top of the footage, with the text appearing at key moments and remaining easy to read. Keep the overall style polished, energetic, visually appealing, and concise.",
  "resolution": "1080p"
}
```

### Example output

Every field the run produces, with the signed URL shortened. Field names follow the Rendley API. The agent job comes back whole as `agent_job` and the render job as `export_job`, with their most useful fields also at the top level.

```json
{
  "status": "completed",
  "project_id": "ab29a4fd-0393-4067-a255-7b4635fbd17a",
  "workspace_id": "3b66b9b6-de8e-44c3-9f27-848a09c79320",
  "created_project": true,
  "thread_id": "026bf203-dbf7-4fd1-9245-73008ea04db9",
  "agent_job_id": "8ba0ed2d-9a94-44f6-a586-3911966e5719",
  "last_message": "Added an automatic caption track to the video, covering the full 59.4-second duration.",
  "commands_applied": 2,
  "commands_failed": 0,
  "agent_job": { "job_id": "8ba0ed2d-9a94-44f6-a586-3911966e5719", "project_id": "ab29a4fd-0393-4067-a255-7b4635fbd17a", "thread_id": "026bf203-dbf7-4fd1-9245-73008ea04db9", "status": "completed", "last_message": "Added an automatic caption track to the video, covering the full 59.4-second duration.", "commands_applied": 2, "commands_failed": 0, "save_status": "synced", "created_at": 1788876571775, "updated_at": 1788876645434 },
  "job_id": "92e54de7-ca6e-4107-ac23-9e4e822f72ff",
  "url": "https://storage.rendley.com/exports/ab29a4fd-...?X-Amz-Signature=...",
  "url_expires_at": "2026-09-08T17:46:24Z",
  "media_id": "6b1f0d2e-5c3a-4e8f-9a7b-1d2c3e4f5a6b",
  "file_hash": "7fd6a19855329dc7",
  "mime_type": "video/mp4",
  "size": 8421337,
  "width": 1920,
  "height": 1080,
  "duration": 59.4,
  "result_data": { "media_id": "6b1f0d2e-5c3a-4e8f-9a7b-1d2c3e4f5a6b", "file_hash": "7fd6a19855329dc7", "width": 1920, "height": 1080, "duration": 59.4 },
  "export_job": { "id": "92e54de7-ca6e-4107-ac23-9e4e822f72ff", "type": "export_video", "status": "completed", "source_type": "api", "output": { "media_id": "6b1f0d2e-5c3a-4e8f-9a7b-1d2c3e4f5a6b", "url": "https://storage.rendley.com/exports/ab29a4fd-...?X-Amz-Signature=...", "url_expires_at": "2026-09-08T17:46:24Z", "mime_type": "video/mp4", "size": 8421337, "duration": 59.4 } },
  "kvs_key": "OUTPUT_VIDEO",
  "kvs_url": "https://api.apify.com/v2/key-value-stores/.../records/OUTPUT_VIDEO",
  "url_expiry": "Download URLs are signed and expire after a few hours; use the key-value store copy (kvs_url) for a durable link."
}
```

With **Export a video file** off, the fields from `job_id` onward are replaced by a `note` saying the edited project is ready in Rendley. A run that reaches its Apify timeout while the job is still going pushes `status` = `running` with the IDs and a note. A failed run pushes `{ "status": "failed", "error": "..." }` and exits with an error, so schedules and integrations can react.

## Inputs

| Input | What it is |
| --- | --- |
| **Rendley API key** | Your key from app.rendley.com/settings. Stored as a secret. |
| **Prompt** | What the agent should create or change. |
| **Files** | Public URLs of clips, images or audio for the agent to work with. |
| **Project ID** | Leave empty to create a new project, or set it to edit an existing one. |
| **Workspace** | The workspace for a new project. Leave empty for your first workspace, or give a name or ID. |
| **Thread ID** | Continue an earlier conversation on the same project. |
| **Export a video file** | Export the finished project to a video file. On by default. |
| **Resolution**, **Quality**, **Format** | Settings for the exported video. |
| **Job ID** | The agent job or export job of a run that reached its timeout. The run fetches it instead of starting a new job. |
| **Copy the video to the key-value store** | Stream a copy of the video into the run so the link does not expire. On by default. |
| **API base URL** | Leave empty unless Rendley gave you a different API host. |

## Runs, waiting and cost

The agent and the export run on Rendley, not in the Actor, so the run only polls while it waits. At the Actor's 128 MB an hour of waiting costs about two cents of Apify compute, and a typical edit far less. The run waits until two minutes before its Apify timeout, one hour by default and settable per run. If the job is still going then, the run ends with `status` = `running`, the `agent_job_id` and the `project_id`, so nothing is lost. Run the Actor again with that ID in **Job ID** and it waits for the rest. When the agent is done, that run starts the export, remembers it, and waits for it. The export is only ever started once per agent job, so running again costs nothing on Rendley. The Actor keeps that link between agent job and export in a key-value store named `rendley-ai-video-agent-exports` in your Apify account.

The Actor forwards requests and streams files, so it needs no memory to speak of. It runs in 128 MB, the smallest memory Apify offers, which is its default.

## Projects and workspaces

- **Project ID** is optional. Leave it empty and the run creates a project named after the prompt. Set it to edit an existing project, and the run's `project_id` output lets you keep editing the same project later.
- **Workspace** is only used when a project is created. It defaults to your first workspace; give another workspace's name or ID to use it. Every run logs your workspaces with their IDs, so you can copy one from the log.
- **Thread ID** continues an earlier conversation with the agent. Pass the `thread_id` from a previous run together with its `project_id`.

## Output files and expiring links

The `url` in the result is a signed Rendley link that **expires after a few hours**. With **Copy the video to the key-value store** on (the default), the run that receives the finished export streams the video into its key-value store, under the Output tab, and the result's `kvs_url` points to that copy. That link does not expire.

## FAQ

**Which workspace does the video go to?** Your first workspace unless you set **Workspace**. Give a name or an ID; the run log lists them.

**Can I keep editing the same video?** Yes. Pass the run's `project_id` into the next run, and its `thread_id` too if you want to keep the conversation.

**Why did my run end with status running?** It reached its Apify timeout while the agent or the export was still going. The dataset item has the job ID. Run the Actor again with it in **Job ID**, or give runs a longer timeout.

**Is my API key stored?** It is a secret input field. Apify encrypts it and it never appears in logs or the dataset.

**What if the agent needs more information?** When a prompt is ambiguous the agent asks a question, which the Actor reports as an error. Make the prompt specific about length, format and captions, and run again.

## Support

The Rendley documentation lives at <https://docs.rendley.com>. For issues with the Actor, open a ticket on the Actor's Issues tab.
