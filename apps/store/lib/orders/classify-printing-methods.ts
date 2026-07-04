import "server-only";

import {
  getStoreVertexClient,
  getStoreVertexThinkingProviderOptions,
} from "@/lib/ai/server-vertex";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  estimateAiUsageTextTokens,
  runMeteredAiText,
} from "@/lib/ai/usage-metering";
import { loadStoreAiInstructionSettings } from "@/lib/ai/ai-instruction-settings.server";
import { MODELS, tenantFirestorePaths } from "@konfi/firebase";
import {
  buildOrderPrintingMethodsClassificationContext,
  buildOrderPrintingMethodsClassificationSystemPrompt,
  getActivePrintingMethodIds,
  getKnownPrintingMethodIds,
  normalizePrintingMethodsSettings,
  normalizeInferredPrintingMethods,
  PRINTING_METHODS_SETTINGS_DOC_ID,
} from "@konfi/utils";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { PrintingMethodId, PrintingMethodsSettings } from "@konfi/types";
import type { OrderPrintingMethodItem } from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";

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

function logStructuredOutputFailure(
  error: NoObjectGeneratedError,
  context: StructuredOutputFailureContext,
) {
  const cause = error.cause;
  const nestedCause = getRecordValue(cause, "cause");

  console.error("[storeAi] Structured output did not match schema", {
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

function getStructuredOutputFallback<T>(
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
  const statusCode = candidate.code ?? candidate.status;

  if (typeof statusCode === "number") {
    return statusCode === 429;
  }

  if (typeof statusCode === "string") {
    return statusCode === "429" || statusCode === "RESOURCE_EXHAUSTED";
  }

  if (typeof candidate.message === "string") {
    return (
      candidate.message.includes("429") ||
      candidate.message.includes("RESOURCE_EXHAUSTED")
    );
  }

  return false;
}

async function callWithRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRY_ATTEMPTS,
  baseDelayMs = BASE_RETRY_DELAY_MS,
): Promise<T> {
  let attempt = 0;
  let delay = baseDelayMs;

  // eslint-disable-next-line no-constant-condition
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

async function loadStorePrintingMethodsSettings(
  channelId: string | undefined,
  tenantContext: TenantContext,
): Promise<PrintingMethodsSettings> {
  if (!channelId) {
    return normalizePrintingMethodsSettings();
  }

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

export async function classifyStoreOrderPrintingMethods(input: {
  items: OrderPrintingMethodItem[];
  currentPrintingMethods?: PrintingMethodId[];
  channelId?: string;
}): Promise<PrintingMethodId[]> {
  const { items, currentPrintingMethods = [], channelId } = input;

  if (items.length === 0) {
    return currentPrintingMethods;
  }

  const tenantContext = await getTenantContextForRequest();
  const printingMethodsSettings = await loadStorePrintingMethodsSettings(
    channelId,
    tenantContext,
  );
  const knownPrintingMethodIds = getKnownPrintingMethodIds(
    printingMethodsSettings,
  );
  const activePrintingMethodIds = getActivePrintingMethodIds(
    printingMethodsSettings,
  );

  const firstActivePrintingMethodId = activePrintingMethodIds[0];
  if (!firstActivePrintingMethodId) {
    return currentPrintingMethods;
  }

  const printingMethodSchema = z.enum([
    firstActivePrintingMethodId,
    ...activePrintingMethodIds.slice(1),
  ]);
  const schema = z.object({
    printingMethods: z.array(printingMethodSchema).max(4),
    currentClearlyInvalid: z.boolean(),
    confidence: z.number().min(0).max(1).optional(),
  });

  const context = buildOrderPrintingMethodsClassificationContext({
    items,
    currentPrintingMethods,
    availablePrintingMethods: printingMethodsSettings.methods,
  });
  const vertex = await getStoreVertexClient();
  const aiInstructionSettings = await loadStoreAiInstructionSettings({
    channelId,
    tenantContext,
  });
  const system = buildOrderPrintingMethodsClassificationSystemPrompt(
    printingMethodsSettings.methods,
    aiInstructionSettings,
  );

  try {
    const { output } = await callWithRetry(() =>
      runMeteredAiText({
        estimatedTotalTokens: estimateAiUsageTextTokens(context.prompt),
        metering: {
          context: tenantContext,
          firestore: getAdminDb(),
          model: MODELS.GEMINI_3_FLASH_LITE,
          provider: "google-vertex",
          source: "order-risk",
        },
        run: () =>
          generateText({
            model: vertex(MODELS.GEMINI_3_FLASH_LITE),
            providerOptions: getStoreVertexThinkingProviderOptions({
              thinkingLevel: "minimal",
            }),
            output: Output.object({ schema }),
            system,
            prompt: context.prompt,
          }),
      }),
    );

    return normalizeInferredPrintingMethods({
      currentPrintingMethods,
      suggestedPrintingMethods: output.printingMethods,
      strongDeterministicCandidates: context.strongDeterministicCandidates,
      availablePrintingMethodIds: knownPrintingMethodIds,
      aiMarkedCurrentInvalid: output.currentClearlyInvalid,
    });
  } catch (error) {
    return getStructuredOutputFallback(error, currentPrintingMethods, {
      action: "classifyStoreOrderPrintingMethods",
      schemaBranch: "printingMethods",
      promptCategory: "order-printing-method-classification",
    });
  }
}
