import type { ImageGenerationRequest } from "@konfi/types";
import { MODELS } from "@konfi/firebase";

const ENABLED_VALUE = "true";

export function arePaidGatewayImageModelsVisible(): boolean {
  return (
    process.env.NEXT_PUBLIC_AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED ===
    ENABLED_VALUE
  );
}

export function isPaidGatewayImageModel(
  model: ImageGenerationRequest["model"],
): boolean {
  return model === MODELS.FLUX_2_KLEIN || model === MODELS.GPT_IMAGE_2;
}
