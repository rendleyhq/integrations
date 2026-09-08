import authentication from "./authentication";
import { listTranslateLanguages, listTtsVoices, listWorkspaces, newCompletedJob, newProject } from "./triggers";
import {
  changeVoice,
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
  translateVideo,
  upscaleImage,
  upscaleVideo,
} from "./creates/aiActions";
import { createProject, uploadMedia } from "./creates/projectsAndMedia";
import { aiVideoAgent, startExport } from "./creates/agentAndExport";
import { estimateCost, findProject, getAgentJob, getJob, getMediaUrl } from "./searches";

// zapier-platform-core is provided by the Zapier runtime and kept external in
// the bundle; only its version string is needed here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: platformVersion } = require("zapier-platform-core") as { version: string };

const App = {
  version: require("../package.json").version as string,
  platformVersion,
  // Keep list inputs (Files, Reference Images) exactly as entered.
  flags: { cleanInputData: false },
  authentication,
  triggers: {
    [newCompletedJob.key]: newCompletedJob,
    [newProject.key]: newProject,
    [listWorkspaces.key]: listWorkspaces,
    [listTtsVoices.key]: listTtsVoices,
    [listTranslateLanguages.key]: listTranslateLanguages,
  },
  creates: {
    [aiVideoAgent.key]: aiVideoAgent,
    [startExport.key]: startExport,
    [createProject.key]: createProject,
    [uploadMedia.key]: uploadMedia,
    [transcribe.key]: transcribe,
    [textToSpeech.key]: textToSpeech,
    [translateVideo.key]: translateVideo,
    [lipSync.key]: lipSync,
    [isolateVoice.key]: isolateVoice,
    [changeVoice.key]: changeVoice,
    [removeVideoBackground.key]: removeVideoBackground,
    [removeImageBackground.key]: removeImageBackground,
    [upscaleImage.key]: upscaleImage,
    [upscaleVideo.key]: upscaleVideo,
    [generateImage.key]: generateImage,
    [generateVideo.key]: generateVideo,
    [generateMusic.key]: generateMusic,
    [generateSoundEffect.key]: generateSoundEffect,
  },
  searches: {
    [getJob.key]: getJob,
    [getAgentJob.key]: getAgentJob,
    [findProject.key]: findProject,
    [getMediaUrl.key]: getMediaUrl,
    [estimateCost.key]: estimateCost,
  },
};

export = App;
