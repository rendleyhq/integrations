# Changelog

## 1.3.0

- New Publish a Social Post module (`publishSocialPost`). Posts a video or image to the social accounts connected in Rendley, now or at a scheduled time; the Accounts list follows the chosen workspace. Returns one post per account in `posts`; accounts that fail are reported in `errors` and `failed_count` instead of failing the module.
- New Cancel a Scheduled Social Post module (`cancelSocialPost`).
- New List Social Accounts RPC (`listSocialAccounts`) behind the Accounts dropdown.
- Make an API call always sends the connection's API key. Its headers expression replaced the Base headers, so every call failed with 401.
- Make an API call sends a body typed as JSON text as JSON. It used to go out as a JSON string, which the API rejected. A mapped collection is sent as before, and the module's fields are unchanged.

## 1.2.0

- New Change Voice and Upscale Video modules, so the app covers the same AI actions as the n8n node and the Zapier integration.
- Labels aligned with the other integrations. Transcribe Audio or Video, Text to Speech, Dub Video, Lip Sync and Get Media Download URL. Module names are unchanged.
- Estimate Cost no longer mentions the credit conversion rate.
- Start Export (Render MP4) is now Export Video. The module name (`renderVideo`) is unchanged, so existing scenarios keep working.
- Get Job Status treats a paused agent job (`waiting_input`) as complete and exposes the agent's prompt as `question`, so scenarios stop polling and can route on it.
- New Get Project module (`getProject`). Reads a project by ID and returns its name, workspace, thumbnail, timeline duration, version and timestamps.
- AI Video Agent imports the file into the project through the Rendley API before the agent starts, so the attachment is complete when the agent reads it. When a file is given without a project, the module creates a project named from the prompt in the chosen workspace.
- New List Workspaces RPC (`listWorkspaces`) behind the Workspace dropdowns.
- Credit errors (HTTP 402) carry Rendley's message.
- `npm run push` deploys the app to Make over the SDK Apps REST API, with dry-run, verify and sync modes.
- The README leads with the AI Video Agent and groups the media modules and utilities around it.

## 1.1.0

- The agent module is now AI Video Agent (`aiVideoAgent`).
- AI modules no longer require a project. Leave Project ID empty to save the result to the workspace library, with a Workspace dropdown for accounts with several workspaces.
- Get Job Status follows the Rendley API. The download link is `url` (was `download_url`) and the job's `size` and `duration` are included.

## 1.0.0

- Initial release. 22 modules (agent, render, upload, media URL, cost estimate, 12 AI actions, projects, workspaces, universal), 3 RPCs, connection with key verification, offline and live test harnesses.
