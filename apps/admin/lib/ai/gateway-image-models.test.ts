import { describe, expect, it, vi } from "vitest";
import { MODELS } from "@konfi/firebase";

vi.mock("server-only", () => ({}));

import {
  arePaidGatewayImageModelsVisible,
  isPaidGatewayImageModel,
} from "./gateway-image-models";

describe("gateway image model visibility", () => {
  it("treats Quiver Arrow as a Gateway image model that does not need the paid-model flag", () => {
    expect(isPaidGatewayImageModel(MODELS.QUIVER_ARROW)).toBe(false);
    expect(isPaidGatewayImageModel(MODELS.FLUX_2_KLEIN)).toBe(true);
    expect(isPaidGatewayImageModel(MODELS.GPT_IMAGE_2)).toBe(true);
  });

  it("reads the paid Gateway image model visibility flag", () => {
    const previous =
      process.env.NEXT_PUBLIC_AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED;
    try {
      process.env.NEXT_PUBLIC_AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED = "false";
      expect(arePaidGatewayImageModelsVisible()).toBe(false);

      process.env.NEXT_PUBLIC_AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED = "true";
      expect(arePaidGatewayImageModelsVisible()).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED = previous;
      }
    }
  });
});
