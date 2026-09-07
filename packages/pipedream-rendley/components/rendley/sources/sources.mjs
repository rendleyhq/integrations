import rendley from "../rendley.app.mjs";
import constants from "../common/constants.mjs";

const DEFAULT_POLLING_INTERVAL = 60 * 5;

/** Polling source: fires once per completed API-created job. */
export const newCompletedJob = {
  key: "rendley-new-completed-job",
  name: "New Completed Job",
  description: "Emit new event when an AI action or render started through the API finishes. [See the documentation](https://docs.rendley.com)",
  version: "0.1.0",
  type: "source",
  dedupe: "unique",
  props: {
    rendley,
    db: "$.service.db",
    timer: {
      type: "$.interface.timer",
      default: {
        intervalSeconds: DEFAULT_POLLING_INTERVAL,
      },
    },
    jobType: {
      type: "string",
      label: "Job Type",
      description: "Optional. Only emit one kind of job.",
      optional: true,
      options: Object.entries(constants.JOB_TYPES).map(([
        value,
        label,
      ]) => ({
        value,
        label,
      })),
    },
    projectId: {
      propDefinition: [
        rendley,
        "projectId",
      ],
      optional: true,
      description: "Optional. Only emit jobs from one project.",
    },
  },
  methods: {
    generateMeta(job) {
      return {
        id: job.id,
        summary: `${job.type} ${job.id} completed`,
        ts: Date.now(),
      };
    },
  },
  async run() {
    const jobs = await this.rendley.listJobs({
      params: {
        source_type: "api",
        ...(this.jobType
          ? {
            job_type: this.jobType,
          }
          : {}),
        ...(this.projectId
          ? {
            project_id: this.projectId,
          }
          : {}),
      },
    });
    const completed = (jobs || []).filter(({ status }) => status === "completed");
    // Newest first from the API; emit oldest first so consumers see them in order.
    for (const job of completed.reverse()) {
      let detailed = job;
      try {
        detailed = await this.rendley.getJob({
          jobId: job.id,
        });
      } catch {
        // keep the listing row
      }
      this.$emit(this.rendley.summarizeJob(detailed), this.generateMeta(job));
    }
  },
  sampleEmit: {
    job_id: "f0e1d2c3-b4a5-4678-9012-3456789abcde",
    type: "generate_sound_effect",
    status: "completed",
    is_complete: true,
    project_id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
    error: null,
    media_id: "c448b6e3-2b78-4bda-b369-d1afc6aec07f",
    file_hash: "c6c8ec4f9a6fdd9d",
    download_url: "https://storage.rendley.com/user_uploads/1fdfc335/c6c8ec4f9a6fdd9d?signature=abc",
    url_expires_at: "2026-09-05T15:00:00Z",
    mime_type: "audio/mpeg",
    result: {
      media_id: "c448b6e3-2b78-4bda-b369-d1afc6aec07f",
      file_hash: "c6c8ec4f9a6fdd9d",
    },
  },
};

/** Polling source: fires once per new project. */
export const newProject = {
  key: "rendley-new-project",
  name: "New Project",
  description: "Emit new event when a project is created in Rendley. [See the documentation](https://docs.rendley.com)",
  version: "0.1.0",
  type: "source",
  dedupe: "unique",
  props: {
    rendley,
    db: "$.service.db",
    timer: {
      type: "$.interface.timer",
      default: {
        intervalSeconds: DEFAULT_POLLING_INTERVAL,
      },
    },
    workspaceId: {
      propDefinition: [
        rendley,
        "workspaceId",
      ],
    },
  },
  async run() {
    const projects = await this.rendley.listProjects({
      workspaceId: this.workspaceId,
    });
    for (const project of projects.reverse()) {
      this.$emit(project, {
        id: project.id,
        summary: `New project: ${project.name}`,
        ts: project.created_at
          ? Date.parse(project.created_at)
          : Date.now(),
      });
    }
  },
  sampleEmit: {
    id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
    name: "Product launch teaser",
    workspace_id: "3b66b9b6-de8e-44c3-9f27-848a09c79320",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:05:00Z",
  },
};
