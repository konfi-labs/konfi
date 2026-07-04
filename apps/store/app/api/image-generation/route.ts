import { firebaseConfig } from "@/lib/firebase/config";
import {
  getAdminAuth,
  getStoreRuntimeConfigForRequest,
  verifyAnyIdToken,
  verifyAppCheckToken,
} from "@/lib/firebase/serverApp";
import {
  assertReferenceImages,
  resolveStoreGenerationStyle,
  getStoreImageGenerationJobByRunId,
  isStoreImageGenerationJobExpired,
  storeImageGenerationLimits,
  upsertStoreImageGenerationJob,
  STORE_IMAGE_GENERATION_EXPIRED_ERROR,
  type StoreGenerationReferenceImage,
  type StoreGenerationRequest,
  type StoreGenerationResult,
} from "@/lib/ai/store-image-generation";
import { isSameOriginRequest } from "@konfi/utils";
import { isAdminProductPreviewAllowed } from "@/lib/product-preview.server";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRun, start } from "workflow/api";

const APP_CHECK_HEADER = "x-firebase-appcheck";
const AUTH_HEADER_PREFIX = "Bearer ";
const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith(AUTH_HEADER_PREFIX)) {
    return null;
  }

  return authHeader.slice(AUTH_HEADER_PREFIX.length);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function buildMonthlyBudgetExceededResponse() {
  const now = new Date();
  const nextMonthUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  );
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((nextMonthUtc - now.getTime()) / 1000),
  );

  return NextResponse.json(
    { error: "MONTHLY_BUDGET_EXCEEDED" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function parseBooleanValue(value: FormDataEntryValue | null): boolean {
  return typeof value === "string" && value === "true";
}

function isSupportedReferenceImageType(
  value: string,
): value is (typeof storeImageGenerationLimits.supportedReferenceImageTypes)[number] {
  return (
    storeImageGenerationLimits.supportedReferenceImageTypes as readonly string[]
  ).includes(value);
}

function parseOptionalNumber(
  value: FormDataEntryValue | null,
): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSelectedAttributeOptions(
  value: FormDataEntryValue | null,
): Record<string, string> | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Invalid attribute options format.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid attribute options format.");
  }

  return Object.entries(parsed).reduce<Record<string, string>>(
    (accumulator, [key, rawValue]) => {
      if (
        !BLOCKED_OBJECT_KEYS.has(key) &&
        typeof rawValue === "string" &&
        rawValue.length > 0
      ) {
        accumulator[key] = rawValue;
      }

      return accumulator;
    },
    Object.create(null) as Record<string, string>,
  );
}

async function parseReferenceImages(
  formData: FormData,
): Promise<StoreGenerationReferenceImage[]> {
  const files = formData
    .getAll("referenceFiles")
    .filter((value): value is File => value instanceof File && value.size > 0);

  const referenceImages = await Promise.all(
    files.map(async (file) => {
      if (!isSupportedReferenceImageType(file.type)) {
        throw new Error(
          "Only PNG, JPG, and WebP reference images are supported.",
        );
      }

      if (file.size > storeImageGenerationLimits.maxReferenceFileSizeBytes) {
        throw new Error("Reference images must be 4 MB or smaller.");
      }

      const bytes = Buffer.from(await file.arrayBuffer());

      return {
        mimeType: file.type,
        base64: bytes.toString("base64"),
      } as StoreGenerationReferenceImage;
    }),
  );

  assertReferenceImages(referenceImages);
  return referenceImages;
}

async function authenticateStoreImageGenerationRequest(
  request: NextRequest,
): Promise<
  | { ok: true; isAdmin: boolean; uid: string }
  | { ok: false; response: NextResponse }
> {
  const idToken = getBearerToken(request);
  if (!idToken) {
    return {
      ok: false,
      response: jsonError("Authentication is required.", 401),
    };
  }

  const decodedToken = await verifyAnyIdToken(idToken);
  if (!decodedToken) {
    return {
      ok: false,
      response: jsonError("Authentication is required.", 401),
    };
  }

  if (decodedToken.firebase.sign_in_provider === "anonymous") {
    return {
      ok: false,
      response: jsonError(
        "Anonymous accounts cannot use image generation.",
        403,
      ),
    };
  }

  if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    const appCheckToken = request.headers.get(APP_CHECK_HEADER)?.trim();
    if (!appCheckToken) {
      return {
        ok: false,
        response: jsonError("App Check token is required.", 401),
      };
    }

    const verification = await verifyAppCheckToken(appCheckToken);
    if (!verification) {
      return {
        ok: false,
        response: jsonError("Invalid App Check token.", 401),
      };
    }

    if (verification.appId !== firebaseConfig.appId) {
      return { ok: false, response: jsonError("Invalid App Check app.", 403) };
    }
  }

  const userRecord = await getAdminAuth().getUser(decodedToken.uid);
  if (!userRecord.emailVerified) {
    return {
      ok: false,
      response: jsonError(
        "Verify your email address before generating images.",
        403,
      ),
    };
  }

  return {
    ok: true,
    isAdmin: decodedToken.admin === true,
    uid: decodedToken.uid,
  };
}

