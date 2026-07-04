import {
  finalizeAiImageUsageStep,
  finalizeProjectWideImageQuotaStep,
  generateAndUploadImagesStep,
  releaseAiImageUsageStep,
  reserveProjectWideImageQuotaStep,
} from "./steps";
import type {
  ImageGenerationWorkflowInput,
  ImageGenerationWorkflowResult,
} from "./workflow-types";

export type {
  ImageGenerationAiUsageReservation,
  ImageGenerationWorkflowInput,
  ImageGenerationWorkflowResult,
} from "./workflow-types";

/**
 * Durable workflow for AI image generation.
 *
 * Notes:
 * - Workflow function runs in a sandbox.
 * - All Node.js / Firebase Admin SDK / Vertex calls MUST be done in "use step" functions.
 * - `jobId` is used for idempotency across step retries.
 */
export async function generateImagesWorkflow(
  input: ImageGenerationWorkflowInput,
): Promise<ImageGenerationWorkflowResult> {
  "use workflow";

  const { accountId, aiUsageReservation, jobId, request } = input;

  const quotaReservation = await reserveProjectWideImageQuotaStep({
    accountId,
    jobId,
    request,
  });

  try {
    const result = await generateAndUploadImagesStep({
      accountId,
      jobId,
      request,
    });

    await finalizeProjectWideImageQuotaStep({
      jobId,
      reservation: quotaReservation,
      chargedUsdCents: result.chargedUsdCents,
    });
    if (aiUsageReservation) {
      await finalizeAiImageUsageStep({
        chargedUsdCents: result.chargedUsdCents,
        imageGenerations: result.images.length,
        reservation: aiUsageReservation,
      });
    }

    return result;
  } catch (error) {
    // Always release the reservation to avoid permanently blocking monthly budget.
    await finalizeProjectWideImageQuotaStep({
      jobId,
      reservation: quotaReservation,
      chargedUsdCents: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (aiUsageReservation) {
      await releaseAiImageUsageStep({
        reservation: aiUsageReservation,
      });
    }

    throw error;
  }
}
