#!/usr/bin/env node
/**
 * Generates apiDefinition.swagger.json (OpenAPI 2.0 with the Power Platform
 * x-ms extensions) from one source of truth, so summaries, descriptions and
 * response schemas stay consistent with Microsoft's certification rules.
 */
const fs = require("node:fs");
const path = require("node:path");

const summary = (s) => s;
const field = (type, description, xmsSummary, extra = {}) => ({ type, description, "x-ms-summary": xmsSummary, ...extra });

const jobSchema = {
  type: "object",
  properties: {
    id: field("string", "The job identifier.", "Job ID"),
    type: field("string", "The job type, for example generate_video or export_video.", "Job Type"),
    status: field("string", "One of queued, processing, completed, failed or canceled.", "Status"),
    result_data: field("string", "The result as a JSON string. For transcriptions it holds the transcript.", "Result Data"),
    error: field("string", "Why the job failed, when it did.", "Error"),
    source_id: field("string", "The project the job ran in.", "Project ID"),
    output: {
      type: "object",
      description: "The produced file, present once the job is completed.",
      "x-ms-summary": "Output",
      properties: {
        media_id: field("string", "The media identifier of the produced file.", "Media ID"),
        file_hash: field("string", "The file hash of the produced file.", "File Hash"),
        mime_type: field("string", "The MIME type of the produced file.", "MIME Type"),
        size: field("integer", "The file size in bytes.", "Size", { format: "int64" }),
        duration: field("number", "The duration in seconds for audio and video.", "Duration"),
        url: field("string", "A signed download URL that expires after a few hours.", "Download URL"),
        url_expires_at: field("string", "When the download URL expires.", "Download URL Expires At", { format: "date-time" }),
      },
    },
  },
};
const agentJobSchema = {
  type: "object",
  properties: {
    job_id: field("string", "The agent job identifier.", "Job ID"),
    project_id: field("string", "The project the agent works in.", "Project ID"),
    thread_id: field("string", "The conversation thread, reusable for follow-up prompts.", "Thread ID"),
    status: field("string", "One of pending, running, completed, failed or canceled.", "Status"),
    last_message: field("string", "The final message from the agent.", "Agent Message"),
    error: field("string", "Why the job failed, when it did.", "Error"),
    commands_applied: field("integer", "How many editing commands were applied.", "Commands Applied"),
    commands_failed: field("integer", "How many editing commands failed.", "Commands Failed"),
  },
};
const projectSchema = {
  type: "object",
  properties: {
    id: field("string", "The project identifier.", "Project ID"),
    workspace_id: field("string", "The workspace the project belongs to.", "Workspace ID"),
    name: field("string", "The project name.", "Name"),
    thumbnail_url: field("string", "A thumbnail of the project.", "Thumbnail URL"),
    created_at: field("string", "When the project was created.", "Created At", { format: "date-time" }),
    updated_at: field("string", "When the project was last updated.", "Updated At", { format: "date-time" }),
  },
};
const uploadSchema = {
  type: "object",
  properties: {
    media_id: field("string", "The media identifier, usable as the source of AI actions.", "Media ID"),
    file_hash: field("string", "The file hash, also usable as the source of AI actions.", "File Hash"),
    storage_url: field("string", "A signed download URL that expires after a few hours.", "Download URL"),
    status: field("string", "The upload status.", "Status"),
    mime_type: field("string", "The MIME type of the file.", "MIME Type"),
    original_file_name: field("string", "The file name in the project library.", "File Name"),
    duration: field("number", "The duration in seconds for audio and video.", "Duration"),
  },
};
const idName = (idLabel, idDesc) => ({
  type: "object",
  properties: { id: field("string", idDesc, idLabel), name: field("string", "The display name.", "Name") },
});

const envelope = (label, schema) => ({ type: "object", properties: { data: { ...schema, description: `The ${label.toLowerCase()}.`, "x-ms-summary": label } } });
const listOf = (label, item) => ({ type: "object", properties: { data: { type: "array", description: `The ${label.toLowerCase()}.`, "x-ms-summary": label, items: item } } });
const okJson = (schema) => ({ 200: { description: "The request succeeded.", schema } });
const emptyResult = { type: "object", properties: { data: { type: "object", description: "Empty on success.", "x-ms-summary": "Result", properties: {} } } };

const dynProjects = { operationId: "ListProjects", "value-path": "id", "value-title": "name", "value-collection": "data" };
const dynWorkspaces = { operationId: "ListWorkspaces", "value-path": "id", "value-title": "name", "value-collection": "data" };
const projectParam = { name: "projectId", in: "path", required: true, type: "string", description: "The project identifier.", "x-ms-summary": "Project", "x-ms-dynamic-values": dynProjects, "x-ms-url-encoding": "single" };
const jobParam = { name: "jobId", in: "path", required: true, type: "string", description: "The job identifier.", "x-ms-summary": "Job ID", "x-ms-url-encoding": "single" };
const body = (description, schema) => ({ name: "body", in: "body", required: true, description, schema });
const bodyProjectId = field("string", "The project the media is stored in.", "Project", { "x-ms-dynamic-values": dynProjects });

