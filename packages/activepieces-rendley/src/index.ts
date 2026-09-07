import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { createPiece } from '@activepieces/pieces-framework';
import { rendleyAuth } from './lib/common/auth';
import { getBaseUrl } from './lib/common/client';
import {
  changeVoice,
  dubVideo,
  generateImage,
  generateMusic,
  generateSoundEffect,
  generateVideo,
  isolateVoice,
  lipSync,
  removeImageBackground,
  removeVideoBackground,
  textToSpeech,
  transcribe,
  upscaleImage,
} from './lib/actions/ai-actions';
import {
  cancelAgentJob,
  createProject,
  editWithAgent,
  estimateCost,
  getAgentJob,
  getJob,
  getMediaUrl,
  renderVideo,
  uploadMedia,
} from './lib/actions/core-actions';
import { newCompletedJob, newProject } from './lib/triggers/triggers';

export const rendley = createPiece({
  displayName: 'Rendley',
  description: 'AI video editing and generation: edit projects with an AI agent, generate speech, images, video and music, transcribe, dub, and render MP4s.',
  auth: rendleyAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/rendley.png',
  authors: ['rendleyhq'],
  actions: [
    editWithAgent,
    renderVideo,
    textToSpeech,
    generateImage,
    generateVideo,
    generateMusic,
    generateSoundEffect,
    transcribe,
    dubVideo,
    lipSync,
    isolateVoice,
    changeVoice,
    removeVideoBackground,
    removeImageBackground,
    upscaleImage,
    uploadMedia,
    getMediaUrl,
    createProject,
    getJob,
    getAgentJob,
    cancelAgentJob,
    estimateCost,
    createCustomApiCallAction({
      auth: rendleyAuth,
      baseUrl: () => getBaseUrl(),
      authMapping: async (auth) => ({ Authorization: `Bearer ${(auth as { secret_text: string }).secret_text}` }),
    }),
  ],
  triggers: [newCompletedJob, newProject],
});
