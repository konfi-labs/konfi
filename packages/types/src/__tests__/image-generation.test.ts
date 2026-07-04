import { describe, expect, it } from "vitest";
import {
  getGptImage2AspectRatioLabel,
  getGptImage2PriceUsdCents,
  getAspectRatioForGptImage2Size,
  getGptImage2SizeForAspectRatio,
  IMAGE_MODEL_CAPABILITIES,
  VIDEO_MODEL_CAPABILITIES,
  isGeminiImageModel,
  isGatewayImageModel,
  isOpenAiImageModel,
  isGptImage2GenerationSize,
  isGptImage2PresetSize,
  isVertexVideoModel,
  parseGptImage2Size,
} from "../image-generation";

describe("image-generation active models", () => {
  it("recognizes active Gemini and gateway models", () => {
    expect(isGeminiImageModel("gemini-3.1-flash-lite-image")).toBe(true);
    expect(isGeminiImageModel("gemini-3.1-flash-image")).toBe(true);
    expect(isGeminiImageModel("gemini-3-pro-image-preview")).toBe(true);
    expect(isGatewayImageModel("bfl/flux-2-klein-9b")).toBe(true);
    expect(isGatewayImageModel("openai/gpt-image-2")).toBe(true);
    expect(isGatewayImageModel("quiverai/arrow-1.1")).toBe(true);
    expect(isOpenAiImageModel("openai/gpt-image-2")).toBe(true);
  });

  it("stores capabilities only for supported active image models", () => {
    expect(Object.keys(IMAGE_MODEL_CAPABILITIES)).toEqual([
      "gemini-3.1-flash-lite-image",
      "gemini-3.1-flash-image",
      "gemini-3-pro-image-preview",
      "bfl/flux-2-klein-9b",
      "openai/gpt-image-2",
      "quiverai/arrow-1.1",
    ]);
  });

  it("maps GPT Image 2 sizes and aspect ratios consistently", () => {
    expect(getGptImage2SizeForAspectRatio("1:1")).toBe("1024x1024");
    expect(getGptImage2SizeForAspectRatio("2:3")).toBe("1024x1536");
    expect(getGptImage2SizeForAspectRatio("3:2")).toBe("1536x1024");
    expect(getGptImage2SizeForAspectRatio("16:9")).toBeUndefined();
    expect(getAspectRatioForGptImage2Size("1024x1024")).toBe("1:1");
    expect(getAspectRatioForGptImage2Size("1024x1536")).toBe("2:3");
    expect(getAspectRatioForGptImage2Size("1536x1024")).toBe("3:2");
    expect(getAspectRatioForGptImage2Size("2048x1152")).toBe("16:9");
    expect(getGptImage2AspectRatioLabel("2048x1280")).toBe("8:5");
  });

  it("validates GPT Image 2 custom sizes against API constraints", () => {
    expect(isGptImage2GenerationSize("2048x1152")).toBe(true);
    expect(isGptImage2GenerationSize("2050x1152")).toBe(false);
    expect(isGptImage2GenerationSize("4096x1024")).toBe(false);
    expect(isGptImage2GenerationSize("512x512")).toBe(false);
    expect(isGptImage2PresetSize("1024x1024")).toBe(true);
    expect(isGptImage2PresetSize("2048x1152")).toBe(false);
    expect(parseGptImage2Size(" 2048X1152 ")).toEqual({
      width: 2048,
      height: 1152,
      size: "2048x1152",
      totalPixels: 2359296,
      simplifiedAspectRatio: "16:9",
    });
  });

  it("returns the documented GPT Image 2 prices", () => {
    expect(
      getGptImage2PriceUsdCents({
        size: "1024x1024",
        quality: "medium",
      }),
    ).toBe(5.3);
    expect(
      getGptImage2PriceUsdCents({
        size: "1024x1536",
        quality: "low",
      }),
    ).toBe(0.5);
  });
});

describe("video-generation active models", () => {
  it("recognizes only Veo 3.1 models", () => {
    expect(isVertexVideoModel("veo-3.1-generate-001")).toBe(true);
    expect(isVertexVideoModel("veo-3.1-fast-generate-001")).toBe(true);
  });

  it("stores capabilities only for supported Veo 3.1 models", () => {
    expect(Object.keys(VIDEO_MODEL_CAPABILITIES)).toEqual([
      "veo-3.1-generate-001",
      "veo-3.1-fast-generate-001",
    ]);
  });
});
