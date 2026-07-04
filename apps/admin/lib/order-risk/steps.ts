import type {
  OrderRiskAnalysis,
  OrderRiskAnalysisSource,
  OrderRiskDeterministicEvaluation,
} from "@konfi/types";

type OrderRiskEvaluation = OrderRiskDeterministicEvaluation;
type OrderRiskLocale = "cs" | "de" | "en" | "fr" | "pl" | "sk" | "uk";
type OrderRiskAiResult = {
  fraudScore: number;
  operationalScore: number;
  localizedContent: Record<
    OrderRiskLocale,
    { summary: string; reasons: string[] }
  >;
  confidence?: number;
};

export async function loadOrderRiskEvaluationStep(params: {
  channelId: string;
  orderId: string;
}): Promise<OrderRiskEvaluation> {
  "use step";

  const { loadOrderRiskEvaluationStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}

export async function generateOrderRiskAiResultStep(params: {
  channelId: string;
  createdBy: string;
  evaluation: OrderRiskEvaluation;
  workflowRunId: string;
}): Promise<OrderRiskAiResult> {
  "use step";

  const { generateOrderRiskAiResultStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}

export async function persistCompletedOrderRiskAnalysisStep(params: {
  channelId: string;
  orderId: string;
  workflowRunId: string;
  inputHash: string;
  source: OrderRiskAnalysisSource;
  createdBy: string;
  evaluation: OrderRiskEvaluation;
  aiResult: OrderRiskAiResult;
}): Promise<OrderRiskAnalysis> {
  "use step";

  const { persistCompletedOrderRiskAnalysisStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}

export async function persistFailedOrderRiskAnalysisStep(params: {
  channelId: string;
  orderId: string;
  workflowRunId: string;
  inputHash: string;
  source: OrderRiskAnalysisSource;
  createdBy: string;
  error: string;
}): Promise<void> {
  "use step";

  const { persistFailedOrderRiskAnalysisStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}
