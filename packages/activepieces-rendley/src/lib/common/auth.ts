import { HttpMethod } from '@activepieces/pieces-common';
import { PieceAuth } from '@activepieces/pieces-framework';
import { rendleyApiCall } from './client';

export const rendleyAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'Create an API key at app.rendley.com/settings. AI actions consume credits; the agent and renders need an active subscription.',
  required: true,
  validate: async ({ auth }) => {
    try {
      await rendleyApiCall({ apiKey: auth as string, method: HttpMethod.GET, resourceUri: '/workspaces' });
      return { valid: true };
    } catch {
      return { valid: false, error: 'Rendley rejected this API key.' };
    }
  },
});
