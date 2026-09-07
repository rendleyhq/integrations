import { HttpMethod } from '@activepieces/pieces-common';
import { createAction, Property } from '@activepieces/pieces-framework';
import { rendleyAuth } from '../common/auth';
import { agentShape, AgentJob, defaultWorkspaceId, Job, rendleyApiCall, summarizeJob, waitForAgentJob, waitForJob } from '../common/client';
import { optionalProjectDropdown, projectDropdown, timeoutProp, waitProp, workspaceDropdown } from '../common/props';

export const createProject = createAction({
  auth: rendleyAuth,
  name: 'create_project',
  displayName: 'Create Project',
  description: 'Creates a new Rendley project, optionally from a template.',
  props: {
    name: Property.ShortText({ displayName: 'Name', description: 'The project name shown in Rendley.', required: true }),
    workspaceId: workspaceDropdown,
    templateId: Property.ShortText({ displayName: 'Template ID', description: 'Optional Rendley template to start from.', required: false }),
  },
  async run({ auth, propsValue }) {
    const apiKey = auth.secret_text;
    const workspaceId = propsValue.workspaceId || (await defaultWorkspaceId(apiKey));
    return rendleyApiCall({
      apiKey,
      method: HttpMethod.POST,
      resourceUri: '/projects',
      body: { name: propsValue.name, workspace_id: workspaceId, ...(propsValue.templateId ? { template_id: propsValue.templateId } : {}) },
    });
  },
});

export const uploadMedia = createAction({
  auth: rendleyAuth,
  name: 'upload_media',
  displayName: 'Upload Media From URL',
  description: "Adds a file from a public URL to a project's media library. Rendley fetches the file itself.",
  props: {
    projectId: projectDropdown,
    fileUrl: Property.ShortText({ displayName: 'File URL', description: 'A publicly reachable URL of the video, audio or image.', required: true }),
    fileName: Property.ShortText({ displayName: 'File Name', description: 'Optional name shown in the project library.', required: false }),
  },
  async run({ auth, propsValue }) {
    const upload = await rendleyApiCall<Record<string, unknown>>({
      apiKey: auth.secret_text,
      method: HttpMethod.POST,
      resourceUri: `/projects/${encodeURIComponent(propsValue.projectId)}/uploads/import`,
      body: { download_url: propsValue.fileUrl, ...(propsValue.fileName ? { file_name: propsValue.fileName } : {}), role: 'pending' },
    });
    return {
      project_id: propsValue.projectId,
      media_id: upload['media_id'],
      file_hash: upload['file_hash'],
      file_name: upload['original_file_name'],
      mime_type: upload['mime_type'],
      status: upload['status'],
      download_url: upload['storage_url'],
    };
  },
});

export const getMediaUrl = createAction({
  auth: rendleyAuth,
  name: 'get_media_url',
  displayName: 'Get Media Download URL',
  description: 'Gets a fresh download URL for a file in a project by Media ID or File Hash. URLs are signed and expire after a few hours.',
  props: {
    projectId: projectDropdown,
    mediaId: Property.ShortText({ displayName: 'Media ID', description: 'Leave empty to look up by File Hash.', required: false }),
    fileHash: Property.ShortText({ displayName: 'File Hash', description: 'Used when the Media ID is empty.', required: false }),
  },
  async run({ auth, propsValue }) {
    if (!propsValue.mediaId && !propsValue.fileHash) throw new Error('Fill in either the Media ID or the File Hash.');
    const upload = await rendleyApiCall<Record<string, unknown>>({
      apiKey: auth.secret_text,
      method: HttpMethod.GET,
      resourceUri: `/projects/${encodeURIComponent(propsValue.projectId)}/uploads`,
      query: propsValue.mediaId ? { media_id: propsValue.mediaId } : { hash: propsValue.fileHash },
    });
    return {
      project_id: propsValue.projectId,
      media_id: upload['media_id'] ?? propsValue.mediaId ?? null,
      file_hash: upload['file_hash'],
      file_name: upload['original_file_name'] ?? null,
      mime_type: upload['mime_type'] ?? null,
      download_url: upload['storage_url'],
    };
  },
});

