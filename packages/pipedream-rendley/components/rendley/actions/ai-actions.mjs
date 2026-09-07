import rendley from "../rendley.app.mjs";
import {
  aiAction, num,
} from "../common/ai-action.mjs";

const media = (label, description) => ({
  type: "string",
  label,
  description: `${description} A public URL, or the Media ID or File Hash of a file already uploaded to the project.`,
});

export const transcribe = aiAction({
  key: "rendley-transcribe",
  name: "Transcribe",
  description: "Transcribes the speech in an audio or video file into timed text.",
  action: "transcribe",
  resultKind: "transcript",
  props: {
    media: media("Source File", "The audio or video to transcribe."),
    startTime: {
      type: "integer",
      label: "Start Time (Seconds)",
      description: "Optional. Transcribe from this point.",
      optional: true,
    },
    endTime: {
      type: "integer",
      label: "End Time (Seconds)",
      description: "Optional. Stop transcribing at this point.",
      optional: true,
    },
  },
  buildParams: (self) => ({
    media: self.media,
    ...(num(self.startTime) !== undefined
      ? {
        start_time: num(self.startTime),
      }
      : {}),
    ...(num(self.endTime) !== undefined
      ? {
        end_time: num(self.endTime),
      }
      : {}),
  }),
});

export const textToSpeech = aiAction({
  key: "rendley-text-to-speech",
  name: "Text to Speech",
  description: "Converts a script into spoken audio with an AI voice.",
  action: "text-to-speech",
  props: {
    voiceId: {
      propDefinition: [
        rendley,
        "voiceId",
      ],
    },
    text: {
      type: "string",
      label: "Script",
      description: "The exact words to speak.",
    },
    speed: {
      type: "string",
      label: "Speed",
      description: "Optional speaking rate between 0.7 and 1.2, where 1 is natural.",
      optional: true,
    },
    stability: {
      type: "string",
      label: "Stability",
      description: "Optional, 0 to 1. Higher is more consistent and less expressive.",
      optional: true,
    },
  },
  buildParams: (self) => ({
    voice_id: self.voiceId,
    prompt: self.text,
    ...(num(self.speed) !== undefined
      ? {
        speed: num(self.speed),
      }
      : {}),
    ...(num(self.stability) !== undefined
      ? {
        stability: num(self.stability),
      }
      : {}),
  }),
});

export const dubVideo = aiAction({
  key: "rendley-dub-video",
  name: "Dub Video",
  description: "Translates a video's speech into another language and dubs it back in.",
  action: "video-translate",
  props: {
    media: media("Source Video", "The video to dub."),
    outputLanguage: {
      propDefinition: [
        rendley,
        "outputLanguage",
      ],
    },
    mode: {
      type: "string",
      label: "Mode",
      description: "Trade dubbing accuracy against turnaround time.",
      optional: true,
      options: [
        "precision",
        "speed",
      ],
    },
  },
  buildParams: (self) => ({
    media: self.media,
    output_language: self.outputLanguage,
    ...(self.mode
      ? {
        mode: self.mode,
      }
      : {}),
  }),
});

export const lipSync = aiAction({
  key: "rendley-lip-sync",
  name: "Lip Sync",
  description: "Re-times a speaker's mouth in a video to match a new audio track.",
  action: "lipsync",
  props: {
    videoMedia: media("Video With Speaker", "The video showing the speaker."),
    audioMedia: media("New Audio Track", "The audio the lips should follow."),
  },
  buildParams: (self) => ({
    video_media: self.videoMedia,
    audio_media: self.audioMedia,
  }),
});

export const isolateVoice = aiAction({
  key: "rendley-isolate-voice",
  name: "Isolate Voice",
  description: "Strips background noise and music from a recording, keeping only the voice.",
  action: "voice-isolation",
  props: {
    media: media("Audio or Video", "The recording to clean up."),
  },
  buildParams: (self) => ({
    media: self.media,
  }),
});

export const changeVoice = aiAction({
  key: "rendley-change-voice",
  name: "Change Voice",
  description: "Replaces the speaker's voice in a recording while keeping the timing and delivery.",
  action: "voice-changer",
  props: {
    media: media("Audio or Video", "The recording whose voice to replace."),
    voiceId: {
      propDefinition: [
        rendley,
        "voiceId",
      ],
    },
  },
  buildParams: (self) => ({
    media: self.media,
    voice_id: self.voiceId,
  }),
});

export const removeVideoBackground = aiAction({
  key: "rendley-remove-video-background",
  name: "Remove Video Background",
  description: "Cuts the subject out of a video frame by frame.",
  action: "remove-video-background",
  props: {
    media: media("Source Video", "The video to cut out."),
  },
  buildParams: (self) => ({
    media: self.media,
  }),
});

