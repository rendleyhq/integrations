# Changelog

## 1.0.0

- Initial release. One run is one Rendley AI action. Generate images, video clips, music, sound effects and speech, or upscale, remove backgrounds, change and isolate voices, lip sync, dub and transcribe existing media.
- Model, voice and dubbing language dropdowns are generated from Rendley's catalog (`npm run sync:catalog`). Parameters are checked against the chosen model's schema before any credits are spent.
- The run waits for the job and returns the result. It waits until just before its Apify timeout and then hands a still-running job off as running with its ID instead of failing; a later run with the ID in Job ID picks it up.
- Files are streamed into the key-value store rather than held in memory, so the Actor runs in 128 MB, the smallest memory Apify offers, by default.
- Results go to the workspace library by default, or to a project when Project ID is set. Dataset items follow the Rendley API (`url`, `media_id`, `file_hash`, `result_data`, raw `job`) and the file is copied to the run's key-value store as OUTPUT_MEDIA (transcripts as OUTPUT_TRANSCRIPT).
