import { DedupeStrategy, HttpMethod, Polling, pollingHelper } from '@activepieces/pieces-common';
import { AppConnectionValueForAuthProperty, createTrigger, Property, TriggerStrategy } from '@activepieces/pieces-framework';
import { rendleyAuth } from '../common/auth';
import { defaultWorkspaceId, Job, rendleyApiCall, summarizeJob } from '../common/client';
import { optionalProjectDropdown, workspaceDropdown } from '../common/props';

type Auth = AppConnectionValueForAuthProperty<typeof rendleyAuth>;

const JOB_TYPES = [
  ['export_video', 'Render Video'], ['transcription', 'Transcribe'], ['text_to_speech', 'Text to Speech'], ['video_translate', 'Dub Video'],
  ['lipsync', 'Lip Sync'], ['voice_isolation', 'Isolate Voice'], ['voice_changer', 'Change Voice'], ['remove_video_background', 'Remove Video Background'],
  ['remove_image_background', 'Remove Image Background'], ['upscale_image', 'Upscale Image'], ['generate_image', 'Generate Image'],
  ['generate_video', 'Generate Video'], ['generate_music', 'Generate Music'], ['generate_sound_effect', 'Generate Sound Effect'],
];

/** Completed API-created jobs, newest first; deduplicated by job id. */
const completedJobsPolling: Polling<Auth, { jobType?: string; projectId?: string }> = {
  strategy: DedupeStrategy.LAST_ITEM,
  items: async ({ auth, propsValue }) => {
    const jobs = await rendleyApiCall<Job[]>({
      apiKey: auth.secret_text,
      method: HttpMethod.GET,
      resourceUri: '/jobs',
      query: { source_type: 'api', job_type: propsValue.jobType, project_id: propsValue.projectId },
    });
    return (jobs ?? []).filter((job) => job.status === 'completed').map((job) => ({ id: job.id, data: summarizeJob(job) }));
  },
};

export const newCompletedJob = createTrigger({
  auth: rendleyAuth,
  name: 'new_completed_job',
  displayName: 'New Completed Job',
  description: 'Fires when an AI action or render started through the API finishes.',
  type: TriggerStrategy.POLLING,
  props: {
    jobType: Property.StaticDropdown({
      displayName: 'Job Type',
      description: 'Optional. Only fire for one kind of job.',
      required: false,
      options: { options: JOB_TYPES.map(([value, label]) => ({ label, value })) },
    }),
    projectId: optionalProjectDropdown,
  },
  sampleData: {
    job_id: 'f0e1d2c3-b4a5-4678-9012-3456789abcde',
    type: 'generate_sound_effect',
    status: 'completed',
    is_complete: true,
    project_id: '1fdfc335-a483-4f8d-8466-8dae94175cc6',
    error: null,
    media_id: 'c448b6e3-2b78-4bda-b369-d1afc6aec07f',
    file_hash: 'c6c8ec4f9a6fdd9d',
    download_url: null,
    url_expires_at: null,
    mime_type: null,
    result: { media_id: 'c448b6e3-2b78-4bda-b369-d1afc6aec07f', file_hash: 'c6c8ec4f9a6fdd9d' },
  },
  async test(context) {
    return await pollingHelper.test(completedJobsPolling, context);
  },
  async onEnable(context) {
    await pollingHelper.onEnable(completedJobsPolling, context);
  },
  async onDisable(context) {
    await pollingHelper.onDisable(completedJobsPolling, context);
  },
  async run(context) {
    return await pollingHelper.poll(completedJobsPolling, context);
  },
});

const projectsPolling: Polling<Auth, { workspaceId?: string }> = {
  strategy: DedupeStrategy.LAST_ITEM,
  items: async ({ auth, propsValue }) => {
    const apiKey = auth.secret_text;
    const workspaceId = propsValue.workspaceId || (await defaultWorkspaceId(apiKey));
    const projects = await rendleyApiCall<Array<{ id: string; name: string; created_at?: string }>>({
      apiKey,
      method: HttpMethod.GET,
      resourceUri: '/projects',
      query: { workspace_id: workspaceId },
    });
    return (projects ?? []).map((project) => ({ id: project.id, data: project }));
  },
};

export const newProject = createTrigger({
  auth: rendleyAuth,
  name: 'new_project',
  displayName: 'New Project',
  description: 'Fires when a project is created in Rendley.',
  type: TriggerStrategy.POLLING,
  props: { workspaceId: workspaceDropdown },
  sampleData: {
    id: '1fdfc335-a483-4f8d-8466-8dae94175cc6',
    name: 'Product launch teaser',
    workspace_id: '3b66b9b6-de8e-44c3-9f27-848a09c79320',
    created_at: '2026-09-01T10:00:00Z',
  },
  async test(context) {
    return await pollingHelper.test(projectsPolling, context);
  },
  async onEnable(context) {
    await pollingHelper.onEnable(projectsPolling, context);
  },
  async onDisable(context) {
    await pollingHelper.onDisable(projectsPolling, context);
  },
  async run(context) {
    return await pollingHelper.poll(projectsPolling, context);
  },
});
