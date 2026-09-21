# Changelog

## 1.1.1

This release addresses the feedback from the Zapier app review. Every change is to labels, descriptions, help text and field order so the app follows Zapier's style guidelines. No action keys, inputs or output fields changed, so existing Zaps keep working without edits.

- Searches are named Find instead of Get, as Zapier requires. Get Job Status is now Find Job Status, Get Agent Job Status is now Find Agent Job Status, and Get Media Download URL is now Find Media Download URL.
- Field labels no longer end in ID. Job ID is now Job, Media ID is now Media, Thread ID is now Thread and Template ID is now Template. Help text refers to the job reference and the media reference.
- Wait for Completion? is now Wait for completion, without the question mark.
- Descriptions no longer repeat the Rendley name. They say project, account credits and created instead of Rendley project, Rendley credits and created in Rendley.
- Action descriptions are a single sentence. The longer guidance moved into the help text of the relevant field. The AI Video Agent description now sits under Prompt, the Delay step advice for Find Job Status sits under Job, the server side fetch note for Upload Media From URL sits under File URL, and the export timing note was dropped from Export Video.
- AI actions list their own inputs first, followed by Project, Workspace, Model, Params JSON and Wait for completion.

## 1.1.0

- The agent action is now AI Video Agent.
- AI actions no longer require a project. Leave Project empty to save the result to the workspace library, with a Workspace dropdown for accounts with several workspaces.
- Output fields follow the Rendley API. The download link is `url` (was `download_url`), the parsed job result is `result_data` (was `result` and `transcript`), and jobs also return `size` and `duration`.
- The agent action's media list is called Files, matching the API.
- Render Video is now Export Video, matching the other integrations. The action key is unchanged.
- New Upscale Video action.
- Estimate Cost (was Estimate Credit Cost) returns credits only and no longer includes an approximate USD figure.
- Get Agent Job Status and AI Video Agent report a paused agent job as complete, with Status waiting_input and the agent's prompt in Agent Question.
- Files given to AI Video Agent are imported into the project through the Rendley API before the agent starts, so every attachment is complete when the agent reads it. When files are given without a project, the action creates a project named from the prompt.
- AI Video Agent returns `commands_applied` and `commands_failed`.
- Waiting for a job survives transient network errors and rate limits instead of failing the step.
- Credit errors (HTTP 402) carry Rendley's message and point to app.rendley.com.
- The README leads with the AI Video Agent and groups the media tools, utilities and job searches around it.
- The connection form asks only for the API key. The API host is set per app version through the RENDLEY_API_BASE_URL environment variable instead of a connection field.
- The New Completed Job and New Project triggers mark their `id` as the primary key.

## 1.0.0

- Initial release. Agent edits, renders, project and media actions, thirteen AI actions, job searches, and the New Completed Job and New Project triggers.
