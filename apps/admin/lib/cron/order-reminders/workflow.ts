import "server-only";

import { getWorkflowMetadata } from "workflow";
import {
  collectNoPaymentDocumentReminderJobsForTenantStep,
  collectNoPaymentDocumentReminderJobsStep,
  collectStalledOrderReminderJobsForTenantStep,
  collectStalledOrderReminderJobsStep,
  sendOrderReminderEmailStep,
  type OrderReminderJobBatch,
  type OrderReminderKind,
} from "./steps";

export interface OrderReminderWorkflowResult {
  kind: OrderReminderKind;
  preparedJobs: number;
  scannedOrders: number;
  sentEmails: number;
  workflowRunId: string;
}

async function runReminderWorkflow(params: {
  collectJobs: () => Promise<OrderReminderJobBatch>;
  kind: OrderReminderKind;
  tenantId?: string;
}): Promise<OrderReminderWorkflowResult> {
  const { workflowRunId } = getWorkflowMetadata();
  const batch = await params.collectJobs();

  for (const job of batch.jobs) {
    await sendOrderReminderEmailStep(job, params.tenantId);
  }

  return {
    kind: params.kind,
    preparedJobs: batch.jobs.length,
    scannedOrders: batch.scannedOrders,
    sentEmails: batch.jobs.length,
    workflowRunId,
  };
}

export async function runStalledOrdersReminderWorkflow(tenantId?: string) {
  "use workflow";

  return runReminderWorkflow({
    collectJobs: tenantId
      ? () => collectStalledOrderReminderJobsForTenantStep(tenantId)
      : collectStalledOrderReminderJobsStep,
    kind: "stalled-orders-reminder",
    tenantId,
  });
}

export async function runNoPaymentDocumentReminderWorkflow(tenantId?: string) {
  "use workflow";

  return runReminderWorkflow({
    collectJobs: tenantId
      ? () => collectNoPaymentDocumentReminderJobsForTenantStep(tenantId)
      : collectNoPaymentDocumentReminderJobsStep,
    kind: "no-payment-document-id",
    tenantId,
  });
}
