import { describe, expect, it, vi } from "vitest";
import { MODELS } from "@konfi/firebase";

vi.mock("server-only", () => ({}));

import {
  assertPaidGatewayImageModelEnabled,
  arePaidGatewayImageModelsEnabled,
  isPaidGatewayImageModel,
} from "./server-gateway-image-models";

describe("server Gateway image model gating", () => {
  it("allows Quiver Arrow without the paid Gateway image model flag", () => {
    const previous = process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED;
    try {
      delete process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED;

      expect(arePaidGatewayImageModelsEnabled()).toBe(false);
      expect(isPaidGatewayImageModel(MODELS.QUIVER_ARROW)).toBe(false);
      expect(() =>
        assertPaidGatewayImageModelEnabled(MODELS.QUIVER_ARROW),
      ).not.toThrow();
    } finally {
      if (previous === undefined) {
        delete process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED;
      } else {
        process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED = previous;
      }
    }
  });

  it("still blocks paid Gateway image models when the paid flag is disabled", () => {
    const previous = process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED;
    try {
      delete process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED;

      expect(isPaidGatewayImageModel(MODELS.GPT_IMAGE_2)).toBe(true);
      expect(() =>
        assertPaidGatewayImageModelEnabled(MODELS.GPT_IMAGE_2),
      ).toThrow("AI Gateway image models require paid AI Gateway credits.");
    } finally {
      if (previous === undefined) {
        delete process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED;
      } else {
        process.env.AI_GATEWAY_PAID_IMAGE_MODELS_ENABLED = previous;
      }
    }
  });
});
