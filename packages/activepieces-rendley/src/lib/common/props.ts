import { HttpMethod } from '@activepieces/pieces-common';
import { Property } from '@activepieces/pieces-framework';
import { rendleyAuth } from './auth';
import { defaultWorkspaceId, rendleyApiCall } from './client';

const disabled = (placeholder: string) => ({ disabled: true, options: [], placeholder });

const projectOptions = async ({ auth }: { auth?: unknown }) => {
      if (!auth) return disabled('Connect your Rendley account first.');
      const apiKey = (auth as { secret_text: string }).secret_text;
      const workspaceId = await defaultWorkspaceId(apiKey);
      const projects = await rendleyApiCall<Array<{ id: string; name: string }>>({
        apiKey,
        method: HttpMethod.GET,
        resourceUri: '/projects',
        query: { workspace_id: workspaceId },
      });
      return { disabled: false, options: projects.map((p) => ({ label: p.name || p.id, value: p.id })) };
};

export const projectDropdown = Property.Dropdown({
  auth: rendleyAuth,
  displayName: 'Project',
  description: 'The Rendley project the media is stored in.',
  required: true,
  refreshers: [],
  options: projectOptions,
});

export const optionalProjectDropdown = Property.Dropdown({
  auth: rendleyAuth,
  displayName: 'Project',
  description: 'Optional existing project to edit. Leave empty to let the agent create one.',
  required: false,
  refreshers: [],
  options: projectOptions,
});

export const workspaceDropdown = Property.Dropdown({
  auth: rendleyAuth,
  displayName: 'Workspace',
  description: 'Optional. Defaults to your first workspace.',
  required: false,
  refreshers: [],
  options: async ({ auth }) => {
    if (!auth) return disabled('Connect your Rendley account first.');
    const workspaces = await rendleyApiCall<Array<{ id: string; name: string }>>({
      apiKey: (auth as { secret_text: string }).secret_text,
      method: HttpMethod.GET,
      resourceUri: '/workspaces',
    });
    return { disabled: false, options: workspaces.map((w) => ({ label: w.name || w.id, value: w.id })) };
  },
});

export const voiceDropdown = Property.Dropdown({
  auth: rendleyAuth,
  displayName: 'Voice',
  description: "A voice from Rendley's text-to-speech catalog.",
  required: true,
  refreshers: [],
  options: async ({ auth }) => {
    if (!auth) return disabled('Connect your Rendley account first.');
    const voices = await rendleyApiCall<Array<{ id: string; name: string }>>({
      apiKey: (auth as { secret_text: string }).secret_text,
      method: HttpMethod.GET,
      resourceUri: '/ai/text-to-speech/voices',
      query: { limit: 100 },
    });
    return { disabled: false, options: voices.map((v) => ({ label: v.name || v.id, value: v.id })) };
  },
});

export const languageDropdown = Property.Dropdown({
  auth: rendleyAuth,
  displayName: 'Target Language',
  description: 'The language to dub the spoken audio into.',
  required: true,
  refreshers: [],
  options: async ({ auth }) => {
    if (!auth) return disabled('Connect your Rendley account first.');
    const languages = await rendleyApiCall<Array<{ id: string; name: string }>>({
      apiKey: (auth as { secret_text: string }).secret_text,
      method: HttpMethod.GET,
      resourceUri: '/ai/video-translate/languages',
    });
    return { disabled: false, options: languages.map((l) => ({ label: l.name || l.id, value: l.id })) };
  },
});

/** Models offered for one action; the catalog spells actions with underscores. */
export const modelDropdown = (action: string) =>
  Property.Dropdown({
    auth: rendleyAuth,
    displayName: 'Model',
    description: "Optional. Leave empty for Rendley's default model.",
    required: false,
    refreshers: [],
    options: async ({ auth }) => {
      if (!auth) return disabled('Connect your Rendley account first.');
      const tools = await rendleyApiCall<Array<{ action: string; models: Array<{ id: string; name: string }> }>>({
        apiKey: (auth as { secret_text: string }).secret_text,
        method: HttpMethod.GET,
        resourceUri: '/ai/tools',
      });
      const tool = tools.find((t) => t.action === action.replace(/-/g, '_'));
      return { disabled: false, options: (tool?.models ?? []).map((m) => ({ label: m.name || m.id, value: m.id })) };
    },
  });

export const mediaProp = (displayName: string, what: string) =>
  Property.ShortText({
    displayName,
    description: `A public URL of the ${what}, or the Media ID or File Hash of a file already uploaded to the project (see Upload Media From URL).`,
    required: true,
  });

export const extraParamsProp = Property.Json({
  displayName: 'Extra Parameters',
  description: 'Optional model-specific parameters merged into the request, for example {"aspect_ratio": "9:16"}. Schemas: GET /v1/ai/models/{model_id}.',
  required: false,
});

export const waitProp = Property.Checkbox({
  displayName: 'Wait for Completion',
  description: 'Poll until the job finishes (up to the Timeout) and return the result with a fresh download URL. Turn off to return the Job ID immediately and follow it with Get Job Status.',
  required: false,
  defaultValue: true,
});

export const timeoutProp = (defaultValue = 240) =>
  Property.Number({
    displayName: 'Timeout (Seconds)',
    description: 'How long to wait when Wait for Completion is on.',
    required: false,
    defaultValue,
  });
