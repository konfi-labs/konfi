import "server-only";

import { getWorkflowMetadata } from "workflow";
import type { SyncFakturowniaCostInvoicesResult } from "./cost-intelligence";
import { runFakturowniaCostSyncStep } from "./cost-sync-workflow.steps";

export interface FakturowniaCostSyncWorkflowResult
  extends SyncFakturowniaCostInvoicesResult {
  workflowRunId: string;
}

export async function runFakturowniaCostSyncWorkflow(): Promise<FakturowniaCostSyncWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await runFakturowniaCostSyncStep();

  return {
    ...result,
    workflowRunId,
  };
}
