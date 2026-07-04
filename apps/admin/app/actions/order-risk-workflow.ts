"use server";

import {
  getAuthenticatedAdminUid,
  getTenantAdminScopeTenantId,
  requireTenantAdminChannelAccess,
} from "@/actions/auth-utils";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  isNestedCustomer,
  Order,
  OrderRiskAnalysis,
  OrderRiskAnalysisDocumentKind,
  OrderRiskAnalysisSource,
  OrderRiskAnalysisStatus,
  OrderRiskSkipReason,
} from "@konfi/types";
import {
  buildOrderRiskHashInput,
  extractOrderRiskSnapshot,
  getOrderRiskHistoryDocPath,
  getOrderRiskLatestDocPath,
  ORDER_RISK_ANALYSIS_VERSION,
  ORDER_RISK_EXISTING_CUSTOMER_SKIP_MIN_ORDERS,
} from "@konfi/utils";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getRun, start } from "workflow/api";
import type { Customer } from "@konfi/types";

export type StartOrderRiskAnalysisResponse = {
  started: boolean;
  runId?: string;
  alreadyCurrent?: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: OrderRiskSkipReason;
};

export type SerializedOrderRiskAnalysis = Omit<
  OrderRiskAnalysis,
  "createdAt" | "updatedAt"
> & {
  createdAt?: number;
  updatedAt?: number;
};

type TenantScopedOrderRiskAnalysis = OrderRiskAnalysis & {
  tenantId?: string;
};

function serializeOrderRiskAnalysis(
  analysis: OrderRiskAnalysis,
): SerializedOrderRiskAnalysis {
  return {
    ...analysis,
    createdAt:
      typeof analysis.createdAt?.toMillis === "function"
        ? analysis.createdAt.toMillis()
        : undefined,
    updatedAt:
      typeof analysis.updatedAt?.toMillis === "function"
        ? analysis.updatedAt.toMillis()
        : undefined,
  };
}