export const renderVideo = createAction({
  auth: rendleyAuth,
  name: 'render_video',
  displayName: 'Render Video',
  description: 'Renders a project to an MP4 and returns the download URL. Requires a paid Rendley plan.',
  props: {
    projectId: projectDropdown,
    codec: Property.StaticDropdown({ displayName: 'Codec', description: 'Defaults to H.264.', required: false, options: { options: [{ label: 'H.264 (MP4)', value: 'h264' }, { label: 'VP8 (WebM)', value: 'vp8' }] } }),
    targetResolution: Property.StaticDropdown({ displayName: 'Resolution', description: 'Defaults to 1080p.', required: false, options: { options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }, { label: '4K', value: '4K' }] } }),
    quality: Property.StaticDropdown({ displayName: 'Quality', description: 'Defaults to high.', required: false, options: { options: [{ label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }] } }),
    wait: waitProp,
    timeout: timeoutProp(600),
  },
  async run({ auth, propsValue }) {
    const apiKey = auth.secret_text;
    const settings = {
      ...(propsValue.codec ? { codec: propsValue.codec } : {}),
      ...(propsValue.targetResolution ? { target_resolution: propsValue.targetResolution } : {}),
      ...(propsValue.quality ? { quality: propsValue.quality } : {}),
    };
    const started = await rendleyApiCall<{ job_id: string }>({
      apiKey,
      method: HttpMethod.POST,
      resourceUri: '/export',
      body: { project_id: propsValue.projectId, ...(Object.keys(settings).length ? { settings } : {}) },
    });
    if (propsValue.wait === false) return { job_id: started.job_id, project_id: propsValue.projectId, status: 'queued', is_complete: false };
    const job = await waitForJob(apiKey, started.job_id, Number(propsValue.timeout) || 600);
    if (job.status !== 'completed') throw new Error(`Render ${started.job_id} ${job.status}: ${job.error ?? 'no details'}`);
    const summary = summarizeJob(job, propsValue.projectId);
    return { ...summary, video_url: summary['download_url'] };
  },
});

export const editWithAgent = createAction({
  auth: rendleyAuth,
  name: 'edit_video_with_ai_agent',
  displayName: 'Edit Video With AI Agent',
  description: 'Sends a prompt to the Rendley AI agent, which creates or edits a video project: cuts, captions, reframing, generated media and more. Requires a paid Rendley plan.',
  props: {
    prompt: Property.LongText({ displayName: 'Prompt', description: 'What the agent should create or change.', required: true }),
    projectId: optionalProjectDropdown,
    fileUrls: Property.Array({ displayName: 'Media URLs', description: 'Optional public URLs of clips, images or audio for the agent to work with.', required: false }),
    threadId: Property.ShortText({ displayName: 'Thread ID', description: 'Optional. Continue a previous agent conversation on the same project.', required: false }),
    wait: waitProp,
    timeout: timeoutProp(600),
  },
  async run({ auth, propsValue }) {
    const apiKey = auth.secret_text;
    const files = Array.isArray(propsValue.fileUrls) ? propsValue.fileUrls.map((url) => ({ url: String(url) })) : [];
    const started = await rendleyApiCall<AgentJob>({
      apiKey,
      method: HttpMethod.POST,
      resourceUri: '/agent',
      body: {
        prompt: propsValue.prompt,
        ...(propsValue.projectId ? { project_id: propsValue.projectId } : {}),
        ...(propsValue.threadId ? { thread_id: propsValue.threadId } : {}),
        ...(files.length ? { files } : {}),
      },
    });
    if (propsValue.wait === false) return agentShape(started);
    const job = await waitForAgentJob(apiKey, started.job_id, Number(propsValue.timeout) || 600);
    if (job.status !== 'completed') throw new Error(`Agent job ${started.job_id} ${job.status}: ${job.error ?? job.last_message ?? 'no details'}`);
    return agentShape({ ...job, thread_id: job.thread_id ?? started.thread_id });
  },
});

