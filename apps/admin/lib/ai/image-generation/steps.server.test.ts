import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageGenerationRequest } from "@konfi/types";

const mocks = vi.hoisted(() => {
  const imageModel = vi.fn((model: string) => ({ model }));
  const generateImage = vi.fn();
  const jobSet = vi.fn();
  const jobGet = vi.fn();
  const save = vi.fn();

  return {
    generateImage,
    getGatewayClient: vi.fn(async () => ({ imageModel })),
    imageModel,
    jobGet,
    jobSet,
    save,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("ai", () => ({
  generateImage: mocks.generateImage,
}));

vi.mock("@/lib/ai/server-gateway", () => ({
  getGatewayClient: mocks.getGatewayClient,
}));

vi.mock("@/lib/ai/server-gateway-image-models", () => ({
  assertPaidGatewayImageModelEnabled: vi.fn(),
}));

vi.mock("@/lib/ai/vertex-rest.server", () => ({
  generateVertexContent: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: mocks.jobGet,
      set: mocks.jobSet,
    })),
  })),
  getFirebaseAdminApp: vi.fn(() => ({})),
}));

vi.mock("@/lib/ai/usage-metering", () => ({
  finalizeAiUsage: vi.fn(),
  releaseAiUsageReservation: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => {
  class MockTimestamp {
    static now() {
      return new MockTimestamp();
    }
  }

  return {
    FieldValue: {
      increment: vi.fn((value: number) => ({ increment: value })),
    },
    Timestamp: MockTimestamp,
  };
});

vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({
        save: mocks.save,
      })),
    })),
  })),
}));

vi.mock("workflow", () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
}));

import { generateAndUploadImagesStep } from "./steps.server";

describe("generateAndUploadImagesStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "bucket.test";
    mocks.jobGet.mockResolvedValue({ exists: false });
    mocks.generateImage.mockResolvedValue({
      images: [
        {
          mediaType: "image/svg+xml",
          uint8Array: new TextEncoder().encode(
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
          ),
        },
      ],
    });
  });

  it("generates Quiver SVGs through AI Gateway and stores them as SVG files", async () => {
    const request = {
      model: "quiverai/arrow-1.1",
      numberOfImages: 4,
      prompt: "Minimal phoenix logo, geometric rising wings",
    } satisfies ImageGenerationRequest;

    const result = await generateAndUploadImagesStep({
      accountId: "admin-1",
      jobId: "job-1",
      request,
    });

    expect(mocks.imageModel).toHaveBeenCalledWith("quiverai/arrow-1.1");
    expect(mocks.generateImage).toHaveBeenCalledWith({
      model: { model: "quiverai/arrow-1.1" },
      n: 1,
      prompt: "Minimal phoenix logo, geometric rising wings",
    });
    expect(mocks.save).toHaveBeenCalledWith(expect.any(Buffer), {
      contentType: "image/svg+xml",
      metadata: {
        metadata: expect.objectContaining({
          firebaseStorageDownloadTokens: expect.any(String),
          jobId: "job-1",
          model: "quiverai/arrow-1.1",
          prompt: "Minimal phoenix logo, geometric rising wings",
        }),
      },
      resumable: false,
    });
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.storagePath).toMatch(
      /^ai\/generated\/accounts\/admin-1\/\d{4}-\d{2}-\d{2}\/quiverai\/arrow-1\.1\/job-1-\d+-0\.svg$/,
    );
    expect(result.images[0]?.id).not.toMatch(/\.svg$/);
    expect(result.chargedUsdCents).toBe(2);
  });
});
