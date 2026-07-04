import { describe, expect, it } from "vitest";

import {
  appendProductImageGenerationPromptEnhancement,
  getProductImageGenerationConfigPath,
  normalizeProductImageGenerationConfig,
} from "../product-image-generation";

describe("product image generation helpers", () => {
  it("builds the product image generation config path", () => {
    expect(
      getProductImageGenerationConfigPath("channel-1", "product-1"),
    ).toBe("channels/channel-1/products/product-1/imageGeneration/config");
  });

  it("normalizes empty config to undefined", () => {
    expect(
      normalizeProductImageGenerationConfig({
        enabled: false,
        promptEnhancement: "   ",
      }),
    ).toBeUndefined();
  });

  it("preserves trimmed config values", () => {
    expect(
      normalizeProductImageGenerationConfig({
        enabled: true,
        promptEnhancement: "  Use bold clean hierarchy.  ",
      }),
    ).toEqual({
      enabled: true,
      promptEnhancement: "Use bold clean hierarchy.",
    });
  });

  it("appends product-specific prompt guidance when available", () => {
    expect(
      appendProductImageGenerationPromptEnhancement(
        "Create a premium flyer.",
        "Keep the tone calm and editorial.",
      ),
    ).toContain(
      "Product-specific direction: Keep the tone calm and editorial.",
    );
  });
});