export const getJob = createAction({
  auth: rendleyAuth,
  name: 'get_job',
  displayName: 'Get Job Status',
  description: 'Looks up an AI action or render job and returns its status and, once complete, a fresh download URL.',
  props: { jobId: Property.ShortText({ displayName: 'Job ID', description: 'The Job ID returned by an AI action or Render Video.', required: true }) },
  async run({ auth, propsValue }) {
    const job = await rendleyApiCall<Job>({ apiKey: auth.secret_text, method: HttpMethod.GET, resourceUri: `/jobs/${encodeURIComponent(propsValue.jobId)}` });
    return summarizeJob(job);
  },
});

export const getAgentJob = createAction({
  auth: rendleyAuth,
  name: 'get_agent_job',
  displayName: 'Get Agent Job Status',
  description: 'Looks up an AI agent edit by Job ID.',
  props: { jobId: Property.ShortText({ displayName: 'Job ID', description: 'The Job ID returned by Edit Video With AI Agent.', required: true }) },
  async run({ auth, propsValue }) {
    const job = await rendleyApiCall<AgentJob>({ apiKey: auth.secret_text, method: HttpMethod.GET, resourceUri: `/agent/jobs/${encodeURIComponent(propsValue.jobId)}` });
    return agentShape(job);
  },
});

export const cancelAgentJob = createAction({
  auth: rendleyAuth,
  name: 'cancel_agent_job',
  displayName: 'Cancel Agent Job',
  description: 'Stops a running AI agent edit.',
  props: { jobId: Property.ShortText({ displayName: 'Job ID', description: 'The Job ID returned by Edit Video With AI Agent.', required: true }) },
  async run({ auth, propsValue }) {
    const job = await rendleyApiCall<AgentJob>({ apiKey: auth.secret_text, method: HttpMethod.POST, resourceUri: `/agent/jobs/${encodeURIComponent(propsValue.jobId)}/cancel` });
    return agentShape(job);
  },
});

const COST_ACTIONS = [
  ['transcribe', 'Transcribe Audio or Video'], ['text-to-speech', 'Text to Speech'], ['video-translate', 'Dub Video'], ['lipsync', 'Lip Sync'],
  ['voice-isolation', 'Isolate Voice'], ['voice-changer', 'Change Voice'], ['remove-video-background', 'Remove Video Background'],
  ['remove-image-background', 'Remove Image Background'], ['upscale-image', 'Upscale Image'], ['generate-image', 'Generate Image'],
  ['generate-video', 'Generate Video'], ['generate-music', 'Generate Music'], ['generate-sound-effect', 'Generate Sound Effect'], ['export', 'Render Video'],
];

export const estimateCost = createAction({
  auth: rendleyAuth,
  name: 'estimate_cost',
  displayName: 'Estimate Credit Cost',
  description: 'Estimates how many Rendley credits an AI action or render would consume, without running it.',
  props: {
    action: Property.StaticDropdown({ displayName: 'Action', description: 'The action to price.', required: true, options: { options: COST_ACTIONS.map(([value, label]) => ({ label, value })) } }),
    projectId: projectDropdown,
    modelId: Property.ShortText({ displayName: 'Model', description: 'Optional model ID, for AI actions only.', required: false }),
    params: Property.Json({ displayName: 'Parameters', description: 'The parameters you would run with. Prices depend on them.', required: false }),
  },
  async run({ auth, propsValue }) {
    const apiKey = auth.secret_text;
    const data =
      propsValue.action === 'export'
        ? await rendleyApiCall<{ credits: number }>({ apiKey, method: HttpMethod.POST, resourceUri: '/export/cost', body: { project_id: propsValue.projectId } })
        : await rendleyApiCall<number | { credits?: number }>({
            apiKey,
            method: HttpMethod.POST,
            resourceUri: `/ai/${propsValue.action}/cost`,
            body: { project_id: propsValue.projectId, ...(propsValue.modelId ? { model_id: propsValue.modelId } : {}), params: propsValue.params ?? {} },
          });
    const credits = typeof data === 'number' ? data : (data as { credits?: number })?.credits ?? 0;
    return { action: propsValue.action, credits, usd: credits / 100 };
  },
});