function hashOrderRiskInput(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isActiveOrderRiskAnalysis(analysis: OrderRiskAnalysis): boolean {
  return (
    analysis.status === OrderRiskAnalysisStatus.PENDING ||
    analysis.status === OrderRiskAnalysisStatus.RUNNING
  );
}

async function readFailedWorkflowMessage(runId: string): Promise<string> {
  try {
    await getRun(runId).returnValue;
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
  }

  return "Workflow failed before saving an order risk analysis result.";
}

async function reconcileActiveOrderRiskAnalysis(params: {
  analysis: TenantScopedOrderRiskAnalysis;
  channelId: string;
  orderId: string;
}): Promise<TenantScopedOrderRiskAnalysis> {
  const { analysis, channelId, orderId } = params;
  if (!isActiveOrderRiskAnalysis(analysis) || !analysis.workflowRunId) {
    return analysis;
  }

  let workflowStatus: string;
  try {
    workflowStatus = await getRun(analysis.workflowRunId).status;
  } catch {
    workflowStatus = "not_found";
  }

  if (
    workflowStatus !== "failed" &&
    workflowStatus !== "cancelled" &&
    workflowStatus !== "not_found"
  ) {
    return analysis;
  }

  const error =
    workflowStatus === "cancelled"
      ? "Workflow was cancelled before saving an order risk analysis result."
      : workflowStatus === "not_found"
        ? "Workflow run was not found before saving an order risk analysis result."
        : await readFailedWorkflowMessage(analysis.workflowRunId);
  const failedAnalysis: TenantScopedOrderRiskAnalysis = {
    ...analysis,
    status: OrderRiskAnalysisStatus.FAILED,
    error,
  };
  const latestWrite = {
    ...failedAnalysis,
    updatedAt: FieldValue.serverTimestamp(),
  };
  const historyWrite = {
    ...failedAnalysis,
    id: `order-risk-${analysis.workflowRunId}`,
    documentKind: OrderRiskAnalysisDocumentKind.HISTORY,
    updatedAt: FieldValue.serverTimestamp(),
  };
  const firestore = getAdminDb();

  await Promise.all([
    firestore
      .doc(getOrderRiskLatestDocPath(channelId, orderId))
      .set(latestWrite, { merge: true }),
    firestore
      .doc(
        getOrderRiskHistoryDocPath(channelId, orderId, analysis.workflowRunId),
      )
      .set(historyWrite, { merge: true }),
  ]);

  return failedAnalysis;
}

async function shouldSkipOrderRiskAnalysisForCustomer(params: {
  customerId: string;
  tenantId?: string;
}): Promise<boolean> {
  const firestore = getAdminDb();
  const customerSnapshot = await firestore
    .collection("customers")
    .doc(params.customerId)
    .get();

  if (!customerSnapshot.exists) {
    return false;
  }

  const customer = customerSnapshot.data() as Customer;
  if (params.tenantId && customer.tenantId !== params.tenantId) {
    return false;
  }

  return (
    (customer.orders?.length ?? 0) >=
    ORDER_RISK_EXISTING_CUSTOMER_SKIP_MIN_ORDERS
  );
}

export async function startOrderRiskAnalysisWorkflow(input: {
  channelId: string;
  orderId: string;
  source?: OrderRiskAnalysisSource;
}): Promise<StartOrderRiskAnalysisResponse> {
  const [createdBy, channelId, tenantContext] = await Promise.all([
    getAuthenticatedAdminUid(),
    requireTenantAdminChannelAccess(input.channelId),
    getTenantContextForRequest(),
  ]);
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  const source = input.source ?? OrderRiskAnalysisSource.MANUAL_RERUN;
  const firestore = getAdminDb();

  const orderRef = firestore.doc(
    `channels/${channelId}/orders/${input.orderId}`,
  );
  const orderSnapshot = await orderRef.get();

  if (!orderSnapshot.exists) {
    return { started: false, error: "Order not found." };
  }

  const order = orderSnapshot.data() as Order;
  if (tenantId && order.tenantId !== tenantId) {
    return { started: false, error: "Order not found." };
  }

  const inputHash = hashOrderRiskInput(
    buildOrderRiskHashInput(extractOrderRiskSnapshot(order)),
  );

  const latestRef = firestore.doc(
    getOrderRiskLatestDocPath(channelId, input.orderId),
  );
  const latestSnapshot = await latestRef.get();
  const latestAnalysis = latestSnapshot.exists
    ? (latestSnapshot.data() as OrderRiskAnalysis)
    : undefined;

  if (source !== OrderRiskAnalysisSource.MANUAL_RERUN) {
    if (
      latestAnalysis?.inputHash === inputHash &&
      (latestAnalysis.status === OrderRiskAnalysisStatus.COMPLETED ||
        latestAnalysis.status === OrderRiskAnalysisStatus.SKIPPED)
    ) {
      return {
        started: false,
        runId: latestAnalysis.workflowRunId,
        alreadyCurrent: true,
        skipped: latestAnalysis.status === OrderRiskAnalysisStatus.SKIPPED,
        skipReason: latestAnalysis.skipReason,
      };
    }
  }

  if (
    latestAnalysis?.inputHash === inputHash &&
    (latestAnalysis.status === OrderRiskAnalysisStatus.PENDING ||
      latestAnalysis.status === OrderRiskAnalysisStatus.RUNNING)
  ) {
    return {
      started: false,
      runId: latestAnalysis.workflowRunId,
      alreadyCurrent: true,
    };
  }

  if (
    isNestedCustomer(order.customer) &&
    (await shouldSkipOrderRiskAnalysisForCustomer({
      customerId: order.customer.id,
      tenantId,
    }))
  ) {
    const latestDoc = {
      id: "order-risk-latest",
      orderId: input.orderId,
      channelId,
      ...(tenantId ? { tenantId } : {}),
      documentKind: OrderRiskAnalysisDocumentKind.LATEST,
      source,
      status: OrderRiskAnalysisStatus.SKIPPED,
      inputHash,
      reasons: [],
      signals: [],
      safeSignals: [],
      version: ORDER_RISK_ANALYSIS_VERSION,
      createdBy,
      skipReason: OrderRiskSkipReason.EXISTING_CUSTOMER,
    } satisfies Partial<OrderRiskAnalysis>;
    const latestWrite = {
      ...latestDoc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await latestRef.set(latestWrite, { merge: true });

    return {
      started: false,
      skipped: true,
      skipReason: OrderRiskSkipReason.EXISTING_CUSTOMER,
    };
  }

  const { runAdminOrderRiskWorkflow } =
    await import("../../lib/order-risk/workflow");
  const run = await start(runAdminOrderRiskWorkflow, [
    {
      channelId,
      orderId: input.orderId,
      ...(tenantId ? { tenantId } : {}),
      source,
      createdBy,
      inputHash,
    },
  ]);

  const latestDoc = {
    id: "order-risk-latest",
    orderId: input.orderId,
    channelId,
    ...(tenantId ? { tenantId } : {}),
    documentKind: OrderRiskAnalysisDocumentKind.LATEST,
    source,
    status: OrderRiskAnalysisStatus.RUNNING,
    workflowRunId: run.runId,
    inputHash,
    reasons: [],
    signals: [],
    safeSignals: [],
    version: ORDER_RISK_ANALYSIS_VERSION,
    createdBy,
  } satisfies Partial<OrderRiskAnalysis>;
  const latestWrite = {
    ...latestDoc,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await latestRef.set(latestWrite, { merge: true });

  return { started: true, runId: run.runId };
}

export async function getLatestOrderRiskAnalysis(input: {
  channelId: string;
  orderId: string;
}): Promise<SerializedOrderRiskAnalysis | null> {
  const [channelId, tenantContext] = await Promise.all([
    requireTenantAdminChannelAccess(input.channelId),
    getTenantContextForRequest(),
  ]);
  const tenantId = getTenantAdminScopeTenantId(tenantContext);

  const firestore = getAdminDb();
  const latestRef = firestore.doc(
    getOrderRiskLatestDocPath(channelId, input.orderId),
  );
  const latestSnapshot = await latestRef.get();

  if (!latestSnapshot.exists) {
    return null;
  }

  const latestAnalysis = await reconcileActiveOrderRiskAnalysis({
    analysis: latestSnapshot.data() as TenantScopedOrderRiskAnalysis,
    channelId,
    orderId: input.orderId,
  });
  if (tenantId && latestAnalysis.tenantId !== tenantId) {
    return null;
  }

  return serializeOrderRiskAnalysis({
    ...latestAnalysis,
    id: latestSnapshot.id,
  });
}
