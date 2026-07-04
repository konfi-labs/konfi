import "server-only";

import { runMeteredAdminAiText } from "@/lib/ai/metered-text";
import {
  generateVertexContent,
  parseVertexJsonObject,
} from "@/lib/ai/vertex-rest.server";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import {
  DEFAULT_LOCALE,
  Order,
  OrderRiskAnalysis,
  OrderRiskAnalysisDocumentKind,
  OrderRiskAnalysisSource,
  OrderRiskAnalysisStatus,
} from "@konfi/types";
import {
  getOrderRiskHistoryDocPath,
  getOrderRiskLatestDocPath,
  buildOrderRiskPrompt,
  buildOrderRiskSystemPrompt,
  evaluateOrderRiskDeterministically,
  extractOrderRiskSnapshot,
  getOrderRiskLevel,
  getOrderRiskRecommendation,
  normalizeOrderRiskAiResult,
  normalizeOrderRiskConfidence,
  type NormalizedOrderRiskAiResult,
  ORDER_RISK_ANALYSIS_VERSION,
} from "@konfi/utils";
import { FieldValue } from "firebase-admin/firestore";
import { FatalError } from "workflow";
import { z } from "zod";

const orderRiskAiSchema = z.object({
  fraudScore: z.number().min(0).max(100),
  operationalScore: z.number().min(0).max(100),
  localizedContent: z.unknown().optional(),
  confidence: z
    .preprocess(normalizeOrderRiskConfidence, z.number().min(0).max(1))
    .optional(),
});

type RawOrderRiskAiResult = z.infer<typeof orderRiskAiSchema>;
type OrderRiskAiResult = NormalizedOrderRiskAiResult;

const ORDER_RISK_AI_MODEL = MODELS.GEMINI_3_FLASH_LITE;
const ORDER_RISK_VERTEX_TIMEOUT_MS = 45_000;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function parseOrderRiskAiResult(
  text: string,
  evaluation: Awaited<ReturnType<typeof loadOrderRiskEvaluationStep>>,
): OrderRiskAiResult {
  try {
    return normalizeOrderRiskAiResult(
      orderRiskAiSchema.parse(parseVertexJsonObject(text)),
      evaluation,
    );
  } catch (error) {
    throw new FatalError(
      `Order risk AI response was invalid: ${
        error instanceof Error ? error.message : "Unknown parse error"
      }`,
    );
  }
}

export async function loadOrderRiskEvaluationStep(params: {
  channelId: string;
  orderId: string;
}) {
  const { channelId, orderId } = params;
  const firestore = getAdminDb();
  const orderSnapshot = await firestore
    .doc(`channels/${channelId}/orders/${orderId}`)
    .get();

  if (!orderSnapshot.exists) {
    throw new Error("Order not found for risk analysis.");
  }

  const order = orderSnapshot.data() as Order;
  return evaluateOrderRiskDeterministically(extractOrderRiskSnapshot(order));
}

export async function generateOrderRiskAiResultStep(params: {
  channelId: string;
  createdBy: string;
  evaluation: Awaited<ReturnType<typeof loadOrderRiskEvaluationStep>>;
  workflowRunId: string;
}) {
  const { channelId, createdBy, evaluation, workflowRunId } = params;
  const system = `${buildOrderRiskSystemPrompt()}\n\nReturn only a JSON object with fraudScore, operationalScore, localizedContent entries for every locale listed in outputLocales, and optional confidence. Confidence must be a decimal from 0 to 1, not a percentage.`;
  const prompt = buildOrderRiskPrompt(evaluation);

  const { output } = await runMeteredAdminAiText({
    channelId,
    input: { prompt, system },
    model: ORDER_RISK_AI_MODEL,
    provider: "google-vertex",
    run: async () => {
      const result = await generateVertexContent({
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
        },
        model: ORDER_RISK_AI_MODEL,
        system,
        prompt,
        timeoutMs: ORDER_RISK_VERTEX_TIMEOUT_MS,
      });

      return {
        output: parseOrderRiskAiResult(result.text, evaluation),
        usage: result.usage,
      };
    },
    runId: workflowRunId,
    source: "order-risk",
    userId: createdBy,
  });

  return output;
}

