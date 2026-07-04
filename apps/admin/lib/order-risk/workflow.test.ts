const mocks = vi.hoisted(() => ({
  generateOrderRiskAiResultStep: vi.fn(),
  loadOrderRiskEvaluationStep: vi.fn(),
  persistCompletedOrderRiskAnalysisStep: vi.fn(),
  persistFailedOrderRiskAnalysisStep: vi.fn(),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => ({ workflowRunId: "workflow-run-1" }),
}));

vi.mock("./steps", () => ({
  generateOrderRiskAiResultStep: mocks.generateOrderRiskAiResultStep,
  loadOrderRiskEvaluationStep: mocks.loadOrderRiskEvaluationStep,
  persistCompletedOrderRiskAnalysisStep:
    mocks.persistCompletedOrderRiskAnalysisStep,
  persistFailedOrderRiskAnalysisStep: mocks.persistFailedOrderRiskAnalysisStep,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderRiskAnalysisSource } from "@konfi/types";
import { runAdminOrderRiskWorkflow } from "./workflow";

describe("runAdminOrderRiskWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orchestrates risk analysis through registered workflow steps", async () => {
    const evaluation = {
      fraudScoreHint: 20,
      operationalScoreHint: 10,
      safeSignals: [],
      signals: [],
    };
    const aiResult = {
      confidence: 0.8,
      fraudScore: 30,
      localizedContent: {},
      operationalScore: 15,
    };
    const completedResult = {
      id: "order-risk-latest",
      orderId: "order-1",
      workflowRunId: "workflow-run-1",
    };

    mocks.loadOrderRiskEvaluationStep.mockResolvedValue(evaluation);
    mocks.generateOrderRiskAiResultStep.mockResolvedValue(aiResult);
    mocks.persistCompletedOrderRiskAnalysisStep.mockResolvedValue(
      completedResult,
    );

    const result = await runAdminOrderRiskWorkflow({
      channelId: "channel-1",
      createdBy: "admin-1",
      inputHash: "hash-1",
      orderId: "order-1",
      source: OrderRiskAnalysisSource.MANUAL_RERUN,
    });

    expect(mocks.loadOrderRiskEvaluationStep).toHaveBeenCalledWith({
      channelId: "channel-1",
      orderId: "order-1",
    });
    expect(mocks.generateOrderRiskAiResultStep).toHaveBeenCalledWith({
      channelId: "channel-1",
      createdBy: "admin-1",
      evaluation,
      workflowRunId: "workflow-run-1",
    });
    expect(mocks.persistCompletedOrderRiskAnalysisStep).toHaveBeenCalledWith({
      aiResult,
      channelId: "channel-1",
      createdBy: "admin-1",
      evaluation,
      inputHash: "hash-1",
      orderId: "order-1",
      source: OrderRiskAnalysisSource.MANUAL_RERUN,
      workflowRunId: "workflow-run-1",
    });
    expect(result).toBe(completedResult);
  });

  it("persists a failed analysis when a step throws", async () => {
    mocks.loadOrderRiskEvaluationStep.mockRejectedValue(
      new Error("load failed"),
    );

    await expect(
      runAdminOrderRiskWorkflow({
        channelId: "channel-1",
        createdBy: "admin-1",
        inputHash: "hash-1",
        orderId: "order-1",
        source: OrderRiskAnalysisSource.MANUAL_RERUN,
      }),
    ).rejects.toThrow("load failed");

    expect(mocks.persistFailedOrderRiskAnalysisStep).toHaveBeenCalledWith({
      channelId: "channel-1",
      createdBy: "admin-1",
      error: "load failed",
      inputHash: "hash-1",
      orderId: "order-1",
      source: OrderRiskAnalysisSource.MANUAL_RERUN,
      workflowRunId: "workflow-run-1",
    });
  });
});
