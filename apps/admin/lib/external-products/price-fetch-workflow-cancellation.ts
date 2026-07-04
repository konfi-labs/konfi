import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import type { ExternalProduct } from "@konfi/types";

const WORKFLOW_CANCELLATION_POLL_INTERVAL_MS = 1_500;
const activeAbortControllers = new Map<string, AbortController>();

function getDb() {
  return getAdminDb();
}

export class ExternalProductPriceFetchWorkflowCancelledError extends Error {
  constructor(context?: string) {
    super(
      context
        ? `External product price fetch workflow was cancelled while ${context}.`
        : "External product price fetch workflow was cancelled.",
    );
    this.name = "ExternalProductPriceFetchWorkflowCancelledError";
  }
}

export interface ExternalProductPriceFetchWorkflowCancellation {
  readonly signal: AbortSignal;
  throwIfCancelled(context?: string): Promise<void>;
  dispose(): void;
}

function createCancellationError(
  context?: string,
): ExternalProductPriceFetchWorkflowCancelledError {
  return new ExternalProductPriceFetchWorkflowCancelledError(context);
}

function getAbortController(workflowRunId: string): AbortController {
  const existingController = activeAbortControllers.get(workflowRunId);

  if (existingController) {
    return existingController;
  }

  const nextController = new AbortController();
  activeAbortControllers.set(workflowRunId, nextController);
  return nextController;
}

function isCancellationRequested(
  workflow: ExternalProduct["priceFetchWorkflow"] | undefined,
  workflowRunId: string,
): boolean {
  if (!workflow?.runId || workflow.runId !== workflowRunId) {
    return true;
  }

  return (
    workflow.status === "cancelled" || workflow.cancelRequestedAt !== undefined
  );
}

function throwIfLocallyAborted(signal: AbortSignal, context?: string): void {
  if (!signal.aborted) {
    return;
  }

  const reason = signal.reason;

  if (
    !context &&
    reason instanceof ExternalProductPriceFetchWorkflowCancelledError
  ) {
    throw reason;
  }

  throw createCancellationError(context);
}

export function abortActiveExternalProductPriceFetchWorkflowRun(
  workflowRunId: string,
): void {
  const controller = activeAbortControllers.get(workflowRunId);

  if (!controller || controller.signal.aborted) {
    return;
  }

  controller.abort(createCancellationError());
}

export function isExternalProductPriceFetchWorkflowCancelledError(
  error: unknown,
): error is ExternalProductPriceFetchWorkflowCancelledError {
  return (
    error instanceof Error &&
    error.name === "ExternalProductPriceFetchWorkflowCancelledError"
  );
}

export function createExternalProductPriceFetchWorkflowCancellation(options: {
  externalProductId: string;
  workflowRunId?: string;
}): ExternalProductPriceFetchWorkflowCancellation | undefined {
  const { externalProductId, workflowRunId } = options;

  if (!workflowRunId) {
    return undefined;
  }

  const controller = getAbortController(workflowRunId);
  let lastRemoteCheckAtMs = 0;
  let remoteCheckPromise: Promise<void> | null = null;

  const refreshRemoteCancellationState = async (
    context?: string,
  ): Promise<void> => {
    if (remoteCheckPromise) {
      await remoteCheckPromise;
      return;
    }

    lastRemoteCheckAtMs = Date.now();
    remoteCheckPromise = (async () => {
      try {
        const externalDoc = await getDb()
          .collection("externalProducts")
          .doc(externalProductId)
          .get();

        if (!externalDoc.exists) {
          controller.abort(createCancellationError(context));
          return;
        }

        const externalProduct = externalDoc.data() as ExternalProduct;

        if (
          isCancellationRequested(
            externalProduct.priceFetchWorkflow,
            workflowRunId,
          )
        ) {
          controller.abort(createCancellationError(context));
        }
      } catch (error) {
        console.warn(
          "Error checking external product price fetch cancellation state:",
          {
            externalProductId,
            workflowRunId,
            error,
          },
        );
      }
    })().finally(() => {
      remoteCheckPromise = null;
    });

    await remoteCheckPromise;
  };

  return {
    signal: controller.signal,
    async throwIfCancelled(context?: string): Promise<void> {
      throwIfLocallyAborted(controller.signal, context);

      if (
        Date.now() - lastRemoteCheckAtMs >=
        WORKFLOW_CANCELLATION_POLL_INTERVAL_MS
      ) {
        await refreshRemoteCancellationState(context);
      }

      throwIfLocallyAborted(controller.signal, context);
    },
    dispose(): void {
      if (activeAbortControllers.get(workflowRunId) === controller) {
        activeAbortControllers.delete(workflowRunId);
      }
    },
  };
}
