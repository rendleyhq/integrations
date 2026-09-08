import { JOB_OUTPUT_FIELDS, clientFor, jobOutput, jobSample, toUserError, type Bundle, type Trigger, type ZObject } from "../lib/zapier";

const JOB_TYPES: Record<string, string> = {
  export_video: "Export Video",
  transcription: "Transcribe",
  text_to_speech: "Text to Speech",
  video_translate: "Dub Video",
  lipsync: "Lip Sync",
  voice_isolation: "Isolate Voice",
  voice_changer: "Change Voice",
  remove_video_background: "Remove Video Background",
  remove_image_background: "Remove Image Background",
  upscale_image: "Upscale Image",
  upscale_video: "Upscale Video",
  generate_image: "Generate Image",
  generate_video: "Generate Video",
  generate_music: "Generate Music",
  generate_sound_effect: "Generate Sound Effect",
};

/** Polling trigger over the account's API-created jobs, newest first. */
export const newCompletedJob: Trigger<{ job_type?: string; project_id?: string }> = {
  key: "new_completed_job",
  noun: "Completed Job",
  display: {
    label: "New Completed Job",
    description: "Triggers when an AI action or render started through the API finishes, with its result and download URL.",
  },
  operation: {
    type: "polling",
    inputFields: [
      {
        key: "job_type",
        label: "Job Type",
        type: "string",
        required: false,
        choices: JOB_TYPES,
        helpText: "Optional: only fire for one kind of job. Leave empty for every job type.",
      },
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: false,
        dynamic: "new_project.id.name",
        helpText: "Optional: only fire for jobs in one project.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const client = clientFor(bundle);
      const { job_type, project_id } = bundle.inputData;
      try {
        const jobs = await client.listJobs({
          type: job_type || undefined,
          projectId: project_id || undefined,
        });
        const completed = jobs.filter((job) => job.status === "completed").slice(0, 50);
        // The listing carries no signed URL; fetch each job for a fresh one.
        const detailed = await Promise.all(
          completed.slice(0, 10).map(async (job) => {
            try {
              return await client.getJob(job.id);
            } catch {
              return job;
            }
          }),
        );
        return [...detailed, ...completed.slice(10)].map((job) => jobOutput(job));
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: jobSample(),
    outputFields: [{ key: "id", label: "Job ID", primary: true }, ...JOB_OUTPUT_FIELDS],
  },
};

/** Polling trigger for projects; also powers the Project dropdowns. */
export const newProject: Trigger<{ workspace_id?: string }> = {
  key: "new_project",
  noun: "Project",
  display: {
    label: "New Project",
    description: "Triggers when a project is created in Rendley.",
  },
  operation: {
    type: "polling",
    inputFields: [
      {
        key: "workspace_id",
        label: "Workspace",
        type: "string",
        required: false,
        dynamic: "list_workspaces.id.name",
        helpText: "Optional: only watch one workspace. Defaults to your first workspace.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      try {
        const projects = await clientFor(bundle).listProjects(bundle.inputData.workspace_id || undefined);
        return projects.map((p) => ({
          id: p.id,
          name: p.name,
          workspace_id: p.workspace_id,
          created_at: p.created_at ?? null,
          updated_at: p.updated_at ?? null,
          thumbnail_url: p.thumbnail_url ?? null,
        }));
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: {
      id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
      name: "Product launch teaser",
      workspace_id: "3b66b9b6-de8e-44c3-9f27-848a09c79320",
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-01T10:05:00Z",
      thumbnail_url: "https://storage.rendley.com/thumbnails/1fdfc335.jpg",
    },
    outputFields: [
      { key: "id", label: "Project ID", primary: true },
      { key: "name", label: "Name" },
      { key: "workspace_id", label: "Workspace ID" },
      { key: "created_at", label: "Created At", type: "datetime" },
      { key: "updated_at", label: "Updated At", type: "datetime" },
      { key: "thumbnail_url", label: "Thumbnail URL" },
    ],
  },
};

/** Hidden: powers the Workspace dropdowns. */
export const listWorkspaces: Trigger = {
  key: "list_workspaces",
  noun: "Workspace",
  display: {
    label: "List Workspaces",
    description: "Triggers when a workspace exists. Powers the Workspace dropdown.",
    hidden: true,
  },
  operation: {
    type: "polling",
    perform: async (z: ZObject, bundle: Bundle) => {
      try {
        const workspaces = await clientFor(bundle).listWorkspaces();
        return workspaces.map((w) => ({ id: w.id, name: w.name }));
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: { id: "3b66b9b6-de8e-44c3-9f27-848a09c79320", name: "Marketing" },
    outputFields: [
      { key: "id", label: "Workspace ID" },
      { key: "name", label: "Name" },
    ],
  },
};

/** Hidden: powers the Voice dropdowns. Paginated through `bundle.meta.page`. */
export const listTtsVoices: Trigger = {
  key: "list_tts_voices",
  noun: "Voice",
  display: {
    label: "List Voices",
    description: "Triggers when a voice exists. Powers the Voice dropdown.",
    hidden: true,
  },
  operation: {
    type: "polling",
    canPaginate: true,
    perform: async (z: ZObject, bundle: Bundle) => {
      const page = typeof bundle.meta?.page === "number" ? bundle.meta.page : 0;
      try {
        const voices = await clientFor(bundle).listTtsVoices({ page: page + 1, limit: 100 });
        return voices.map((v) => ({ id: v.id, name: v.name }));
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
    outputFields: [
      { key: "id", label: "Voice ID" },
      { key: "name", label: "Name" },
    ],
  },
};

/** Hidden: powers the Target Language dropdown. */
export const listTranslateLanguages: Trigger = {
  key: "list_translate_languages",
  noun: "Language",
  display: {
    label: "List Dubbing Languages",
    description: "Triggers when a dubbing language exists. Powers the Target Language dropdown.",
    hidden: true,
  },
  operation: {
    type: "polling",
    perform: async (z: ZObject, bundle: Bundle) => {
      try {
        const languages = await clientFor(bundle).listTranslateLanguages();
        return languages.map((l) => ({ id: l.id, name: l.name ?? l.id }));
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: { id: "es", name: "Spanish" },
    outputFields: [
      { key: "id", label: "Language Code" },
      { key: "name", label: "Name" },
    ],
  },
};