const AI_ACTIONS = ["transcribe", "text-to-speech", "video-translate", "lipsync", "voice-isolation", "voice-changer", "remove-video-background", "remove-image-background", "upscale-image", "generate-image", "generate-video", "generate-music", "generate-sound-effect"];
const actionParam = { name: "action", in: "path", required: true, type: "string", enum: AI_ACTIONS, description: "The AI action to run.", "x-ms-summary": "Action", "x-ms-url-encoding": "single" };
const aiBody = {
  type: "object",
  required: ["project_id", "params"],
  properties: {
    project_id: bodyProjectId,
    model_id: field("string", "An optional model for this action, for example kling-v2.6. Leave empty for the default model.", "Model ID", { "x-ms-visibility": "advanced" }),
    params: { type: "object", description: "The model parameters as JSON. File inputs go in media as a public URL, media ID or file hash. Lip sync uses video_media and audio_media. Prompts go in prompt.", "x-ms-summary": "Parameters", properties: {}, additionalProperties: true },
  },
};

const op = (operationId, sum, description, extra = {}) => ({ operationId, summary: summary(sum), description, "x-ms-visibility": "important", ...extra });

const swagger = {
  swagger: "2.0",
  info: {
    title: "Rendley",
    description: "AI video editing and generation. Edit projects with the Rendley AI agent, generate speech, images, video and music, transcribe and dub media, upload files, and render MP4 videos.",
    version: "1.0",
    contact: { name: "Rendley", url: "https://rendley.com", email: "support@rendley.com" },
  },
  host: "api.rendley.com",
  basePath: "/v1",
  schemes: ["https"],
  consumes: ["application/json"],
  produces: ["application/json"],
  paths: {
    "/workspaces": {
      get: op("ListWorkspaces", "List workspaces", "Lists the workspaces the API key can access.", { responses: okJson(listOf("Workspaces", idName("Workspace ID", "The workspace identifier."))) }),
    },
    "/projects": {
      get: op("ListProjects", "List projects", "Lists the projects in a workspace.", {
        parameters: [{ name: "workspace_id", in: "query", required: false, type: "string", description: "The workspace to list. Defaults to the first workspace.", "x-ms-summary": "Workspace", "x-ms-dynamic-values": dynWorkspaces }],
        responses: okJson(listOf("Projects", projectSchema)),
      }),
      post: op("CreateProject", "Create project", "Creates a new project, optionally from a template.", {
        parameters: [body("The project to create.", { type: "object", required: ["name"], properties: { name: field("string", "The project name.", "Name"), workspace_id: field("string", "The workspace to create the project in. Defaults to the first workspace.", "Workspace", { "x-ms-dynamic-values": dynWorkspaces }), template_id: field("string", "An optional template to start from.", "Template ID", { "x-ms-visibility": "advanced" }) } })],
        responses: okJson(envelope("Project", projectSchema)),
      }),
    },
    "/projects/{projectId}": {
      get: op("GetProject", "Get project", "Gets a project by its identifier.", { parameters: [projectParam], responses: okJson(envelope("Project", projectSchema)) }),
      delete: op("DeleteProject", "Delete project", "Deletes a project.", { parameters: [projectParam], responses: okJson(emptyResult) }),
    },
    "/projects/{projectId}/uploads/import": {
      post: op("UploadMediaFromUrl", "Upload media from URL", "Adds a file from a public URL to the media library of the project. Rendley fetches the file itself.", {
        parameters: [projectParam, body("The file to import.", { type: "object", required: ["download_url"], properties: { download_url: field("string", "A publicly reachable URL of the video, audio or image.", "File URL"), file_name: field("string", "An optional name for the project library.", "File Name"), role: field("string", "Leave at pending.", "Role", { "x-ms-visibility": "internal", default: "pending" }) } })],
        responses: okJson(envelope("Upload", uploadSchema)),
      }),
    },
    "/projects/{projectId}/uploads": {
      get: op("GetMediaUrl", "Get media download URL", "Gets a fresh signed download URL for a file by media ID or file hash.", {
        parameters: [projectParam, { name: "media_id", in: "query", required: false, type: "string", description: "The media identifier. Leave empty to look up by file hash.", "x-ms-summary": "Media ID" }, { name: "hash", in: "query", required: false, type: "string", description: "The file hash, used when the media ID is empty.", "x-ms-summary": "File Hash" }],
        responses: okJson(envelope("Upload", uploadSchema)),
      }),
    },
    "/ai/{action}": {
      post: op("RunAiAction", "Run AI action", "Starts an AI action such as text to speech, image or video generation, transcription or dubbing. Returns a job identifier to follow with Get job.", {
        parameters: [actionParam, body("The action request.", aiBody)],
        responses: okJson(envelope("Job", { type: "object", properties: { job_id: field("string", "The job identifier to follow with Get job.", "Job ID") } })),
      }),
    },
    "/ai/{action}/cost": {
      post: op("EstimateAiActionCost", "Estimate AI action cost", "Estimates how many credits an AI action would consume, without running it.", {
        parameters: [actionParam, body("The action request to price.", aiBody)],
        responses: okJson({ type: "object", properties: { data: field("integer", "The estimated credits.", "Credits") } }),
      }),
    },
    "/ai/text-to-speech/voices": {
      get: op("ListVoices", "List voices", "Lists the text to speech voices.", { parameters: [{ name: "limit", in: "query", required: false, type: "integer", description: "The page size.", "x-ms-summary": "Limit", default: 100 }], responses: okJson(listOf("Voices", idName("Voice ID", "The voice identifier."))), "x-ms-visibility": "advanced" }),
    },
    "/ai/video-translate/languages": {
      get: op("ListDubbingLanguages", "List dubbing languages", "Lists the languages a video can be dubbed into.", { responses: okJson(listOf("Languages", idName("Language Code", "The language code."))), "x-ms-visibility": "advanced" }),
    },
    "/export": {
      post: op("RenderVideo", "Render video", "Renders a project to an MP4 video. Returns a job identifier to follow with Get job. Requires a paid Rendley plan.", {
        parameters: [body("The render request.", { type: "object", required: ["project_id"], properties: { project_id: bodyProjectId, settings: { type: "object", description: "The render settings.", "x-ms-summary": "Settings", properties: { codec: field("string", "The video codec. Defaults to h264.", "Codec", { enum: ["h264", "vp8"] }), target_resolution: field("string", "The output resolution. Defaults to 1080p.", "Resolution", { enum: ["720p", "1080p", "4K"] }), quality: field("string", "The encoding quality. Defaults to high.", "Quality", { enum: ["high", "medium", "low"] }) } } } })],
        responses: okJson(envelope("Job", { type: "object", properties: { job_id: field("string", "The render job identifier.", "Job ID") } })),
      }),
    },
    "/export/cost": {
      post: op("EstimateRenderCost", "Estimate render cost", "Estimates how many credits a render would consume.", {
        parameters: [body("The render request to price.", { type: "object", required: ["project_id"], properties: { project_id: bodyProjectId } })],
        responses: okJson(envelope("Estimate", { type: "object", properties: { credits: field("integer", "The estimated credits.", "Credits") } })),
      }),
    },
    "/jobs/{jobId}": {
      get: op("GetJob", "Get job", "Gets the status of an AI action or render job and, once complete, a fresh download URL.", { parameters: [jobParam], responses: okJson(envelope("Job", jobSchema)) }),
      delete: op("CancelJob", "Cancel job", "Cancels a queued or running AI action or render job.", { parameters: [jobParam], responses: okJson(emptyResult), "x-ms-visibility": "advanced" }),
    },
    "/agent": {
      post: op("EditVideoWithAiAgent", "Edit video with AI agent", "Sends a prompt to the Rendley AI agent, which creates or edits a video project. Returns an agent job identifier to follow with Get agent job. Requires a paid Rendley plan.", {
        parameters: [body("The agent request.", { type: "object", required: ["prompt"], properties: { prompt: field("string", "What the agent should create or change.", "Prompt"), project_id: field("string", "An existing project to edit. Leave empty to let the agent create one.", "Project", { "x-ms-dynamic-values": dynProjects }), thread_id: field("string", "Continues a previous agent conversation on the same project.", "Thread ID", { "x-ms-visibility": "advanced" }), files: { type: "array", description: "The media for the agent to work with.", "x-ms-summary": "Files", items: { type: "object", properties: { url: field("string", "A public URL of a clip, image or audio file.", "URL"), name: field("string", "An optional display name.", "Name") } } } } })],
        responses: okJson(envelope("Agent job", agentJobSchema)),
      }),
    },
    "/agent/jobs/{jobId}": { get: op("GetAgentJob", "Get agent job", "Gets the status and message of an AI agent edit.", { parameters: [jobParam], responses: okJson(envelope("Agent job", agentJobSchema)) }) },
    "/agent/jobs/{jobId}/cancel": { post: op("CancelAgentJob", "Cancel agent job", "Stops a running AI agent edit.", { parameters: [jobParam], responses: okJson(envelope("Agent job", agentJobSchema)), "x-ms-visibility": "advanced" }) },
  },
  definitions: {},
  parameters: {},
  responses: {},
  securityDefinitions: { api_key: { type: "apiKey", in: "header", name: "Authorization" } },
  security: [{ api_key: [] }],
  tags: [],
  "x-ms-connector-metadata": [
    { propertyName: "Website", propertyValue: "https://rendley.com" },
    { propertyName: "Privacy policy", propertyValue: "https://rendley.com/privacy" },
    { propertyName: "Categories", propertyValue: "AI;Content and Files" },
  ],
};

const out = path.join(__dirname, "..", "apiDefinition.swagger.json");
fs.writeFileSync(out, JSON.stringify(swagger, null, 2) + "\n");
console.log(`wrote ${path.relative(process.cwd(), out)} with ${Object.values(swagger.paths).reduce((n, m) => n + Object.keys(m).length, 0)} operations`);
