import "server-only";

import { getWorkflowMetadata } from "workflow";
import type { FeedGenerationOptions } from "./feed";
import {
  generateMonthlyWhatsNewChangeStep,
  type MonthlyWhatsNewWorkflowStepResult,
} from "./monthly-workflow.steps";

export interface MonthlyWhatsNewWorkflowResult extends MonthlyWhatsNewWorkflowStepResult {
  workflowRunId: string;
}

export async function runMonthlyWhatsNewWorkflow(
  options: boolean | FeedGenerationOptions = false,
): Promise<MonthlyWhatsNewWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await generateMonthlyWhatsNewChangeStep(options);

  return {
    ...result,
    workflowRunId,
  };
}
