const BASE_URL = "https://api.rendley.com/v1";

const TERMINAL_STATUSES = [
  "completed",
  "failed",
  "canceled",
  "cancelled",
];

/** Rendley AI actions exposed as dedicated Pipedream actions. */
const AI_ACTIONS = {
  "text-to-speech": "Text to Speech",
  "generate-image": "Generate Image",
  "generate-video": "Generate Video",
  "generate-music": "Generate Music",
  "generate-sound-effect": "Generate Sound Effect",
  "transcribe": "Transcribe",
  "video-translate": "Dub Video",
  "lipsync": "Lip Sync",
  "voice-isolation": "Isolate Voice",
  "voice-changer": "Change Voice",
  "remove-video-background": "Remove Video Background",
  "remove-image-background": "Remove Image Background",
  "upscale-image": "Upscale Image",
};

const JOB_TYPES = {
  export_video: "Render Video",
  transcription: "Transcribe",
  text_to_speech: "Text to Speech",
  video_translate: "Dub Video",
  lipsync: "Lip Sync",
  voice_isolation: "Isolate Voice",
  voice_changer: "Change Voice",
  remove_video_background: "Remove Video Background",
  remove_image_background: "Remove Image Background",
  upscale_image: "Upscale Image",
  generate_image: "Generate Image",
  generate_video: "Generate Video",
  generate_music: "Generate Music",
  generate_sound_effect: "Generate Sound Effect",
};

const URL_EXPIRY_NOTE = "Download URLs are signed and expire after a few hours.";

export default {
  BASE_URL,
  TERMINAL_STATUSES,
  AI_ACTIONS,
  JOB_TYPES,
  URL_EXPIRY_NOTE,
};
