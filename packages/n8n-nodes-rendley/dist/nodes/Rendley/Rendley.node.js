"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rendley = void 0;
const node_crypto_1 = require("node:crypto");
const n8n_workflow_1 = require("n8n-workflow");
const xxhash_1 = require("./xxhash");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Parses the `result_data` field returned by the REST job endpoint. The API
 * returns it as a JSON string, but we defensively accept objects too.
 */
function parseResultData(raw) {
    if (raw === undefined || raw === null || raw === '') {
        return undefined;
    }
    if (typeof raw === 'object') {
        return raw;
    }
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
/**
 * Builds an export `settings` object from a collection value, omitting any
 * unset fields so we never send empty strings to the API.
 */
function buildSettings(raw) {
    const settings = {};
    if (raw.codec) {
        settings.codec = raw.codec;
    }
    if (raw.target_resolution) {
        settings.target_resolution = raw.target_resolution;
    }
    if (raw.quality) {
        settings.quality = raw.quality;
    }
    return Object.keys(settings).length > 0 ? settings : undefined;
}
/**
 * Wraps a request/HTTP error into a NodeApiError with a clear, English message.
 * Surfaces the Rendley envelope error and a friendly note for HTTP 402.
 */
function toApiError(ctx, error) {
    const err = error;
    const status = err?.httpCode ?? err?.response?.status ?? err?.statusCode;
    const bodySource = err?.response?.body ?? err?.response?.data ?? err?.error ?? {};
    const body = (typeof bodySource === 'object' && bodySource !== null ? bodySource : {});
    const enveloped = (body.error && typeof body.error === 'object' ? body.error : undefined);
    let message = enveloped?.message || err?.message || 'The Rendley API request failed.';
    if (String(status) === '402') {
        message = `Rendley: payment required. ${enveloped?.message ||
            'This operation requires an active subscription and available credits.'}`;
    }
    return new n8n_workflow_1.NodeApiError(ctx.getNode(), err, {
        message,
        httpCode: status !== undefined ? String(status) : undefined,
    });
}
/** Keeps an already-shaped n8n error, shapes anything else (bad JSON, helper failures). */
function asNodeError(ctx, error) {
    if (error instanceof n8n_workflow_1.NodeApiError || error instanceof n8n_workflow_1.NodeOperationError)
        return error;
    return toApiError(ctx, error);
}
/** HTTP status of a failed request, as a string, or an empty string. */
function errorStatus(error) {
    const err = error;
    const status = err?.httpCode ?? err?.response?.status ?? err?.statusCode;
    return status === undefined ? '' : String(status);
}
/**
 * Performs an authenticated request against the Rendley API and unwraps the
 * `{ data }` envelope every route answers with.
 */
async function rendleyRequest(ctx, method, path, body) {
    const credentials = await ctx.getCredentials('rendleyApi');
    const baseURL = credentials.apiBaseUrl || 'https://api.rendley.com/v1';
    const options = {
        method,
        url: path,
        baseURL,
        json: true,
    };
    if (body !== undefined) {
        options.body = body;
    }
    let response;
    try {
        response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'rendleyApi', options);
    }
    catch (error) {
        throw toApiError(ctx, error);
    }
    if (response &&
        typeof response === 'object' &&
        !Array.isArray(response) &&
        'data' in response) {
        return response.data;
    }
    return response;
}
/** Both /projects calls reject a missing workspace_id, so an empty field takes the first one. */
async function resolveWorkspaceId(ctx, workspaceId) {
    if (workspaceId) {
        return workspaceId;
    }
    const workspaces = await rendleyRequest(ctx, 'GET', '/workspaces');
    const first = workspaces?.[0]?.id;
    if (!first) {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), 'No workspace found for this Rendley API key. Create one at app.rendley.com.');
    }
    return first;
}
/** The API validates against the model's own schema, so a mismatched model errors on an unrelated field. */
async function assertModelMatchesAction(ctx, action, modelId) {
    const tools = await rendleyRequest(ctx, 'GET', '/ai/tools');
    // The catalog spells actions with underscores, the endpoints with hyphens.
    const catalogAction = action.replace(/-/g, '_');
    const tool = tools?.find((entry) => entry.action === catalogAction);
    const modelIds = (tool?.models ?? []).map((model) => model.id);
    if (modelIds.length > 0 && !modelIds.includes(modelId)) {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), `Model "${modelId}" is not available for "${action}". Pick one of: ${modelIds.join(', ')}.`);
    }
}
/** The workspace list shared by every workspace picker, sorted A-Z. */
async function loadWorkspaceOptions(ctx) {
    const workspaces = await rendleyRequest(ctx, 'GET', '/workspaces');
    if (!Array.isArray(workspaces)) {
        return [];
    }
    return workspaces
        .map((workspace) => ({
        name: workspace.name || workspace.id,
        value: workspace.id,
    }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
/** The project list shared by every project picker, newest names sorted A-Z. */
async function loadProjectOptions(ctx) {
    const workspaceId = await resolveWorkspaceId(ctx, '');
    const projects = await rendleyRequest(ctx, 'GET', `/projects?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!Array.isArray(projects)) {
        return [];
    }
    return projects
        .map((project) => ({
        name: project.name || project.id,
        value: project.id,
    }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
/** A locator, not an options list: in a workflow the project is created a step earlier. */
function projectLocator(displayOptions, spec) {
    return {
        displayName: 'Project',
        name: 'projectId',
        type: 'resourceLocator',
        default: { mode: spec.defaultMode ?? 'list', value: '' },
        required: spec.required,
        displayOptions,
        description: spec.description,
        modes: [
            {
                displayName: 'From List',
                name: 'list',
                type: 'list',
                typeOptions: { searchListMethod: 'searchProjects', searchable: true },
            },
            {
                displayName: 'By ID',
                name: 'id',
                type: 'string',
                placeholder: 'e.g. 1fdfc335-a483-4f8d-8466-8dae94175cc6',
            },
        ],
    };
}
/** The signed MP4 URL of a completed export: the fresh `output.url`, else the stored `storage_url`. */
function exportVideoUrl(job) {
    const output = job.output;
    if (output?.url) {
        return output.url;
    }
    return parseResultData(job.result_data)?.storage_url;
}
/** `error` arrives as a plain string on some responses and wrapped in `{ message }` on others. */
function jobFailureMessage(job, fallback) {
    const error = job.error;
    if (typeof error === 'string' && error !== '') {
        return error;
    }
    const wrapped = error?.message;
    if (typeof wrapped === 'string' && wrapped !== '') {
        return wrapped;
    }
    const lastMessage = job.last_message;
    if (typeof lastMessage === 'string' && lastMessage !== '') {
        return lastMessage;
    }
    return fallback;
}
/** Last path segment of a URL, used when no file name was given. */
function fileNameFromUrl(url) {
    const path = url.split('?')[0] ?? '';
    const last = path.split('/').filter(Boolean).pop();
    return last && last !== '' ? last : 'upload';
}
/** Register, PUT the bytes, confirm. The returned `media_id` and `file_hash` both work as AI media references. */
async function uploadBytes(ctx, projectId, data, fileName, mimeType, itemIndex) {
    if (data.byteLength === 0) {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), 'The file is empty, nothing to upload.', {
            itemIndex,
        });
    }
    if (data.byteLength > MULTIPART_THRESHOLD_BYTES) {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), `The file is ${Math.round(data.byteLength / 1024 / 1024)} MB. Files above ${MULTIPART_THRESHOLD_BYTES / 1024 / 1024} MB need Rendley's multipart upload, which this node does not support yet. Host the file on a URL and use Source > URL instead.`, { itemIndex });
    }
    const mediaId = (0, node_crypto_1.randomUUID)();
    const fileHash = (0, xxhash_1.xxhash64Hex)(new Uint8Array(data));
    const created = (await rendleyRequest(ctx, 'POST', `/projects/${encodeURIComponent(projectId)}/uploads`, {
        project_id: projectId,
        media_id: mediaId,
        file_hash: fileHash,
        file_size: data.byteLength,
        original_file_name: fileName,
        mime_type: mimeType,
        // The editor's hash sync deletes `library` rows the project JSON does not reference.
        role: 'pending',
    }));
    // No auth header: the Content-Type must match the one registered above.
    await ctx.helpers.httpRequest({
        method: 'PUT',
        url: created.presigned_url,
        body: data,
        headers: { 'Content-Type': mimeType },
        json: false,
    });
    await rendleyRequest(ctx, 'POST', `/projects/${encodeURIComponent(projectId)}/uploads/${encodeURIComponent(created.upload_id)}/complete`);
    return {
        media_id: mediaId,
        file_hash: fileHash,
        upload_id: created.upload_id,
        file_name: fileName,
        mime_type: mimeType,
        size: data.byteLength,
    };
}
const DEFAULT_POLL_INTERVAL_SECONDS = 10;
const MIN_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_POLL_TIMEOUT_MINUTES = 60;
/** Rendley switches to a multipart flow above this size; the editor uses the same figure. */
const MULTIPART_THRESHOLD_BYTES = 50 * 1024 * 1024;
/** Reads the per-operation wait ceiling, so long jobs can be given up on. */
function pollTimeoutMs(ctx, itemIndex) {
    const minutes = ctx.getNodeParameter('pollTimeout', itemIndex, DEFAULT_POLL_TIMEOUT_MINUTES);
    const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_POLL_TIMEOUT_MINUTES;
    return safe * 60 * 1000;
}
/** Reads the per-operation poll interval, clamped to the documented minimum. */
function pollIntervalMs(ctx, itemIndex) {
    const seconds = ctx.getNodeParameter('pollInterval', itemIndex, DEFAULT_POLL_INTERVAL_SECONDS);
    const safe = Number.isFinite(seconds) ? seconds : DEFAULT_POLL_INTERVAL_SECONDS;
    return Math.max(MIN_POLL_INTERVAL_SECONDS, safe) * 1000;
}
/**
 * Polls an agent job until it reaches a terminal state (completed/failed).
 */
async function pollAgentJob(ctx, jobId, intervalMs, timeoutMs) {
    const start = Date.now();
    while (true) {
        const job = await rendleyRequest(ctx, 'GET', `/agent/jobs/${encodeURIComponent(jobId)}`);
        const status = job?.status;
        if (status === 'completed' ||
            status === 'failed' ||
            status === 'canceled' ||
            status === 'cancelled') {
            return job;
        }
        // Automation jobs run non-interactively, so a pause means nobody can answer it.
        if (status === 'waiting_input') {
            const question = job?.interrupt?.summary;
            throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), `The Rendley agent paused job "${jobId}" to ask a question${question ? `: ${question}` : ''}. Rephrase the prompt so the agent does not need to ask, or answer it in the Rendley app.`);
        }
        if (Date.now() - start > timeoutMs) {
            throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), `The Rendley agent job "${jobId}" did not finish within ${timeoutMs / 1000} seconds (last status: ${status ?? 'unknown'}).`);
        }
        await (0, n8n_workflow_1.sleep)(intervalMs);
    }
}
/**
 * Polls a REST job until it reaches a terminal state
 * (completed/failed/canceled).
 */
