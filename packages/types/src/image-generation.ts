import { Timestamp } from "firebase/firestore";

/**
 * Requested output resolution.
 *
 * Note: Vertex Imagen provider currently supports only "1K" and "2K" as an explicit parameter.
 * For other models/situations, values like "4K" can be used as a prompt hint.
 * GPT Image 2 accepts custom `WIDTHxHEIGHT` sizes that satisfy its API constraints.
 */
export type LegacyImageGenerationSize = "1K" | "2K" | "4K";
export type GptImage2PresetSize = "1024x1024" | "1024x1536" | "1536x1024";
export type GptImage2CustomSize = `${number}x${number}`;
export type GptImage2GenerationSize = GptImage2PresetSize | GptImage2CustomSize;
export type ImageGenerationSize =
  | LegacyImageGenerationSize
  | GptImage2GenerationSize;
export type ImageGenerationQuality = "low" | "medium";
export type ImageGenerationAspectRatio =
  | "1:1"
  | "9:16"
  | "16:9"
  | "3:4"
  | "4:3"
  | "3:2"
  | "2:3"
  | "5:4"
  | "4:5"
  | "21:9";
export type GptImage2SupportedAspectRatio = Extract<
  ImageGenerationAspectRatio,
  "1:1" | "2:3" | "3:2"
>;

export const GPT_IMAGE_2_SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
] as const satisfies readonly GptImage2SupportedAspectRatio[];

export const GPT_IMAGE_2_SUPPORTED_SIZES = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
] as const satisfies readonly GptImage2PresetSize[];

export const GPT_IMAGE_2_SIZE_CONSTRAINTS = {
  maxAspectRatio: 3,
  maxEdge: 3840,
  maxPixels: 8_294_400,
  minPixels: 655_360,
  multipleOf: 16,
} as const;

export const GPT_IMAGE_2_DEFAULT_SIZE: GptImage2GenerationSize = "1024x1024";
export const GPT_IMAGE_2_DEFAULT_QUALITY: ImageGenerationQuality = "medium";
export const GPT_IMAGE_2_PRICE_USD_CENTS = {
  low: {
    "1024x1024": 0.6,
    "1024x1536": 0.5,
    "1536x1024": 0.5,
  },
  medium: {
    "1024x1024": 5.3,
    "1024x1536": 4.1,
    "1536x1024": 4.1,
  },
} as const satisfies Record<
  ImageGenerationQuality,
  Record<GptImage2PresetSize, number>
>;

type ParsedGptImage2Size = {
  width: number;
  height: number;
  size: GptImage2GenerationSize;
  totalPixels: number;
  simplifiedAspectRatio: string;
};

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));

  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }

  return x || 1;
}

