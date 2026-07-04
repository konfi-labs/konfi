import "server-only";

import { getStoreVertexClient } from "@/lib/ai/server-vertex";
import { getFirebaseAdminApp } from "@/lib/firebase/serverApp";
import { runMeteredAiText } from "@/lib/ai/usage-metering";
import {
  MODELS,
  resolveServerTenantContext,
  tenantFirestorePaths,
  withTenantId,
} from "@konfi/firebase";
import {
  DEFAULT_LOCALE,
  Order,
  OrderRiskAnalysis,
  OrderRiskAnalysisDocumentKind,
  OrderRiskAnalysisSource,
  OrderRiskAnalysisStatus,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
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
import { Output, generateText } from "ai";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
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
const ORDER_RISK_AI_TIMEOUT_MS = 45_000;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeStoreOrderRiskAiResult(
  result: RawOrderRiskAiResult,
  evaluation: Awaited<ReturnType<typeof loadOrderRiskEvaluationStep>>,
): OrderRiskAiResult {
  try {
    return normalizeOrderRiskAiResult(result, evaluation);
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
  tenantId?: string;
}) {
  const { channelId, orderId } = params;
  const tenantContext = resolveServerTenantContext(
    process.env,
    params.tenantId,
  );
  const firestore = getFirestore(getFirebaseAdminApp());
  const orderSnapshot = await firestore
    .doc(tenantFirestorePaths.orderDoc(tenantContext, channelId, orderId))
    .get();

  if (!orderSnapshot.exists) {
    throw new Error("Order not found for risk analysis.");
  }

  const order = orderSnapshot.data() as Order;
  return evaluateOrderRiskDeterministically(extractOrderRiskSnapshot(order));
}

function getOrderRiskLatestPath(
  tenantContext: TenantContext,
  channelId: string,
  orderId: string,
) {
  return `${tenantFirestorePaths.orderDoc(
    tenantContext,
    channelId,
    orderId,
  )}/analyses/order-risk-latest`;
}

function getOrderRiskHistoryPath(
  tenantContext: TenantContext,
  channelId: string,
  orderId: string,
  workflowRunId: string,
) {
  return `${tenantFirestorePaths.orderDoc(
    tenantContext,
    channelId,
    orderId,
  )}/analyses/order-risk-${workflowRunId}`;
}

export async function generateOrderRiskAiResultStep(params: {
  evaluation: Awaited<ReturnType<typeof loadOrderRiskEvaluationStep>>;
  tenantId?: string;
}) {
  const { evaluation, tenantId } = params;
  const vertex = await getStoreVertexClient();
  const firestore = getFirestore(getFirebaseAdminApp());
  const prompt = buildOrderRiskPrompt(evaluation);

  const { output } = await runMeteredAiText({
    estimatedTotalTokens: prompt.length,
    metering: {
      context: resolveServerTenantContext(process.env, tenantId),
      firestore,
      model: ORDER_RISK_AI_MODEL,
      provider: "google-vertex",
      source: "order-risk",
    },
    run: () =>
      generateText({
        model: vertex(ORDER_RISK_AI_MODEL),
        output: Output.object({ schema: orderRiskAiSchema }),
        instructions: buildOrderRiskSystemPrompt(),
        prompt,
        temperature: 0,
        timeout: {
          totalMs: ORDER_RISK_AI_TIMEOUT_MS,
          stepMs: ORDER_RISK_AI_TIMEOUT_MS,
        },
      }),
  });

  return normalizeStoreOrderRiskAiResult(output, evaluation);
}

export async function persistCompletedOrderRiskAnalysisStep(params: {
  channelId: string;
  orderId: string;
  workflowRunId: string;
  inputHash: string;
  source: OrderRiskAnalysisSource;
  createdBy: string;
  tenantId?: string;
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
    tenantId,
    evaluation,
    aiResult,
  } = params;
  const tenantContext = resolveServerTenantContext(process.env, tenantId);
  const firestore = getFirestore(getFirebaseAdminApp());

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

  const latestPath = getOrderRiskLatestPath(tenantContext, channelId, orderId);
  const historyPath = getOrderRiskHistoryPath(
    tenantContext,
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
  const latestWrite = withTenantId(
    {
      ...latestDoc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    tenantContext,
    "order risk latest",
  );
  const historyWrite = withTenantId(
    {
      ...historyDoc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    tenantContext,
    "order risk history",
  );

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
  tenantId?: string;
  error: string;
}): Promise<void> {
  const {
    channelId,
    orderId,
    workflowRunId,
    inputHash,
    source,
    createdBy,
    tenantId,
    error,
  } = params;
  const tenantContext = resolveServerTenantContext(process.env, tenantId);
  const firestore = getFirestore(getFirebaseAdminApp());
  const latestPath = getOrderRiskLatestPath(tenantContext, channelId, orderId);
  const historyPath = getOrderRiskHistoryPath(
    tenantContext,
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
  const latestWrite = withTenantId(
    {
      ...latestDoc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    tenantContext,
    "order risk failed latest",
  );
  const historyWrite = withTenantId(
    {
      ...historyDoc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    tenantContext,
    "order risk failed history",
  );

  await Promise.all([
    firestore.doc(latestPath).set(latestWrite, { merge: true }),
    firestore.doc(historyPath).set(historyWrite),
  ]);
}
