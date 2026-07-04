"use server";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { tenantFirestorePaths, withTenantId } from "@konfi/firebase";
import {
  isNestedCustomer,
  Order,
  OrderRiskAnalysis,
  OrderRiskAnalysisDocumentKind,
  OrderRiskAnalysisSource,
  OrderRiskAnalysisStatus,
  OrderRiskSkipReason,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  buildOrderRiskHashInput,
  extractOrderRiskSnapshot,
  getOrderRiskLatestDocPath,
  ORDER_RISK_ANALYSIS_VERSION,
  ORDER_RISK_EXISTING_CUSTOMER_SKIP_MIN_ORDERS,
} from "@konfi/utils";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { start } from "workflow/api";
import type { Customer } from "@konfi/types";

function hashOrderRiskInput(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function shouldSkipOrderRiskAnalysisForCustomer(params: {
  customerId: string;
  tenantContext: TenantContext;
}): Promise<boolean> {
  const firestore = getAdminDb();
  const customerSnapshot = await firestore
    .doc(
      tenantFirestorePaths.customerDoc(params.tenantContext, params.customerId),
    )
    .get();

  if (!customerSnapshot.exists) {
    return false;
  }

  const customer = customerSnapshot.data() as Customer;
  return (
    (customer.orders?.length ?? 0) >=
    ORDER_RISK_EXISTING_CUSTOMER_SKIP_MIN_ORDERS
  );
}

export async function startStoreOrderRiskAnalysis(input: {
  channelId: string;
  orderId: string;
  source?: OrderRiskAnalysisSource;
  tenantContext: TenantContext;
}) {
  const source = input.source ?? OrderRiskAnalysisSource.AUTO;
  const firestore = getAdminDb();
  const orderRef = firestore.doc(
    tenantFirestorePaths.orderDoc(
      input.tenantContext,
      input.channelId,
      input.orderId,
    ),
  );
  const orderSnapshot = await orderRef.get();

  if (!orderSnapshot.exists) {
    return { started: false, error: "Order not found." };
  }

  const order = orderSnapshot.data() as Order;
  const inputHash = hashOrderRiskInput(
    buildOrderRiskHashInput(extractOrderRiskSnapshot(order)),
  );

  const latestRef = firestore.doc(
    getOrderRiskLatestDocPath(input.channelId, input.orderId),
  );
  const latestSnapshot = await latestRef.get();
  const latestAnalysis = latestSnapshot.exists
    ? (latestSnapshot.data() as OrderRiskAnalysis)
    : undefined;

  if (
    latestAnalysis?.inputHash === inputHash &&
    (latestAnalysis.status === OrderRiskAnalysisStatus.COMPLETED ||
      latestAnalysis.status === OrderRiskAnalysisStatus.SKIPPED ||
      latestAnalysis.status === OrderRiskAnalysisStatus.PENDING ||
      latestAnalysis.status === OrderRiskAnalysisStatus.RUNNING)
  ) {
    return {
      started: false,
      runId: latestAnalysis.workflowRunId,
      alreadyCurrent: true,
      skipped: latestAnalysis.status === OrderRiskAnalysisStatus.SKIPPED,
      skipReason: latestAnalysis.skipReason,
    };
  }

  if (
    isNestedCustomer(order.customer) &&
    (await shouldSkipOrderRiskAnalysisForCustomer({
      customerId: order.customer.id,
      tenantContext: input.tenantContext,
    }))
  ) {
    const latestDoc = {
      id: "order-risk-latest",
      orderId: input.orderId,
      channelId: input.channelId,
      documentKind: OrderRiskAnalysisDocumentKind.LATEST,
      source,
      status: OrderRiskAnalysisStatus.SKIPPED,
      inputHash,
      reasons: [],
      signals: [],
      safeSignals: [],
      version: ORDER_RISK_ANALYSIS_VERSION,
      createdBy: "SYSTEM",
      skipReason: OrderRiskSkipReason.EXISTING_CUSTOMER,
    } satisfies Partial<OrderRiskAnalysis>;
    const latestWrite = withTenantId(
      {
        ...latestDoc,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      input.tenantContext,
      "order risk latest skip",
    );

    await latestRef.set(latestWrite, { merge: true });

    return {
      started: false,
      skipped: true,
      skipReason: OrderRiskSkipReason.EXISTING_CUSTOMER,
    };
  }

  const { runStoreOrderRiskWorkflow } = await import("./workflow");
  const run = await start(runStoreOrderRiskWorkflow, [
    {
      channelId: input.channelId,
      orderId: input.orderId,
      source,
      createdBy: "SYSTEM",
      inputHash,
      tenantId: input.tenantContext.tenantId,
    },
  ]);

  const latestDoc = {
    id: "order-risk-latest",
    orderId: input.orderId,
    channelId: input.channelId,
    documentKind: OrderRiskAnalysisDocumentKind.LATEST,
    source,
    status: OrderRiskAnalysisStatus.RUNNING,
    workflowRunId: run.runId,
    inputHash,
    reasons: [],
    signals: [],
    safeSignals: [],
    version: ORDER_RISK_ANALYSIS_VERSION,
    createdBy: "SYSTEM",
  } satisfies Partial<OrderRiskAnalysis>;
  const latestWrite = withTenantId(
    {
      ...latestDoc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    input.tenantContext,
    "order risk latest run",
  );

  await latestRef.set(latestWrite, { merge: true });

  return { started: true, runId: run.runId };
}
