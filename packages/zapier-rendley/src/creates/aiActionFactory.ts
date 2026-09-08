import {
  JOB_OUTPUT_FIELDS,
  MODEL_FIELD,
  PARAMS_JSON_FIELD,
  PROJECT_FIELD,
  URL_EXPIRY_NOTE,
  WORKSPACE_FIELD,
  WAIT_BUDGET_MS,
  WAIT_FIELD,
  clientFor,
  jobOutput,
  jobSample,
  parseParamsJson,
  toUserError,
  wantsWait,
  type Bundle,
  type Create,
  type InputField,
  type ZObject,
} from "../lib/zapier";
import { isTerminal, parseResultData } from "@rendley/client";

export interface AiActionBaseInput {
  project_id?: string;
  workspace_id?: string;
  model?: string;
  params_json?: string;
  wait_for_completion?: boolean | string;
}

export interface AiActionConfig<I> {
  key: string;
  noun: string;
  label: string;
  description: string;
  /** Wire action for `POST /v1/ai/{action}`. */
  action: string;
  paramFields: InputField[];
  buildParams: (input: I & AiActionBaseInput) => Record<string, unknown>;
  /** `transcript` actions return the transcript in `result` instead of a file. */
  resultKind?: "media" | "transcript";
  sample?: { mime_type?: string; type?: string };
}

/**
 * One AI action as a Zapier create. `perform` enqueues the job; when the user
 * waits, it polls for up to {@link WAIT_BUDGET_MS} and returns the job in
 * whatever state it reached, with `is_complete` saying whether the result is
 * in. Zapier stops a step at 30 seconds, so longer jobs are finished with a
 * Delay step plus the Get Job Status search.
 */
export function makeAiActionCreate<I>(config: AiActionConfig<I>): Create<I & AiActionBaseInput> {
  type Input = I & AiActionBaseInput;

  const perform = async (z: ZObject, bundle: Bundle<Input>) => {
    const client = clientFor(bundle);
    const input = bundle.inputData;
    try {
      const params = { ...config.buildParams(input), ...parseParamsJson(z, input.params_json) };
      // The result lands in the project, or in the workspace library.
      const { jobId } = await client.runAiAction(config.action, {
        projectId: input.project_id || undefined,
        workspaceId: input.project_id ? undefined : input.workspace_id || undefined,
        modelId: input.model || undefined,
        params,
      });

      if (!wantsWait(input.wait_for_completion)) {
        return { ...jobOutput({ id: jobId, type: config.action.replace(/-/g, "_"), status: "queued" }, input.project_id) };
      }

      const { job } = await client.waitForJobBounded(jobId, WAIT_BUDGET_MS);
      if (isTerminal(job.status) && job.status !== "completed") {
        throw new z.errors.Error(
          `Rendley ${config.label} job ${job.id} ${job.status}: ${job.error ?? "no details"}`,
        );
      }
      const output = jobOutput(job, input.project_id);
      if (config.resultKind === "transcript") {
        const result = parseResultData(job) ?? {};
        output.text = typeof result.text === "string" ? result.text : null;
        output.language_code = typeof result.language_code === "string" ? result.language_code : null;
      }
      return output;
    } catch (err) {
      throw toUserError(z, err);
    }
  };

  const sample =
    config.resultKind === "transcript"
      ? jobSample({
          type: "transcription",
          media_id: null,
          file_hash: null,
          url: null,
          url_expires_at: null,
          mime_type: null,
          size: null,
          duration: null,
          text: "Welcome to the show.",
          language_code: "eng",
          result_data: {
            language_code: "eng",
            text: "Welcome to the show.",
            words: [{ text: "Welcome", start: 0.0, end: 0.4, type: "word" }],
          },
        })
      : jobSample({
          type: config.sample?.type ?? config.action.replace(/-/g, "_"),
          mime_type: config.sample?.mime_type ?? "video/mp4",
        });

  return {
    key: config.key,
    noun: config.noun,
    display: {
      label: config.label,
      description:
        config.resultKind === "transcript"
          ? `${config.description} Consumes Rendley credits. Saved to your workspace library unless a project is chosen.`
          : `${config.description} Consumes Rendley credits. Saved to your workspace library unless a project is chosen. ${URL_EXPIRY_NOTE}`,
    },
    operation: {
      inputFields: [PROJECT_FIELD, WORKSPACE_FIELD, ...config.paramFields, MODEL_FIELD, PARAMS_JSON_FIELD, WAIT_FIELD],
      perform,
      sample,
      outputFields:
        config.resultKind === "transcript"
          ? [
              ...JOB_OUTPUT_FIELDS,
              { key: "text", label: "Transcript Text" },
              { key: "language_code", label: "Language Code" },
            ]
          : JOB_OUTPUT_FIELDS,
    },
  };
}

/** The "URL, media ID or file hash" source field used by single-file actions. */
export function sourceField(key: string, label: string, what: string): InputField {
  return {
    key,
    label,
    type: "string",
    required: true,
    helpText: `A public URL of the ${what}, or the Media ID or File Hash of a file already uploaded to the project (see the Upload Media action).`,
  };
}
