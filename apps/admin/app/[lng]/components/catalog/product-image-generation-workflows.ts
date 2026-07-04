import type {
  ImageGenerationWorkflowStatusResponse,
  StartImageGenerationWorkflowResponse,
} from "@/actions/generate-images-workflow";

export const PRODUCT_IMAGE_GENERATION_WORKFLOW_COUNT = 1;

export type GeneratedWorkflowImage = {
  id: string;
  storagePath: string;
  url: string;
};

type CompletedImageGenerationWorkflowResult = Extract<
  ImageGenerationWorkflowStatusResponse,
  { status: "completed" }
>["result"];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function pollImageGenerationWorkflow(params: {
  runId: string;
  jobId?: string;
  getWorkflowStatus: (
    runId: string,
    jobId?: string,
  ) => Promise<ImageGenerationWorkflowStatusResponse>;
  pollTimeoutMs: number;
  sleep: (ms: number) => Promise<void>;
}): Promise<CompletedImageGenerationWorkflowResult> {
  const { runId, jobId, getWorkflowStatus, pollTimeoutMs, sleep } = params;
  const startedAt = Date.now();
  let attempt = 0;

  for (;;) {
    const status = await getWorkflowStatus(runId, jobId);

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

export async function generateProductImageOptions(params: {
  workflowCount?: number;
  startWorkflow: () => Promise<StartImageGenerationWorkflowResponse>;
  getWorkflowStatus: (
    runId: string,
    jobId?: string,
  ) => Promise<ImageGenerationWorkflowStatusResponse>;
  pollTimeoutMs: number;
  sleep: (ms: number) => Promise<void>;
}): Promise<{
  images: GeneratedWorkflowImage[];
  errorMessages: string[];
  filteredReasons: string[];
}> {
  const {
    workflowCount = PRODUCT_IMAGE_GENERATION_WORKFLOW_COUNT,
    startWorkflow,
    getWorkflowStatus,
    pollTimeoutMs,
    sleep,
  } = params;
  const safeWorkflowCount = Math.max(1, Math.floor(workflowCount));

  const workflows = await Promise.all(
    Array.from({ length: safeWorkflowCount }, () => startWorkflow()),
  );

  const settledResults = await Promise.allSettled(
    workflows.map(({ runId, jobId }) =>
      pollImageGenerationWorkflow({
        runId,
        jobId,
        getWorkflowStatus,
        pollTimeoutMs,
        sleep,
      }),
    ),
  );

  const images = settledResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value.images : [],
  );
  const filteredReasons = Array.from(
    new Set(
      settledResults.flatMap((result) =>
        result.status === "fulfilled" && result.value.filteredReason
          ? [result.value.filteredReason]
          : [],
      ),
    ),
  );
  const errorMessages = Array.from(
    new Set(
      settledResults.flatMap((result) =>
        result.status === "rejected"
          ? [getErrorMessage(result.reason, "Image generation failed.")]
          : [],
      ),
    ),
  );

  return {
    images,
    errorMessages,
    filteredReasons,
  };
}
