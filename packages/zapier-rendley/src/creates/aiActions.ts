import { makeAiActionCreate, sourceField } from "./aiActionFactory";
import { num, str, urlList } from "../lib/zapier";

export const transcribe = makeAiActionCreate<{ source: string; start_time?: number; end_time?: number }>({
  key: "transcribe",
  noun: "Transcript",
  label: "Transcribe Audio or Video",
  description: "Transcribes the speech in an audio or video file into timed text.",
  action: "transcribe",
  resultKind: "transcript",
  paramFields: [
    sourceField("source", "Source File", "audio or video file to transcribe"),
    {
      key: "start_time",
      label: "Start Time (Seconds)",
      type: "number",
      required: false,
      helpText: "Optional: transcribe from this point instead of the start of the file.",
    },
    {
      key: "end_time",
      label: "End Time (Seconds)",
      type: "number",
      required: false,
      helpText: "Optional: stop transcribing at this point instead of the end of the file.",
    },
  ],
  buildParams: (input) => ({
    media: str(input.source),
    ...(num(input.start_time) !== undefined ? { start_time: num(input.start_time) } : {}),
    ...(num(input.end_time) !== undefined ? { end_time: num(input.end_time) } : {}),
  }),
});

export const textToSpeech = makeAiActionCreate<{
  voice_id: string;
  text: string;
  speed?: number;
  stability?: number;
}>({
  key: "text_to_speech",
  noun: "Speech Audio",
  label: "Text to Speech",
  description: "Converts a script into spoken audio with an AI voice.",
  action: "text-to-speech",
  paramFields: [
    {
      key: "voice_id",
      label: "Voice",
      type: "string",
      required: true,
      dynamic: "list_tts_voices.id.name",
      helpText: "The voice to speak with, from Rendley's voice catalog.",
    },
    {
      key: "text",
      label: "Script",
      type: "text",
      required: true,
      helpText: "The exact words to speak, without stage directions.",
    },
    {
      key: "speed",
      label: "Speed",
      type: "number",
      required: false,
      helpText: "Speaking rate between 0.7 and 1.2, where 1 is the voice's natural speed.",
    },
    {
      key: "stability",
      label: "Stability",
      type: "number",
      required: false,
      helpText: "0 to 1. Higher is more consistent and less expressive.",
    },
  ],
  buildParams: (input) => ({
    voice_id: input.voice_id,
    prompt: input.text,
    ...(num(input.speed) !== undefined ? { speed: num(input.speed) } : {}),
    ...(num(input.stability) !== undefined ? { stability: num(input.stability) } : {}),
  }),
  sample: { mime_type: "audio/mpeg", type: "text_to_speech" },
});

export const translateVideo = makeAiActionCreate<{
  source: string;
  output_language: string;
  mode?: "speed" | "precision";
}>({
  key: "translate_video",
  noun: "Dubbed Video",
  label: "Dub Video",
  description: "Translates a video's speech into another language and dubs it back in.",
  action: "video-translate",
  paramFields: [
    sourceField("source", "Source Video", "video to dub"),
    {
      key: "output_language",
      label: "Target Language",
      type: "string",
      required: true,
      dynamic: "list_translate_languages.id.name",
      helpText: "The language to dub the spoken audio into.",
    },
    {
      key: "mode",
      label: "Mode",
      type: "string",
      required: false,
      choices: { precision: "Precision (higher fidelity)", speed: "Speed (faster)" },
      helpText: "Trade dubbing accuracy against turnaround time. Defaults to precision.",
    },
  ],
  buildParams: (input) => ({
    media: str(input.source),
    output_language: input.output_language,
    ...(input.mode ? { mode: input.mode } : {}),
  }),
  sample: { type: "video_translate" },
});

