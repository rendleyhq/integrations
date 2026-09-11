/**
 * Small, local view of the Zapier platform types this app touches, plus the
 * helpers every trigger, action and search shares.
 *
 * The app is bundled with esbuild, so keeping these shapes local keeps
 * `tsc --noEmit` hermetic across zapier-platform-core versions.
 */
import { RendleyClient, RendleyError, type Job, summarizeJob } from "@rendley/client";

export interface AuthData {
  apiKey: string;
  [key: string]: string | undefined;
}

export interface Bundle<I = Record<string, unknown>> {
  authData: AuthData;
  inputData: I;
  inputDataRaw?: Record<string, string>;
  meta?: { page?: number; isLoadingSample?: boolean; [key: string]: unknown };
}

export interface ZObject {
  console: Console;
  errors: {
    Error: new (message: string, code?: string, status?: number) => Error;
    HaltedError: new (message: string) => Error;
    ExpiredAuthError: new (message: string) => Error;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface InputField {
  key: string;
  label?: string;
  type?: "string" | "text" | "integer" | "number" | "boolean" | "datetime" | "file" | "password";
  required?: boolean;
  helpText?: string;
  default?: string;
  placeholder?: string;
  choices?: Record<string, string>;
  dynamic?: string;
  list?: boolean;
  altersDynamicFields?: boolean;
}

export interface OutputField {
  key: string;
  label?: string;
  type?: "string" | "integer" | "number" | "boolean" | "datetime";
  /** Marks the field Zapier deduplicates trigger results by. */
  primary?: boolean;
}

export type Perform<I, O> = (z: ZObject, bundle: Bundle<I>) => Promise<O>;

export interface Display {
  label: string;
  description: string;
  hidden?: boolean;
}

export interface Create<I = Record<string, unknown>> {
  key: string;
  noun: string;
  display: Display;
  operation: {
    inputFields: InputField[];
    perform: Perform<I, Record<string, unknown>>;
    sample: Record<string, unknown>;
    outputFields?: OutputField[];
  };
}

export interface Search<I = Record<string, unknown>> {
  key: string;
  noun: string;
  display: Display;
  operation: {
    inputFields: InputField[];
    perform: Perform<I, Array<Record<string, unknown>>>;
    sample: Record<string, unknown>;
    outputFields?: OutputField[];
  };
}

export interface Trigger<I = Record<string, unknown>> {
  key: string;
  noun: string;
  display: Display;
  operation: {
    type: "polling";
    inputFields?: InputField[];
    canPaginate?: boolean;
    perform: Perform<I, Array<Record<string, unknown>>>;
    sample: Record<string, unknown>;
    outputFields?: OutputField[];
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * A client for the stored connection. The client adds the bearer header
 * itself. The API host is Rendley's; another host is only reachable through
 * the RENDLEY_API_BASE_URL environment variable of the app version
 * (`zapier env:set`), which keeps the connection form to the API key.
 */
export function clientFor(bundle: Bundle<unknown>): RendleyClient {
  return new RendleyClient({
    apiKey: bundle.authData.apiKey,
    apiBaseUrl: process.env.RENDLEY_API_BASE_URL || undefined,
    // Leave room inside Zapier's 30 second step budget.
    timeoutMs: 25_000,
  });
}

/** Turn anything thrown into an error Zapier displays cleanly. */
export function toUserError(z: ZObject, err: unknown): Error {
  if (err instanceof RendleyError) {
    if (err.status === 401) {
      return new z.errors.ExpiredAuthError(err.message);
    }
    return new z.errors.Error(err.message, err.code, err.status);
  }
  if (err instanceof Error) return err;
  return new z.errors.Error(String(err));
}

/**
 * How long an action may keep polling before it has to answer. Zapier stops a
 * step at 30 seconds, and the enqueue request itself needs a few of those.
 */
export const WAIT_BUDGET_MS = 20_000;

export const WAIT_HELP =
  "Yes (default): the step polls Rendley for up to about 20 seconds and returns the finished result when the job completes in time. " +
  "Speech, sound effects, transcription and image operations usually do. Longer jobs (video generation, dubbing, exports, agent edits) " +
  "come back with Is Complete = false and the job reference: add a Delay step, then a Find Job Status search, to pick up the result. " +
  "No: return the job reference immediately without waiting.";

export const URL_EXPIRY_NOTE =
  "Download URLs are signed and expire after a few hours. Use them in the next steps of the Zap rather than storing them.";

export function wantsWait(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  const s = String(value).toLowerCase();
  return s !== "false" && s !== "no" && s !== "0";
}

export function num(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function str(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

export function urlList(value: unknown): string[] | undefined {
  const list = (Array.isArray(value) ? value : value ? [value] : [])
    .map((v) => String(v).trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

/** Parse the optional "Extra Parameters (JSON)" input. */
export function parseParamsJson(z: ZObject, value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === "") return {};
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new z.errors.Error('Extra Parameters must be a JSON object, for example {"seed": 42}.');
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new z.errors.Error("Extra Parameters must be a JSON object, not an array or a plain value.");
  }
  return parsed as Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Shared fields
// -----------------------------------------------------------------------------

export const PROJECT_FIELD: InputField = {
  key: "project_id",
  label: "Project",
  type: "string",
  required: false,
  dynamic: "new_project.id.name",
  helpText: "Leave empty to save the result to your workspace library. Set it to save into a specific project instead.",
};

export const WORKSPACE_FIELD: InputField = {
  key: "workspace_id",
  label: "Workspace",
  type: "string",
  required: false,
  dynamic: "list_workspaces.id.name",
  helpText: "Only used when Project is empty. Leave empty for your first workspace.",
};

export const MODEL_FIELD: InputField = {
  key: "model",
  label: "Model",
  type: "string",
  required: false,
  helpText:
    "Optional model ID for this action, for example `kling-v2.6` for video generation. Leave empty for Rendley's default. The [model catalog](https://docs.rendley.com/api/models) lists every model with its parameters.",
};

export const PARAMS_JSON_FIELD: InputField = {
  key: "params_json",
  label: "Extra Parameters (JSON)",
  type: "text",
  required: false,
  helpText:
    'Advanced: a JSON object merged into the model parameters for fields not listed above, for example `{"aspect_ratio": "9:16"}`. Keys here override the fields above. Each model\'s parameters are in the [model catalog](https://docs.rendley.com/api/models).',
};

export const WAIT_FIELD: InputField = {
  key: "wait_for_completion",
  label: "Wait for completion",
  type: "boolean",
  required: false,
  default: "true",
  helpText: WAIT_HELP,
};

/** Output fields every job-producing action shares. */
export const JOB_OUTPUT_FIELDS: OutputField[] = [
  { key: "job_id", label: "Job ID" },
  { key: "project_id", label: "Project ID" },
  { key: "status", label: "Status" },
  { key: "is_complete", label: "Is Complete", type: "boolean" },
  { key: "media_id", label: "Media ID" },
  { key: "file_hash", label: "File Hash" },
  { key: "url", label: "Download URL (signed, expires)" },
  { key: "url_expires_at", label: "Download URL Expires At", type: "datetime" },
  { key: "mime_type", label: "MIME Type" },
  { key: "size", label: "Size (bytes)", type: "integer" },
  { key: "duration", label: "Duration (seconds)", type: "number" },
  { key: "error", label: "Error" },
];

/** Flatten a job for a Zap step with the API's field names, keeping `project_id` from the input when the job lacks it. */
export function jobOutput(job: Job, projectId?: string): Record<string, unknown> {
  const summary = summarizeJob(job);
  return { ...summary, project_id: summary.project_id ?? projectId ?? null };
}

export function jobSample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "f0e1d2c3-b4a5-4678-9012-3456789abcde",
    job_id: "f0e1d2c3-b4a5-4678-9012-3456789abcde",
    type: "generate_sound_effect",
    status: "completed",
    is_complete: true,
    project_id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
    error: null,
    media_id: "c448b6e3-2b78-4bda-b369-d1afc6aec07f",
    file_hash: "c6c8ec4f9a6fdd9d",
    url: "https://storage.rendley.com/user_uploads/1fdfc335/c6c8ec4f9a6fdd9d?signature=abc",
    url_expires_at: "2026-09-05T15:00:00Z",
    mime_type: "audio/mpeg",
    size: 39750,
    duration: 2.4,
    result_data: { media_id: "c448b6e3-2b78-4bda-b369-d1afc6aec07f", file_hash: "c6c8ec4f9a6fdd9d" },
    ...overrides,
  };
}
