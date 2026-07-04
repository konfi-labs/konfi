import "server-only";

import {
  generateMonthlyGrowthWhatsNewChange,
  type FeedGenerationOptions,
  type FeedGenerationResult,
} from "./feed";

export interface MonthlyWhatsNewWorkflowStepResult extends FeedGenerationResult {
  force: boolean;
}

export async function generateMonthlyWhatsNewChangeStep(
  options: boolean | FeedGenerationOptions,
): Promise<MonthlyWhatsNewWorkflowStepResult> {
  "use step";

  const result = await generateMonthlyGrowthWhatsNewChange(options);

  return {
    ...result,
    force: typeof options === "boolean" ? options : (options.force ?? false),
  };
}
