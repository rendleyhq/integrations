import { HttpMethod } from '@activepieces/pieces-common';
import { createAction, InputPropertyMap } from '@activepieces/pieces-framework';
import { rendleyAuth } from '../common/auth';
import { rendleyApiCall, summarizeJob, waitForJob } from '../common/client';
import { extraParamsProp, modelDropdown, projectDropdown, timeoutProp, waitProp } from '../common/props';

interface AiActionConfig {
  name: string;
  displayName: string;
  description: string;
  /** Wire action for POST /v1/ai/{action}. */
  action: string;
  props: InputPropertyMap;
  buildParams: (props: Record<string, unknown>) => Record<string, unknown>;
  resultKind?: 'media' | 'transcript';
}

/** One Rendley AI action as an Activepieces action, with shared project, model, wait and timeout props. */
export function aiAction(config: AiActionConfig) {
  return createAction({
    auth: rendleyAuth,
    name: config.name,
    displayName: config.displayName,
    description: `${config.description} Consumes Rendley credits.`,
    props: {
      projectId: projectDropdown,
      ...config.props,
      modelId: modelDropdown(config.action),
      extraParams: extraParamsProp,
      wait: waitProp,
      timeout: timeoutProp(),
    },
    async run({ auth, propsValue }) {
      const apiKey = auth.secret_text;
      const values = propsValue as Record<string, unknown>;
      const projectId = values['projectId'] as string;
      const extra = (values['extraParams'] as Record<string, unknown> | undefined) ?? {};
      const params = { ...config.buildParams(values), ...extra };
      const started = await rendleyApiCall<{ job_id?: string } | string>({
        apiKey,
        method: HttpMethod.POST,
        resourceUri: `/ai/${config.action}`,
        body: {
          project_id: projectId,
          ...(values['modelId'] ? { model_id: values['modelId'] } : {}),
          params,
        },
      });
      const jobId = typeof started === 'string' ? started : started?.job_id;
      if (!jobId) throw new Error(`Rendley did not return a job ID for ${config.action}.`);

      if (values['wait'] === false) {
        return { job_id: jobId, project_id: projectId, status: 'queued', is_complete: false };
      }
      const job = await waitForJob(apiKey, jobId, Number(values['timeout']) || 240);
      if (job.status !== 'completed') {
        throw new Error(`${config.displayName} job ${jobId} ${job.status}: ${job.error ?? 'no details'}`);
      }
      const summary = summarizeJob(job, projectId);
      if (config.resultKind === 'transcript') {
        const result = summary['result'] as Record<string, unknown>;
        summary['text'] = typeof result['text'] === 'string' ? result['text'] : null;
        summary['language_code'] = result['language_code'] ?? null;
      }
      return summary;
    },
  });
}

export function num(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