async function pollApiJob(ctx, jobId, intervalMs, timeoutMs) {
    const start = Date.now();
    while (true) {
        const job = await rendleyRequest(ctx, 'GET', `/jobs/${jobId}`);
        const status = job?.status;
        if (status === 'completed' || status === 'failed' || status === 'canceled') {
            return job;
        }
        if (Date.now() - start > timeoutMs) {
            throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), `The Rendley job "${jobId}" did not finish within ${timeoutMs / 1000} seconds (last status: ${status ?? 'unknown'}).`);
        }
        await (0, n8n_workflow_1.sleep)(intervalMs);
    }
}
// ---------------------------------------------------------------------------
// Media resolution
// ---------------------------------------------------------------------------
/**
 * Resolves a media reference to a freshly presigned download URL.
 *
 * Resolved from the uploads listing, which carries `media_id`, `file_hash` and a
 * freshly presigned `storage_url` for every row. There is no per-media route in
 * the API.
 */
async function resolveMediaUrl(ctx, projectId, mediaId, fileHash) {
    if (fileHash) {
        try {
            const upload = (await rendleyRequest(ctx, 'GET', `/projects/${encodeURIComponent(projectId)}/uploads?hash=${encodeURIComponent(fileHash)}`));
            if (upload && typeof upload === 'object' && upload.storage_url) {
                return {
                    ...upload,
                    media_id: mediaId,
                    download_url: upload.storage_url,
                    resolved_via: 'uploads_by_hash',
                };
            }
        }
        catch (error) {
            if (errorStatus(error) !== '404') {
                throw asNodeError(ctx, error);
            }
        }
    }
    const uploads = await rendleyRequest(ctx, 'GET', `/projects/${encodeURIComponent(projectId)}/uploads`);
    if (!Array.isArray(uploads)) {
        return undefined;
    }
    const match = uploads.find((upload) => (fileHash !== undefined && upload.file_hash === fileHash) ||
        (mediaId !== undefined && upload.media_id === mediaId));
    if (!match) {
        return undefined;
    }
    return {
        ...match,
        media_id: match.media_id ?? mediaId,
        download_url: match.storage_url,
        resolved_via: 'uploads_list',
    };
}
// ---------------------------------------------------------------------------
// AI actions
// ---------------------------------------------------------------------------
/** Maps every `resource:operation` pair to its `POST /ai/{action}` path segment. */
const AI_ACTIONS = {
    'video:transcribe': 'transcribe',
    'video:dub': 'video-translate',
    'video:lipSync': 'lipsync',
    'video:isolateVoice': 'voice-isolation',
    'video:changeVoice': 'voice-changer',
    'video:removeBackground': 'remove-video-background',
    'video:generate': 'generate-video',
    // generate-video-avatar is commented out in the API ("avatar generation is not working").
    // Restore this pair, the operation and the getAvatars loader when it returns.
    'image:generate': 'generate-image',
    'image:upscale': 'upscale-image',
    'image:removeBackground': 'remove-image-background',
    'audio:textToSpeech': 'text-to-speech',
    'audio:generateMusic': 'generate-music',
    'audio:generateSoundEffect': 'generate-sound-effect',
};
/**
 * Extracts the job id from an AI enqueue response. `POST /ai/{action}` answers
 * with `{ data: { job_id } }`; older deployments answered with a bare string.
 */
function extractJobId(ctx, response, itemIndex) {
    if (typeof response === 'string' && response !== '') {
        return response;
    }
    if (response && typeof response === 'object') {
        const asObject = response;
        const candidate = (asObject.job_id ?? asObject.id);
        if (candidate) {
            return candidate;
        }
    }
    throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), 'Rendley did not return a job ID for this AI action.', { itemIndex });
}
/** Copies a value into `params` only when the user actually set it. */
function setParam(params, key, value) {
    if (value === undefined || value === null || value === '') {
        return;
    }
    params[key] = value;
}
/** Splits a comma or newline separated list into trimmed, non-empty entries. */
function splitList(raw) {
    return raw
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
}
/**
 * Merges the free-form "Additional Parameters" JSON escape hatch into the
 * params built from the typed fields.
 */
function mergeExtraParams(ctx, params, raw, itemIndex) {
    const trimmed = (raw ?? '').trim();
    if (trimmed === '') {
        return params;
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), 'Additional Parameters must be a JSON object, for example {"seed": 42}.', { itemIndex });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), 'Additional Parameters must be a JSON object, not an array or a primitive.', { itemIndex });
    }
    return { ...params, ...parsed };
}
// ---------------------------------------------------------------------------
// Edit prompt templates
// ---------------------------------------------------------------------------
/**
 * The Edit resource is a set of curated prompts for the same `POST /agent`
 * endpoint the Agent resource uses — the wording is what makes the results
 * repeatable, so each template names the exact SDK commands the agent should
 * reach for and the traps it should avoid.
 */
