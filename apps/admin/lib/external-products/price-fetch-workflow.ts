import "server-only";

import { getWorkflowMetadata } from "workflow";
import {
  runExternalProductPriceFetchStep,
  type ExternalProductPriceFetchWorkflowInput,
  type ExternalProductPriceFetchWorkflowResult,
} from "./price-fetch-workflow.steps";

export type {
  ExternalProductPriceFetchWorkflowInput,
  ExternalProductPriceFetchWorkflowResult,
} from "./price-fetch-workflow.steps";

export async function externalProductPriceFetchWorkflow(
  input: ExternalProductPriceFetchWorkflowInput,
): Promise<ExternalProductPriceFetchWorkflowResult> {
  "use workflow";

  return runExternalProductPriceFetchStep({
    ...input,
    workflowRunId: getWorkflowMetadata().workflowRunId,
  });
}
