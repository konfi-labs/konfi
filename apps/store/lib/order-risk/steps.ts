import type {
  OrderRiskAnalysis,
  OrderRiskAnalysisSource,
  OrderRiskDeterministicEvaluation,
} from "@konfi/types";

type StoreOrderRiskEvaluation = OrderRiskDeterministicEvaluation;
type OrderRiskLocale = "cs" | "de" | "en" | "fr" | "pl" | "sk" | "uk";
type StoreOrderRiskAiResult = {
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
  tenantId?: string;
}): Promise<StoreOrderRiskEvaluation> {
  "use step";

  const { loadOrderRiskEvaluationStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}

export async function generateOrderRiskAiResultStep(params: {
  evaluation: StoreOrderRiskEvaluation;
  tenantId?: string;
}): Promise<StoreOrderRiskAiResult> {
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
  tenantId?: string;
  evaluation: StoreOrderRiskEvaluation;
  aiResult: StoreOrderRiskAiResult;
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
  tenantId?: string;
  error: string;
}): Promise<void> {
  "use step";

  const { persistFailedOrderRiskAnalysisStep: runStep } =
    await import("./steps.server");
  return runStep(params);
}
