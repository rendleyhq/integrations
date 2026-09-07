# Rendley

Rendley is an AI video editor with an API. This connector lets flows and apps edit video projects with the Rendley AI agent, run AI actions such as text to speech, transcription, dubbing, image, video and music generation, background removal and lip sync, upload media, and render MP4 videos.

## Publisher: Rendley

## Prerequisites

- A Rendley account at <https://rendley.com>.
- An API key from <https://app.rendley.com/settings>. AI actions consume credits; the agent and renders need an active subscription.

## Supported operations

| Operation | Description |
| --- | --- |
| List workspaces | Lists the workspaces the API key can access. |
| List projects, Create project, Get project, Delete project | Manage projects. |
| Upload media from URL | Adds a file from a public URL to a project's media library. |
| Get media download URL | Gets a fresh signed download URL for a file. |
| Run AI action | Starts an AI action and returns a job identifier. |
| Estimate AI action cost | Prices an AI action without running it. |
| Render video, Estimate render cost | Renders a project to MP4 and prices a render. |
| Get job, Cancel job | Follows or cancels an AI action or render job. |
| Edit video with AI agent, Get agent job, Cancel agent job | Prompts the Rendley AI agent to create or edit a project. |
| List voices, List dubbing languages | Catalog lookups. |

## Obtaining credentials

Create an API key under Settings in the Rendley app and paste it into the connection. The connector adds the `Bearer` prefix.

## Getting started

1. Create a project with **Create project** (or pick an existing one).
2. Run **Run AI action** with, for example, action `text-to-speech` and parameters `{ "voice_id": "...", "prompt": "Hello" }`, or **Edit video with AI agent** with a prompt.
3. Loop **Get job** (or **Get agent job**) with a **Delay** until `status` is `completed`.
4. Use `output.url` (or **Get media download URL**) to download the result. Links expire after a few hours.

## Known issues and limitations

- Jobs are asynchronous; the connector returns job identifiers that flows poll. Rendley does not send webhooks.
- Download URLs are signed and expire after a few hours.
- The AI agent and video renders require a paid Rendley plan; the API answers with HTTP 402 otherwise.

## Frequently asked questions

**Which AI models are available?** Rendley picks a default per action; pass `model_id` to choose. The catalog with parameter schemas is at `https://api.rendley.com/v1/ai/tools`.

**How do I pass a file?** Give a public URL, or upload it with **Upload media from URL** and use the returned media ID.

## Deployment instructions

Import `apiDefinition.swagger.json` and `apiProperties.json` as a custom connector, or use `paconn create` from this folder.