export const lipSync = makeAiActionCreate<{ video_source: string; audio_source: string }>({
  key: "lip_sync",
  noun: "Lip-Synced Video",
  label: "Lip Sync",
  description: "Re-times a speaker's mouth in a video to match a new audio track.",
  action: "lipsync",
  paramFields: [
    sourceField("video_source", "Video With Speaker", "video showing the speaker"),
    sourceField("audio_source", "New Audio Track", "audio the lips should follow"),
  ],
  buildParams: (input) => ({
    video_media: str(input.video_source),
    audio_media: str(input.audio_source),
  }),
  sample: { type: "lipsync" },
});

export const isolateVoice = makeAiActionCreate<{ source: string }>({
  key: "isolate_voice",
  noun: "Isolated Voice",
  label: "Isolate Voice",
  description: "Strips background noise and music from a recording, keeping only the voice.",
  action: "voice-isolation",
  paramFields: [sourceField("source", "Audio or Video", "recording to clean up")],
  buildParams: (input) => ({ media: str(input.source) }),
  sample: { mime_type: "audio/mpeg", type: "voice_isolation" },
});

export const changeVoice = makeAiActionCreate<{ source: string; voice_id: string }>({
  key: "change_voice",
  noun: "Voice-Changed Audio",
  label: "Change Voice",
  description: "Replaces the speaker's voice in a recording while keeping the timing and delivery.",
  action: "voice-changer",
  paramFields: [
    sourceField("source", "Audio or Video", "recording whose voice to replace"),
    {
      key: "voice_id",
      label: "Voice",
      type: "string",
      required: true,
      dynamic: "list_tts_voices.id.name",
      helpText: "The voice to convert the speech into, from Rendley's voice catalog.",
    },
  ],
  buildParams: (input) => ({ media: str(input.source), voice_id: input.voice_id }),
  sample: { mime_type: "audio/mpeg", type: "voice_changer" },
});

export const removeVideoBackground = makeAiActionCreate<{ source: string }>({
  key: "remove_video_background",
  noun: "Video",
  label: "Remove Video Background",
  description: "Cuts the subject out of a video frame by frame, producing a transparent background.",
  action: "remove-video-background",
  paramFields: [sourceField("source", "Source Video", "video to cut out")],
  buildParams: (input) => ({ media: str(input.source) }),
  sample: { mime_type: "video/webm", type: "remove_video_background" },
});

export const removeImageBackground = makeAiActionCreate<{ source: string }>({
  key: "remove_image_background",
  noun: "Image",
  label: "Remove Image Background",
  description: "Cuts the subject out of an image onto a transparent background.",
  action: "remove-image-background",
  paramFields: [sourceField("source", "Source Image", "image to cut out")],
  buildParams: (input) => ({ media: str(input.source) }),
  sample: { mime_type: "image/png", type: "remove_image_background" },
});

export const upscaleImage = makeAiActionCreate<{ source: string; scale?: number }>({
  key: "upscale_image",
  noun: "Image",
  label: "Upscale Image",
  description: "Increases an image's resolution with AI super-resolution.",
  action: "upscale-image",
  paramFields: [
    sourceField("source", "Source Image", "image to upscale"),
    {
      key: "scale",
      label: "Scale",
      type: "integer",
      required: false,
      choices: { "2": "2x", "4": "4x" },
      helpText: "How much larger the result should be. Defaults to 2x.",
    },
  ],
  buildParams: (input) => ({
    media: str(input.source),
    ...(num(input.scale) !== undefined ? { scale: num(input.scale) } : {}),
  }),
  sample: { mime_type: "image/png", type: "upscale_image" },
});

export const generateImage = makeAiActionCreate<{
  prompt: string;
  image_urls?: string[];
  aspect_ratio?: string;
}>({
  key: "generate_image",
  noun: "Image",
  label: "Generate Image",
  description: "Generates an image from a text prompt, optionally guided by reference images.",
  action: "generate-image",
  paramFields: [
    {
      key: "prompt",
      label: "Prompt",
      type: "text",
      required: true,
      helpText: "Describe the image you want, including style and composition.",
    },
    {
      key: "image_urls",
      label: "Reference Images",
      type: "string",
      list: true,
      required: false,
      helpText: "Optional public image URLs to transform or use as references, for models that accept them.",
    },
    {
      key: "aspect_ratio",
      label: "Aspect Ratio",
      type: "string",
      required: false,
      helpText: "Optional, for example `16:9`, `9:16` or `1:1`. Supported values depend on the model.",
    },
  ],
  buildParams: (input) => ({
    prompt: input.prompt,
    ...(urlList(input.image_urls) ? { image_inputs: urlList(input.image_urls) } : {}),
    ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
  }),
  sample: { mime_type: "image/png", type: "generate_image" },
});

