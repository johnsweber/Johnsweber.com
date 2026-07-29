export type PicturePresetKey = "fast" | "medium" | "quality";
export type PictureAspectKey = "square" | "landscape" | "portrait";

export const AI_PICTURE_MODELS = {
  base: {
    key: "base",
    name: "SDXL Base 1.0",
    description: "Versatile photoreal, illustrative, and concept-image creation.",
    provider: "local",
    supportsReference: false,
    presets: {
      fast: { steps: 16, estimateSeconds: 45 },
      medium: { steps: 24, estimateSeconds: 75 },
      quality: { steps: 32, estimateSeconds: 110 },
    },
  },
  animagine: {
    key: "animagine",
    name: "Animagine XL 4.0",
    description: "Expressive anime and illustration-focused image creation.",
    provider: "local",
    supportsReference: false,
    presets: {
      fast: { steps: 18, estimateSeconds: 50 },
      medium: { steps: 28, estimateSeconds: 85 },
      quality: { steps: 36, estimateSeconds: 120 },
    },
  },
  zimage: {
    key: "zimage",
    name: "Z-Image Turbo 6B",
    description: "Fast photoreal generation, strong prompt adherence, and reference-image editing.",
    provider: "modal",
    supportsReference: true,
    presets: {
      fast: { steps: 4, estimateSeconds: 18 },
      medium: { steps: 6, estimateSeconds: 28 },
      quality: { steps: 9, estimateSeconds: 42 },
    },
  },
} as const;

export type PictureModelKey = keyof typeof AI_PICTURE_MODELS;

export const PICTURE_ASPECTS = {
  square: {
    label: "Square",
    dimensions: {
      fast: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      quality: { width: 1280, height: 1280 },
    },
  },
  landscape: {
    label: "Landscape",
    dimensions: {
      fast: { width: 1024, height: 576 },
      medium: { width: 1280, height: 720 },
      quality: { width: 1536, height: 864 },
    },
  },
  portrait: {
    label: "Portrait",
    dimensions: {
      fast: { width: 576, height: 1024 },
      medium: { width: 720, height: 1280 },
      quality: { width: 864, height: 1536 },
    },
  },
} as const;

export function getPictureSettings(
  modelKey: string,
  presetKey: string,
  aspectKey: string,
) {
  if (!(modelKey in AI_PICTURE_MODELS)) return null;
  if (!(presetKey in AI_PICTURE_MODELS.base.presets)) return null;
  if (!(aspectKey in PICTURE_ASPECTS)) return null;
  const model = AI_PICTURE_MODELS[modelKey as PictureModelKey];
  const preset = model.presets[presetKey as PicturePresetKey];
  const dimensions =
    PICTURE_ASPECTS[aspectKey as PictureAspectKey].dimensions[
      presetKey as PicturePresetKey
    ];
  return { model, preset, dimensions };
}
