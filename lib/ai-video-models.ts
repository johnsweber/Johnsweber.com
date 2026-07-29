export const AI_VIDEO_MODELS = {
  wan22: {
    key: "wan22",
    name: "Wan 2.2 I2V-A14B",
    description: "Image-guided motion with strong composition retention.",
    mode: "image-to-video",
    supportsImage: true,
    requiresImage: true,
    supportsAudio: false,
    endpointEnv: "WAN22_MODAL_URL",
    qualities: {
      "480p": { label: "480p", width: 832, height: 480 },
      "720p": { label: "720p", width: 1280, height: 720 },
    },
    durations: {
      "5": { seconds: 5, frames: 81, fps: 16 },
      "10": { seconds: 10, frames: 161, fps: 16 },
    },
    estimates: {
      "480p-5": 300,
      "480p-10": 540,
      "720p-5": 600,
      "720p-10": 900,
    },
  },
  ltx23: {
    key: "ltx23",
    name: "LTX 2.3",
    description: "Fast text- or image-guided video with synchronized generated audio.",
    mode: "text-or-image-to-video",
    supportsImage: true,
    requiresImage: false,
    supportsAudio: true,
    endpointEnv: "LTX23_MODAL_URL",
    qualities: {
      standard: { label: "768 × 512", width: 768, height: 512 },
      wide: { label: "1280 × 768", width: 1280, height: 768 },
    },
    durations: {
      "5": { seconds: 5, frames: 121, fps: 24 },
      "10": { seconds: 10, frames: 241, fps: 24 },
    },
    estimates: {
      "standard-5": 180,
      "standard-10": 300,
      "wide-5": 300,
      "wide-10": 480,
    },
  },
} as const;

export type AiVideoModelKey = keyof typeof AI_VIDEO_MODELS;

export function getModelConfig(modelKey: string) {
  if (!(modelKey in AI_VIDEO_MODELS)) return null;
  return AI_VIDEO_MODELS[modelKey as AiVideoModelKey];
}

export function getGenerationSettings(
  modelKey: string,
  qualityKey: string,
  durationKey: string,
) {
  const model = getModelConfig(modelKey);
  if (!model) return null;
  const quality = model.qualities[
    qualityKey as keyof typeof model.qualities
  ] as { label: string; width: number; height: number } | undefined;
  const duration = model.durations[
    durationKey as keyof typeof model.durations
  ] as { seconds: number; frames: number; fps: number } | undefined;
  const estimate = model.estimates[
    `${qualityKey}-${durationKey}` as keyof typeof model.estimates
  ] as number | undefined;
  if (!quality || !duration || !estimate) return null;
  return { model, quality, duration, estimate };
}