export const generateVideo = makeAiActionCreate<{
  prompt: string;
  image_url?: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
}>({
  key: "generate_video",
  noun: "Video Clip",
  label: "Generate Video",
  description: "Generates a video clip from a text prompt, optionally animating a starting image.",
  action: "generate-video",
  paramFields: [
    {
      key: "prompt",
      label: "Prompt",
      type: "text",
      required: true,
      helpText: "Describe the motion, subject and style of the clip.",
    },
    {
      key: "image_url",
      label: "Start Image",
      type: "string",
      required: false,
      helpText: "Optional public URL of an image to use as the first frame (image to video).",
    },
    {
      key: "duration",
      label: "Duration (Seconds)",
      type: "integer",
      required: false,
      helpText: "Optional clip length. Supported values depend on the model, typically 5 or 10.",
    },
    {
      key: "aspect_ratio",
      label: "Aspect Ratio",
      type: "string",
      required: false,
      helpText: "Optional, for example `16:9` or `9:16`. Usually ignored when a start image is given.",
    },
    {
      key: "resolution",
      label: "Resolution",
      type: "string",
      required: false,
      helpText: "Optional, for example `720p` or `1080p`. Supported values depend on the model.",
    },
  ],
  buildParams: (input) => ({
    prompt: input.prompt,
    ...(input.image_url ? { start_image: input.image_url } : {}),
    ...(num(input.duration) !== undefined ? { duration: num(input.duration) } : {}),
    ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
  }),
  sample: { type: "generate_video" },
});

export const generateMusic = makeAiActionCreate<{ prompt: string; duration_seconds?: number }>({
  key: "generate_music",
  noun: "Music Track",
  label: "Generate Music",
  description: "Generates a music track from a text prompt describing genre, instruments and mood.",
  action: "generate-music",
  paramFields: [
    {
      key: "prompt",
      label: "Prompt",
      type: "text",
      required: true,
      helpText: "Describe the music: genre, instruments, tempo, mood and structure.",
    },
    {
      key: "duration_seconds",
      label: "Duration (Seconds)",
      type: "number",
      required: false,
      helpText: "Optional track length. Supported ranges depend on the model.",
    },
  ],
  buildParams: (input) => ({
    prompt: input.prompt,
    ...(num(input.duration_seconds) !== undefined ? { duration_seconds: num(input.duration_seconds) } : {}),
  }),
  sample: { mime_type: "audio/mpeg", type: "generate_music" },
});

export const generateSoundEffect = makeAiActionCreate<{ prompt: string; duration_seconds?: number }>({
  key: "generate_sound_effect",
  noun: "Sound Effect",
  label: "Generate Sound Effect",
  description: "Generates a short sound effect from a text prompt.",
  action: "generate-sound-effect",
  paramFields: [
    {
      key: "prompt",
      label: "Prompt",
      type: "text",
      required: true,
      helpText: "Describe the sound, for example `whoosh transition` or `gentle rain ambience`.",
    },
    {
      key: "duration_seconds",
      label: "Duration (Seconds)",
      type: "number",
      required: false,
      helpText: "Optional length between 0.5 and 22 seconds. Defaults to the model's choice.",
    },
  ],
  buildParams: (input) => ({
    prompt: input.prompt,
    ...(num(input.duration_seconds) !== undefined ? { duration_seconds: num(input.duration_seconds) } : {}),
  }),
  sample: { mime_type: "audio/mpeg", type: "generate_sound_effect" },
});
