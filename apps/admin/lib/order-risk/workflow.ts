import { getWorkflowMetadata } from "workflow";
import type { OrderRiskAnalysisSource } from "@konfi/types";
import {
  generateOrderRiskAiResultStep,
  loadOrderRiskEvaluationStep,
  persistCompletedOrderRiskAnalysisStep,
  persistFailedOrderRiskAnalysisStep,
} from "./steps";

export interface AdminOrderRiskWorkflowInput {
  channelId: string;
  orderId: string;
  source: OrderRiskAnalysisSource;
  createdBy: string;
  inputHash: string;
}

export async function runAdminOrderRiskWorkflow(
  input: AdminOrderRiskWorkflowInput,
) {
  "use workflow";

  const { channelId, orderId, source, createdBy, inputHash } = input;
  const { workflowRunId } = getWorkflowMetadata();

  try {
    const evaluation = await loadOrderRiskEvaluationStep({
      channelId,
      orderId,
    });
    const aiResult = await generateOrderRiskAiResultStep({
      channelId,
      createdBy,
      evaluation,
      workflowRunId,
    });

    return await persistCompletedOrderRiskAnalysisStep({
      channelId,
      orderId,
      workflowRunId,
      inputHash,
      source,
      createdBy,
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
      error: errorMessage,
    });

    throw error;
  }
}
