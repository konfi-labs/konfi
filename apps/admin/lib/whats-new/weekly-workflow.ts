import "server-only";

import { getWorkflowMetadata } from "workflow";
import type { FeedGenerationOptions } from "./feed";
import {
  generateWeeklyWhatsNewChangeStep,
  type WeeklyWhatsNewWorkflowStepResult,
} from "./weekly-workflow.steps";

export interface WeeklyWhatsNewWorkflowResult extends WeeklyWhatsNewWorkflowStepResult {
  workflowRunId: string;
}

export async function runWeeklyWhatsNewWorkflow(
  options: boolean | FeedGenerationOptions = false,
): Promise<WeeklyWhatsNewWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await generateWeeklyWhatsNewChangeStep(options);

  return {
    ...result,
    workflowRunId,
  };
}
