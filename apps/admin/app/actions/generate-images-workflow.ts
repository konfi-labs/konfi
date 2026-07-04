"use server";

import { getAuthenticatedAdminUid } from "@/actions/auth-utils";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  releaseAiUsageReservation,
  reserveAiUsage,
} from "@/lib/ai/usage-metering";
import { assertPaidGatewayImageModelEnabled } from "@/lib/ai/server-gateway-image-models";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import type {
  ImageGenerationWorkflowInput,
  ImageGenerationWorkflowResult,
} from "@/lib/ai/image-generation/workflow";
import { IMAGE_MODEL_CAPABILITIES, isGatewayImageModel } from "@konfi/types";
import { getRun, start } from "workflow/api";

export type StartImageGenerationWorkflowResponse = {
  runId: string;
  jobId?: string;
};

export type ImageGenerationWorkflowStatusResponse =
  | { status: "pending" | "running" | "cancelled" }
  | { status: "completed"; result: ImageGenerationWorkflowResult }
  | { status: "failed"; error: string };

type StartImageGenerationWorkflowInput = Pick<
  ImageGenerationWorkflowInput,
  "jobId" | "request"
>;

type GeneratedWorkflowImage = ImageGenerationWorkflowResult["images"][number];

function getImageGenerationJobDocPath(jobId: string): string {
  return `aiImageGenerationJobs/${jobId}`;
}

function getRequestedImageCountForModel(
  request: Pick<
    ImageGenerationWorkflowInput["request"],
    "model" | "numberOfImages"
  >,
): number {
  const capabilities = IMAGE_MODEL_CAPABILITIES[request.model];
  const requested = Math.max(1, Math.floor(request.numberOfImages ?? 1));
  return capabilities.supportsMultipleImages
    ? Math.min(requested, capabilities.maxImages)
    : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readGeneratedWorkflowImage(
  value: unknown,
): GeneratedWorkflowImage | undefined {
  if (!isRecord(value)) return undefined;

  const { id, storagePath, url } = value;
  if (
    typeof id !== "string" ||
    typeof storagePath !== "string" ||
    typeof url !== "string"
  ) {
    return undefined;
  }

  return { id, storagePath, url };
}

function getJobStatusFromData(
  data: Record<string, unknown>,
  accountId: string,
): ImageGenerationWorkflowStatusResponse | undefined {
  if (data.accountId !== accountId) return undefined;

  if (data.status === "failed") {
    const error =
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : "Workflow failed";

    return { status: "failed", error };
  }

  if (data.status !== "completed") return undefined;

  const images = Array.isArray(data.images)
    ? data.images
        .map((image) => readGeneratedWorkflowImage(image))
        .filter((image): image is GeneratedWorkflowImage => Boolean(image))
    : [];

  if (images.length === 0) return undefined;

  const filteredReason =
    typeof data.filteredReason === "string" ? data.filteredReason : undefined;
  const chargedUsdCents =
    typeof data.chargedUsdCents === "number" &&
    Number.isFinite(data.chargedUsdCents)
      ? data.chargedUsdCents
      : 0;

  return {
    status: "completed",
    result: {
      images,
      ...(filteredReason ? { filteredReason } : {}),
      chargedUsdCents,
    },
  };
}

async function getImageGenerationJobStatus(
  jobId: string,
  accountId: string,
): Promise<ImageGenerationWorkflowStatusResponse | undefined> {
  const jobSnap = await getAdminDb()
    .doc(getImageGenerationJobDocPath(jobId))
    .get();
  if (!jobSnap.exists) return undefined;

  const data = jobSnap.data();
  if (!isRecord(data)) return undefined;

  return getJobStatusFromData(data, accountId);
}

export async function startImageGenerationWorkflow(
  input: StartImageGenerationWorkflowInput,
): Promise<StartImageGenerationWorkflowResponse> {
  const accountId = await getAuthenticatedAdminUid();
  const tenantContext = await getTenantContextForRequest();
  if (
    isSharedSaasTenantRuntime(tenantContext) &&
    isGatewayImageModel(input.request.model)
  ) {
    throw new Error(
      "AI Gateway image models are not available in SaaS runtime.",
    );
  }
  assertPaidGatewayImageModelEnabled(input.request.model);

  const requestedImageGenerations = getRequestedImageCountForModel(
    input.request,
  );
  const aiUsageReservation = await reserveAiUsage({
    context: tenantContext,
    firestore: getAdminDb(),
    imageGenerations: requestedImageGenerations,
    modality: "image",
    model: input.request.model,
    provider: isGatewayImageModel(input.request.model)
      ? "ai-gateway"
      : "google-vertex",
    source: "image",
    userId: accountId,
  });

  // Dynamic import to ensure workflow function is properly annotated by the workflow compiler.
  // Use a relative dynamic import so the workflow module is resolved in both
  // dev and build runtimes without relying on alias resolution.
  try {
    const { generateImagesWorkflow } =
      await import("../../lib/ai/image-generation/workflow");
    const run = await start(generateImagesWorkflow, [
      { ...input, accountId, aiUsageReservation },
    ]);
    return { runId: run.runId, jobId: input.jobId };
  } catch (error) {
    await releaseAiUsageReservation({
      firestore: getAdminDb(),
      reservation: aiUsageReservation,
    });
    throw error;
  }
}

export async function getImageGenerationWorkflowStatus(
  runId: string,
  jobId?: string,
): Promise<ImageGenerationWorkflowStatusResponse> {
  const accountId = await getAuthenticatedAdminUid();

  if (jobId) {
    const jobStatus = await getImageGenerationJobStatus(jobId, accountId);
    if (jobStatus) return jobStatus;
  }

  const run = getRun(runId);
  const status = await run.status;

  if (status === "completed") {
    const result = (await run.returnValue) as ImageGenerationWorkflowResult;
    return { status: "completed", result };
  }

  if (status === "failed") {
    // Best-effort error string
    try {
      const maybe = await run.returnValue;
      if (typeof maybe === "string") {
        return { status: "failed", error: maybe };
      }
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "Workflow failed",
      };
    }
    return { status: "failed", error: "Workflow failed" };
  }

  return { status };
}
