import {
  GPT_IMAGE_2_DEFAULT_QUALITY,
  GPT_IMAGE_2_DEFAULT_SIZE,
  isGatewayImageModel,
  type ImageGenerationRequest,
} from "@konfi/types";

export const NANO_BANANA_2_LITE_PRODUCT_IMAGE_MODEL =
  "gemini-3.1-flash-lite-image";
export const NANO_BANANA_2_PRODUCT_IMAGE_MODEL = "gemini-3.1-flash-image";
export const GPT_IMAGE_2_PRODUCT_IMAGE_MODEL = "openai/gpt-image-2";

export const PRODUCT_IMAGE_GENERATION_MODELS = [
  NANO_BANANA_2_LITE_PRODUCT_IMAGE_MODEL,
  NANO_BANANA_2_PRODUCT_IMAGE_MODEL,
  GPT_IMAGE_2_PRODUCT_IMAGE_MODEL,
] as const satisfies readonly ImageGenerationRequest["model"][];

export type ProductImageGenerationModel =
  (typeof PRODUCT_IMAGE_GENERATION_MODELS)[number];

export const DEFAULT_PRODUCT_IMAGE_GENERATION_MODEL: ProductImageGenerationModel =
  NANO_BANANA_2_PRODUCT_IMAGE_MODEL;

const PRODUCT_IMAGE_GENERATION_MODEL_SET = new Set<string>(
  PRODUCT_IMAGE_GENERATION_MODELS,
);

export function getProductImageGenerationModels(options?: {
  includeGatewayModels?: boolean;
}): readonly ProductImageGenerationModel[] {
  if (options?.includeGatewayModels ?? true) {
    return PRODUCT_IMAGE_GENERATION_MODELS;
  }

  return PRODUCT_IMAGE_GENERATION_MODELS.filter(
    (model) => !isGatewayImageModel(model),
  );
}

export function isProductImageGenerationModel(
  value: string,
): value is ProductImageGenerationModel {
  return PRODUCT_IMAGE_GENERATION_MODEL_SET.has(value);
}

export function buildProductImageGenerationRequest(params: {
  language?: string;
  maxReferenceImages: number;
  model: ProductImageGenerationModel;
  prompt: string;
  referenceImages?: string[];
}): ImageGenerationRequest {
  const { language, maxReferenceImages, model, prompt, referenceImages } =
    params;
  const normalizedReferenceImages = referenceImages?.slice(
    0,
    maxReferenceImages,
  );
  const request: ImageGenerationRequest = {
    aspectRatio: "1:1",
    language,
    model,
    numberOfImages: 1,
    prompt: prompt.trim(),
    ...(normalizedReferenceImages && normalizedReferenceImages.length > 0
      ? { referenceImages: normalizedReferenceImages }
      : {}),
  };

  if (model === GPT_IMAGE_2_PRODUCT_IMAGE_MODEL) {
    return {
      ...request,
      quality: GPT_IMAGE_2_DEFAULT_QUALITY,
      size: GPT_IMAGE_2_DEFAULT_SIZE,
    };
  }

  return request;
}
