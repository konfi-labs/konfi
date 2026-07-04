import "server-only";

import { z } from "zod";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { MODELS } from "@konfi/firebase";
import type {
  ParsedProductQuestion,
  CalculatedCombinationResult,
  VolumeSuggestionResult,
  SizeSuggestionResult,
  CustomSizeWithQuantityResult,
  MultipleSizesDetectionResult,
  ProductRequestDetailsResult,
  ProductWithAttributes,
} from "@/lib/ai/product-suggestion/types";
import {
  SPLIT_QUESTION_PROMPT,
  SUGGEST_COMBINATION_PROMPT,
  PRODUCT_REQUEST_DETAILS_PROMPT,
} from "@/lib/ai/product-suggestion/prompts";

// Constants for retry logic
const MAX_RETRY_ATTEMPTS = 1;
const BASE_RETRY_DELAY_MS = 500;
const AI_GENERATE_TIMEOUT_MS = 45_000;
const PRODUCT_SELECTION_ATTRIBUTE_LIMIT = 4;
const PRODUCT_SELECTION_OPTION_EXAMPLE_LIMIT = 6;
const ATTRIBUTE_OPTIONS_PROMPT_LIMIT = 20;
const PRODUCT_SELECTION_CANDIDATE_LIMIT = 2;
const PRODUCT_SUGGESTION_MODEL = MODELS.GEMINI_3_FLASH;
const PRODUCT_SUGGESTION_FAST_MODEL = MODELS.GEMINI_3_FLASH_LITE;

interface AiUsageContext {
  channelId?: string | undefined;
  tenantId?: string | null | undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAiRuntime(
  context: AiUsageContext = {},
  modelId = PRODUCT_SUGGESTION_MODEL,
) {
  const runtime = await import("ai");

  return {
    ...runtime,
    generateText: createMeteredAdminGenerateText({
      channelId: context.channelId,
      generateText: runtime.generateText,
      model: modelId,
      provider: "google-vertex",
      source: "agent",
      tenantId: context.tenantId,
    }),
  };
}

function isRetriableError(error: unknown): boolean {
  const candidate = error as {
    code?: number | string;
    status?: number | string;
    statusCode?: number | string;
    message?: string;
  };
  const statusCode =
    candidate?.code ?? candidate?.status ?? candidate?.statusCode;
  if (typeof statusCode === "number") {
    return [408, 429, 500, 502, 503, 504].includes(statusCode);
  }
  if (typeof statusCode === "string") {
    return [
      "408",
      "429",
      "500",
      "502",
      "503",
      "504",
      "RESOURCE_EXHAUSTED",
      "DEADLINE_EXCEEDED",
      "UNAVAILABLE",
    ].includes(statusCode);
  }
  if (typeof candidate?.message === "string") {
    const message = candidate.message.toLowerCase();
    return [
      "429",
      "resource_exhausted",
      "deadline_exceeded",
      "unavailable",
      "headers timeout",
      "cannot connect to api",
      "timeout",
      "econnreset",
      "econnrefused",
      "fetch failed",
      "socket hang up",
    ].some((needle) => message.includes(needle));
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
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      if (attempt > retries || !isRetriableError(error)) {
        throw error;
      }
      await sleep(delay + Math.floor(Math.random() * 100));
      delay *= 2;
    }
  }
}

/**
 * Get the AI model for product suggestion prompts
 */
async function getModel(modelId = PRODUCT_SUGGESTION_MODEL) {
  const { getAdminVertexLanguageModel } = await import(
    "@/lib/ai/vertex-language-model.server"
  );
  return getAdminVertexLanguageModel(modelId);
}

function normalizePromptSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizePromptSearchText(value: string): string[] {
  return Array.from(
    new Set(
      normalizePromptSearchText(value)
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );
}

function scoreOptionForQuestion(
  option: string,
  questionTokens: readonly string[],
) {
  const normalizedOption = normalizePromptSearchText(option);
  const optionWords = new Set(
    normalizedOption.split(/[^a-z0-9]+/).filter(Boolean),
  );
  let score = 0;

  for (const token of questionTokens) {
    if (optionWords.has(token)) {
      score += 20;
    } else if (normalizedOption.includes(token)) {
      score += 10;
    }

    if (
      (token.startsWith("plakat") || token === "poster") &&
      normalizedOption.includes("plakat")
    ) {
      score += 25;
    }
  }

  return score;
}

export function buildProductSelectionReference(
  productNamesWithAttributes: readonly ProductWithAttributes[],
) {
  return productNamesWithAttributes.map((product) => ({
    productId: product.productId,
    productName: product.productName,
    attributeHints: product.attributesWithOptions
      .slice(0, PRODUCT_SELECTION_ATTRIBUTE_LIMIT)
      .map((attribute) => {
        const examples = attribute.options
          .slice(0, PRODUCT_SELECTION_OPTION_EXAMPLE_LIMIT)
          .join(", ");
        return examples
          ? `${attribute.attributeName}: ${examples}`
          : attribute.attributeName;
      }),
  }));
}

export function compactAttributeOptionsForQuestion(
  attributeOptions: Record<string, string[]>,
  question: string,
): Record<string, string[]> {
  const questionTokens = tokenizePromptSearchText(question);

  return Object.fromEntries(
    Object.entries(attributeOptions).map(([attributeName, options]) => {
      if (options.length <= ATTRIBUTE_OPTIONS_PROMPT_LIMIT) {
        return [attributeName, options];
      }

      const scoredOptions = options
        .map((option, index) => ({
          option,
          index,
          score: scoreOptionForQuestion(option, questionTokens),
        }))
        .toSorted((left, right) => {
          const scoreDiff = right.score - left.score;
          return scoreDiff !== 0 ? scoreDiff : left.index - right.index;
        });

      const selected = new Set<string>();
      for (const option of options.slice(0, Math.min(5, options.length))) {
        selected.add(option);
      }
      for (const { option } of scoredOptions) {
        selected.add(option);
        if (selected.size >= ATTRIBUTE_OPTIONS_PROMPT_LIMIT) {
          break;
        }
      }

      return [attributeName, Array.from(selected)];
    }),
  );
}

/**
 * Split a customer question into product-specific questions
 */
export async function splitQuestionByProducts(
  question: string,
  productNamesWithAttributes: ProductWithAttributes[],
  context: AiUsageContext = {},
): Promise<ParsedProductQuestion[]> {
  const model = await getModel(PRODUCT_SUGGESTION_FAST_MODEL);
  const { generateText, Output } = await getAiRuntime(
    context,
    PRODUCT_SUGGESTION_FAST_MODEL,
  );

  const productReference = buildProductSelectionReference(
    productNamesWithAttributes,
  );
  const knownProductIds = new Set(
    productNamesWithAttributes.map((product) => product.productId),
  );

  const systemPrompt = `${SPLIT_QUESTION_PROMPT}

Indexed product candidates for selection (use selectProduct to get the productId):
${JSON.stringify(productReference, null, 2)}

These candidates were already narrowed by semantic search and Meilisearch. Match the customer's request to the most appropriate product from this list and return its exact productId only when the product is the requested sellable product type. Return an empty list when no candidate is suitable.`;

  const elementSchema = z.object({
    question: z
      .string()
      .describe("Question that was split from the original question"),
    productId: z
      .string()
      .describe("ID of the product matched from the available products"),
    candidateProductIds: z
      .array(z.string())
      .optional()
      .describe(
        "Up to two viable product IDs for the same item, including productId when alternatives should be priced before choosing.",
      ),
  });

  const { output } = await callWithRetry(() =>
    generateText({
      model,
      output: Output.array({ element: elementSchema }),
      prompt: `Input: ${question}\nResponse:`,
      instructions: systemPrompt,
      maxRetries: 0,
      timeout: AI_GENERATE_TIMEOUT_MS,
    }),
  );

  const parsed = output
    .filter((item) => knownProductIds.has(item.productId))
    .map((item) => {
      const candidateProductIds = Array.from(
        new Set([item.productId, ...(item.candidateProductIds ?? [])]),
      )
        .filter((productId) => knownProductIds.has(productId))
        .slice(0, PRODUCT_SELECTION_CANDIDATE_LIMIT);

      return {
        ...item,
        candidateProductIds,
      };
    });
  if (parsed.length > 0) {
    return parsed;
  }

  if (productNamesWithAttributes.length === 1) {
    return [{ question, productId: productNamesWithAttributes[0].productId }];
  }

  return parsed;
}

/**
 * Suggest the calculated combination based on attribute options and customer question
 */
export async function suggestCalculatedCombination(
  attributeOptions: Record<string, string[]>,
  question: string,
  context: AiUsageContext = {},
): Promise<CalculatedCombinationResult> {
  const model = await getModel();
  const { generateText, Output } = await getAiRuntime(context);

  const schema = z.object({
    calculatedCombination: z.string(),
  });
  const compactAttributeOptions = compactAttributeOptionsForQuestion(
    attributeOptions,
    question,
  );

  const { output } = await callWithRetry(() =>
    generateText({
      model,
      output: Output.object({ schema }),
      prompt: `Input attributeOptions: ${JSON.stringify(compactAttributeOptions)}
Input question: ${question}
Response:`,
      instructions: SUGGEST_COMBINATION_PROMPT,
      maxRetries: 0,
      timeout: AI_GENERATE_TIMEOUT_MS,
    }),
  );

  return output;
}

export async function suggestProductRequestDetails(
  params: {
    customFormat: boolean;
    defaultVolume?: number;
    minHeight?: number;
    minWidth?: number;
    question: string;
  },
  context: AiUsageContext = {},
): Promise<ProductRequestDetailsResult> {
  const model = await getModel(PRODUCT_SUGGESTION_FAST_MODEL);
  const { generateText, Output } = await getAiRuntime(
    context,
    PRODUCT_SUGGESTION_FAST_MODEL,
  );

  const customSizeSchema = z.object({
    width: z.number(),
    height: z.number(),
    quantity: z.number(),
  });
  const schema = z.object({
    hasMultipleSizes: z.boolean(),
    sizesCount: z.number(),
    width: z.number(),
    height: z.number(),
    customSizes: z.array(customSizeSchema),
    volume: z.number(),
  });

  const { output } = await callWithRetry(() =>
    generateText({
      model,
      output: Output.object({ schema }),
      prompt: JSON.stringify({
        customFormat: params.customFormat,
        defaultVolume: params.defaultVolume ?? 1,
        minHeight: params.minHeight ?? 0,
        minWidth: params.minWidth ?? 0,
        question: params.question,
      }),
      instructions: PRODUCT_REQUEST_DETAILS_PROMPT,
      maxRetries: 0,
      timeout: AI_GENERATE_TIMEOUT_MS,
    }),
  );

  return output;
}

/**
 * Suggest the volume/quantity from a customer question
 */
export async function suggestVolume(
  question: string,
  customFormat: boolean,
  defaultVolume?: number,
  context: AiUsageContext = {},
): Promise<VolumeSuggestionResult> {
  const details = await suggestProductRequestDetails(
    {
      customFormat,
      defaultVolume,
      question,
    },
    context,
  );

  return { volume: details.volume };
}

/**
 * Suggest custom size dimensions from a customer question
 */
export async function suggestSize(
  question: string,
  minWidth?: number,
  minHeight?: number,
  context: AiUsageContext = {},
): Promise<SizeSuggestionResult> {
  const details = await suggestProductRequestDetails(
    {
      customFormat: true,
      minHeight,
      minWidth,
      question,
    },
    context,
  );

  return {
    height: details.height,
    width: details.width,
  };
}

/**
 * Suggest multiple custom sizes with quantities from a customer question
 */
export async function suggestCustomSizes(
  question: string,
  minWidth?: number,
  minHeight?: number,
  context: AiUsageContext = {},
): Promise<CustomSizeWithQuantityResult[]> {
  const details = await suggestProductRequestDetails(
    {
      customFormat: true,
      minHeight,
      minWidth,
      question,
    },
    context,
  );

  return details.customSizes;
}

/**
 * Detect if a question mentions multiple sizes
 */
export async function detectMultipleSizes(
  question: string,
  context: AiUsageContext = {},
): Promise<MultipleSizesDetectionResult> {
  const details = await suggestProductRequestDetails(
    {
      customFormat: true,
      question,
    },
    context,
  );

  return {
    hasMultipleSizes: details.hasMultipleSizes,
    sizesCount: details.sizesCount,
  };
}
