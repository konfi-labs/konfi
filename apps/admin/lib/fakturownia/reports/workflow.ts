import "server-only";

import { getWorkflowMetadata } from "workflow";
import type { ScheduledFakturowniaReportResult } from "./service";
import {
  runDailyFakturowniaTurnoverReportStep,
  runWeeklyFakturowniaUnpaidReportStep,
} from "./workflow.steps";

export interface FakturowniaReportWorkflowResult extends ScheduledFakturowniaReportResult {
  workflowRunId: string;
}

export async function runDailyFakturowniaTurnoverReportWorkflow(): Promise<FakturowniaReportWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await runDailyFakturowniaTurnoverReportStep();

  return {
    ...result,
    workflowRunId,
  };
}

export async function runWeeklyFakturowniaUnpaidReportWorkflow(): Promise<FakturowniaReportWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await runWeeklyFakturowniaUnpaidReportStep();

  return {
    ...result,
    workflowRunId,
  };
}
