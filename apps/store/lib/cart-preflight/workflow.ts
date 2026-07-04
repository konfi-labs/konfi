import "server-only";

import {
  markCartPreflightCompletedStep,
  markCartPreflightFailedStep,
  markCartPreflightRunningStep,
  runCartPreflightStep,
} from "@/lib/cart-preflight/steps";
import type {
  CartPreflightWorkflowInput,
  CartPreflightWorkflowResult,
} from "@/lib/cart-preflight/types";

export async function runCartPreflightWorkflow(
  input: CartPreflightWorkflowInput,
): Promise<CartPreflightWorkflowResult> {
  "use workflow";

  await markCartPreflightRunningStep(input);

  try {
    const result = await runCartPreflightStep(input);
    await markCartPreflightCompletedStep({ input, result });

    return result;
  } catch (error) {
    await markCartPreflightFailedStep({
      error: error instanceof Error ? error.message : "Preflight check failed.",
      input,
    });

    throw error;
  }
}