export async function persistCompletedOrderRiskAnalysisStep(params: {
  channelId: string;
  orderId: string;
  workflowRunId: string;
  inputHash: string;
  source: OrderRiskAnalysisSource;
  createdBy: string;
  evaluation: Awaited<ReturnType<typeof loadOrderRiskEvaluationStep>>;
  aiResult: OrderRiskAiResult;
}): Promise<OrderRiskAnalysis> {
  const {
    channelId,
    orderId,
    workflowRunId,
    inputHash,
    source,
    createdBy,
    evaluation,
    aiResult,
  } = params;
  const firestore = getAdminDb();

  const fraudScore = clampScore(
    Math.max(evaluation.fraudScoreHint, aiResult.fraudScore),
  );
  const operationalScore = clampScore(
    Math.max(evaluation.operationalScoreHint, aiResult.operationalScore),
  );
  const overallScore = Math.max(fraudScore, operationalScore);
  const defaultLocalizedContent = aiResult.localizedContent[DEFAULT_LOCALE];

  const analysis: Omit<OrderRiskAnalysis, "id"> = {
    orderId,
    channelId,
    documentKind: OrderRiskAnalysisDocumentKind.LATEST,
    source,
    status: OrderRiskAnalysisStatus.COMPLETED,
    workflowRunId,
    inputHash,
    recommendation: getOrderRiskRecommendation(fraudScore, operationalScore),
    overallScore,
    overallLevel: getOrderRiskLevel(overallScore),
    fraudScore,
    fraudLevel: getOrderRiskLevel(fraudScore),
    operationalScore,
    operationalLevel: getOrderRiskLevel(operationalScore),
    summary: defaultLocalizedContent.summary,
    reasons: defaultLocalizedContent.reasons,
    localizedContent: aiResult.localizedContent,
    signals: evaluation.signals,
    safeSignals: evaluation.safeSignals,
    confidence: aiResult.confidence,
    model: ORDER_RISK_AI_MODEL,
    version: ORDER_RISK_ANALYSIS_VERSION,
    createdBy,
  };

  const latestPath = getOrderRiskLatestDocPath(channelId, orderId);
  const historyPath = getOrderRiskHistoryDocPath(
    channelId,
    orderId,
    workflowRunId,
  );

  const latestDoc: OrderRiskAnalysis = {
    id: "order-risk-latest",
    ...analysis,
  };
  const historyDoc: OrderRiskAnalysis = {
    id: `order-risk-${workflowRunId}`,
    ...analysis,
    documentKind: OrderRiskAnalysisDocumentKind.HISTORY,
  };
  const latestWrite = {
    ...latestDoc,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const historyWrite = {
    ...historyDoc,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await Promise.all([
    firestore.doc(latestPath).set(latestWrite, { merge: true }),
    firestore.doc(historyPath).set(historyWrite),
  ]);

  return latestDoc;
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
  const {
    channelId,
    orderId,
    workflowRunId,
    inputHash,
    source,
    createdBy,
    error,
  } = params;
  const firestore = getAdminDb();
  const latestPath = getOrderRiskLatestDocPath(channelId, orderId);
  const historyPath = getOrderRiskHistoryDocPath(
    channelId,
    orderId,
    workflowRunId,
  );

  const latestDoc: OrderRiskAnalysis = {
    id: "order-risk-latest",
    orderId,
    channelId,
    documentKind: OrderRiskAnalysisDocumentKind.LATEST,
    source,
    status: OrderRiskAnalysisStatus.FAILED,
    workflowRunId,
    inputHash,
    reasons: [],
    signals: [],
    safeSignals: [],
    version: ORDER_RISK_ANALYSIS_VERSION,
    createdBy,
    error,
  };

  const historyDoc: OrderRiskAnalysis = {
    ...latestDoc,
    id: `order-risk-${workflowRunId}`,
    documentKind: OrderRiskAnalysisDocumentKind.HISTORY,
  };
  const latestWrite = {
    ...latestDoc,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const historyWrite = {
    ...historyDoc,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await Promise.all([
    firestore.doc(latestPath).set(latestWrite, { merge: true }),
    firestore.doc(historyPath).set(historyWrite),
  ]);
}
