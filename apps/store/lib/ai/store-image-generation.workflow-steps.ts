import type { StoreGenerationResult } from "./store-image-generation.shared";
import type { StoreImageGenerationWorkflowInput } from "./store-image-generation.workflow";
import { FatalError } from "workflow";

const NON_RETRYABLE_ERRORS = new Set([
  "MONTHLY_BUDGET_EXCEEDED",
  "PRODUCT_IMAGE_GENERATION_DISABLED",
  "Product not found.",
  "RATE_LIMIT_EXCEEDED",
]);

function toWorkflowError(error: unknown): Error {
  if (error instanceof Error && NON_RETRYABLE_ERRORS.has(error.message)) {
    return new FatalError(error.message);
  }

  return error instanceof Error ? error : new Error("Image generation failed.");
}

export async function generateStoreImageStep(
  input: StoreImageGenerationWorkflowInput,
): Promise<StoreGenerationResult> {
  "use step";

  try {
    const { generateStoreImageForJob } =
      await import("./store-image-generation");

    return await generateStoreImageForJob(input);
  } catch (error) {
    throw toWorkflowError(error);
  }
}
