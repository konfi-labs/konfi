import "server-only";

export const MAX_WORKFLOW_RUNTIME_MS = 2 * 60 * 60 * 1000;
const MAX_WORKFLOW_RUNTIME_LABEL = "2 hours";

export type WorkflowRuntimeDeadline = {
  startedAtMs: number;
  expiresAtMs: number;
  maxRuntimeMs: number;
};

export class WorkflowRuntimeLimitError extends Error {
  constructor(context?: string) {
    super(
      context
        ? `Workflow exceeded maximum runtime of ${MAX_WORKFLOW_RUNTIME_LABEL} while ${context}.`
        : `Workflow exceeded maximum runtime of ${MAX_WORKFLOW_RUNTIME_LABEL}.`,
    );
    this.name = "WorkflowRuntimeLimitError";
  }
}

export function createWorkflowRuntimeDeadline(
  startedAtMs?: number,
): WorkflowRuntimeDeadline {
  const now = Date.now();
  const normalizedStartedAtMs =
    typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
      ? Math.min(startedAtMs, now)
      : now;

  return {
    startedAtMs: normalizedStartedAtMs,
    expiresAtMs: normalizedStartedAtMs + MAX_WORKFLOW_RUNTIME_MS,
    maxRuntimeMs: MAX_WORKFLOW_RUNTIME_MS,
  };
}

export function getWorkflowRuntimeRemainingMs(
  deadline: WorkflowRuntimeDeadline,
): number {
  return Math.max(0, deadline.expiresAtMs - Date.now());
}

export function getWorkflowRuntimeRemainingMsOrThrow(
  deadline: WorkflowRuntimeDeadline,
  context?: string,
): number {
  const remainingMs = getWorkflowRuntimeRemainingMs(deadline);

  if (remainingMs <= 0) {
    throw new WorkflowRuntimeLimitError(context);
  }

  return remainingMs;
}

export function assertWithinWorkflowRuntime(
  deadline: WorkflowRuntimeDeadline,
  context?: string,
): void {
  getWorkflowRuntimeRemainingMsOrThrow(deadline, context);
}

export async function runWithinWorkflowRuntime<T>(
  deadline: WorkflowRuntimeDeadline,
  context: string,
  operation: () => Promise<T>,
): Promise<T> {
  const remainingMs = getWorkflowRuntimeRemainingMsOrThrow(deadline, context);
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new WorkflowRuntimeLimitError(context));
    }, remainingMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

type CombinedSignal = {
  signal: AbortSignal;
  cleanup: () => void;
};

function combineAbortSignals(
  timeoutSignal: AbortSignal,
  externalSignal?: AbortSignal | null,
): CombinedSignal {
  const noop = () => { };

  if (!externalSignal) {
    return { signal: timeoutSignal, cleanup: noop };
  }

  if (typeof AbortSignal.any === "function") {
    return {
      signal: AbortSignal.any([timeoutSignal, externalSignal]),
      cleanup: noop,
    };
  }

  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };

  if (timeoutSignal.aborted || externalSignal.aborted) {
    controller.abort();
    return { signal: controller.signal, cleanup: noop };
  }

  timeoutSignal.addEventListener("abort", abort, { once: true });
  externalSignal.addEventListener("abort", abort, { once: true });

  const cleanup = () => {
    timeoutSignal.removeEventListener("abort", abort);
    externalSignal.removeEventListener("abort", abort);
  };

  return { signal: controller.signal, cleanup };
}

export async function fetchWithinWorkflowRuntime(
  deadline: WorkflowRuntimeDeadline | undefined,
  context: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!deadline) {
    return fetch(input, init);
  }

  const timeoutMs = getWorkflowRuntimeRemainingMsOrThrow(deadline, context);
  const controller = new AbortController();
  let abortedByTimeout = false;
  const timeoutId = setTimeout(() => {
    abortedByTimeout = true;
    controller.abort();
  }, timeoutMs);
  const { signal: requestSignal, cleanup } = combineAbortSignals(
    controller.signal,
    init?.signal,
  );

  try {
    return await fetch(input, { ...init, signal: requestSignal });
  } catch (error) {
    if (abortedByTimeout) {
      throw new WorkflowRuntimeLimitError(context);
    }

    if (init?.signal?.aborted) {
      throw init.signal.reason ?? error;
    }

    if (isAbortError(error)) {
      throw new WorkflowRuntimeLimitError(context);
    }

    throw error;
  } finally {
    cleanup();
    clearTimeout(timeoutId);
  }
}
