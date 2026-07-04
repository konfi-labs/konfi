import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageGenerationRequest } from "@konfi/types";
import type { ImageGenerationAiUsageReservation } from "./workflow-types";

const mocks = vi.hoisted(() => ({
  finalizeAiImageUsageStep: vi.fn(),
  finalizeProjectWideImageQuotaStep: vi.fn(),
  generateAndUploadImagesStep: vi.fn(),
  releaseAiImageUsageStep: vi.fn(),
  reserveProjectWideImageQuotaStep: vi.fn(),
}));

vi.mock("./steps", () => ({
  finalizeAiImageUsageStep: mocks.finalizeAiImageUsageStep,
  finalizeProjectWideImageQuotaStep: mocks.finalizeProjectWideImageQuotaStep,
  generateAndUploadImagesStep: mocks.generateAndUploadImagesStep,
  releaseAiImageUsageStep: mocks.releaseAiImageUsageStep,
  reserveProjectWideImageQuotaStep: mocks.reserveProjectWideImageQuotaStep,
}));

import { generateImagesWorkflow } from "./workflow";

const request = {
  aspectRatio: "1:1",
  model: "gemini-3.1-flash-lite-image",
  numberOfImages: 1,
  prompt: "Generate a product photo.",
  size: "1K",
} satisfies ImageGenerationRequest;

describe("generateImagesWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveProjectWideImageQuotaStep.mockResolvedValue({
      accountId: "account-1",
      periodKey: "2026-06",
      reservedUsdCents: 1,
    });
    mocks.generateAndUploadImagesStep.mockResolvedValue({
      chargedUsdCents: 2,
      images: [
        {
          id: "image-1",
          storagePath: "ai/generated/image-1.png",
          url: "https://example.test/image-1.png",
        },
      ],
    });
  });

  it("orchestrates image generation through registered workflow steps", async () => {
    const result = await generateImagesWorkflow({
      accountId: "account-1",
      jobId: "job-1",
      request,
    });

    expect(mocks.reserveProjectWideImageQuotaStep).toHaveBeenCalledWith({
      accountId: "account-1",
      jobId: "job-1",
      request,
    });
    expect(mocks.generateAndUploadImagesStep).toHaveBeenCalledWith({
      accountId: "account-1",
      jobId: "job-1",
      request,
    });
    expect(mocks.finalizeProjectWideImageQuotaStep).toHaveBeenCalledWith({
      chargedUsdCents: 2,
      jobId: "job-1",
      reservation: {
        accountId: "account-1",
        periodKey: "2026-06",
        reservedUsdCents: 1,
      },
    });
    expect(mocks.finalizeAiImageUsageStep).not.toHaveBeenCalled();
    expect(result.chargedUsdCents).toBe(2);
  });

  it("releases AI usage reservations when generation fails", async () => {
    const reservation = {
      deploymentMode: "saas",
      estimatedTotalTokens: 0,
      id: "reservation-1",
      modality: "image",
      mode: "enforce",
      periodKey: "2026-06",
      reservedImageGenerations: 1,
      reservedVideoGenerations: 0,
      source: "image",
      tenantId: "tenant-1",
    } satisfies ImageGenerationAiUsageReservation;
    mocks.generateAndUploadImagesStep.mockRejectedValue(
      new Error("generation failed"),
    );

    await expect(
      generateImagesWorkflow({
        accountId: "account-1",
        aiUsageReservation: reservation,
        jobId: "job-1",
        request,
      }),
    ).rejects.toThrow("generation failed");
    expect(mocks.finalizeProjectWideImageQuotaStep).toHaveBeenCalledWith({
      chargedUsdCents: 0,
      error: "generation failed",
      jobId: "job-1",
      reservation: {
        accountId: "account-1",
        periodKey: "2026-06",
        reservedUsdCents: 1,
      },
    });
    expect(mocks.releaseAiImageUsageStep).toHaveBeenCalledWith({
      reservation,
    });
  });
});