export const removeImageBackground = aiAction({
  key: "rendley-remove-image-background",
  name: "Remove Image Background",
  description: "Cuts the subject out of an image onto a transparent background.",
  action: "remove-image-background",
  props: {
    media: media("Source Image", "The image to cut out."),
  },
  buildParams: (self) => ({
    media: self.media,
  }),
});

export const upscaleImage = aiAction({
  key: "rendley-upscale-image",
  name: "Upscale Image",
  description: "Increases an image's resolution with AI super-resolution.",
  action: "upscale-image",
  props: {
    media: media("Source Image", "The image to upscale."),
    scale: {
      type: "integer",
      label: "Scale",
      description: "How much larger the result should be. Defaults to 2.",
      optional: true,
      options: [
        {
          label: "2x",
          value: 2,
        },
        {
          label: "4x",
          value: 4,
        },
      ],
    },
  },
  buildParams: (self) => ({
    media: self.media,
    ...(num(self.scale) !== undefined
      ? {
        scale: num(self.scale),
      }
      : {}),
  }),
});

export const generateImage = aiAction({
  key: "rendley-generate-image",
  name: "Generate Image",
  description: "Generates an image from a text prompt, optionally guided by reference images.",
  action: "generate-image",
  props: {
    prompt: {
      type: "string",
      label: "Prompt",
      description: "Describe the image you want, including style and composition.",
    },
    imageUrls: {
      type: "string[]",
      label: "Reference Images",
      description: "Optional public image URLs to transform or use as references.",
      optional: true,
    },
    aspectRatio: {
      type: "string",
      label: "Aspect Ratio",
      description: "Optional, for example `16:9`, `9:16` or `1:1`.",
      optional: true,
    },
  },
  buildParams: (self) => ({
    prompt: self.prompt,
    ...(self.imageUrls?.length
      ? {
        image_inputs: self.imageUrls,
      }
      : {}),
    ...(self.aspectRatio
      ? {
        aspect_ratio: self.aspectRatio,
      }
      : {}),
  }),
});

export const generateVideo = aiAction({
  key: "rendley-generate-video",
  name: "Generate Video",
  description: "Generates a video clip from a text prompt, optionally animating a starting image.",
  action: "generate-video",
  props: {
    prompt: {
      type: "string",
      label: "Prompt",
      description: "Describe the motion, subject and style of the clip.",
    },
    imageUrl: {
      type: "string",
      label: "Start Image",
      description: "Optional public URL of an image to use as the first frame.",
      optional: true,
    },
    duration: {
      type: "integer",
      label: "Duration (Seconds)",
      description: "Optional clip length. Supported values depend on the model, typically 5 or 10.",
      optional: true,
    },
    aspectRatio: {
      type: "string",
      label: "Aspect Ratio",
      description: "Optional, for example `16:9` or `9:16`.",
      optional: true,
    },
    resolution: {
      type: "string",
      label: "Resolution",
      description: "Optional, for example `720p` or `1080p`.",
      optional: true,
    },
  },
  buildParams: (self) => ({
    prompt: self.prompt,
    ...(self.imageUrl
      ? {
        start_image: self.imageUrl,
      }
      : {}),
    ...(num(self.duration) !== undefined
      ? {
        duration: num(self.duration),
      }
      : {}),
    ...(self.aspectRatio
      ? {
        aspect_ratio: self.aspectRatio,
      }
      : {}),
    ...(self.resolution
      ? {
        resolution: self.resolution,
      }
      : {}),
  }),
});

export const generateMusic = aiAction({
  key: "rendley-generate-music",
  name: "Generate Music",
  description: "Generates a music track from a text prompt describing genre, instruments and mood.",
  action: "generate-music",
  props: {
    prompt: {
      type: "string",
      label: "Prompt",
      description: "Describe the music: genre, instruments, tempo, mood and structure.",
    },
    durationSeconds: {
      type: "integer",
      label: "Duration (Seconds)",
      description: "Optional track length.",
      optional: true,
    },
  },
  buildParams: (self) => ({
    prompt: self.prompt,
    ...(num(self.durationSeconds) !== undefined
      ? {
        duration_seconds: num(self.durationSeconds),
      }
      : {}),
  }),
});

export const generateSoundEffect = aiAction({
  key: "rendley-generate-sound-effect",
  name: "Generate Sound Effect",
  description: "Generates a short sound effect from a text prompt.",
  action: "generate-sound-effect",
  props: {
    prompt: {
      type: "string",
      label: "Prompt",
      description: "Describe the sound, for example `whoosh transition`.",
    },
    durationSeconds: {
      type: "string",
      label: "Duration (Seconds)",
      description: "Optional length between 0.5 and 22 seconds.",
      optional: true,
    },
  },
  buildParams: (self) => ({
    prompt: self.prompt,
    ...(num(self.durationSeconds) !== undefined
      ? {
        duration_seconds: num(self.durationSeconds),
      }
      : {}),
  }),
});
