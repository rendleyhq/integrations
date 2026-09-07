import { Property } from '@activepieces/pieces-framework';
import { aiAction, num } from './ai-action';
import { languageDropdown, mediaProp, voiceDropdown } from '../common/props';

const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v).trim() || undefined);

export const transcribe = aiAction({
  name: 'transcribe',
  displayName: 'Transcribe Audio or Video',
  description: 'Transcribes the speech in an audio or video file into timed text.',
  action: 'transcribe',
  resultKind: 'transcript',
  props: {
    media: mediaProp('Source File', 'audio or video to transcribe'),
    startTime: Property.Number({ displayName: 'Start Time (Seconds)', description: 'Optional. Transcribe from this point.', required: false }),
    endTime: Property.Number({ displayName: 'End Time (Seconds)', description: 'Optional. Stop transcribing at this point.', required: false }),
  },
  buildParams: (p) => ({
    media: str(p['media']),
    ...(num(p['startTime']) !== undefined ? { start_time: num(p['startTime']) } : {}),
    ...(num(p['endTime']) !== undefined ? { end_time: num(p['endTime']) } : {}),
  }),
});

export const textToSpeech = aiAction({
  name: 'text_to_speech',
  displayName: 'Text to Speech',
  description: 'Converts a script into spoken audio with an AI voice.',
  action: 'text-to-speech',
  props: {
    voiceId: voiceDropdown,
    text: Property.LongText({ displayName: 'Script', description: 'The exact words to speak.', required: true }),
    speed: Property.Number({ displayName: 'Speed', description: 'Optional speaking rate between 0.7 and 1.2, where 1 is natural.', required: false }),
    stability: Property.Number({ displayName: 'Stability', description: 'Optional, 0 to 1. Higher is more consistent and less expressive.', required: false }),
  },
  buildParams: (p) => ({
    voice_id: p['voiceId'],
    prompt: p['text'],
    ...(num(p['speed']) !== undefined ? { speed: num(p['speed']) } : {}),
    ...(num(p['stability']) !== undefined ? { stability: num(p['stability']) } : {}),
  }),
});

export const dubVideo = aiAction({
  name: 'dub_video',
  displayName: 'Dub Video',
  description: "Translates a video's speech into another language and dubs it back in.",
  action: 'video-translate',
  props: {
    media: mediaProp('Source Video', 'video to dub'),
    outputLanguage: languageDropdown,
    mode: Property.StaticDropdown({
      displayName: 'Mode',
      description: 'Trade dubbing accuracy against turnaround time.',
      required: false,
      options: { options: [{ label: 'Precision', value: 'precision' }, { label: 'Speed', value: 'speed' }] },
    }),
  },
  buildParams: (p) => ({ media: str(p['media']), output_language: p['outputLanguage'], ...(p['mode'] ? { mode: p['mode'] } : {}) }),
});

export const lipSync = aiAction({
  name: 'lip_sync',
  displayName: 'Lip Sync',
  description: "Re-times a speaker's mouth in a video to match a new audio track.",
  action: 'lipsync',
  props: {
    videoMedia: mediaProp('Video With Speaker', 'video showing the speaker'),
    audioMedia: mediaProp('New Audio Track', 'audio the lips should follow'),
  },
  buildParams: (p) => ({ video_media: str(p['videoMedia']), audio_media: str(p['audioMedia']) }),
});

export const isolateVoice = aiAction({
  name: 'isolate_voice',
  displayName: 'Isolate Voice',
  description: 'Strips background noise and music from a recording, keeping only the voice.',
  action: 'voice-isolation',
  props: { media: mediaProp('Audio or Video', 'recording to clean up') },
  buildParams: (p) => ({ media: str(p['media']) }),
});

export const changeVoice = aiAction({
  name: 'change_voice',
  displayName: 'Change Voice',
  description: "Replaces the speaker's voice in a recording while keeping the timing and delivery.",
  action: 'voice-changer',
  props: { media: mediaProp('Audio or Video', 'recording whose voice to replace'), voiceId: voiceDropdown },
  buildParams: (p) => ({ media: str(p['media']), voice_id: p['voiceId'] }),
});

export const removeVideoBackground = aiAction({
  name: 'remove_video_background',
  displayName: 'Remove Video Background',
  description: 'Cuts the subject out of a video frame by frame.',
  action: 'remove-video-background',
  props: { media: mediaProp('Source Video', 'video to cut out') },
  buildParams: (p) => ({ media: str(p['media']) }),
});

