import { MODELS } from "@konfi/firebase";
import {
  GPT_IMAGE_2_DEFAULT_QUALITY,
  GPT_IMAGE_2_DEFAULT_SIZE,
} from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  buildProductImageGenerationRequest,
  getProductImageGenerationModels,
  GPT_IMAGE_2_PRODUCT_IMAGE_MODEL,
  isProductImageGenerationModel,
  NANO_BANANA_2_LITE_PRODUCT_IMAGE_MODEL,
  NANO_BANANA_2_PRODUCT_IMAGE_MODEL,
} from "./request";

describe("product image request helpers", () => {
  it("builds Nano Banana requests without GPT-specific settings", () => {
    const request = buildProductImageGenerationRequest({
      language: "en",
      maxReferenceImages: 14,
      model: NANO_BANANA_2_PRODUCT_IMAGE_MODEL,
      prompt: "  Premium product image  ",
      referenceImages: ["one", "two"],
    });

    expect(request).toEqual({
      aspectRatio: "1:1",
      language: "en",
      model: NANO_BANANA_2_PRODUCT_IMAGE_MODEL,
      numberOfImages: 1,
      prompt: "Premium product image",
      referenceImages: ["one", "two"],
    });
    expect(request).not.toHaveProperty("quality");
    expect(request).not.toHaveProperty("size");
  });

  it("applies GPT Image 2 default quality and size", () => {
    const request = buildProductImageGenerationRequest({
      language: "pl",
      maxReferenceImages: 4,
      model: GPT_IMAGE_2_PRODUCT_IMAGE_MODEL,
      prompt: "Poster mockup",
      referenceImages: ["one", "two", "three", "four", "five"],
    });

    expect(request).toEqual({
      aspectRatio: "1:1",
      language: "pl",
      model: GPT_IMAGE_2_PRODUCT_IMAGE_MODEL,
      numberOfImages: 1,
      prompt: "Poster mockup",
      quality: GPT_IMAGE_2_DEFAULT_QUALITY,
      referenceImages: ["one", "two", "three", "four"],
      size: GPT_IMAGE_2_DEFAULT_SIZE,
    });
  });

  it("recognizes the supported product image models", () => {
    expect(isProductImageGenerationModel(MODELS.NANO_BANANA_2_LITE)).toBe(true);
    expect(isProductImageGenerationModel(MODELS.NANO_BANANA_2)).toBe(true);
    expect(isProductImageGenerationModel(MODELS.GPT_IMAGE_2)).toBe(true);
    expect(isProductImageGenerationModel(MODELS.FLUX_2_KLEIN)).toBe(false);
  });

  it("can hide AI Gateway models for SaaS runtime selectors", () => {
    expect(getProductImageGenerationModels()).toEqual([
      NANO_BANANA_2_LITE_PRODUCT_IMAGE_MODEL,
      NANO_BANANA_2_PRODUCT_IMAGE_MODEL,
      GPT_IMAGE_2_PRODUCT_IMAGE_MODEL,
    ]);
    expect(
      getProductImageGenerationModels({ includeGatewayModels: false }),
    ).toEqual([
      NANO_BANANA_2_LITE_PRODUCT_IMAGE_MODEL,
      NANO_BANANA_2_PRODUCT_IMAGE_MODEL,
    ]);
  });
});
