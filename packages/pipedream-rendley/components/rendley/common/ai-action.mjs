import rendley from "../rendley.app.mjs";
import constants from "./constants.mjs";

/**
 * Builds one Pipedream action for a Rendley AI action. `buildParams` maps the
 * action's own props to the model `params`; the shared props (project, model,
 * extra parameters, wait, timeout) are added here.
 */
export function aiAction({
  key, name, description, action, props = {}, buildParams, resultKind = "media",
}) {
  return {
    key,
    name,
    description: `${description} Consumes Rendley credits. [See the documentation](https://docs.rendley.com)`,
    version: "0.1.0",
    type: "action",
    annotations: {
      destructiveHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    props: {
      rendley,
      projectId: {
        propDefinition: [
          rendley,
          "projectId",
        ],
      },
      ...props,
      modelId: {
        propDefinition: [
          rendley,
          "modelId",
          () => ({
            action,
          }),
        ],
      },
      paramsJson: {
        propDefinition: [
          rendley,
          "paramsJson",
        ],
      },
      waitForCompletion: {
        propDefinition: [
          rendley,
          "waitForCompletion",
        ],
      },
      timeoutSeconds: {
        propDefinition: [
          rendley,
          "timeoutSeconds",
        ],
      },
    },
    async run({ $ }) {
      const params = {
        ...buildParams(this),
        ...parseObject(this.paramsJson),
      };
      const started = await this.rendley.runAiAction({
        $,
        action,
        data: {
          project_id: this.projectId,
          ...(this.modelId
            ? {
              model_id: this.modelId,
            }
            : {}),
          params,
        },
      });
      const jobId = typeof started === "string"
        ? started
        : started?.job_id;
      if (!jobId) {
        throw new Error(`Rendley did not return a job ID for ${action}.`);
      }

      if (this.waitForCompletion === false) {
        $.export("$summary", `Started ${name} job ${jobId}`);
        return {
          job_id: jobId,
          project_id: this.projectId,
          status: "queued",
          is_complete: false,
        };
      }

      const job = await this.rendley.waitForJob({
        $,
        jobId,
        timeoutSeconds: this.timeoutSeconds,
      });
      if (job.status !== "completed") {
        throw new Error(`${name} job ${jobId} ${job.status}: ${job.error || "no details"}`);
      }
      const summary = this.rendley.summarizeJob(job);
      summary.project_id = summary.project_id || this.projectId;
      if (resultKind === "transcript") {
        summary.text = typeof summary.result.text === "string"
          ? summary.result.text
          : null;
        summary.language_code = summary.result.language_code || null;
        $.export("$summary", `Transcribed ${summary.text
          ? `${summary.text.length} characters`
          : "audio"}`);
      } else {
        $.export("$summary", `${name} completed: job ${jobId}`);
      }
      return summary;
    },
  };
}

export function parseObject(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    throw new Error("Extra Parameters must be a JSON object.");
  }
}

export function num(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : undefined;
}

export { constants };