export const removeImageBackground = aiAction({
  name: 'remove_image_background',
  displayName: 'Remove Image Background',
  description: 'Cuts the subject out of an image onto a transparent background.',
  action: 'remove-image-background',
  props: { media: mediaProp('Source Image', 'image to cut out') },
  buildParams: (p) => ({ media: str(p['media']) }),
});

export const upscaleImage = aiAction({
  name: 'upscale_image',
  displayName: 'Upscale Image',
  description: "Increases an image's resolution with AI super-resolution.",
  action: 'upscale-image',
  props: {
    media: mediaProp('Source Image', 'image to upscale'),
    scale: Property.StaticDropdown({
      displayName: 'Scale',
      description: 'How much larger the result should be. Defaults to 2x.',
      required: false,
      options: { options: [{ label: '2x', value: 2 }, { label: '4x', value: 4 }] },
    }),
  },
  buildParams: (p) => ({ media: str(p['media']), ...(num(p['scale']) !== undefined ? { scale: num(p['scale']) } : {}) }),
});

export const generateImage = aiAction({
  name: 'generate_image',
  displayName: 'Generate Image',
  description: 'Generates an image from a text prompt, optionally guided by reference images.',
  action: 'generate-image',
  props: {
    prompt: Property.LongText({ displayName: 'Prompt', description: 'Describe the image you want, including style and composition.', required: true }),
    imageUrls: Property.Array({ displayName: 'Reference Images', description: 'Optional public image URLs to transform or use as references.', required: false }),
    aspectRatio: Property.ShortText({ displayName: 'Aspect Ratio', description: 'Optional, for example 16:9, 9:16 or 1:1.', required: false }),
  },
  buildParams: (p) => ({
    prompt: p['prompt'],
    ...(Array.isArray(p['imageUrls']) && p['imageUrls'].length ? { image_inputs: p['imageUrls'] } : {}),
    ...(p['aspectRatio'] ? { aspect_ratio: p['aspectRatio'] } : {}),
  }),
});

export const generateVideo = aiAction({
  name: 'generate_video',
  displayName: 'Generate Video',
  description: 'Generates a video clip from a text prompt, optionally animating a starting image.',
  action: 'generate-video',
  props: {
    prompt: Property.LongText({ displayName: 'Prompt', description: 'Describe the motion, subject and style of the clip.', required: true }),
    imageUrl: Property.ShortText({ displayName: 'Start Image', description: 'Optional public URL of an image to use as the first frame.', required: false }),
    duration: Property.Number({ displayName: 'Duration (Seconds)', description: 'Optional clip length. Supported values depend on the model, typically 5 or 10.', required: false }),
    aspectRatio: Property.ShortText({ displayName: 'Aspect Ratio', description: 'Optional, for example 16:9 or 9:16.', required: false }),
    resolution: Property.ShortText({ displayName: 'Resolution', description: 'Optional, for example 720p or 1080p.', required: false }),
  },
  buildParams: (p) => ({
    prompt: p['prompt'],
    ...(p['imageUrl'] ? { start_image: p['imageUrl'] } : {}),
    ...(num(p['duration']) !== undefined ? { duration: num(p['duration']) } : {}),
    ...(p['aspectRatio'] ? { aspect_ratio: p['aspectRatio'] } : {}),
    ...(p['resolution'] ? { resolution: p['resolution'] } : {}),
  }),
});

export const generateMusic = aiAction({
  name: 'generate_music',
  displayName: 'Generate Music',
  description: 'Generates a music track from a text prompt describing genre, instruments and mood.',
  action: 'generate-music',
  props: {
    prompt: Property.LongText({ displayName: 'Prompt', description: 'Describe the music: genre, instruments, tempo, mood and structure.', required: true }),
    durationSeconds: Property.Number({ displayName: 'Duration (Seconds)', description: 'Optional track length.', required: false }),
  },
  buildParams: (p) => ({ prompt: p['prompt'], ...(num(p['durationSeconds']) !== undefined ? { duration_seconds: num(p['durationSeconds']) } : {}) }),
});

export const generateSoundEffect = aiAction({
  name: 'generate_sound_effect',
  displayName: 'Generate Sound Effect',
  description: 'Generates a short sound effect from a text prompt.',
  action: 'generate-sound-effect',
  props: {
    prompt: Property.LongText({ displayName: 'Prompt', description: 'Describe the sound, for example "whoosh transition".', required: true }),
    durationSeconds: Property.Number({ displayName: 'Duration (Seconds)', description: 'Optional length between 0.5 and 22 seconds.', required: false }),
  },
  buildParams: (p) => ({ prompt: p['prompt'], ...(num(p['durationSeconds']) !== undefined ? { duration_seconds: num(p['durationSeconds']) } : {}) }),
});