function buildEditPrompt(ctx, operation, itemIndex) {
    const options = ctx.getNodeParameter('editOptions', itemIndex, {});
    const instructions = (options.extraInstructions || '').trim();
    let prompt;
    switch (operation) {
        case 'removeFillerWords': {
            const silence = options.minSilenceSeconds ?? 0.6;
            prompt = [
                'Clean up the spoken audio in this project so it sounds tighter without sounding chopped.',
                '',
                '1. Call getTimelineClips and getClipData to find every video or audio clip that contains speech.',
                '2. Transcribe each of those clips (transcribe action, pass the clip_id) and wait for the word-level transcript before editing anything. Do not guess at timings.',
                '3. From the word timestamps, collect the ranges to cut: filler words and disfluencies ("um", "uh", "er", "ah", "mm", "like" used as filler, "you know", "I mean", "sort of", "kind of", "basically" and "actually" when they carry no meaning), stutters and repeated words, false starts, and abandoned sentences.',
                `4. Also collect every silence longer than ${silence} seconds. Trim each silence down to roughly ${silence} seconds rather than removing it entirely, so the delivery keeps its natural rhythm.`,
                '5. Express every cut as an explicit { start, end } range in seconds. Merge ranges that are less than 0.12 s apart, and pad each range inward by about 0.03 s so the cut lands in the silence instead of clipping the neighbouring word.',
                '6. Apply the cuts with removeClipSegments using space "trim" and the segments array. Edit the existing clips - do not delete and rebuild them, and do not touch clips that contain no speech.',
                '7. Never cut a word that carries meaning, never cut mid-word, and never remove a breath that makes a sentence readable.',
                '',
                'When you are done, report the number of ranges removed, the total seconds saved, and the new duration.',
            ].join('\n');
            break;
        }
        case 'autoEdit': {
            const targetDuration = options.targetDurationSeconds;
            const style = (options.style || '').trim();
            prompt = [
                `Do a full editorial pass on this project and turn the raw footage into a tight, watchable cut${targetDuration ? ` of about ${targetDuration} seconds` : ''}.`,
                '',
                '1. Call getTimelineClips, getClipData and getDisplaySize to understand what is on the timeline.',
                '2. Transcribe every clip that contains speech so you can edit against word-level timestamps instead of guessing.',
                '3. Decide the narrative: a hook in the first 3 seconds, the substance in the middle, and a clean ending. Everything that does not serve that arc is a candidate for removal.',
                '4. Remove dead air, filler words, false starts, tangents, and repeated takes with removeClipSegments and explicit { start, end } ranges. When a line was recorded more than once, keep the single best take and drop the rest.',
                '5. Re-order what remains so the story flows, using moveClip and setClipStartTime, and close every gap on the timeline so there is no black frame between clips.',
                '6. Add a transition only where there is a genuine scene change. Do not put transitions between cuts inside one continuous take.',
                '7. Balance the audio: run enhanceAudio on the speech clips, and if there is a music bed keep it well under the voice with setClipVolume.',
                '',
                'Do not add captions and do not change the aspect ratio unless explicitly asked. Report the cut list you applied and the final duration.',
                style ? `\nEditorial style to aim for: ${style}.` : '',
            ].join('\n');
            break;
        }
        case 'reframe': {
            const ratio = options.aspectRatio || '9:16';
            prompt = [
                `Reframe this project to ${ratio}.`,
                '',
                '1. Call getDisplaySize and getTimelineClips so you know the current canvas and every video clip on the timeline.',
                `2. For each video clip, call reframeClip with ratio "${ratio}". reframeClip runs subject detection and writes position keyframes that pan to keep the subject in frame, so it is the right tool here - do NOT use setClipCrop, which is a static, non-tracking crop.`,
                `3. Leave resizeCanvas at its default (true) on the FIRST reframeClip call: that resizes the project canvas to ${ratio} and cover-fits the clip. For every clip after that, pass resizeCanvas: false, because the canvas is already correct. Never emit setDisplaySize for ${ratio} yourself - reframeClip has already done it.`,
                '4. Keep useActiveSpeaker and usePose at their defaults so talking heads and people facing away are both tracked.',
                '5. reframeClip only works on video clips. For images, shapes, text, and motion clips, reposition or rescale them so they still sit inside the new canvas.',
                '6. After reframing, re-check every text, title, subtitle and logo element: anything now outside the canvas or inside the platform safe area must be moved or resized.',
                '',
                'Report the axis and keyframe count reframeClip returned for each clip, and note any clip that came back with axis NONE.',
            ].join('\n');
            break;
        }
        case 'addCaptions': {
            const language = (options.language || '').trim();
            const style = (options.captionStyle || '').trim();
            prompt = [
                'Add accurate, readable captions to this project.',
                '',
                '1. Call getTimelineClips and identify every clip that contains speech.',
                `2. Transcribe each speech clip${language ? ` in ${language}` : ''} so you have word-level timing: a text string plus a words array of { start, end, text, type }.`,
                '3. Call addSubtitles with startTime set to that speech clip\'s timeline start, subtitles.text mapped from the transcript text, and subtitles.words mapped straight from the transcript words with their original timings preserved. Use addSubtitles - do not emulate captions with plain text clips.',
                '4. Style the subtitles for mobile viewing: a heavy sans-serif, high contrast against the footage, a stroke or shadow so it survives bright frames, positioned in the lower third but clear of the platform UI safe area, and short enough that no line wraps awkwardly.',
                '5. Do not call setClipLeftTrim, setClipRightTrim or setTrimDuration on the subtitles clip - subtitle sizing is driven by its content. If the captions are wrong, call addSubtitles again with corrected data instead.',
                '',
                'Report how many caption cues you created and their overall time range.',
                style ? `\nCaption look to aim for: ${style}.` : '',
            ].join('\n');
            break;
        }
        case 'createShorts': {
            const count = options.shortCount ?? 3;
            const minSeconds = options.minSeconds ?? 20;
            const maxSeconds = options.maxSeconds ?? 60;
            const ratio = options.aspectRatio || '9:16';
            prompt = [
                `Find the ${count} strongest short-form moments in this project and build the best one into a finished ${ratio} short.`,
                '',
                '1. Transcribe every speech clip so you can score moments against the actual words and their timings.',
                `2. Score candidate moments on four things: a hook in the first 2 seconds, a self-contained idea that needs no earlier context, a clear payoff or punchline, and a natural place to stop. Each candidate must be between ${minSeconds} and ${maxSeconds} seconds long.`,
                `3. List all ${count} candidates up front with their exact start and end times in seconds and a one-line title for each, ranked best first.`,
                '4. Then build the top-ranked candidate on the timeline: keep only that range (setClipLeftTrim / setClipRightTrim, or removeClipSegments for everything outside it), close the gaps so the short starts at 0.',
                `5. Call reframeClip with ratio "${ratio}" on the video clip so the subject stays in frame and the canvas becomes vertical. Do not use setClipCrop.`,
                '6. Inside the kept range, remove filler words and dead air with removeClipSegments, then add word-level captions with addSubtitles.',
                '',
                'Report every candidate\'s time range in your final message so the remaining shorts can be produced in follow-up runs on the same thread ID.',
            ].join('\n');
            break;
        }
        case 'customPrompt':
            prompt = ctx.getNodeParameter('prompt', itemIndex);
            break;
        default:
            throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), `The operation "${operation}" is not supported for resource "edit".`, { itemIndex });
    }
    if (instructions !== '' && operation !== 'customPrompt') {
        prompt = `${prompt}\n\nAdditional instructions from the user: ${instructions}`;
    }
    return prompt;
}
// ---------------------------------------------------------------------------
// Reusable property option lists
// ---------------------------------------------------------------------------
const exportSettingsOptions = [
    {
        displayName: 'Codec',
        name: 'codec',
        type: 'options',
        default: 'h264',
        options: [
            { name: 'H.264', value: 'h264' },
            { name: 'VP8', value: 'vp8' },
        ],
        description: 'Video codec used for the exported file',
    },
    {
        displayName: 'Quality',
        name: 'quality',
        type: 'options',
        default: 'high',
        options: [
            { name: 'High', value: 'high' },
            { name: 'Low', value: 'low' },
            { name: 'Medium', value: 'medium' },
        ],
        description: 'Encoding quality of the exported video',
    },
    {
        displayName: 'Target Resolution',
        name: 'target_resolution',
        type: 'options',
        default: '1080p',
        options: [
            { name: '1080p', value: '1080p' },
            { name: '4K', value: '4K' },
            { name: '720p', value: '720p' },
        ],
        description: 'Output resolution of the exported video',
    },
];
const aspectRatioOptions = [
    { name: '1:1 (Square)', value: '1:1' },
    { name: '16:9 (Wide)', value: '16:9' },
    { name: '4:5 (Portrait Feed)', value: '4:5' },
    { name: '9:16 (Reels, TikTok, Shorts)', value: '9:16' },
];
/** Every resource/operation pair that enqueues an AI job. */
const AI_RESOURCES = ['audio', 'image', 'video'];
const AI_OPERATIONS = [
    'changeVoice',
    'dub',
    'generate',
    'generateMusic',
    'generateSoundEffect',
    'isolateVoice',
    'lipSync',
    'removeBackground',
    'textToSpeech',
    'transcribe',
    'upscale',
];
/**
 * Operations that take a single source media reference. The API accepts the
 * same `params.media` value for all of them: a public URL, a media ID, or the
 * file hash of an upload in the project.
 */
