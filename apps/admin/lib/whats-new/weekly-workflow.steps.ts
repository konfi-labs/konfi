import "server-only";

import {
  generateWeeklyWhatsNewChange,
  type FeedGenerationOptions,
  type FeedGenerationResult,
} from "./feed";

export interface WeeklyWhatsNewWorkflowStepResult extends FeedGenerationResult {
  force: boolean;
}

export async function generateWeeklyWhatsNewChangeStep(
  options: boolean | FeedGenerationOptions,
): Promise<WeeklyWhatsNewWorkflowStepResult> {
  "use step";

  const result = await generateWeeklyWhatsNewChange(options);

  return {
    ...result,
    force: typeof options === "boolean" ? options : (options.force ?? false),
  };
}
