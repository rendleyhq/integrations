const { RendleyClient, RendleyError, summarizeJob, isTerminal } = require("./lib/rendley.js");

/**
 * Operations the Rendley node performs. Each reads its inputs from
 * `msg.payload` (an object), with `project_id` defaulting to the node's
 * Project ID field. The result replaces `msg.payload`; `msg.rendley` carries
 * the operation and, for jobs, the job id.
 */
const OPERATIONS = {
  async listWorkspaces(client) {
    return client.listWorkspaces();
  },
  async listProjects(client, p) {
    return client.listProjects(p.workspace_id);
  },
  async createProject(client, p) {
    return client.createProject({ name: required(p, "name"), workspaceId: p.workspace_id, templateId: p.template_id });
  },
  async getProject(client, p) {
    return client.getProject(required(p, "project_id"));
  },
  async deleteProject(client, p) {
    await client.deleteProject(required(p, "project_id"));
    return { deleted: true, id: p.project_id };
  },
  async uploadMedia(client, p) {
    return client.importUpload(required(p, "project_id"), {
      downloadUrl: required(p, "file_url"),
      fileName: p.file_name,
      mimeType: p.mime_type,
    });
  },
  async getMediaUrl(client, p) {
    return client.getMediaUrl(required(p, "project_id"), { mediaId: p.media_id, fileHash: p.file_hash });
  },
  async aiAction(client, p, node) {
    const { jobId } = await client.runAiAction(required(p, "action"), {
      projectId: required(p, "project_id"),
      modelId: p.model_id,
      params: p.params || {},
    });
    if (!node.wait) return { job_id: jobId, status: "queued", is_complete: false, project_id: p.project_id };
    const job = await client.waitForJob(jobId, waitOpts(node));
    failIfNotCompleted(job.status, job.error, `AI action ${p.action}`);
    return { ...summarizeJob(job), project_id: p.project_id };
  },
  async estimateCost(client, p) {
    const action = required(p, "action");
    const credits =
      action === "export"
        ? await client.estimateExportCost({ projectId: required(p, "project_id"), settings: p.settings })
        : await client.estimateAiActionCost(action, { projectId: required(p, "project_id"), modelId: p.model_id, params: p.params || {} });
    return { action, credits, usd: credits / 100 };
  },
  async render(client, p, node) {
    const { jobId } = await client.createExport({ projectId: required(p, "project_id"), settings: p.settings });
    if (!node.wait) return { job_id: jobId, status: "queued", is_complete: false, project_id: p.project_id };
    const job = await client.waitForJob(jobId, waitOpts(node));
    failIfNotCompleted(job.status, job.error, "Render");
    const summary = summarizeJob(job);
    return { ...summary, project_id: p.project_id, video_url: summary.download_url };
  },
  async getJob(client, p) {
    return summarizeJob(await client.getJob(required(p, "job_id")));
  },
  async waitForJob(client, p, node) {
    return summarizeJob(await client.waitForJob(required(p, "job_id"), waitOpts(node)));
  },
  async agentEdit(client, p, node) {
    const started = await client.startAgentJob({
      prompt: required(p, "prompt"),
      projectId: p.project_id,
      threadId: p.thread_id,
      files: Array.isArray(p.file_urls) ? p.file_urls.map((url) => ({ url })) : undefined,
    });
    if (!node.wait) return agentShape(started);
    const job = await client.waitForAgentJob(started.job_id, waitOpts(node));
    failIfNotCompleted(job.status, job.error || job.last_message, "Agent edit");
    return agentShape({ ...job, thread_id: job.thread_id || started.thread_id });
  },
  async getAgentJob(client, p) {
    return agentShape(await client.getAgentJob(required(p, "job_id")));
  },
  async waitForAgentJob(client, p, node) {
    return agentShape(await client.waitForAgentJob(required(p, "job_id"), waitOpts(node)));
  },
  async cancelAgentJob(client, p) {
    return agentShape(await client.cancelAgentJob(required(p, "job_id")));
  },
};

function required(payload, key) {
  const value = payload[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`msg.payload.${key} is required for this operation`);
  }
  return value;
}

function failIfNotCompleted(status, error, what) {
  if (isTerminal(status) && status !== "completed") {
    throw new Error(`${what} ${status}: ${error || "no details"}`);
  }
}

function waitOpts(node) {
  return { timeoutMs: (node.timeout || 300) * 1000, pollIntervalMs: 4000 };
}

function agentShape(job) {
  return {
    job_id: job.job_id,
    project_id: job.project_id || null,
    thread_id: job.thread_id || null,
    status: job.status,
    is_complete: isTerminal(job.status),
    last_message: job.last_message || null,
    error: job.error || null,
    commands_applied: job.commands_applied ?? null,
    commands_failed: job.commands_failed ?? null,
  };
}

module.exports = function (RED) {
  function RendleyNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.operation = config.operation || "aiAction";
    node.projectId = config.projectId || "";
    node.wait = config.wait !== false;
    node.timeout = Number(config.timeout) || 300;
    node.configNode = RED.nodes.getNode(config.rendley);

    node.on("input", async function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };

      if (!node.configNode || !node.configNode.credentials || !node.configNode.credentials.apiKey) {
        return done(new Error("Rendley config node with an API key is required"));
      }
      const operation = msg.operation || node.operation;
      const handler = OPERATIONS[operation];
      if (!handler) return done(new Error(`Unknown Rendley operation "${operation}"`));

      const payload = msg.payload && typeof msg.payload === "object" && !Array.isArray(msg.payload) ? { ...msg.payload } : {};
      if (!payload.project_id && node.projectId) payload.project_id = node.projectId;

      const client = new RendleyClient({
        apiKey: node.configNode.credentials.apiKey,
        apiBaseUrl: node.configNode.baseUrl,
      });

      node.status({ fill: "blue", shape: "dot", text: operation });
      try {
        const result = await handler(client, payload, node);
        msg.payload = result;
        msg.rendley = { operation, job_id: result && result.job_id ? result.job_id : undefined };
        node.status({ fill: "green", shape: "dot", text: `${operation} ok` });
        send(msg);
        done();
      } catch (err) {
        const message = err instanceof RendleyError ? `${err.message} (${err.code})` : err.message;
        node.status({ fill: "red", shape: "ring", text: message.slice(0, 40) });
        done(new Error(message));
      }
    });

    node.on("close", () => node.status({}));
  }
  RED.nodes.registerType("rendley", RendleyNode);
};

module.exports.OPERATIONS = Object.keys(OPERATIONS);