const SINGLE_FILE_OPERATIONS = {
    audio: [],
    image: ['removeBackground', 'upscale'],
    video: ['changeVoice', 'dub', 'isolateVoice', 'removeBackground', 'transcribe'],
};
const extraParamsProperty = {
    displayName: 'Additional Parameters (JSON)',
    name: 'extraParams',
    type: 'json',
    // An empty string lints as invalid JSON in the editor; `{}` merges to nothing.
    default: '{}',
    displayOptions: { show: { resource: AI_RESOURCES, operation: AI_OPERATIONS } },
    description: 'Extra model-specific parameters merged into the request. Call GET /v1/ai/models/{model_id} to see each model\'s schema.',
};
// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------
class Rendley {
    constructor() {
        this.description = {
            displayName: 'Rendley',
            name: 'rendley',
            icon: { light: 'file:rendley.svg', dark: 'file:rendley.dark.svg' },
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
            description: 'Generate and edit videos with Rendley: prompt-to-video, AI media, projects, and MP4 export',
            defaults: {
                name: 'Rendley',
            },
            usableAsTool: true,
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            credentials: [
                {
                    name: 'rendleyApi',
                    required: true,
                },
            ],
            properties: [
                // ----- Resource -----
                {
                    displayName: 'Resource',
                    name: 'resource',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        { name: 'Agent', value: 'agent' },
                        { name: 'Audio', value: 'audio' },
                        { name: 'Brand Kit', value: 'brandKit' },
                        { name: 'Edit', value: 'edit' },
                        { name: 'Export', value: 'export' },
                        { name: 'Image', value: 'image' },
                        { name: 'Media', value: 'media' },
                        { name: 'Project', value: 'project' },
                        { name: 'Video', value: 'video' },
                    ],
                    default: 'agent',
                },
                // ----- Agent operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['agent'] } },
                    options: [
                        {
                            name: 'Cancel Job',
                            value: 'cancelJob',
                            action: 'Cancel an agent job',
                            description: 'Stop an agent job that is still running',
                        },
                        {
                            name: 'Get Job',
                            value: 'getJob',
                            action: 'Get an agent job',
                            description: 'Read an agent job status without waiting, for workflows that poll on their own',
                        },
                        {
                            name: 'Prompt to Video',
                            value: 'promptToVideo',
                            action: 'Generate a video from a prompt',
                            description: 'Submit a prompt to the Rendley agent, which edits or creates a project',
                        },
                    ],
                    default: 'promptToVideo',
                },
                // ----- Edit operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['edit'] } },
                    options: [
                        {
                            name: 'Add Captions',
                            value: 'addCaptions',
                            action: 'Add captions to a project',
                            description: 'Transcribe the speech and burn word-level captions into the timeline',
                        },
                        {
                            name: 'Auto Edit',
                            value: 'autoEdit',
                            action: 'Auto edit a project',
                            description: 'Let the agent cut the raw footage down to a tight, watchable edit',
                        },
                        {
                            name: 'Create Shorts',
                            value: 'createShorts',
                            action: 'Create shorts from a project',
                            description: 'Find the strongest short-form moments and build the best one',
                        },
                        {
                            name: 'Custom Prompt',
                            value: 'customPrompt',
                            action: 'Run a custom edit prompt',
                            description: 'Send your own natural-language editing instructions to the agent',
                        },
                        {
                            name: 'Reframe',
                            value: 'reframe',
                            action: 'Reframe a project',
                            description: 'Re-crop every video clip to a new aspect ratio with subject tracking',
                        },
                        {
                            name: 'Remove Filler Words',
                            value: 'removeFillerWords',
                            action: 'Remove filler words from a project',
                            description: 'Transcribe the speech, then cut fillers, stutters, and dead air',
                        },
                    ],
                    default: 'removeFillerWords',
                },
                // ----- Video operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['video'] } },
                    options: [
                        {
                            name: 'Change Voice',
                            value: 'changeVoice',
                            action: 'Change the voice in a video',
                            description: 'Replace the speaker voice while keeping timing and delivery',
                        },
                        {
                            name: 'Dub',
                            value: 'dub',
                            action: 'Dub a video into another language',
                            description: 'Translate the spoken content and dub it back in the original voice',
                        },
                        {
                            name: 'Generate',
                            value: 'generate',
                            action: 'Generate a video',
                            description: 'Generate a video clip from a text prompt',
                        },
                        {
                            name: 'Isolate Voice',
                            value: 'isolateVoice',
                            action: 'Isolate the voice in a video',
                            description: 'Strip background noise and leave only the clean speech',
                        },
                        {
                            name: 'Lip Sync',
                            value: 'lipSync',
                            action: 'Lip sync a video',
                            description: 'Re-sync the lip movement in a video to a separate audio track',
                        },
                        {
                            name: 'Remove Background',
                            value: 'removeBackground',
                            action: 'Remove a video background',
                            description: 'Cut the subject out of a video frame by frame',
                        },
                        {
                            name: 'Transcribe',
                            value: 'transcribe',
                            action: 'Transcribe a video',
                            description: 'Convert speech to text with word-level timestamps',
                        },
                    ],
                    default: 'transcribe',
                },
                // ----- Image operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['image'] } },
                    options: [
                        {
                            name: 'Generate',
                            value: 'generate',
                            action: 'Generate an image',
                            description: 'Generate or edit an image from a text prompt',
                        },
                        {
                            name: 'Remove Background',
                            value: 'removeBackground',
                            action: 'Remove an image background',
                            description: 'Cut the subject out of an image onto transparency',
                        },
                        {
                            name: 'Upscale',
                            value: 'upscale',
                            action: 'Upscale an image',
                            description: 'Increase image resolution with AI super-resolution',
                        },
                    ],
                    default: 'generate',
                },
                // ----- Audio operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['audio'] } },
                    options: [
                        {
                            name: 'Generate Music',
                            value: 'generateMusic',
                            action: 'Generate music',
                            description: 'Generate a music bed from a text prompt',
                        },
                        {
                            name: 'Generate Sound Effect',
                            value: 'generateSoundEffect',
                            action: 'Generate a sound effect',
                            description: 'Generate a short sound effect from a text prompt',
                        },
                        {
                            name: 'Text to Speech',
                            value: 'textToSpeech',
                            action: 'Generate speech from text',
                            description: 'Turn a script into a voiceover with a chosen voice',
                        },
                    ],
                    default: 'textToSpeech',
                },
                // ----- Export operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['export'] } },
                    options: [
                        {
                            name: 'Estimate Cost',
                            value: 'estimateCost',
                            action: 'Estimate the credit cost of an export',
                            description: 'Estimate how many credits an export would consume',
                        },
                        {
                            name: 'Get Job',
                            value: 'getJob',
                            action: 'Get an export job',
                            description: 'Retrieve the status and result of an export job',
                        },
                        {
                            name: 'Render Video',
                            value: 'render',
                            action: 'Render a project to MP4',
                            description: 'Export a project to an MP4 video file',
                        },
                    ],
                    default: 'render',
                },
                // ----- Media operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['media'] } },
                    options: [
                        {
                            name: 'Get Download URL',
                            value: 'getDownloadUrl',
                            action: 'Get a media download URL',
                            description: 'Resolve a media ID or file hash to a presigned download URL',
                        },
                        {
                            name: 'Upload',
                            value: 'upload',
                            action: 'Upload a file to a project',
                            description: 'Put a file from a previous node or a URL into the project library',
                        },
                        {
                            name: 'List',
                            value: 'list',
                            action: 'List project media',
                            description: 'List every upload in a project with a fresh download URL',
                        },
                    ],
                    default: 'getDownloadUrl',
                },
                // ----- Brand Kit operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['brandKit'] } },
                    options: [
                        {
                            name: 'Get',
                            value: 'get',
                            action: 'Get a brand kit',
                            description: 'Retrieve the brand kit for a workspace',
                        },
                        {
                            name: 'Import From Website',
                            value: 'importFromWebsite',
                            action: 'Import a brand kit from a website',
                            description: 'Extract colors, fonts, and logos from a public website',
                        },
                    ],
                    default: 'get',
                },
                // ----- Project operations -----
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: { show: { resource: ['project'] } },
                    options: [
                        {
                            name: 'Create',
                            value: 'create',
                            action: 'Create a project',
                            description: 'Create a new Rendley project',
                        },
                        {
                            name: 'Delete',
                            value: 'delete',
                            action: 'Delete a project',
                            description: 'Delete a Rendley project',
                        },
                        {
                            name: 'Get',
                            value: 'get',
                            action: 'Get a project',
                            description: 'Retrieve a single Rendley project',
                        },
                        {
                            name: 'List',
                            value: 'list',
                            action: 'List projects',
                            description: 'List Rendley projects',
                        },
                    ],
                    default: 'create',
                },
                // ===== Agent > Prompt to Video =====
                {
                    displayName: 'Prompt',
                    name: 'prompt',
                    type: 'string',
                    required: true,
                    typeOptions: { rows: 4 },
                    default: '',
                    displayOptions: { show: { resource: ['agent'], operation: ['promptToVideo'] } },
                    description: 'Describe the video you want Rendley to create, or the edits to apply',
                },
                projectLocator({ show: { resource: ['agent'], operation: ['promptToVideo'] } }, {
                    defaultMode: 'id',
                    description: 'Existing project to edit. Leave empty to let Rendley create a project.',
                }),
                // ===== Edit > shared inputs =====
                projectLocator({ show: { resource: ['edit'] } }, { required: true, description: 'The project to edit' }),
                {
                    displayName: 'Prompt',
                    name: 'prompt',
                    type: 'string',
                    required: true,
                    typeOptions: { rows: 5 },
                    default: '',
                    displayOptions: { show: { resource: ['edit'], operation: ['customPrompt'] } },
                    description: 'Your own editing instructions, sent to the Rendley agent verbatim',
                },
                {
                    displayName: 'Options',
                    name: 'editOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: {
                        show: {
                            resource: ['edit'],
                            operation: ['addCaptions', 'autoEdit', 'createShorts', 'reframe', 'removeFillerWords'],
                        },
                    },
                    options: [
                        {
                            displayName: 'Additional Instructions',
                            name: 'extraInstructions',
                            type: 'string',
                            typeOptions: { rows: 3 },
                            default: '',
                            description: 'Extra guidance appended to the generated prompt',
                        },
                        {
                            displayName: 'Aspect Ratio',
                            name: 'aspectRatio',
                            type: 'options',
                            default: '9:16',
                            options: aspectRatioOptions,
                            description: 'Target aspect ratio for reframing',
                        },
                        {
                            displayName: 'Caption Style',
                            name: 'captionStyle',
                            type: 'string',
                            default: '',
                            placeholder: 'bold white text with a black stroke, centred lower third',
                            description: 'How the captions should look',
                        },
                        {
                            displayName: 'Editorial Style',
                            name: 'style',
                            type: 'string',
                            default: '',
                            placeholder: 'punchy social cut',
                            description: 'Editorial tone the auto edit should aim for',
                        },
                        {
                            displayName: 'Language',
                            name: 'language',
                            type: 'string',
                            default: '',
                            placeholder: 'English',
                            description: 'Language the captions should be written in',
                        },
                        {
                            displayName: 'Maximum Length (Seconds)',
                            name: 'maxSeconds',
                            type: 'number',
                            default: 60,
                            typeOptions: { minValue: 5 },
                            description: 'Longest a generated short may be',
                        },
                        {
                            displayName: 'Minimum Length (Seconds)',
                            name: 'minSeconds',
                            type: 'number',
                            default: 20,
                            typeOptions: { minValue: 3 },
                            description: 'Shortest a generated short may be',
                        },
                        {
                            displayName: 'Minimum Silence (Seconds)',
                            name: 'minSilenceSeconds',
                            type: 'number',
                            default: 0.6,
                            typeOptions: { minValue: 0.1, numberPrecision: 2 },
                            description: 'Pauses longer than this are trimmed back to this length',
                        },
                        {
                            displayName: 'Number of Shorts',
                            name: 'shortCount',
                            type: 'number',
                            default: 3,
                            typeOptions: { minValue: 1, maxValue: 10 },
                            description: 'How many candidate shorts the agent should identify',
                        },
                        {
                            displayName: 'Target Duration (Seconds)',
                            name: 'targetDurationSeconds',
                            type: 'number',
                            default: 60,
                            typeOptions: { minValue: 5 },
                            description: 'Roughly how long the finished edit should be',
                        },
                    ],
                },
                // ===== Agent + Edit > shared agent plumbing =====
                {
                    displayName: 'Files',
                    name: 'files',
                    type: 'fixedCollection',
                    typeOptions: { multipleValues: true },
                    default: {},
                    placeholder: 'Add File',
                    displayOptions: { show: { resource: ['agent', 'edit'] } },
                    description: 'Media files to make available to the agent',
                    options: [
                        {
                            name: 'file',
                            displayName: 'File',
                            values: [
                                {
                                    displayName: 'URL',
                                    name: 'url',
                                    type: 'string',
                                    default: '',
                                    description: 'Publicly accessible URL of the media file',
                                },
                                {
                                    displayName: 'Name',
                                    name: 'name',
                                    type: 'string',
                                    default: '',
                                    description: 'Optional display name for the file',
                                },
                            ],
                        },
                    ],
                },
                {
                    displayName: 'Render MP4 After Edit',
                    name: 'renderAfter',
                    type: 'boolean',
                    default: false,
                    displayOptions: { show: { resource: ['agent', 'edit'] } },
                    description: 'Whether to also export an MP4 after the agent finishes editing',
                },
                {
                    displayName: 'Export Settings',
                    name: 'renderSettings',
                    type: 'collection',
                    placeholder: 'Add Setting',
                    default: {},
                    displayOptions: {
                        show: { resource: ['agent', 'edit'], renderAfter: [true] },
                    },
                    options: exportSettingsOptions,
                },
                {
                    displayName: 'Additional Options',
                    name: 'additionalOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: { show: { resource: ['agent', 'edit'] } },
                    options: [
                        {
                            displayName: 'Thread ID',
                            name: 'threadId',
                            type: 'string',
                            default: '',
                            description: 'Conversation thread to continue. Requires a Project ID to be set as well.',
                        },
                    ],
                },
                // ===== AI resources > shared inputs =====
                projectLocator({ show: { resource: AI_RESOURCES, operation: AI_OPERATIONS } }, { required: true, description: 'Project the generated media is stored in' }),
                {
                    displayName: 'Model Name or ID',
                    name: 'modelId',
                    type: 'options',
                    typeOptions: {
                        loadOptionsMethod: 'getModels',
                        loadOptionsDependsOn: ['resource', 'operation'],
                    },
                    default: '',
                    displayOptions: { show: { resource: AI_RESOURCES, operation: AI_OPERATIONS } },
                    description: 'Model to run this action with. Leave on Default to let Rendley pick. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
                },
                // ===== AI resources > single source file =====
                {
                    displayName: 'File',
                    name: 'mediaFile',
                    type: 'string',
                    required: true,
                    default: '',
                    displayOptions: {
                        show: {
                            resource: ['image', 'video'],
                            operation: ['changeVoice', 'dub', 'isolateVoice', 'removeBackground', 'transcribe', 'upscale'],
                        },
                    },
                    description: 'Source media: a public URL, or the media ID or file hash of an upload in this project',
                },
                // ===== Video > Lip Sync =====
                {
                    displayName: 'Video File',
                    name: 'videoFile',
                    type: 'string',
                    required: true,
                    default: '',
                    displayOptions: { show: { resource: ['video'], operation: ['lipSync'] } },
                    description: 'Video to re-sync: a public URL, or the media ID or file hash of an upload in this project',
                },
                {
                    displayName: 'Audio File',
                    name: 'audioFile',
                    type: 'string',
                    required: true,
                    default: '',
                    displayOptions: { show: { resource: ['video'], operation: ['lipSync'] } },
                    description: 'Audio the lips should follow: a public URL, or the media ID or file hash of an upload in this project',
                },
                // ===== Video > Dub =====
                {
                    displayName: 'Output Language Name or ID',
                    name: 'outputLanguage',
                    type: 'options',
                    typeOptions: { loadOptionsMethod: 'getTranslateLanguages' },
                    required: true,
                    default: '',
                    displayOptions: { show: { resource: ['video'], operation: ['dub'] } },
                    description: 'Language to dub into. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
                },
                // ===== Voice pickers (Change Voice + Text to Speech) =====
                {
                    displayName: 'Voice Name or ID',
                    name: 'voiceId',
                    type: 'options',
                    typeOptions: { loadOptionsMethod: 'getVoices' },
                    required: true,
                    default: '',
                    displayOptions: {
                        show: { resource: ['audio', 'video'], operation: ['changeVoice', 'textToSpeech'] },
                    },
                    description: 'Voice to speak with. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
                },
                // ===== Prompt-driven AI operations =====
                {
                    displayName: 'Prompt',
                    name: 'aiPrompt',
                    type: 'string',
                    required: true,
                    typeOptions: { rows: 4 },
                    default: '',
                    displayOptions: {
                        show: {
                            resource: AI_RESOURCES,
                            operation: ['generate', 'generateMusic', 'generateSoundEffect', 'textToSpeech'],
                        },
                    },
                    description: 'Text prompt for the model. For Text to Speech this is the script that gets spoken.',
                },
                // ===== Per-operation option collections =====
                {
                    displayName: 'Options',
                    name: 'aiOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: { show: { resource: ['video'], operation: ['transcribe'] } },
                    options: [
                        {
                            displayName: 'End Time (Seconds)',
                            name: 'end_time',
                            type: 'number',
                            default: 0,
                            typeOptions: { minValue: 0 },
                            description: 'Stop transcribing at this offset',
                        },
                        {
                            displayName: 'Start Time (Seconds)',
                            name: 'start_time',
                            type: 'number',
                            default: 0,
                            typeOptions: { minValue: 0 },
                            description: 'Start transcribing at this offset',
                        },
                    ],
                },
                {
                    displayName: 'Options',
                    name: 'aiOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: { show: { resource: ['video'], operation: ['dub'] } },
                    options: [
                        {
                            displayName: 'Mode',
                            name: 'mode',
                            type: 'options',
                            default: 'precision',
                            options: [
                                { name: 'Precision', value: 'precision' },
                                { name: 'Speed', value: 'speed' },
                            ],
                            description: 'Trade dubbing accuracy against turnaround time',
                        },
                    ],
                },
                {
                    displayName: 'Options',
                    name: 'aiOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: { show: { resource: ['video'], operation: ['generate'] } },
                    options: [
                        {
                            displayName: 'Aspect Ratio',
                            name: 'aspect_ratio',
                            type: 'string',
                            default: '',
                            placeholder: '9:16',
                            description: 'Aspect ratio of the generated video, if the model supports it',
                        },
                        {
                            displayName: 'Duration (Seconds)',
                            name: 'duration',
                            type: 'number',
                            default: 6,
                            typeOptions: { minValue: 1 },
                            description: 'Length of the generated clip, if the model supports it',
                        },
                        {
                            displayName: 'Start Image URL',
                            name: 'start_image',
                            type: 'string',
                            default: '',
                            description: 'Image the generated video should start from. Sent as start_image, which the API maps onto the chosen model\'s first-frame field (e.g. kling-v2.6\'s start_image, veo/seedance\'s image). For models with a different native field (e.g. hailuo-2.3\'s first_frame_image), set it via Additional Parameters instead.',
                        },
                        {
                            displayName: 'Resolution',
                            name: 'resolution',
                            type: 'string',
                            default: '',
                            placeholder: '1080p',
                            description: 'Output resolution, if the model supports it',
                        },
                    ],
                },
                {
                    displayName: 'Options',
                    name: 'aiOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: { show: { resource: ['image'], operation: ['generate'] } },
                    options: [
                        {
                            displayName: 'Aspect Ratio',
                            name: 'aspect_ratio',
                            type: 'string',
                            default: '',
                            placeholder: '1:1',
                            description: 'Aspect ratio of the generated image',
                        },
                        {
                            displayName: 'Reference Image URLs',
                            name: 'image_inputs',
                            type: 'string',
                            default: '',
                            description: 'Comma-separated image URLs to transform or use as reference, for models that accept them',
                        },
                    ],
                },
                {
                    displayName: 'Options',
                    name: 'aiOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: { show: { resource: ['image'], operation: ['upscale'] } },
                    options: [
                        {
                            displayName: 'Scale',
                            name: 'scale',
                            type: 'options',
                            default: 2,
                            options: [
                                { name: '2x', value: 2 },
                                { name: '4x', value: 4 },
                            ],
                            description: 'How much bigger the upscaled image should be',
                        },
                    ],
                },
                {
                    displayName: 'Options',
                    name: 'aiOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: { show: { resource: ['audio'], operation: ['textToSpeech'] } },
                    options: [
                        {
                            displayName: 'Similarity Boost',
                            name: 'similarity_boost',
                            type: 'number',
                            default: 0.75,
                            typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
                            description: 'How closely the output should match the reference voice',
                        },
                        {
                            displayName: 'Speed',
                            name: 'speed',
                            type: 'number',
                            default: 1,
                            typeOptions: { minValue: 0.7, maxValue: 1.2, numberPrecision: 2 },
                            description: 'Speaking rate, where 1 is the voice default',
                        },
                        {
                            displayName: 'Stability',
                            name: 'stability',
                            type: 'number',
                            default: 0.5,
                            typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
                            description: 'Higher values make the delivery more consistent and less expressive',
                        },
                        {
                            displayName: 'Style',
                            name: 'style',
                            type: 'number',
                            default: 0,
                            typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
                            description: 'How much stylistic exaggeration to apply',
                        },
                        {
                            displayName: 'Use Speaker Boost',
                            name: 'use_speaker_boost',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to sharpen similarity to the reference speaker',
                        },
                    ],
                },
                {
                    displayName: 'Options',
                    name: 'aiOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    displayOptions: {
                        show: { resource: ['audio'], operation: ['generateMusic', 'generateSoundEffect'] },
                    },
                    options: [
                        {
                            displayName: 'Duration (Seconds)',
                            name: 'duration_seconds',
                            type: 'number',
                            default: 10,
                            typeOptions: { minValue: 0.5, numberPrecision: 1 },
                            description: 'Length of the generated audio',
                        },
                    ],
                },
                extraParamsProperty,
                // ===== AI resources > execution controls =====
                {
                    displayName: 'Estimate Cost Only',
                    name: 'estimateCostOnly',
                    type: 'boolean',
                    default: false,
                    displayOptions: { show: { resource: AI_RESOURCES, operation: AI_OPERATIONS } },
                    description: 'Whether to only estimate the credit cost instead of running the action. Nothing is generated and no credits are spent.',
                },
                // ===== Export > Render / Estimate Cost =====
                projectLocator({ show: { resource: ['export'], operation: ['render', 'estimateCost'] } }, { required: true, description: 'The project to export' }),
                {
                    displayName: 'Export Settings',
                    name: 'settings',
                    type: 'collection',
                    placeholder: 'Add Setting',
                    default: {},
                    displayOptions: {
                        show: { resource: ['export'], operation: ['render', 'estimateCost'] },
                    },
                    options: exportSettingsOptions,
                },
                // ===== Agent > Get Job / Cancel Job =====
                {
                    displayName: 'Job ID',
                    name: 'agentJobId',
                    type: 'string',
                    required: true,
                    default: '',
                    displayOptions: { show: { resource: ['agent'], operation: ['cancelJob', 'getJob'] } },
                    description: 'The agent job to read or cancel',
                },
                // ===== Media > Upload =====
                {
                    displayName: 'Source',
                    name: 'uploadSource',
                    type: 'options',
                    options: [
                        {
                            name: 'Binary Data',
                            value: 'binary',
                            description: 'A file produced by an earlier node, e.g. Google Drive or an email attachment',
                        },
                        {
                            name: 'URL',
                            value: 'url',
                            description: 'A publicly reachable file URL',
                        },
                    ],
                    default: 'binary',
                    displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
                    description: 'Where the file comes from',
                },
                {
                    displayName: 'Input Binary Field',
                    name: 'binaryPropertyName',
                    type: 'string',
                    required: true,
                    default: 'data',
                    displayOptions: {
                        show: { resource: ['media'], operation: ['upload'], uploadSource: ['binary'] },
                    },
                    description: 'Name of the binary field holding the file',
                },
                {
                    displayName: 'File URL',
                    name: 'uploadUrl',
                    type: 'string',
                    required: true,
                    default: '',
                    displayOptions: {
                        show: { resource: ['media'], operation: ['upload'], uploadSource: ['url'] },
                    },
                    description: 'Publicly reachable URL of the file to upload',
                },
                {
                    displayName: 'File Name',
                    name: 'uploadFileName',
                    type: 'string',
                    default: '',
                    displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
                    description: 'Name stored in the project library. Defaults to the source file name.',
                },
                // ===== Export > Get Job =====
                {
                    displayName: 'Job ID',
                    name: 'jobId',
                    type: 'string',
                    required: true,
                    default: '',
                    displayOptions: { show: { resource: ['export'], operation: ['getJob'] } },
                    description: 'The export job to retrieve',
                },
                // ===== Media =====
                projectLocator({ show: { resource: ['media'] } }, { required: true, description: 'Project the media belongs to' }),
                {
                    displayName: 'Media ID',
                    name: 'mediaId',
                    type: 'string',
                    default: '',
                    displayOptions: { show: { resource: ['media'], operation: ['getDownloadUrl'] } },
                    description: 'The media ID returned by an AI job or an upload. Leave empty if you only have the file hash.',
                },
                {
                    displayName: 'File Hash',
                    name: 'fileHash',
                    type: 'string',
                    default: '',
                    displayOptions: { show: { resource: ['media'], operation: ['getDownloadUrl'] } },
                    description: 'The file_hash returned by an AI job. Used as a fallback when the media ID cannot be resolved.',
                },
                {
                    displayName: 'Rendley download URLs are presigned and expire after about 3 hours. Copy the file to your own storage in the same workflow rather than saving the URL for later.',
                    name: 'mediaUrlNotice',
                    type: 'notice',
                    default: '',
                    displayOptions: { show: { resource: ['media'] } },
                },
                // ===== Brand Kit =====
                {
                    displayName: 'Workspace Name or ID',
                    name: 'brandKitWorkspaceId',
                    type: 'options',
                    typeOptions: { loadOptionsMethod: 'getWorkspaces' },
                    required: true,
                    default: '',
                    displayOptions: { show: { resource: ['brandKit'] } },
                    description: 'Workspace whose brand kit you want to read or fill. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
                },
                {
                    displayName: 'Website URL',
                    name: 'websiteUrl',
                    type: 'string',
                    required: true,
                    default: '',
                    placeholder: 'https://example.com',
                    displayOptions: { show: { resource: ['brandKit'], operation: ['importFromWebsite'] } },
                    description: 'Public website to extract colors, fonts, and logos from',
                },
                // ===== Project > Create =====
                {
                    displayName: 'Name',
                    name: 'name',
                    type: 'string',
                    required: true,
                    default: '',
                    displayOptions: { show: { resource: ['project'], operation: ['create'] } },
                    description: 'Name of the new project',
                },
                {
                    displayName: 'Template ID',
                    name: 'templateId',
                    type: 'string',
                    default: '',
                    displayOptions: { show: { resource: ['project'], operation: ['create'] } },
                    description: 'Optional template to base the project on',
                },
                // ===== Project > Workspace filter (create + list) =====
                {
                    displayName: 'Workspace Name or ID',
                    name: 'workspaceId',
                    type: 'options',
                    typeOptions: { loadOptionsMethod: 'getWorkspacesOrDefault' },
                    default: '',
                    displayOptions: { show: { resource: ['project'], operation: ['create', 'list'] } },
                    description: 'Workspace to scope the project to. Leave on Default Workspace to use the first one. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
                },
                // ===== Project > Get / Delete =====
                projectLocator({ show: { resource: ['project'], operation: ['get', 'delete'] } }, { required: true, description: 'The project to operate on' }),
                {
                    displayName: 'Simplify',
                    name: 'simplify',
                    type: 'boolean',
                    default: true,
                    displayOptions: { show: { resource: ['project'], operation: ['get'] } },
                    description: 'Whether to return a simplified version of the response instead of the raw data (leaves out the full editor document)',
                },
                // ===== Shared: Wait for Completion =====
                {
                    displayName: 'Wait for Completion',
                    name: 'waitForCompletion',
                    type: 'boolean',
                    default: true,
                    displayOptions: {
                        show: { resource: ['agent', 'export'], operation: ['promptToVideo', 'render'] },
                    },
                    description: 'Whether to wait until the job finishes before continuing',
                },
                {
                    displayName: 'Wait for Completion',
                    name: 'waitForCompletion',
                    type: 'boolean',
                    default: true,
                    displayOptions: { show: { resource: ['edit'] } },
                    description: 'Whether to wait until the job finishes before continuing',
                },
                {
                    displayName: 'Wait for Completion',
                    name: 'waitForCompletion',
                    type: 'boolean',
                    default: true,
                    displayOptions: {
                        show: { resource: AI_RESOURCES, operation: AI_OPERATIONS, estimateCostOnly: [false] },
                    },
                    description: 'Whether to wait until the job finishes and resolve a download URL for the result',
                },
                {
                    displayName: 'Poll Interval (Seconds)',
                    name: 'pollInterval',
                    type: 'number',
                    default: DEFAULT_POLL_INTERVAL_SECONDS,
                    typeOptions: { minValue: MIN_POLL_INTERVAL_SECONDS },
                    displayOptions: {
                        show: {
                            resource: ['agent', 'audio', 'edit', 'export', 'image', 'video'],
                            waitForCompletion: [true],
                        },
                    },
                    description: 'How often to check whether the job has finished',
                },
                {
                    displayName: 'Timeout (Minutes)',
                    name: 'pollTimeout',
                    type: 'number',
                    default: DEFAULT_POLL_TIMEOUT_MINUTES,
                    typeOptions: { minValue: 1 },
                    displayOptions: {
                        show: {
                            resource: ['agent', 'audio', 'edit', 'export', 'image', 'video'],
                            waitForCompletion: [true],
                        },
                    },
                    description: 'Stop waiting after this long and fail the item',
                },
            ],
        };
        this.methods = {
            listSearch: {
                /** Backs every project resource locator. */
                async searchProjects(filter) {
                    const needle = (filter ?? '').toLowerCase();
                    const projects = await loadProjectOptions(this);
                    return {
                        results: projects
                            .filter((project) => project.name.toLowerCase().includes(needle))
                            .map((project) => ({ name: project.name, value: project.value })),
                    };
                },
            },
            loadOptions: {
                /** Voices for Text to Speech and Change Voice. */
                async getVoices() {
                    const voices = await rendleyRequest(this, 'GET', '/ai/text-to-speech/voices?limit=100');
                    if (!Array.isArray(voices)) {
                        return [];
                    }
                    return voices
                        .map((voice) => ({
                        name: voice.name || voice.id,
                        value: voice.id,
                    }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                },
                /** Target languages for Dub. */
                async getTranslateLanguages() {
                    const languages = await rendleyRequest(this, 'GET', '/ai/video-translate/languages');
                    if (!Array.isArray(languages)) {
                        return [];
                    }
                    return languages
                        .map((language) => ({
                        name: language.name || language.id,
                        value: language.id,
                    }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                },
                /** Models available for the AI action the node is currently set to. */
                async getModels() {
                    const resource = this.getCurrentNodeParameter('resource');
                    const operation = this.getCurrentNodeParameter('operation');
                    const action = AI_ACTIONS[`${resource}:${operation}`];
                    if (!action) {
                        return [];
                    }
                    const tools = await rendleyRequest(this, 'GET', '/ai/tools');
                    // The catalog spells actions with underscores, the endpoints with hyphens.
                    const catalogAction = action.replace(/-/g, '_');
                    const tool = tools?.find((entry) => entry.action === catalogAction);
                    const models = tool?.models ?? [];
                    return [
                        { name: 'Default', value: '' },
                        ...models.map((model) => ({
                            name: model.name || model.id,
                            value: model.id,
                            description: model.description,
                        })),
                    ];
                },
                /** Workspaces, for operations that require one. */
                async getWorkspaces() {
                    return loadWorkspaceOptions(this);
                },
                /** Workspaces plus the empty choice that falls back to the first one. */
                async getWorkspacesOrDefault() {
                    return [
                        { name: 'Default Workspace', value: '' },
                        ...(await loadWorkspaceOptions(this)),
                    ];
                },
            },
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        const resource = this.getNodeParameter('resource', 0);
        const operation = this.getNodeParameter('operation', 0);
        const aiAction = AI_ACTIONS[`${resource}:${operation}`];
        for (let i = 0; i < items.length; i++) {
            try {
                let responseData = {};
                if ((resource === 'agent' && operation === 'promptToVideo') || resource === 'edit') {
                    // -------------------------------------------------------------
                    // Agent > Prompt to Video, and every Edit operation, which are
                    // curated prompts over the same endpoint.
                    // -------------------------------------------------------------
                    const prompt = resource === 'edit'
                        ? buildEditPrompt(this, operation, i)
                        : this.getNodeParameter('prompt', i);
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    const filesParam = this.getNodeParameter('files', i, {});
                    const additional = this.getNodeParameter('additionalOptions', i, {});
                    const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true);
                    const renderAfter = this.getNodeParameter('renderAfter', i, false);
                    const intervalMs = pollIntervalMs(this, i);
                    const body = { prompt };
                    if (projectId) {
                        body.project_id = projectId;
                    }
                    if (additional.threadId) {
                        body.thread_id = additional.threadId;
                    }
                    const fileEntries = filesParam.file || [];
                    const files = fileEntries
                        .map((entry) => {
                        const file = {};
                        if (entry.url) {
                            file.url = entry.url;
                        }
                        if (entry.name) {
                            file.name = entry.name;
                        }
                        return file;
                    })
                        .filter((file) => Object.keys(file).length > 0);
                    if (files.length > 0) {
                        body.files = files;
                    }
                    const started = await rendleyRequest(this, 'POST', '/agent', body);
                    const jobId = started.job_id;
                    let projectIdResult = started.project_id || projectId;
                    let status = started.status;
                    const threadId = started.thread_id || undefined;
                    let lastMessage;
                    let videoUrl;
                    let exportJobId;
                    // renderAfter always requires the edit to finish first.
                    const shouldWait = waitForCompletion || renderAfter;
                    if (shouldWait) {
                        const job = await pollAgentJob(this, jobId, intervalMs, pollTimeoutMs(this, i));
                        status = job.status;
                        if (job.status !== 'completed') {
                            const reason = jobFailureMessage(job, `The Rendley agent job ${job.status}.`);
                            throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: reason }, {
                                message: reason,
                            });
                        }
                        projectIdResult = job.project_id || projectIdResult;
                        lastMessage = job.last_message || undefined;
                    }
                    if (renderAfter) {
                        if (!projectIdResult) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Cannot render an MP4: the agent did not return a project ID.', { itemIndex: i });
                        }
                        const settings = buildSettings(this.getNodeParameter('renderSettings', i, {}));
                        const exportBody = { project_id: projectIdResult };
                        if (settings) {
                            exportBody.settings = settings;
                        }
                        const exportStarted = await rendleyRequest(this, 'POST', '/export', exportBody);
                        exportJobId = exportStarted.job_id;
                        const exportJob = await pollApiJob(this, exportJobId, intervalMs, pollTimeoutMs(this, i));
                        if (exportJob.status !== 'completed') {
                            const reason = jobFailureMessage(exportJob, `The Rendley export ${exportJob.status}.`);
                            throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: reason }, {
                                message: reason,
                            });
                        }
                        videoUrl = exportVideoUrl(exportJob);
                    }
                    responseData = {
                        job_id: jobId,
                        project_id: projectIdResult,
                        status,
                        thread_id: threadId,
                        last_message: lastMessage,
                    };
                    if (resource === 'edit') {
                        responseData.operation = operation;
                    }
                    if (videoUrl) {
                        responseData.video_url = videoUrl;
                    }
                    if (exportJobId) {
                        responseData.export_job_id = exportJobId;
                    }
                }
                else if (aiAction !== undefined) {
                    // -------------------------------------------------------------
                    // Video / Image / Audio — every AI action shares one shape:
                    // POST /ai/{action} { project_id, model_id?, params } -> job id.
                    // -------------------------------------------------------------
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    const modelId = this.getNodeParameter('modelId', i, '');
                    if (modelId) {
                        await assertModelMatchesAction(this, aiAction, modelId);
                    }
                    const options = this.getNodeParameter('aiOptions', i, {});
                    const estimateCostOnly = this.getNodeParameter('estimateCostOnly', i, false);
                    let params = {};
                    if (SINGLE_FILE_OPERATIONS[resource]?.includes(operation)) {
                        // One field for every kind of reference: the API resolves a URL,
                        // a media ID or a file hash itself and probes duration for
                        // duration-billed actions.
                        setParam(params, 'media', this.getNodeParameter('mediaFile', i).trim());
                    }
                    if (resource === 'video' && operation === 'lipSync') {
                        setParam(params, 'video_media', this.getNodeParameter('videoFile', i).trim());
                        setParam(params, 'audio_media', this.getNodeParameter('audioFile', i).trim());
                    }
                    if (resource === 'video' && operation === 'dub') {
                        setParam(params, 'output_language', this.getNodeParameter('outputLanguage', i));
                    }
                    if ((resource === 'video' && operation === 'changeVoice') ||
                        (resource === 'audio' && operation === 'textToSpeech')) {
                        setParam(params, 'voice_id', this.getNodeParameter('voiceId', i));
                    }
                    if (['generate', 'generateMusic', 'generateSoundEffect', 'textToSpeech'].includes(operation)) {
                        setParam(params, 'prompt', this.getNodeParameter('aiPrompt', i));
                    }
                    for (const [key, value] of Object.entries(options)) {
                        if (key === 'image_inputs' && typeof value === 'string') {
                            const urls = splitList(value);
                            if (urls.length > 0) {
                                params.image_inputs = urls;
                            }
                            continue;
                        }
                        setParam(params, key, value);
                    }
                    params = mergeExtraParams(this, params, this.getNodeParameter('extraParams', i, ''), i);
                    const body = { project_id: projectId, params };
                    if (modelId) {
                        body.model_id = modelId;
                    }
                    if (estimateCostOnly) {
                        const cost = await rendleyRequest(this, 'POST', `/ai/${aiAction}/cost`, body);
                        responseData = {
                            action: aiAction,
                            credits: typeof cost === 'number' ? cost : cost?.credits,
                        };
                    }
                    else {
                        const started = await rendleyRequest(this, 'POST', `/ai/${aiAction}`, body);
                        const jobId = extractJobId(this, started, i);
                        const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true);
                        if (!waitForCompletion) {
                            responseData = { action: aiAction, job_id: jobId, status: 'queued' };
                        }
                        else {
                            const job = await pollApiJob(this, jobId, pollIntervalMs(this, i), pollTimeoutMs(this, i));
                            if (job.status !== 'completed') {
                                const reason = jobFailureMessage(job, `The Rendley ${aiAction} job ${job.status}.`);
                                throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: reason }, {
                                    message: reason,
                                });
                            }
                            const resultData = parseResultData(job.result_data);
                            const output = (job.output ?? undefined);
                            const mediaId = (output?.media_id ?? resultData?.media_id);
                            const fileHash = (output?.file_hash ?? resultData?.file_hash);
                            responseData = {
                                action: aiAction,
                                job_id: jobId,
                                project_id: projectId,
                                status: job.status,
                                media_id: mediaId,
                                file_hash: fileHash,
                                result: resultData,
                            };
                            // A completed job carries a freshly signed URL; fall back to the
                            // uploads listing for deployments that do not attach one yet.
                            if (output?.url) {
                                responseData.download_url = output.url;
                                responseData.url_expires_at = output.url_expires_at;
                                responseData.media = output;
                            }
                            else if (mediaId !== undefined || fileHash !== undefined) {
                                const media = await resolveMediaUrl(this, projectId, mediaId, fileHash);
                                if (media?.download_url) {
                                    responseData.download_url = media.download_url;
                                    responseData.media = media;
                                }
                            }
                        }
                    }
                }
                else if (resource === 'export' && operation === 'render') {
                    // -------------------------------------------------------------
                    // Export > Render Video
                    // -------------------------------------------------------------
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    const settings = buildSettings(this.getNodeParameter('settings', i, {}));
                    const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true);
                    const body = { project_id: projectId };
                    if (settings) {
                        body.settings = settings;
                    }
                    const started = await rendleyRequest(this, 'POST', '/export', body);
                    const jobId = started.job_id;
                    if (waitForCompletion) {
                        const job = await pollApiJob(this, jobId, pollIntervalMs(this, i), pollTimeoutMs(this, i));
                        if (job.status !== 'completed') {
                            const reason = jobFailureMessage(job, `The Rendley export ${job.status}.`);
                            throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: reason }, {
                                message: reason,
                            });
                        }
                        const resultData = parseResultData(job.result_data);
                        responseData = {
                            job_id: jobId,
                            status: job.status,
                            video_url: exportVideoUrl(job),
                            url_expires_at: job.output?.url_expires_at,
                            result: resultData,
                        };
                    }
                    else {
                        responseData = {
                            job_id: jobId,
                            status: started.status || 'queued',
                        };
                    }
                }
                else if (resource === 'export' && operation === 'estimateCost') {
                    // -------------------------------------------------------------
                    // Export > Estimate Cost
                    // -------------------------------------------------------------
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    const settings = buildSettings(this.getNodeParameter('settings', i, {}));
                    const body = { project_id: projectId };
                    if (settings) {
                        body.settings = settings;
                    }
                    const cost = await rendleyRequest(this, 'POST', '/export/cost', body);
                    responseData = { credits: cost.credits };
                }
                else if (resource === 'media' && operation === 'upload') {
                    // -------------------------------------------------------------
                    // Media > Upload
                    // -------------------------------------------------------------
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    const source = this.getNodeParameter('uploadSource', i, 'binary');
                    const chosenName = this.getNodeParameter('uploadFileName', i, '');
                    if (source === 'url') {
                        // Rendley fetches the file itself, so size is not bounded by n8n's memory.
                        const url = this.getNodeParameter('uploadUrl', i).trim();
                        const imported = (await rendleyRequest(this, 'POST', `/projects/${encodeURIComponent(projectId)}/uploads/import`, {
                            download_url: url,
                            file_name: chosenName || fileNameFromUrl(url),
                            // The editor's hash sync deletes `library` rows the project JSON does not reference.
                            role: 'pending',
                        }));
                        responseData = {
                            media_id: imported.media_id,
                            file_hash: imported.file_hash,
                            file_name: imported.original_file_name ?? (chosenName || fileNameFromUrl(url)),
                            mime_type: imported.mime_type,
                            status: imported.status,
                            download_url: imported.storage_url,
                            ...(imported.duration !== undefined ? { duration: imported.duration } : {}),
                        };
                    }
                    else {
                        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data');
                        const binary = items[i]?.binary?.[binaryPropertyName];
                        if (binary === undefined) {
                            const available = Object.keys(items[i]?.binary ?? {});
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `No binary data in field "${binaryPropertyName}". ${available.length > 0
                                ? `This item carries: ${available.join(', ')}.`
                                : 'Connect a node that outputs a file first, for example Google Drive > Download File.'}`, { itemIndex: i });
                        }
                        const bytes = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
                        const fileName = chosenName || binary?.fileName || 'upload';
                        const mimeType = binary?.mimeType || 'application/octet-stream';
                        responseData = await uploadBytes(this, projectId, bytes, fileName, mimeType, i);
                    }
                }
                else if (resource === 'agent' && operation === 'getJob') {
                    // -------------------------------------------------------------
                    // Agent > Get Job
                    // -------------------------------------------------------------
                    const agentJobId = this.getNodeParameter('agentJobId', i);
                    responseData = (await rendleyRequest(this, 'GET', `/agent/jobs/${encodeURIComponent(agentJobId)}`));
                }
                else if (resource === 'agent' && operation === 'cancelJob') {
                    // -------------------------------------------------------------
                    // Agent > Cancel Job
                    // -------------------------------------------------------------
                    const agentJobId = this.getNodeParameter('agentJobId', i);
                    responseData = (await rendleyRequest(this, 'POST', `/agent/jobs/${encodeURIComponent(agentJobId)}/cancel`));
                }
                else if (resource === 'export' && operation === 'getJob') {
                    // -------------------------------------------------------------
                    // Export > Get Job
                    // -------------------------------------------------------------
                    const jobId = this.getNodeParameter('jobId', i);
                    const job = (await rendleyRequest(this, 'GET', `/jobs/${jobId}`));
                    const resultData = parseResultData(job.result_data);
                    responseData = { ...job, result: resultData };
                }
                else if (resource === 'media' && operation === 'getDownloadUrl') {
                    // -------------------------------------------------------------
                    // Media > Get Download URL
                    // -------------------------------------------------------------
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    const mediaId = this.getNodeParameter('mediaId', i, '').trim();
                    const fileHash = this.getNodeParameter('fileHash', i, '').trim();
                    if (mediaId === '' && fileHash === '') {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Set either a Media ID or a File Hash so Rendley knows which file to resolve.', { itemIndex: i });
                    }
                    const media = await resolveMediaUrl(this, projectId, mediaId === '' ? undefined : mediaId, fileHash === '' ? undefined : fileHash);
                    if (media === undefined) {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `No media found in project "${projectId}" for ${mediaId !== '' ? `media ID "${mediaId}"` : `file hash "${fileHash}"`}.`, { itemIndex: i });
                    }
                    responseData = { project_id: projectId, ...media };
                }
                else if (resource === 'media' && operation === 'list') {
                    // -------------------------------------------------------------
                    // Media > List
                    // -------------------------------------------------------------
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    const uploads = await rendleyRequest(this, 'GET', `/projects/${encodeURIComponent(projectId)}/uploads`);
                    responseData = (uploads || []).map((upload) => ({
                        ...upload,
                        download_url: upload.storage_url,
                    }));
                }
                else if (resource === 'brandKit' && operation === 'get') {
                    // -------------------------------------------------------------
                    // Brand Kit > Get
                    // -------------------------------------------------------------
                    const workspaceId = this.getNodeParameter('brandKitWorkspaceId', i);
                    responseData = (await rendleyRequest(this, 'GET', `/brandkit/${encodeURIComponent(workspaceId)}`));
                }
                else if (resource === 'brandKit' && operation === 'importFromWebsite') {
                    // -------------------------------------------------------------
                    // Brand Kit > Import From Website
                    // -------------------------------------------------------------
                    const workspaceId = this.getNodeParameter('brandKitWorkspaceId', i);
                    const websiteUrl = this.getNodeParameter('websiteUrl', i);
                    responseData = (await rendleyRequest(this, 'POST', `/brandkit/${encodeURIComponent(workspaceId)}/import`, { website_url: websiteUrl }));
                }
                else if (resource === 'project' && operation === 'create') {
                    // -------------------------------------------------------------
                    // Project > Create
                    // -------------------------------------------------------------
                    const name = this.getNodeParameter('name', i);
                    const workspaceId = await resolveWorkspaceId(this, this.getNodeParameter('workspaceId', i, ''));
                    const templateId = this.getNodeParameter('templateId', i, '');
                    const body = { name, workspace_id: workspaceId };
                    if (templateId) {
                        body.template_id = templateId;
                    }
                    responseData = (await rendleyRequest(this, 'POST', '/projects', body));
                }
                else if (resource === 'project' && operation === 'get') {
                    // -------------------------------------------------------------
                    // Project > Get
                    // -------------------------------------------------------------
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    const project = (await rendleyRequest(this, 'GET', `/projects/${encodeURIComponent(projectId)}`));
                    if (this.getNodeParameter('simplify', i, true)) {
                        // project_json is the full editor document, often hundreds of KB.
                        delete project.project_json;
                    }
                    responseData = project;
                }
                else if (resource === 'project' && operation === 'list') {
                    // -------------------------------------------------------------
                    // Project > List
                    // -------------------------------------------------------------
                    const workspaceId = await resolveWorkspaceId(this, this.getNodeParameter('workspaceId', i, ''));
                    const projects = await rendleyRequest(this, 'GET', `/projects?workspace_id=${encodeURIComponent(workspaceId)}`);
                    responseData = projects || [];
                }
                else if (resource === 'project' && operation === 'delete') {
                    // -------------------------------------------------------------
                    // Project > Delete
                    // -------------------------------------------------------------
                    const projectId = this.getNodeParameter('projectId', i, '', {
                        extractValue: true,
                    });
                    await rendleyRequest(this, 'DELETE', `/projects/${encodeURIComponent(projectId)}`);
                    responseData = { deleted: true, id: projectId };
                }
                else {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `The operation "${operation}" is not supported for resource "${resource}".`, { itemIndex: i });
                }
                if (Array.isArray(responseData)) {
                    for (const entry of responseData) {
                        returnData.push({ json: entry, pairedItem: { item: i } });
                    }
                }
                else {
                    returnData.push({ json: responseData, pairedItem: { item: i } });
                }
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: { error: error.message },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                throw asNodeError(this, error);
            }
        }
        return [returnData];
    }
}
exports.Rendley = Rendley;
