import "server-only";

import { getAuthenticatedAdminUid } from "@/actions/auth-utils";
import { getVertexClient } from "@/lib/ai/server-vertex";
import {
  estimateAiUsageTextTokens,
  runMeteredAiText,
} from "@/lib/ai/usage-metering";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { MODELS, tenantFirestorePaths } from "@konfi/firebase";
import { type PrintingMethodsSettings } from "@konfi/types";
import {
  normalizePrintingMethodsSettings,
  PRINTING_METHODS_SETTINGS_DOC_ID,
} from "@konfi/utils";
import { NoObjectGeneratedError, type LanguageModel } from "ai";

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 500;
const AI_OUTPUT_LOG_PREVIEW_LIMIT = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface StructuredOutputFailureContext {
  action: string;
  schemaBranch: string;
  orderId?: string;
  promptCategory: string;
}

function truncateForLog(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return value.length > AI_OUTPUT_LOG_PREVIEW_LIMIT
    ? `${value.slice(0, AI_OUTPUT_LOG_PREVIEW_LIMIT)}...`
    : value;
}

function getRecordValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function getErrorName(value: unknown): string | undefined {
  return typeof getRecordValue(value, "name") === "string"
    ? (getRecordValue(value, "name") as string)
    : undefined;
}

function getErrorMessage(value: unknown): string | undefined {
  return typeof getRecordValue(value, "message") === "string"
    ? (getRecordValue(value, "message") as string)
    : undefined;
}

export function logStructuredOutputFailure(
  error: NoObjectGeneratedError,
  context: StructuredOutputFailureContext,
) {
  const cause = error.cause;
  const nestedCause = getRecordValue(cause, "cause");

  console.error("[adminAi] Structured output did not match schema", {
    action: context.action,
    schemaBranch: context.schemaBranch,
    orderId: context.orderId,
    promptCategory: context.promptCategory,
    message: error.message,
    finishReason: error.finishReason,
    causeName: getErrorName(cause),
    causeMessage: getErrorMessage(cause),
    nestedCauseName: getErrorName(nestedCause),
    nestedCauseMessage: getErrorMessage(nestedCause),
    textPreview: truncateForLog(error.text),
  });
}

export function getStructuredOutputFallback<T>(
  error: unknown,
  fallback: T,
  context: StructuredOutputFailureContext,
): T {
  if (!NoObjectGeneratedError.isInstance(error)) {
    throw error;
  }

  logStructuredOutputFailure(error, context);
  return fallback;
}

function isRetriableError(error: unknown): boolean {
  const candidate = error as {
    code?: number | string;
    status?: number | string;
    message?: string;
  };
  const statusCode = candidate?.code ?? candidate?.status;

  if (typeof statusCode === "number") {
    return statusCode === 429;
  }

  if (typeof statusCode === "string") {
    return statusCode === "429" || statusCode === "RESOURCE_EXHAUSTED";
  }

  if (typeof candidate?.message === "string") {
    return (
      candidate.message.includes("429") ||
      candidate.message.includes("RESOURCE_EXHAUSTED")
    );
  }

  return false;
}

export async function callWithRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRY_ATTEMPTS,
  baseDelayMs = BASE_RETRY_DELAY_MS,
): Promise<T> {
  let attempt = 0;
  let delay = baseDelayMs;

  // eslint-disable-next-line no-constant-condition -- retry loop exits by returning or throwing inside the body
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (attempt > retries || !isRetriableError(error)) {
        throw error;
      }
      await sleep(delay + Math.floor(Math.random() * 100));
      delay *= 2;
    }
  }
}

export async function getModel(modelId?: string): Promise<LanguageModel> {
  const vertex = await getVertexClient();
  return vertex(modelId ?? MODELS.GEMINI_3_FLASH);
}

export async function loadAdminPrintingMethodsSettings(
  channelId?: string,
): Promise<PrintingMethodsSettings> {
  if (!channelId) {
    return normalizePrintingMethodsSettings();
  }

  const tenantContext = await getTenantContextForRequest();
  const snapshot = await getAdminDb()
    .doc(
      tenantFirestorePaths.settingsDoc(
        tenantContext,
        channelId,
        PRINTING_METHODS_SETTINGS_DOC_ID,
      ),
    )
    .get();

  return normalizePrintingMethodsSettings(
    snapshot.exists ? (snapshot.data() as PrintingMethodsSettings) : null,
  );
}

export async function runMeteredAdminTextCall<
  T extends {
    totalUsage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      reasoningTokens?: number;
      cachedInputTokens?: number;
    };
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      reasoningTokens?: number;
      cachedInputTokens?: number;
    };
  },
>(params: {
  instructions?: unknown;
  modelId?: string;
  prompt: unknown;
  run: () => Promise<T>;
  system?: unknown;
}): Promise<T> {
  const [tenantContext, userId] = await Promise.all([
    getTenantContextForRequest(),
    getAuthenticatedAdminUid(),
  ]);
  const modelId = params.modelId ?? MODELS.GEMINI_3_FLASH;

  return runMeteredAiText({
    estimatedTotalTokens: estimateAiUsageTextTokens({
      prompt: params.prompt,
      instructions: params.instructions ?? params.system,
    }),
    metering: {
      context: tenantContext,
      firestore: getAdminDb(),
      model: modelId,
      provider: "google-vertex",
      source: "admin-action",
      userId,
    },
    run: params.run,
  });
}