async function buildStoreGenerationRequest(params: {
  allowAdminPreview: boolean;
  formData: FormData;
  userId: string;
}): Promise<StoreGenerationRequest> {
  const { allowAdminPreview, formData, userId } = params;
  const prompt = formData.get("prompt");
  const productId = formData.get("productId");
  const channelId = formData.get("channelId");
  const language = formData.get("language");
  const style = formData.get("style");

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Prompt is required.");
  }

  if (typeof productId !== "string" || productId.trim().length === 0) {
    throw new Error("Product is required.");
  }

  if (typeof channelId !== "string" || channelId.trim().length === 0) {
    throw new Error("Channel is required.");
  }

  const referenceImages = await parseReferenceImages(formData);

  return {
    allowAdminPreview,
    userId,
    prompt,
    improvePrompt: parseBooleanValue(formData.get("improvePrompt")),
    style:
      typeof style === "string"
        ? resolveStoreGenerationStyle(style)
        : undefined,
    language: typeof language === "string" ? language : undefined,
    productId,
    channelId,
    selectedAttributeOptions: parseSelectedAttributeOptions(
      formData.get("selectedAttributeOptions"),
    ),
    width: parseOptionalNumber(formData.get("width")),
    height: parseOptionalNumber(formData.get("height")),
    pageCount: parseOptionalNumber(formData.get("pageCount")),
    referenceImages,
  };
}

export async function POST(request: NextRequest) {
  try {
    const sameOrigin = isSameOriginRequest({
      headers: request.headers,
      requestOrigin: request.nextUrl.origin,
      allowMissingHeaders: process.env.NODE_ENV !== "production",
    });

    if (!sameOrigin) {
      return jsonError("Forbidden", 403);
    }

    const authentication =
      await authenticateStoreImageGenerationRequest(request);
    if (!authentication.ok) {
      return authentication.response;
    }

    const allowAdminPreview =
      authentication.isAdmin && isAdminProductPreviewAllowed(request.headers);

    const runtimeConfig = await getStoreRuntimeConfigForRequest();
    if (!runtimeConfig) {
      return jsonError("Store not found.", 404);
    }

    const workflowRequest = await buildStoreGenerationRequest({
      allowAdminPreview,
      formData: await request.formData(),
      userId: authentication.uid,
    });
    if (
      !allowAdminPreview &&
      workflowRequest.channelId !== runtimeConfig.channelId
    ) {
      return jsonError("Forbidden", 403);
    }

    workflowRequest.tenantId = runtimeConfig.tenantContext.tenantId;
    const jobId = randomUUID();

    await upsertStoreImageGenerationJob({
      jobId,
      userId: authentication.uid,
      status: "pending",
    });

    const { generateStoreImageWorkflow } =
      await import("../../../lib/ai/store-image-generation.workflow");
    const run = await start(generateStoreImageWorkflow, [
      {
        jobId,
        request: workflowRequest,
      },
    ]);

    await upsertStoreImageGenerationJob({
      jobId,
      userId: authentication.uid,
      runId: run.runId,
      status: "pending",
    });

    return NextResponse.json({ runId: run.runId });
  } catch (error) {
    console.error("Store image generation start failed", error);

    if (error instanceof Error) {
      return jsonError(error.message, 400);
    }

    return jsonError("Image generation failed.", 500);
  }
}

type WorkflowStatusResponse =
  | { status: "pending" | "running" | "cancelled" }
  | { status: "completed"; result: StoreGenerationResult }
  | { status: "failed"; error: string };

export async function GET(request: NextRequest) {
  try {
    const authentication =
      await authenticateStoreImageGenerationRequest(request);
    if (!authentication.ok) {
      return authentication.response;
    }

    const runId = request.nextUrl.searchParams.get("runId");
    if (!runId) {
      return jsonError("runId is required.", 400);
    }

    const job = await getStoreImageGenerationJobByRunId(runId);
    if (!job) {
      return jsonError("Image generation job not found.", 404);
    }

    if (job.data.userId !== authentication.uid) {
      return jsonError("Forbidden", 403);
    }

    if (isStoreImageGenerationJobExpired(job.data)) {
      return NextResponse.json({
        status: "failed",
        error: STORE_IMAGE_GENERATION_EXPIRED_ERROR,
      } satisfies WorkflowStatusResponse);
    }

    if (job.data.status === "completed" && job.data.result) {
      return NextResponse.json({
        status: "completed",
        result: job.data.result,
      } satisfies WorkflowStatusResponse);
    }

    if (job.data.status === "failed" && job.data.error) {
      if (job.data.error === "MONTHLY_BUDGET_EXCEEDED") {
        return buildMonthlyBudgetExceededResponse();
      }

      return NextResponse.json({
        status: "failed",
        error: job.data.error,
      } satisfies WorkflowStatusResponse);
    }

    const run = getRun(runId);
    const status = await run.status;

    if (status === "completed") {
      const result = (await run.returnValue) as StoreGenerationResult;
      return NextResponse.json({
        status: "completed",
        result,
      } satisfies WorkflowStatusResponse);
    }

    if (status === "failed") {
      let errorMessage = job.data.error ?? "Image generation failed.";

      try {
        await run.returnValue;
      } catch (error) {
        errorMessage =
          error instanceof Error ? error.message : "Image generation failed.";
      }

      if (errorMessage === "MONTHLY_BUDGET_EXCEEDED") {
        return buildMonthlyBudgetExceededResponse();
      }

      return NextResponse.json(
        {
          status: "failed",
          error: errorMessage,
        } satisfies WorkflowStatusResponse,
        {
          status:
            errorMessage === "PRODUCT_IMAGE_GENERATION_DISABLED" ? 403 : 200,
        },
      );
    }

    return NextResponse.json({ status } satisfies WorkflowStatusResponse);
  } catch (error) {
    console.error("Store image generation status failed", error);
    return jsonError("Image generation failed.", 500);
  }
}
