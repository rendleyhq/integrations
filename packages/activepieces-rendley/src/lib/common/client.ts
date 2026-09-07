import { httpClient, HttpMethod, HttpRequest, QueryParams } from '@activepieces/pieces-common';

export const BASE_URL = 'https://api.rendley.com/v1';

let baseUrl = BASE_URL;
/** Test hook: point the piece at a different Rendley host. Not used in production. */
export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '');
}
export function getBaseUrl(): string {
  return baseUrl;
}

export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled', 'cancelled']);

export type RendleyApiCallParams = {
  apiKey: string;
  method: HttpMethod;
  resourceUri: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

/** Authenticated request; every Rendley response is wrapped in `{ data }`. */
export async function rendleyApiCall<T>({ apiKey, method, resourceUri, query, body }: RendleyApiCallParams): Promise<T> {
  const queryParams: QueryParams = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') queryParams[key] = String(value);
  }
  const request: HttpRequest = {
    method,
    url: `${baseUrl}${resourceUri}`,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    queryParams,
    body,
  };
  const response = await httpClient.sendRequest<{ data?: T } | T>(request);
  const payload = response.body as { data?: T } | T;
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export interface Job {
  id: string;
  type: string;
  status: string;
  result_data?: string | null;
  error?: string | null;
  source_id?: string;
  output?: {
    media_id?: string;
    file_hash?: string;
    project_id?: string;
    mime_type?: string;
    url?: string;
    url_expires_at?: string;
  };
}

export interface AgentJob {
  job_id: string;
  project_id: string;
  thread_id?: string;
  status: string;
  last_message?: string;
  error?: string;
  commands_applied?: number;
  commands_failed?: number;
  interrupt?: { summary?: string };
}

export function summarizeJob(job: Job, projectId?: string): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  if (typeof job.result_data === 'string') {
    try {
      result = JSON.parse(job.result_data);
    } catch {
      result = {};
    }
  }
  const output = job.output ?? {};
  return {
    job_id: job.id,
    type: job.type,
    status: job.status,
    is_complete: TERMINAL_STATUSES.has(job.status),
    project_id: output.project_id ?? job.source_id ?? projectId ?? null,
    error: job.error ?? null,
    media_id: output.media_id ?? result['media_id'] ?? null,
    file_hash: output.file_hash ?? result['file_hash'] ?? null,
    download_url: output.url ?? result['storage_url'] ?? null,
    url_expires_at: output.url_expires_at ?? null,
    mime_type: output.mime_type ?? result['mime_type'] ?? null,
    result,
  };
}

export function agentShape(job: AgentJob): Record<string, unknown> {
  return {
    job_id: job.job_id,
    project_id: job.project_id ?? null,
    thread_id: job.thread_id ?? null,
    status: job.status,
    is_complete: TERMINAL_STATUSES.has(job.status),
    last_message: job.last_message ?? null,
    error: job.error ?? null,
    commands_applied: job.commands_applied ?? null,
    commands_failed: job.commands_failed ?? null,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForJob(apiKey: string, jobId: string, timeoutSeconds: number): Promise<Job> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const job = await rendleyApiCall<Job>({ apiKey, method: HttpMethod.GET, resourceUri: `/jobs/${encodeURIComponent(jobId)}` });
    if (TERMINAL_STATUSES.has(job.status)) return job;
    if (Date.now() + 4000 > deadline) {
      throw new Error(`Rendley job ${jobId} did not finish within ${timeoutSeconds} seconds (last status: ${job.status}). Follow it with Get Job Status.`);
    }
    await sleep(4000);
  }
}

export async function waitForAgentJob(apiKey: string, jobId: string, timeoutSeconds: number): Promise<AgentJob> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const job = await rendleyApiCall<AgentJob>({ apiKey, method: HttpMethod.GET, resourceUri: `/agent/jobs/${encodeURIComponent(jobId)}` });
    if (job.status === 'waiting_input') {
      throw new Error(`The Rendley agent paused to ask a question${job.interrupt?.summary ? `: ${job.interrupt.summary}` : ''}. Rephrase the prompt so it does not need to ask.`);
    }
    if (TERMINAL_STATUSES.has(job.status)) return job;
    if (Date.now() + 4000 > deadline) {
      throw new Error(`Rendley agent job ${jobId} did not finish within ${timeoutSeconds} seconds (last status: ${job.status}). Follow it with Get Agent Job Status.`);
    }
    await sleep(4000);
  }
}

export async function defaultWorkspaceId(apiKey: string): Promise<string> {
  const workspaces = await rendleyApiCall<Array<{ id: string }>>({ apiKey, method: HttpMethod.GET, resourceUri: '/workspaces' });
  const first = workspaces?.[0]?.id;
  if (!first) throw new Error('No workspace found for this Rendley API key.');
  return first;
}
