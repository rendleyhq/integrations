# Changelog

## 1.0.0

- Initial release. The Rendley AI Video Agent creates or edits a project from a prompt and optional files, then exports a video file (the Export a video file option, on by default).
- Files are imported into the project through the Rendley API before the agent starts, so every attachment is complete when the agent reads it.
- Projects are optional. Without one the Actor creates a project named from the prompt in the chosen workspace, picked by name or ID, with the first workspace as the default.
- A run starts the agent and exits by default, because the work happens on Rendley. Pick the result up later by running the Actor with the job ID in Job ID, or turn on Wait for completion to have one run do everything. A waiting run waits until just before its Apify timeout and hands a still-running job off as running instead of failing. The export is started once per agent job and remembered, so repeated pick-ups never export twice.
- The exported video is streamed into the key-value store rather than held in memory, so the Actor runs in 128 MB, the smallest memory Apify offers, by default.
- Results follow the Rendley API. The dataset item carries `url`, `media_id`, `file_hash`, `result_data`, `last_message`, `commands_applied` and the raw `agent_job` and `export_job`, and the video is copied to the run's key-value store as OUTPUT_VIDEO.
