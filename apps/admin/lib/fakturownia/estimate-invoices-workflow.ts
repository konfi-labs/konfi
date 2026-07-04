import "server-only";

import { getWorkflowMetadata } from "workflow";
import type { FakturowniaEstimateInvoicesResult } from "./estimate-invoices";
import { runFakturowniaEstimateInvoicesStep } from "./estimate-invoices-workflow.steps";

export interface FakturowniaEstimateInvoicesWorkflowResult extends FakturowniaEstimateInvoicesResult {
  workflowRunId: string;
}

export async function runFakturowniaEstimateInvoicesWorkflow(): Promise<FakturowniaEstimateInvoicesWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await runFakturowniaEstimateInvoicesStep();

  return {
    ...result,
    workflowRunId,
  };
}
