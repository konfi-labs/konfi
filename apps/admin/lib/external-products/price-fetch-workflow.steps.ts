import "server-only";

import type { ExternalProductPriceFetchStrategy } from "@konfi/types";
import { FatalError } from "workflow";
import {
  fetchExternalProductPricesSystem,
  stageExternalProductPricesForReviewSystem,
} from "@/lib/external-products/price-fetch-system";

export interface ExternalProductPriceFetchWorkflowInput {
  externalProductId: string;
  fetchStrategy?: ExternalProductPriceFetchStrategy;
  mode: "apply" | "stage";
  marginPercent: number;
  taxPercent: number;
  discountPercent: number;
  workflowStartedAtMs?: number;
  workflowRunId?: string;
}

export interface ExternalProductPriceFetchWorkflowResult {
  externalProductId: string;
  fetchStrategy: ExternalProductPriceFetchStrategy;
  mode: "apply" | "stage";
  fetchedConfigurationCount: number;
}

function isFatalPriceFetchError(message: string): boolean {
  return /not found|no provider|selected endpoint not found|no suitable pricing endpoint|access blocked|ip blocked|forbidden|unauthorized|too many requests|rate limit|maximum runtime/i.test(
    message,
  );
}

export async function runExternalProductPriceFetchStep(
  input: ExternalProductPriceFetchWorkflowInput,
): Promise<ExternalProductPriceFetchWorkflowResult> {
  "use step";

  const {
    externalProductId,
    fetchStrategy,
    mode,
    marginPercent,
    taxPercent,
    discountPercent,
  } = input;
  const resolvedFetchStrategy = fetchStrategy === "full" ? "full" : "reuse";

  const result = mode === "stage"
    ? await stageExternalProductPricesForReviewSystem(
      externalProductId,
      marginPercent,
      taxPercent,
      discountPercent,
      resolvedFetchStrategy,
      input.workflowStartedAtMs,
      input.workflowRunId,
    )
    : await fetchExternalProductPricesSystem(
      externalProductId,
      marginPercent,
      taxPercent,
      discountPercent,
      resolvedFetchStrategy,
      input.workflowStartedAtMs,
      input.workflowRunId,
    );

  if (!result.success) {
    const message = result.error || "Failed to fetch external product prices";

    if (isFatalPriceFetchError(message)) {
      throw new FatalError(message);
    }

    throw new Error(message);
  }

  return {
    externalProductId,
    fetchStrategy: resolvedFetchStrategy,
    mode,
    fetchedConfigurationCount: result.priceConfigurations?.length ?? 0,
  };
}
