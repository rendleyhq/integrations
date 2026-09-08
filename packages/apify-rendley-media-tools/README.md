[![Rendley](https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-light.png)](https://rendley.com)

# Rendley AI Media Tools

[Rendley](https://rendley.com) lets you **create, edit, and automate video**. This Actor runs Rendley's AI media tools one action per run. **Generate AI video clips, images, music, sound effects and speech**, or **upscale, remove backgrounds, change and isolate voices, lip sync, dub and transcribe** existing media. Results are saved to your Rendley library, ready for the Rendley AI Video Agent or for editing in Rendley Studio, and returned with a durable download link. The run waits for the job and returns the result. The work happens on Rendley, so the run only polls while it waits, which costs cents an hour at the Actor's 128 MB.

Models, voices and dubbing languages are dropdowns filled from Rendley's catalog. Model-specific parameters are documented in the [model catalog](https://docs.rendley.com/api/models), which is generated from the same source the API validates against.

## What can the Rendley AI Media Tools do?

| Action | What it does | Needs |
| --- | --- | --- |
| `generate_image` | AI image from a prompt, optionally from reference images. | `prompt`; optional `reference_images`, `aspect_ratio` |
| `generate_video` | AI video clip from a prompt, optionally animating a start image. | `prompt`; optional `reference_images` (first is the start frame), `aspect_ratio`, `duration` |
| `generate_music` | Music from a description of genre, tempo and mood. | `prompt`; optional `duration` |
| `generate_sound_effect` | A sound effect from a description. | `prompt`; optional `duration` |
| `text_to_speech` | Voiceover from a script. | `prompt` (the script); optional `voice_id` |
| `upscale_image`, `upscale_video` | Higher resolution with AI super-resolution, video up to 4K. | `media` |
| `remove_image_background`, `remove_video_background` | Transparent background. | `media` |
| `voice_changer` | Re-voice audio or video with another voice. | `media`, `voice_id` |
| `voice_isolation` | Remove noise and music, keep the voice. | `media` |
| `lipsync` | Sync a speaker's lips to a new audio track. | `media` (video), `audio_media` |
| `video_translate` | Dub a video into another language in the original voice. | `media`, `output_language` |
| `transcribe` | Speech to text with word-level timestamps. | `media`; optional `start_time`, `end_time` |

`media` and `audio_media` accept a **public URL**, or the **media ID** or **file hash** of a file already in your Rendley library or project.

## What do you need to run it?

- A [Rendley](https://rendley.com) account and an **API key** from [app.rendley.com/settings](https://app.rendley.com/settings).
- **Rendley credits**, since every action is billed in credits to your Rendley account. Without them Rendley answers with HTTP 402, which the Actor reports as a clear error.

## How to generate an image, a clip or a voiceover

1. Paste your **Rendley API key**.
2. Pick the **Action** and fill in its fields, a **Prompt or script** for generation or **Source media** for transformations.
3. Run it. The Actor checks the parameters, waits for the job and returns the result. It is saved to the library of your first workspace, and the item includes a download link and a `media_id` you can reuse in later runs.

### Example input for text to speech

```json
{
  "rendley_api_key": "YOUR_KEY",
  "action": "text_to_speech",
  "prompt": "Welcome to Rendley. Let us make something."
}
```

### Example output

A real result, with the signed URL shortened. Field names follow the Rendley API. The job's output fields appear under their own names, `result_data` is parsed, and the job comes back whole as `job`.

```json
{
  "status": "completed",
  "action": "text_to_speech",
  "model_id": "eleven-labs-tts",
  "project_id": null,
  "workspace_id": "3b66b9b6-de8e-44c3-9f27-848a09c79320",
  "job_id": "33a9184d-78c2-4013-9880-107386b1a440",
  "media_id": "dae88e59-a2fe-4dfe-83dd-542ce9373dd5",
  "file_hash": "2c95df4dac20e61b",
  "url": "https://storage.rendley.com/workspace_uploads/3b66b9b6-de8e-44c3-9f27-848a09c79320/dae88e59-a2fe-4dfe-83dd-542ce9373dd5?X-Amz-Signature=...",
  "url_expires_at": "2026-09-08T18:59:06Z",
  "mime_type": "audio/mpeg",
  "size": null,
  "duration": null,
  "result_data": {
    "media_id": "dae88e59-a2fe-4dfe-83dd-542ce9373dd5",
    "file_hash": "2c95df4dac20e61b",
    "upload_id": "0751aa07-cdbc-484c-9944-0c0f0c831b1a",
    "workspace_id": "3b66b9b6-de8e-44c3-9f27-848a09c79320"
  },
  "job": {
    "id": "33a9184d-78c2-4013-9880-107386b1a440",
    "type": "text_to_speech",
    "status": "completed",
    "input_data": "{\"model_id\":\"eleven-labs-tts\",\"params\":{\"prompt\":\"Welcome to Rendley. Let us make something.\",\"voice_id\":\"EXAVITQu4vr4xnSDxMaL\"},\"prompt\":\"Welcome to Rendley. Let us make something.\",\"workspace_id\":\"3b66b9b6-de8e-44c3-9f27-848a09c79320\"}",
    "result_data": "{\"media_id\":\"dae88e59-a2fe-4dfe-83dd-542ce9373dd5\",\"file_hash\":\"2c95df4dac20e61b\",\"upload_id\":\"0751aa07-cdbc-484c-9944-0c0f0c831b1a\",\"workspace_id\":\"3b66b9b6-de8e-44c3-9f27-848a09c79320\"}",
    "error": null,
    "acknowledged": false,
    "source_type": "api",
    "source_id": "3b66b9b6-de8e-44c3-9f27-848a09c79320",
    "output": {
      "media_id": "dae88e59-a2fe-4dfe-83dd-542ce9373dd5",
      "file_hash": "2c95df4dac20e61b",
      "workspace_id": "3b66b9b6-de8e-44c3-9f27-848a09c79320",
      "mime_type": "audio/mpeg",
      "url": "https://storage.rendley.com/workspace_uploads/3b66b9b6-de8e-44c3-9f27-848a09c79320/dae88e59-a2fe-4dfe-83dd-542ce9373dd5?X-Amz-Signature=...",
      "url_expires_at": "2026-09-08T18:59:06Z"
    }
  },
  "kvs_key": "OUTPUT_MEDIA",
  "kvs_url": "https://api.apify.com/v2/key-value-stores/.../records/OUTPUT_MEDIA",
  "url_expiry": "Download URLs are signed and expire after a few hours; use the key-value store copy (kvs_url) for a durable link."
}
```

A transcription result carries `text`, `language_code` and the full transcript in `result_data` instead of a file. A run that reaches its Apify timeout while the job is still going pushes `status` = `running` with the job ID and a note. A run with **Only estimate the credit cost** on returns `credits` and nothing else. A failed run pushes `{ "status": "failed", "action": "...", "error": "..." }` and exits with an error, so schedules and integrations can react.

## Inputs

The form has three parts.

**The action and the model.** Pick what to do, then a model from the dropdown or leave it on Rendley's default for that action.

**The action's fields.** Each action has the fields Rendley's default model for it uses, under the same names as in the API docs.

- **Prompt or script** for generation, or the words to speak for text to speech.
- **Reference images** for image generation, or the start frame for video generation.
- **Aspect ratio** and **Duration (seconds)** for generated images, clips, music and sound effects.
- **Voice** for text to speech and voice changes, a dropdown of Rendley's voices with Sarah as the default.
- **Source media**, the file to transform as a URL, media ID or file hash, plus **Audio track** for lip sync, **Target language** and **Dubbing mode** for dubbing, and **Start time** and **End time** for transcription.
- **Project ID** and **Workspace** decide where the result is saved. Leave both empty for the library of your first workspace.

**Picking up an earlier run.** **Job ID** fetches the job of a run that reached its timeout instead of starting a new one.

**Advanced.** **Extra model parameters** takes a model's other fields as JSON, merged on top of everything above. The [model catalog](https://docs.rendley.com/api/models) lists every model with its parameters, and each action has its own page in the [API docs](https://docs.rendley.com/api). **Only estimate the credit cost** returns the credits the action would use without running it. **Copy the result to the key-value store** streams a copy of the file into the run so the link does not expire. **API base URL** stays empty unless Rendley gave you a different host.

Before spending credits, the Actor checks all of this against the chosen model. A field the model does not accept, a missing required field, or a choice outside the model's options stops the run with a message that says what the model expects.

## Runs, waiting and cost

The action runs on Rendley, not in the Actor, so the run only polls while it waits. At the Actor's 128 MB an hour of waiting costs about two cents of Apify compute, and most actions finish in seconds to a few minutes. The run waits until two minutes before its Apify timeout, one hour by default and settable per run. If the job is still going then, the run ends with `status` = `running` and the `job_id`, so nothing is lost. Run the Actor again with that ID in **Job ID** and it waits for the rest and returns the result exactly as the first run would have.

The Actor forwards requests and streams files, so it needs no memory to speak of. It runs in 128 MB, the smallest memory Apify offers, which is its default.

## Where results are saved

- By default the file goes to the **library of your first workspace**, where the Rendley app and the AI Video Agent can use it. Set **Workspace** to a workspace name or ID to use another one; every run logs your workspaces with their IDs.
- Set **Project ID** to save into a specific Rendley project instead.
- When the workspace library is not available on the account, the Actor saves into a project named **Apify media** in the workspace, creating it once.

## Output files and expiring links

The `url` in the result is a signed Rendley link that **expires after a few hours**. With **Copy the result to the key-value store** on (the default), the run that receives the finished job streams the file into its key-value store, under the Output tab, and the result's `kvs_url` points to that copy. That link does not expire.

## Models

Rendley picks a default model per action, for example Nano Banana for images, Kling for video clips and ElevenLabs for speech and music. The **Model** dropdown lists every alternative. What each model accepts, with types, options and defaults, is in the [model catalog](https://docs.rendley.com/api/models). The action's fields match the default model. When another model names a parameter differently or has extra ones, set them in **Extra model parameters**. The Actor checks every parameter against the chosen model before spending credits and, when something does not fit, replies with the list of parameters that model accepts.

## FAQ

**Why did my run end with status running?** It reached its Apify timeout while the job was still going. The dataset item has the job ID. Run the Actor again with it in **Job ID**, or give runs a longer timeout.

**Is my API key stored?** It is a secret input field. Apify encrypts it and it never appears in logs or the dataset.

**Can I chain actions?** Yes. Pass a result's `media_id` as the next run's **Source media**. Generate speech, then lip sync a clip to it, then transcribe it for captions.

## Support

The Rendley documentation lives at <https://docs.rendley.com>. For issues with the Actor, open a ticket on the Actor's Issues tab.