export function parseGptImage2Size(
  size: string | undefined,
): ParsedGptImage2Size | undefined {
  if (typeof size !== "string") {
    return undefined;
  }

  const normalized = size.trim().toLowerCase().replace(/\s+/g, "");
  const match = /^(\d+)x(\d+)$/.exec(normalized);
  if (!match) {
    return undefined;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  const { maxAspectRatio, maxEdge, maxPixels, minPixels, multipleOf } =
    GPT_IMAGE_2_SIZE_CONSTRAINTS;

  if (
    width > maxEdge ||
    height > maxEdge ||
    width % multipleOf !== 0 ||
    height % multipleOf !== 0
  ) {
    return undefined;
  }

  const totalPixels = width * height;
  if (totalPixels < minPixels || totalPixels > maxPixels) {
    return undefined;
  }

  const aspectRatio = Math.max(width / height, height / width);
  if (!Number.isFinite(aspectRatio) || aspectRatio > maxAspectRatio) {
    return undefined;
  }

  const divisor = greatestCommonDivisor(width, height);
  return {
    width,
    height,
    size: `${width}x${height}` as GptImage2GenerationSize,
    totalPixels,
    simplifiedAspectRatio: `${width / divisor}:${height / divisor}`,
  };
}

export function isGptImage2GenerationSize(
  size: ImageGenerationSize | undefined,
): size is GptImage2GenerationSize {
  return Boolean(parseGptImage2Size(size));
}

export function isGptImage2PresetSize(
  size: GptImage2GenerationSize | undefined,
): size is GptImage2PresetSize {
  return size === "1024x1024" || size === "1024x1536" || size === "1536x1024";
}

export function getGptImage2SizeForAspectRatio(
  aspectRatio: ImageGenerationAspectRatio | undefined,
): GptImage2PresetSize | undefined {
  switch (aspectRatio) {
    case "1:1":
      return "1024x1024";
    case "3:4":
    case "2:3":
      return "1024x1536";
    case "4:3":
    case "3:2":
      return "1536x1024";
    default:
      return undefined;
  }
}

export function getGptImage2AspectRatioLabel(
  size: GptImage2GenerationSize,
): string | undefined {
  return parseGptImage2Size(size)?.simplifiedAspectRatio;
}

export function getAspectRatioForGptImage2Size(
  size: GptImage2GenerationSize,
): ImageGenerationAspectRatio | undefined {
  switch (getGptImage2AspectRatioLabel(size)) {
    case "1:1":
      return "1:1";
    case "2:3":
      return "2:3";
    case "3:2":
      return "3:2";
    case "4:3":
      return "4:3";
    case "3:4":
      return "3:4";
    case "16:9":
      return "16:9";
    case "9:16":
      return "9:16";
    case "5:4":
      return "5:4";
    case "4:5":
      return "4:5";
    case "21:9":
      return "21:9";
    default:
      return undefined;
  }
}

export function resolveGptImage2Quality(
  quality: ImageGenerationQuality | undefined,
): ImageGenerationQuality {
  switch (quality) {
    case "low":
    case "medium":
      return quality;
    default:
      return GPT_IMAGE_2_DEFAULT_QUALITY;
  }
}

export function getGptImage2PriceUsdCents(params: {
  size: GptImage2PresetSize;
  quality?: ImageGenerationQuality;
}): number {
  const { size, quality } = params;
  return GPT_IMAGE_2_PRICE_USD_CENTS[resolveGptImage2Quality(quality)][size];
}

/**
 * Allowed MIME types for Gemini image model reference images.
 *
 * Source: Vertex AI image requirements.
 */
export const GEMINI_REFERENCE_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type GeminiReferenceImageMimeType =
  (typeof GEMINI_REFERENCE_IMAGE_MIME_TYPES)[number];

export interface ImageGenerationRequest {
  prompt: string;
  model:
    | "gemini-3.1-flash-lite-image"
    | "gemini-3.1-flash-image"
    | "gemini-3-pro-image-preview"
    | "bfl/flux-2-klein-9b"
    | "openai/gpt-image-2"
    | "quiverai/arrow-1.1";
  numberOfImages?: number;
  aspectRatio?: ImageGenerationAspectRatio;
  /**
   * Output resolution hint for Vertex Imagen models.
   * Maps to Vertex provider option `sampleImageSize` (e.g. "1K", "2K").
   */
  size?: ImageGenerationSize;
  quality?: ImageGenerationQuality;
  negativePrompt?: string;
  /**
   * Reference image for editing.
   *
   * Supported formats:
   * - Data URL (e.g. `data:image/png;base64,...`)
   * - Raw base64 string
   * - URL (recommended; e.g. Firebase Storage download URL)
   */
  referenceImage?: string;
  /**
   * Multiple reference images for editing.
   *
   * If provided, prefer this over `referenceImage`.
   * Each entry supports the same formats as `referenceImage`.
   *
   * Note: the maximum number of reference images is model-specific (e.g. Gemini Flash: 3, Gemini 3 Pro: 14).
   */
  referenceImages?: string[];
  language?: string; // User's current language for auto-translation
}

export type GeminiImageModel = Extract<
  ImageGenerationRequest["model"],
  | "gemini-3.1-flash-lite-image"
  | "gemini-3.1-flash-image"
  | "gemini-3-pro-image-preview"
>;

export type GatewayImageModel = Extract<
  ImageGenerationRequest["model"],
  "bfl/flux-2-klein-9b" | "openai/gpt-image-2" | "quiverai/arrow-1.1"
>;

export type OpenAiImageModel = Extract<
  ImageGenerationRequest["model"],
  "openai/gpt-image-2"
>;

export function isGeminiImageModel(
  model: ImageGenerationRequest["model"],
): model is GeminiImageModel {
  return (
    model === "gemini-3.1-flash-lite-image" ||
    model === "gemini-3.1-flash-image" ||
    model === "gemini-3-pro-image-preview"
  );
}

export function isGatewayImageModel(
  model: ImageGenerationRequest["model"],
): model is GatewayImageModel {
  return (
    model === "bfl/flux-2-klein-9b" ||
    model === "openai/gpt-image-2" ||
    model === "quiverai/arrow-1.1"
  );
}

export function isOpenAiImageModel(
  model: ImageGenerationRequest["model"],
): model is OpenAiImageModel {
  return model === "openai/gpt-image-2";
}

export interface ImageModelCapabilities {
  supportsNegativePrompt: boolean;
  supportsAspectRatio: boolean;
  supportsMultipleImages: boolean;
  maxImages: number;
  supportedLanguages: string[];
  supportsImageInput: boolean; // For image editing models
  supportsImageOutput: boolean; // Can generate images
  supportsSize: boolean;
  supportsQuality: boolean;
}

export const IMAGE_MODEL_CAPABILITIES: Record<
  ImageGenerationRequest["model"],
  ImageModelCapabilities
> = {
  "gemini-3.1-flash-lite-image": {
    supportsNegativePrompt: false,
    supportsAspectRatio: true,
    supportsMultipleImages: false,
    maxImages: 1,
    supportedLanguages: [
      "en",
      "es",
      "ja",
      "zh",
      "hi",
      "pl",
      "de",
      "fr",
      "it",
      "pt",
      "ko",
    ],
    supportsImageInput: true,
    supportsImageOutput: true,
    supportsSize: true,
    supportsQuality: false,
  },
  "gemini-3.1-flash-image": {
    supportsNegativePrompt: false,
    supportsAspectRatio: false,
    supportsMultipleImages: false,
    maxImages: 1,
    supportedLanguages: [
      "en",
      "es",
      "ja",
      "zh",
      "hi",
      "pl",
      "de",
      "fr",
      "it",
      "pt",
      "ko",
    ],
    supportsImageInput: true,
    supportsImageOutput: true,
    supportsSize: false,
    supportsQuality: false,
  },
  "gemini-3-pro-image-preview": {
    supportsNegativePrompt: false,
    supportsAspectRatio: false,
    supportsMultipleImages: false,
    maxImages: 1,
    supportedLanguages: [
      "en",
      "es",
      "ja",
      "zh",
      "hi",
      "pl",
      "de",
      "fr",
      "it",
      "pt",
      "ko",
    ],
    supportsImageInput: true,
    supportsImageOutput: true,
    supportsSize: false,
    supportsQuality: false,
  },
  "bfl/flux-2-klein-9b": {
    supportsNegativePrompt: false,
    supportsAspectRatio: true,
    supportsMultipleImages: true,
    maxImages: 4,
    supportedLanguages: ["en"],
    supportsImageInput: true,
    supportsImageOutput: true,
    supportsSize: false,
    supportsQuality: false,
  },
  "openai/gpt-image-2": {
    supportsNegativePrompt: false,
    supportsAspectRatio: true,
    supportsMultipleImages: true,
    maxImages: 4,
    supportedLanguages: [
      "en",
      "es",
      "ja",
      "zh",
      "hi",
      "pl",
      "de",
      "fr",
      "it",
      "pt",
      "ko",
    ],
    supportsImageInput: true,
    supportsImageOutput: true,
    supportsSize: true,
    supportsQuality: true,
  },
  "quiverai/arrow-1.1": {
    supportsNegativePrompt: false,
    supportsAspectRatio: false,
    supportsMultipleImages: false,
    maxImages: 1,
    supportedLanguages: ["en"],
    supportsImageInput: false,
    supportsImageOutput: true,
    supportsSize: false,
    supportsQuality: false,
  },
};

export interface GeneratedImage {
  id: string;
  /**
   * Optional Firebase Storage path for this image (e.g. `ai/generated/YYYY-MM-DD/<model>/<id>.<ext>`).
   * When present, prefer this over reconstructing paths from timestamps.
   */
  storagePath?: string;
  url: string;
  base64?: string;
  prompt: string;
  model: string;
  aspectRatio?: ImageGenerationAspectRatio;
  /**
   * Optional resolution hint used for generation.
   * For Imagen models this may map to an explicit provider option (e.g. "1K", "2K");
   * for other models it may be stored as a prompt hint.
   */
  size?: ImageGenerationSize;
  quality?: ImageGenerationQuality;
  timestamp: Timestamp;
  width?: number;
  height?: number;
}

export interface ImageGenerationSession {
  id: string;
  userId: string;
  images: GeneratedImage[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Video generation types
// ---------------------------------------------------------------------------

export type VertexVideoModel =
  | "veo-3.1-generate-001"
  | "veo-3.1-fast-generate-001";
export type VideoModel = VertexVideoModel;

export function isVertexVideoModel(
  model: VideoModel,
): model is VertexVideoModel {
  return (
    model === "veo-3.1-generate-001" || model === "veo-3.1-fast-generate-001"
  );
}

export interface VideoGenerationRequest {
  prompt: string;
  model: VideoModel;
  aspectRatio?: "1:1" | "9:16" | "16:9" | "3:4" | "4:3" | "3:2" | "2:3";
  duration?: number;
  language?: string;
  /** Reference image URL for image-to-video generation (first frame). */
  image?: string;
  /** Additional reference image URLs for style guidance (Vertex only). */
  referenceImages?: string[];
  /** Whether to generate audio along with the video (Vertex only). */
  generateAudio?: boolean;
}

export interface VideoModelCapabilities {
  supportsAspectRatio: boolean;
  supportsDuration: boolean;
  maxDurationSeconds: number;
  defaultDurationSeconds: number;
  /** Specific allowed durations in seconds. If set, only these values are valid. */
  supportedDurations?: number[];
  supportedAspectRatios: string[];
  supportedLanguages: string[];
  supportsImageInput: boolean;
  maxImageInputs: number;
  supportsAudio: boolean;
}

export const VIDEO_MODEL_CAPABILITIES: Record<
  VideoModel,
  VideoModelCapabilities
> = {
  "veo-3.1-generate-001": {
    supportsAspectRatio: true,
    supportsDuration: true,
    maxDurationSeconds: 8,
    defaultDurationSeconds: 4,
    supportedDurations: [4, 6, 8],
    supportedAspectRatios: ["16:9", "9:16"],
    supportedLanguages: ["en"],
    supportsImageInput: true,
    maxImageInputs: 1,
    supportsAudio: true,
  },
  "veo-3.1-fast-generate-001": {
    supportsAspectRatio: true,
    supportsDuration: true,
    maxDurationSeconds: 8,
    defaultDurationSeconds: 4,
    supportedDurations: [4, 6, 8],
    supportedAspectRatios: ["16:9", "9:16"],
    supportedLanguages: ["en"],
    supportsImageInput: true,
    maxImageInputs: 1,
    supportsAudio: true,
  },
};

export interface GeneratedVideo {
  id: string;
  storagePath?: string;
  url: string;
  prompt: string;
  model: string;
  aspectRatio?: string;
  duration?: number;
  timestamp: Timestamp;
}
