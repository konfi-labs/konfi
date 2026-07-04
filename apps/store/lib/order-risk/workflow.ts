import { getWorkflowMetadata } from "workflow";
import type { OrderRiskAnalysisSource } from "@konfi/types";
import {
  generateOrderRiskAiResultStep,
  loadOrderRiskEvaluationStep,
  persistCompletedOrderRiskAnalysisStep,
  persistFailedOrderRiskAnalysisStep,
} from "./steps";

export interface StoreOrderRiskWorkflowInput {
  channelId: string;
  orderId: string;
  source: OrderRiskAnalysisSource;
  createdBy: string;
  inputHash: string;
  tenantId?: string;
}

export async function runStoreOrderRiskWorkflow(
  input: StoreOrderRiskWorkflowInput,
) {
  "use workflow";

  const { channelId, orderId, source, createdBy, inputHash, tenantId } = input;
  const { workflowRunId } = getWorkflowMetadata();

  try {
    const evaluation = await loadOrderRiskEvaluationStep({
      channelId,
      orderId,
      tenantId,
    });
    const aiResult = await generateOrderRiskAiResultStep({
      evaluation,
      tenantId,
    });

    return await persistCompletedOrderRiskAnalysisStep({
      channelId,
      orderId,
      workflowRunId,
      inputHash,
      source,
      createdBy,
      tenantId,
      evaluation,
      aiResult,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown workflow error";

    await persistFailedOrderRiskAnalysisStep({
      channelId,
      orderId,
      workflowRunId,
      inputHash,
      source,
      createdBy,
      tenantId,
      error: errorMessage,
    });

    throw error;
  }
}
