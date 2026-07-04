import "server-only";

import type { ExternalProductPriceFetchWorkflowCancellation } from "@/lib/external-products/price-fetch-workflow-cancellation";
import {
  getWorkflowRuntimeRemainingMsOrThrow,
  runWithinWorkflowRuntime,
  type WorkflowRuntimeDeadline,
  WorkflowRuntimeLimitError,
} from "@/lib/workflow-runtime-limit";

/**
 * Runtime helpers extracted from `price-fetch-system.ts`:
 * - randomized timing / sleep helpers used to space out provider requests
 * - workflow-runtime-aware sleep / run wrappers
 * - bounded-concurrency `mapWithConcurrencyLimit`
 * - provider-blocking detection helpers
 *
 * These are pure utilities (no Firestore, no AI, no top-level state) and are
 * shared across the price-fetch orchestration code paths.
 */

export const INITIAL_BLOCKING_FAILURE_LIMIT = 5;

const SEED_INITIAL_DELAY_MIN_MS = 1_000;
const SEED_INITIAL_DELAY_MAX_MS = 2_400;
const SEED_FOLLOW_UP_DELAY_MIN_MS = 250;
const SEED_FOLLOW_UP_DELAY_MAX_MS = 750;
const BATCH_REQUEST_DELAY_MIN_MS = 250;
const BATCH_REQUEST_DELAY_MAX_MS = 900;
const BATCH_PAUSE_MIN_MS = 1_000;
const BATCH_PAUSE_MAX_MS = 2_200;

export type FailedPricingFetchAttempt = {
  index: number;
  url: string;
  error?: string;
};

export function getRandomDelayMs(min: number, max: number): number {
  if (max <= min) {
    return min;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function maybeRunWithinWorkflowRuntime<T>(
  runtimeDeadline: WorkflowRuntimeDeadline | undefined,
  context: string,
  operation: () => Promise<T>,
  cancellation?: ExternalProductPriceFetchWorkflowCancellation,
): Promise<T> {
  await cancellation?.throwIfCancelled(context);

  if (!runtimeDeadline) {
    const result = await operation();
    await cancellation?.throwIfCancelled(context);
    return result;
  }

  const result = await runWithinWorkflowRuntime(
    runtimeDeadline,
    context,
    operation,
  );
  await cancellation?.throwIfCancelled(context);
  return result;
}

export async function sleepWithinWorkflowRuntime(
  ms: number,
  runtimeDeadline: WorkflowRuntimeDeadline | undefined,
  context: string,
  cancellation?: ExternalProductPriceFetchWorkflowCancellation,
): Promise<void> {
  await cancellation?.throwIfCancelled(context);

  if (!runtimeDeadline) {
    await sleep(ms);
    await cancellation?.throwIfCancelled(context);
    return;
  }

  const remainingMs = getWorkflowRuntimeRemainingMsOrThrow(
    runtimeDeadline,
    context,
  );

  if (remainingMs <= ms) {
    throw new WorkflowRuntimeLimitError(context);
  }

  await sleep(ms);
  await cancellation?.throwIfCancelled(context);
}

export function getSeedDelayMs(attemptIndex: number): number {
  if (attemptIndex < INITIAL_BLOCKING_FAILURE_LIMIT) {
    return getRandomDelayMs(
      SEED_INITIAL_DELAY_MIN_MS,
      SEED_INITIAL_DELAY_MAX_MS,
    );
  }

  return getRandomDelayMs(
    SEED_FOLLOW_UP_DELAY_MIN_MS,
    SEED_FOLLOW_UP_DELAY_MAX_MS,
  );
}

export function getBatchRequestDelayMs(): number {
  return getRandomDelayMs(
    BATCH_REQUEST_DELAY_MIN_MS,
    BATCH_REQUEST_DELAY_MAX_MS,
  );
}

export function getBatchPauseDelayMs(): number {
  return getRandomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
}

export function isLikelyAccessBlockedError(error?: string): boolean {
  if (!error) {
    return false;
  }

  return /http (401|403|429)\b|forbidden|unauthorized|too many requests|rate limit|ip blocked|econnreset|err_connection_reset|timed out|timeout/i.test(
    error,
  );
}

export function summarizeAttemptErrors(
  attempts: FailedPricingFetchAttempt[],
): string[] {
  const counts = new Map<string, number>();

  for (const attempt of attempts) {
    const key = attempt.error || "Unknown error";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].map(([error, count]) => `${error} (${count}x)`);
}

export function buildInitialBlockingAbortMessage(
  attempts: FailedPricingFetchAttempt[],
): string {
  const errorSummary = summarizeAttemptErrors(attempts).join(", ");

  return (
    `Access blocked by provider during the first ${INITIAL_BLOCKING_FAILURE_LIMIT} price lookup attempts. ` +
    `Aborting early to avoid hammering the provider. ` +
    `Errors: ${errorSummary}. Retry later or from a different IP/VPN.`
  );
}

export async function mapWithConcurrencyLimit<TItem, TResult>(options: {
  items: TItem[];
  concurrency: number;
  mapper: (item: TItem, index: number) => Promise<TResult>;
  cancellation?: ExternalProductPriceFetchWorkflowCancellation;
  cancellationContext?: string;
}): Promise<TResult[]> {
  const { items, concurrency, mapper, cancellation, cancellationContext } =
    options;
  const results: TResult[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        if (cancellation) {
          await cancellation.throwIfCancelled(
            cancellationContext ??
              "processing external product price fetch work",
          );
        }

        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

export function shouldLogFetchProgress(
  index: number,
  totalCount: number,
): boolean {
  if (totalCount <= 5) {
    return true;
  }

  if (index < 3 || index === totalCount - 1) {
    return true;
  }

  return (index + 1) % 10 === 0;
}
