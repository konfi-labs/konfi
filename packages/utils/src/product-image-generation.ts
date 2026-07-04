import { ProductImageGenerationConfig } from "@konfi/types";

export const PRODUCT_IMAGE_GENERATION_CONFIG_SUBCOLLECTION = "imageGeneration";
export const PRODUCT_IMAGE_GENERATION_CONFIG_DOC_ID = "config";

function normalizePathSegment(value: string, label: string): string {
  const normalizedValue = value.trim().replace(/^\/+|\/+$/g, "");

  if (!normalizedValue || normalizedValue.includes("/")) {
    throw new Error(`Invalid ${label}.`);
  }

  return normalizedValue;
}

export function getProductImageGenerationConfigPath(
  channelId: string,
  productId: string,
): string {
  const normalizedChannelId = normalizePathSegment(channelId, "channel ID");
  const normalizedProductId = normalizePathSegment(productId, "product ID");

  return `channels/${normalizedChannelId}/products/${normalizedProductId}/${PRODUCT_IMAGE_GENERATION_CONFIG_SUBCOLLECTION}/${PRODUCT_IMAGE_GENERATION_CONFIG_DOC_ID}`;
}

export function normalizeProductImageGenerationConfig(
  value?: Partial<ProductImageGenerationConfig> | null,
): ProductImageGenerationConfig | undefined {
  if (!value) {
    return undefined;
  }

  const promptEnhancement =
    typeof value.promptEnhancement === "string"
      ? value.promptEnhancement.trim()
      : undefined;

  if (value.enabled !== true && !promptEnhancement) {
    return undefined;
  }

  return {
    enabled: value.enabled === true,
    ...(promptEnhancement ? { promptEnhancement } : {}),
  };
}

export function appendProductImageGenerationPromptEnhancement(
  prompt: string,
  promptEnhancement?: string | null,
): string {
  const normalizedPrompt = prompt.trim();
  const normalizedPromptEnhancement = promptEnhancement?.trim();

  if (!normalizedPromptEnhancement) {
    return normalizedPrompt;
  }

  return `${normalizedPrompt}\n\nProduct-specific direction: ${normalizedPromptEnhancement}`;
}
