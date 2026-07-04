import type { GenerationResponse } from "./ProductImageGenerationPanel.types";

export type StartStoreImageGenerationWorkflowResponse = {
  runId: string;
};

export type StoreImageGenerationWorkflowStatusResponse =
  | { status: "pending" | "running" | "cancelled"; }
  | { status: "completed"; result: GenerationResponse; }
  | { status: "failed"; error: string; };

type CompletedStoreImageGenerationWorkflowResult = Extract<
  StoreImageGenerationWorkflowStatusResponse,
  { status: "completed" }
>["result"];

export async function pollStoreImageGenerationWorkflow(params: {
  runId: string;
  getWorkflowStatus: (
    runId: string,
  ) => Promise<StoreImageGenerationWorkflowStatusResponse>;
  pollTimeoutMs: number;
  sleep: (ms: number) => Promise<void>;
}): Promise<CompletedStoreImageGenerationWorkflowResult> {
  const { runId, getWorkflowStatus, pollTimeoutMs, sleep } = params;
  const startedAt = Date.now();
  let attempt = 0;

  for (;;) {
    const status = await getWorkflowStatus(runId);

    if (status.status === "completed") {
      return status.result;
    }

    if (status.status === "failed") {
      throw new Error(status.error);
    }

    if (status.status === "cancelled") {
      throw new Error("Image generation was cancelled.");
    }

    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error("Image generation timed out.");
    }

    attempt += 1;
    await sleep(Math.min(3000, 500 * 1.5 ** attempt));
  }
}
