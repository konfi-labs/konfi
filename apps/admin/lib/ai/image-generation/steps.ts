import type { ImageGenerationRequest } from "@konfi/types";
import type { ImageGenerationAiUsageReservation } from "./workflow-types";

type AiImageGenerationReservation = {
  accountId: string;
  periodKey: string;
  reservedUsdCents: number;
};

type GeneratedImageUrl = {
  id: string;
  storagePath: string;
  url: string;
};

export async function reserveProjectWideImageQuotaStep(params: {
  accountId: string;
  jobId: string;
  request: ImageGenerationRequest;
}): Promise<AiImageGenerationReservation | null> {
  "use step";

  const { reserveProjectWideImageQuotaStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}

export async function finalizeProjectWideImageQuotaStep(params: {
  jobId: string;
  reservation: AiImageGenerationReservation | null;
  chargedUsdCents: number;
  error?: string;
}): Promise<void> {
  "use step";

  const { finalizeProjectWideImageQuotaStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}

export async function finalizeAiImageUsageStep(params: {
  reservation: ImageGenerationAiUsageReservation;
  chargedUsdCents: number;
  imageGenerations: number;
}): Promise<void> {
  "use step";

  const { finalizeAiImageUsageStep: runStep } = await import("./steps.server");
  return runStep(params as Parameters<typeof runStep>[0]);
}

export async function releaseAiImageUsageStep(params: {
  reservation: ImageGenerationAiUsageReservation;
}): Promise<void> {
  "use step";

  const { releaseAiImageUsageStep: runStep } = await import("./steps.server");
  return runStep(params as Parameters<typeof runStep>[0]);
}

export async function generateAndUploadImagesStep(params: {
  accountId: string;
  jobId: string;
  request: ImageGenerationRequest;
}): Promise<{
  images: GeneratedImageUrl[];
  filteredReason?: string;
  chargedUsdCents: number;
}> {
  "use step";

  const { generateAndUploadImagesStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}
