[![Rendley](https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-dark-text.png)](https://rendley.com)

# Rendley AI Video Agent

[Rendley](https://rendley.com) lets you **create, edit, and automate video**. This Actor puts the Rendley AI agent in your Apify workflows. Describe the edit or the video you want, add your files, and the agent does the work on a real editing timeline. It has access to Rendley's full set of video editing tools and AI models, so any prompt that describes an edit or a video is fair game.

No setup in Rendley is needed. Each run creates a project for you, or edits one you name. Keep **Export a video file** on to get a finished video file, or turn it off to keep the edited project and continue working on it in Rendley Studio. The work happens on Rendley, so a run starts the agent and exits within seconds by default, and a later run picks the video up by job ID. Turn on **Wait for completion** to have one run do it all.

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
3. Run it. The Actor creates a project in your first workspace, starts the agent and exits. The dataset item has `status` = `started` and the `agent_job_id`.
4. A few minutes later, run it again with that ID in **Job ID**. With **Wait for completion** on, the run waits for the agent to finish, exports the video when **Export a video file** is on, and returns the download link. Without it, keep running with the same ID until `status` is `completed`. The export is started once and remembered, so repeated runs never export twice.

Or turn on **Wait for completion** in step 3 to get the video from a single run.

### Example input

One run that does everything and waits for the video.

```json
{
  "rendley_api_key": "YOUR_KEY",
  "prompt": "Create a short, engaging social-media video using high-quality stock footage. Use an interesting, modern layout with dynamic cuts, varied framing, and smooth transitions. Add bold, clean text overlays on top of the footage, with the text appearing at key moments and remaining easy to read. Keep the overall style polished, energetic, visually appealing, and concise.",
  "resolution": "1080p",
  "wait_for_completion": true
}
```

A run that picks up the agent job of an earlier run and waits for the video.

```json
{
  "rendley_api_key": "YOUR_KEY",
  "job_id": "8ba0ed2d-9a94-44f6-a586-3911966e5719",
  "wait_for_completion": true
}
```

### Example output

A run that starts the agent without waiting pushes the IDs to pick up later.

```json
{
  "status": "started",
  "project_id": "ab29a4fd-0393-4067-a255-7b4635fbd17a",
  "workspace_id": "3b66b9b6-de8e-44c3-9f27-848a09c79320",
  "created_project": true,
  "thread_id": "026bf203-dbf7-4fd1-9245-73008ea04db9",
  "agent_job_id": "8ba0ed2d-9a94-44f6-a586-3911966e5719",
  "note": "The job was started on Rendley and this run did not wait for it. Run this Actor again with that ID in job_id to pick up the result, with wait_for_completion on if that run should wait for it."
}
```

A finished run has every field below, with the signed URL shortened. Field names follow the Rendley API. The agent job comes back whole as `agent_job` and the render job as `export_job`, with their most useful fields also at the top level.

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

With **Export a video file** off, the fields from `job_id` onward are replaced by a `note` saying the edited project is ready in Rendley. A run that picks up a job that is still running pushes `status` = `running` with a note. A failed run pushes `{ "status": "failed", "error": "..." }` and exits with an error, so schedules and integrations can react.

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
| **Job ID** | The agent job or export job of an earlier run. The run fetches it instead of starting a new job. |
| **Wait for completion** | Keep the run open until the video is ready. Off by default. |
| **Copy the video to the key-value store** | Stream a copy of the video into the run so the link does not expire. On by default. |
| **API base URL** | Leave empty unless Rendley gave you a different API host. |

## Runs, waiting and cost

The agent and the export run on Rendley, not in the Actor, so a run has nothing to do while it waits. By default it does not wait. It creates the project, imports the files, starts the agent and exits within seconds with `status` = `started`, the `agent_job_id` and the `project_id`. A later run with that ID in **Job ID** fetches the job. When the agent is done, that run starts the export, remembers it, and with **Wait for completion** on waits for it and returns the video. A run that picks up a still-running agent job or export reports `status` = `running` with a note, so a schedule or an integration can simply run again with the same ID until it is `completed`. The export is only ever started once per agent job, so running again costs nothing on Rendley. The Actor keeps that link between agent job and export in a key-value store named `rendley-ai-video-agent-exports` in your Apify account.

**Wait for completion** turns the whole thing into one run that starts the agent, waits for it, exports the video and returns the link. Agent edits take minutes and the export about a minute more, and the run is billed for that time. A waiting run has no limit of its own. It waits until two minutes before the run's Apify timeout, which is one hour by default and can be set per run, and if the job is still going it reports `status` = `running` with the IDs, so nothing is lost and a later run picks it up.

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

**Why did my run finish in seconds without a video?** Because runs do not wait by default. The dataset item has `status` = `started` and the job ID. Run the Actor again with it in **Job ID**, or turn on **Wait for completion**.

**Is my API key stored?** It is a secret input field. Apify encrypts it and it never appears in logs or the dataset.

**What if the agent needs more information?** When a prompt is ambiguous the agent asks a question, which the Actor reports as an error. Make the prompt specific about length, format and captions, and run again.

## Support

The Rendley documentation lives at <https://docs.rendley.com>. For issues with the Actor, open a ticket on the Actor's Issues tab.
