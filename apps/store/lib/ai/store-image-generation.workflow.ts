import type {
  StoreGenerationRequest,
  StoreGenerationResult,
} from "./store-image-generation.shared";
import { generateStoreImageStep } from "./store-image-generation.workflow-steps";

export type StoreImageGenerationWorkflowInput = {
  jobId: string;
  request: StoreGenerationRequest;
};

export type StoreImageGenerationWorkflowResult = StoreGenerationResult;

export async function generateStoreImageWorkflow(
  input: StoreImageGenerationWorkflowInput,
): Promise<StoreImageGenerationWorkflowResult> {
  "use workflow";

  return await generateStoreImageStep(input);
}
