import "server-only";

import { MODELS } from "@konfi/firebase";
import type { ImageGenerationRequest } from "@konfi/types";

const ENABLED_VALUE = "true";

export function arePaidGatewayImageModelsEnabled(): boolean {
  return process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED === ENABLED_VALUE;
}

export function isPaidGatewayImageModel(
  model: ImageGenerationRequest["model"],
): boolean {
  return model === MODELS.FLUX_2_KLEIN || model === MODELS.GPT_IMAGE_2;
}

export function assertPaidGatewayImageModelEnabled(
  model: ImageGenerationRequest["model"],
): void {
  if (!isPaidGatewayImageModel(model) || arePaidGatewayImageModelsEnabled()) {
    return;
  }

  throw new Error(
    [
      "AI Gateway image models require paid AI Gateway credits.",
      "Set AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED=true only after the Vercel team has credits/top-up configured.",
      "Set NEXT_PUBLIC_AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED=true as well to expose these models in the UI.",
    ].join(" "),
  );
}
