"use server";

import { getAuthenticatedAdminUid } from "@/actions/auth-utils";
import { getGatewayClient } from "@/lib/ai/server-gateway";
import { assertPaidGatewayImageModelEnabled } from "@/lib/ai/server-gateway-image-models";
import { getVertexClient } from "@/lib/ai/server-vertex";
import {
  getAdminDb,
  getFirebaseAdminApp,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  finalizeAiUsage,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "@/lib/ai/usage-metering";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { getMaxReferenceImagesForModel } from "@/lib/utils/reference-image";
import { MODELS } from "@konfi/firebase";
import {
  GEMINI_REFERENCE_IMAGE_MIME_TYPES,
  IMAGE_MODEL_CAPABILITIES,
  type GeminiImageModel,
  type GatewayImageModel,
  type GptImage2GenerationSize,
  type GptImage2PresetSize,
  getAspectRatioForGptImage2Size,
  getGptImage2PriceUsdCents,
  getGptImage2SizeForAspectRatio,
  type ImageGenerationQuality,
  type ImageGenerationRequest,
  isGeminiImageModel,
  isGatewayImageModel,
  isGptImage2GenerationSize,
  isGptImage2PresetSize,
  isOpenAiImageModel,
  parseGptImage2Size,
  resolveGptImage2Quality,
} from "@konfi/types";
import { generateImage, generateText } from "ai";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

type GeneratedImageUrl = {
  id: string;
  storagePath: string;
  url: string;
};

const DEFAULT_MONTHLY_LIMIT_USD_CENTS = 10 * 100;

type FlatPriceGatewayImageModel = Exclude<
  GatewayImageModel,
  "openai/gpt-image-2"
>;

const GATEWAY_PRICE_USD_CENTS_PER_IMAGE = {
  "bfl/flux-2-klein-9b": 1.5,
  "quiverai/arrow-1.1": 2,
} as const satisfies Record<FlatPriceGatewayImageModel, number>;

// Gemini (token-based) pricing expressed as USD per 1M tokens.
// NOTE: These are the *online / standard* rates from the Vertex pricing table.
// https://cloud.google.com/vertex-ai/generative-ai/pricing#google_models
const GEMINI_USD_PER_MILLION_TOKENS = {
  "gemini-3.1-flash-lite-image": {
    input: 0.25,
    outputText: 1.5,
    outputImage: 30,
  },
  "gemini-3.1-flash-image": {
    input: 0.5,
    outputText: 3,
    outputImage: 60,
  },
  "gemini-3-pro-image-preview": {
    input: 2,
    outputText: 12,
    outputImage: 120,
  },
} satisfies Record<
  GeminiImageModel,
  { input: number; outputText: number; outputImage: number }
>;

// Image tokenization (output tokens) is based on Vertex docs:
// - Gemini 3 Pro Image output: 1120 tokens for 1K/2K, 2000 tokens for 4K
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-understanding#image-requirements
// https://cloud.google.com/vertex-ai/generative-ai/pricing#google_models
const GEMINI_3_PRO_IMAGE_OUTPUT_TOKENS_1K_OR_2K = 1120;
const GEMINI_3_PRO_IMAGE_OUTPUT_TOKENS_4K = 2000;
const GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_TOKENS_1K = 1120;
const GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_1K = 1120;
const GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_2K = 1680;
const GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_4K = 2520;

// We reserve some extra text output tokens because we request BOTH TEXT and IMAGE modalities.
const GEMINI_RESERVED_OUTPUT_TEXT_TOKENS = 512;

const BFL_DIMENSION_MIN = 256;
const BFL_DIMENSION_MAX = 1920;
const BFL_DEFAULT_MAX_DIMENSION = 1024;
const BFL_OUTPUT_FORMAT: "jpeg" | "png" = "png";
const BFL_SAFETY_TOLERANCE = 2;

type LanguageModelUsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

type GatewayPrompt = string | { text: string; images: string[] };

type BlackForestLabsProviderOptions = {
  width?: number;
  height?: number;
  outputFormat?: "jpeg" | "png";
  steps?: number;
  guidance?: number;
  imagePrompt?: string;
  imagePromptStrength?: number;
  promptUpsampling?: boolean;
  raw?: boolean;
  safetyTolerance?: number;
  pollIntervalMillis?: number;
  pollTimeoutMillis?: number;
  webhookUrl?: string;
  webhookSecret?: string;
};

const DEFAULT_IMAGE_REFERENCE_PROMPT =
  "Edit this reference image while preserving key details.";

function extractReferenceImages(request: {
  referenceImage?: string;
  referenceImages?: string[];
}): string[] {
  const normalizedReferenceImages = (request.referenceImages ?? [])
    .map((referenceImage) => referenceImage.trim())
    .filter((referenceImage) => referenceImage.length > 0);

  if (normalizedReferenceImages.length > 0) {
    return normalizedReferenceImages;
  }

  const singleReferenceImage = request.referenceImage?.trim();
  return singleReferenceImage ? [singleReferenceImage] : [];
}

function resolveEffectiveImagePrompt(params: {
  request: ImageGenerationRequest;
  supportsImageInput: boolean;
}): string {
  const { request, supportsImageInput } = params;
  const trimmedPrompt = request.prompt.trim();
  if (trimmedPrompt) {
    return trimmedPrompt;
  }

  if (supportsImageInput && extractReferenceImages(request).length > 0) {
    return DEFAULT_IMAGE_REFERENCE_PROMPT;
  }

  throw new Error(
    "Prompt is required unless at least one reference image is provided for an image-input model.",
  );
}

function formatUsdCents(usdCents: number): string {
  const safe = Math.max(0, usdCents);
  return `$${(safe / 100).toFixed(2)}`;
}

function roundUsdCents(usdCents: number): number {
  const safe = Number.isFinite(usdCents) ? Math.max(0, usdCents) : 0;
  return Math.round(safe * 10) / 10;
}

function estimateTextTokens(text: string): number {
  // Very rough approximation. Google notes that tokens are roughly ~4 characters on average.
  // This is good enough for *reservation*; finalization uses provider-reported usage.
  const trimmed = text.trim();
  if (!trimmed) return 1;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function getRequestedImageCountForModel(
  request: Pick<ImageGenerationRequest, "model" | "numberOfImages">,
): number {
  const capabilities = IMAGE_MODEL_CAPABILITIES[request.model];
  const requested = Math.max(1, Math.floor(request.numberOfImages ?? 1));
  return capabilities.supportsMultipleImages
    ? Math.min(requested, capabilities.maxImages)
    : 1;
}

function tokensToUsdCents(params: {
  tokens: number;
  usdPerMillionTokens: number;
}): number {
  const { tokens, usdPerMillionTokens } = params;
  const safeTokens = Math.max(0, Math.floor(tokens));
  const safeRate = Math.max(0, usdPerMillionTokens);

  // Convert: USD = tokens * (usdPerMillion / 1_000_000)
  // USD cents = USD * 100
  // We round up to avoid under-enforcing the quota.
  return Math.ceil((safeTokens * safeRate * 100) / 1_000_000);
}

function getGeminiOutputImageTokens(params: {
  model: GeminiImageModel;
  size: ImageGenerationRequest["size"] | undefined;
}): number {
  const { model, size } = params;

  if (model === "gemini-3-pro-image-preview") {
    return size === "4K"
      ? GEMINI_3_PRO_IMAGE_OUTPUT_TOKENS_4K
      : GEMINI_3_PRO_IMAGE_OUTPUT_TOKENS_1K_OR_2K;
  }

  if (model === "gemini-3.1-flash-lite-image") {
    return GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_TOKENS_1K;
  }

  if (model === "gemini-3.1-flash-image") {
    if (size === "4K") return GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_4K;
    if (size === "2K") return GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_2K;
    return GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_1K;
  }

  return GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_1K;
}

function estimateMaxUsdCentsForReservation(
  request: ImageGenerationRequest,
): number {
  if (isGatewayImageModel(request.model)) {
    return calculateGatewayUsdCents({
      model: request.model,
      request,
      imageCount: getRequestedImageCountForModel(request),
    });
  }

  // Gemini image models: reserve based on an estimated token usage.
  if (!isGeminiImageModel(request.model)) {
    throw new Error(
      `Unsupported image model for quota reservation: ${request.model}`,
    );
  }

  const pricing = GEMINI_USD_PER_MILLION_TOKENS[request.model];
  const inputTokensEstimate = estimateTextTokens(request.prompt);
  const outputTextTokensEstimate = GEMINI_RESERVED_OUTPUT_TEXT_TOKENS;
  const outputImageTokensEstimate = getGeminiOutputImageTokens({
    model: request.model,
    size: request.size,
  });

  return (
    tokensToUsdCents({
      tokens: inputTokensEstimate,
      usdPerMillionTokens: pricing.input,
    }) +
    tokensToUsdCents({
      tokens: outputTextTokensEstimate,
      usdPerMillionTokens: pricing.outputText,
    }) +
    tokensToUsdCents({
      tokens: outputImageTokensEstimate,
      usdPerMillionTokens: pricing.outputImage,
    })
  );
}

function calculateGeminiActualUsdCents(params: {
  model: GeminiImageModel;
  size: ImageGenerationRequest["size"] | undefined;
  usage: LanguageModelUsageLike | undefined;
}): number {
  const { model, size, usage } = params;
  const pricing = GEMINI_USD_PER_MILLION_TOKENS[model];
  const outputImageTokens = getGeminiOutputImageTokens({ model, size });

  // For text tokens, use provider-reported usage when available.
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTextTokens = usage?.outputTokens ?? 0;

  return (
    tokensToUsdCents({
      tokens: inputTokens,
      usdPerMillionTokens: pricing.input,
    }) +
    tokensToUsdCents({
      tokens: outputTextTokens,
      usdPerMillionTokens: pricing.outputText,
    }) +
    tokensToUsdCents({
      tokens: outputImageTokens,
      usdPerMillionTokens: pricing.outputImage,
    })
  );
}

function resolveGptImage2Size(
  request: Pick<ImageGenerationRequest, "aspectRatio" | "size">,
): GptImage2GenerationSize | undefined {
  if (isGptImage2GenerationSize(request.size)) {
    return request.size;
  }

  return getGptImage2SizeForAspectRatio(request.aspectRatio);
}

function getGptImage2PriceReferenceSize(
  size: GptImage2GenerationSize | undefined,
): GptImage2PresetSize | undefined {
  if (!size) {
    return undefined;
  }

  if (isGptImage2PresetSize(size)) {
    return size;
  }

  const parsed = parseGptImage2Size(size);
  if (!parsed) {
    return undefined;
  }

  if (parsed.width === parsed.height) {
    return "1024x1024";
  }

  return parsed.width > parsed.height ? "1536x1024" : "1024x1536";
}

function estimateGptImage2UsdCents(
  request: Pick<ImageGenerationRequest, "aspectRatio" | "quality" | "size">,
): number {
  const quality = resolveGptImage2Quality(request.quality);
  const resolvedSize = resolveGptImage2Size(request);
  const priceReferenceSize: GptImage2PresetSize =
    getGptImage2PriceReferenceSize(resolvedSize) ?? "1024x1024";
  const basePriceUsdCents = getGptImage2PriceUsdCents({
    size: priceReferenceSize,
    quality,
  });

  if (!resolvedSize || resolvedSize === priceReferenceSize) {
    return basePriceUsdCents;
  }

  const parsed = parseGptImage2Size(resolvedSize);
  const referenceParsed = parseGptImage2Size(priceReferenceSize);
  if (!parsed || !referenceParsed) {
    return basePriceUsdCents;
  }

  // GPT Image 2 supports many valid resolutions; for non-tabulated custom sizes
  // we scale from the closest documented orientation bucket.
  return roundUsdCents(
    basePriceUsdCents * (parsed.totalPixels / referenceParsed.totalPixels),
  );
}

function calculateGatewayUsdCents(params: {
  model: GatewayImageModel;
  request: Pick<ImageGenerationRequest, "aspectRatio" | "quality" | "size">;
  imageCount: number;
}): number {
  const { model, request, imageCount } = params;
  const safeImageCount = Math.max(1, Math.floor(imageCount));

  if (isOpenAiImageModel(model)) {
    return roundUsdCents(safeImageCount * estimateGptImage2UsdCents(request));
  }

  return roundUsdCents(
    safeImageCount * GATEWAY_PRICE_USD_CENTS_PER_IMAGE[model],
  );
}

type AiImageGenerationQuotaDoc = {
  /** When false/absent, quota checks are disabled (unlimited). */
  enabled: boolean;
  /** Optional monthly budget (in USD cents). Defaults to $10.00 per account when enabled. */
  monthlyLimitUsdCents?: number;
  /** Optional monthly budget (in USD). Prefer `monthlyLimitUsdCents`. */
  monthlyLimitUsd?: number;
};

type AiImageGenerationUsageDoc = {
  usedUsdCents: number;
  reservedUsdCents: number;
  updatedAt: Timestamp;
};

type AiImageGenerationReservation = {
  accountId: string;
  periodKey: string;
  reservedUsdCents: number;
};

export type AiImageGenerationBudgetUsage = {
  enabled: boolean;
  periodKey: string;
  monthlyLimitUsdCents: number | null;
  usedUsdCents: number;
  reservedUsdCents: number;
};

function getMonthlyPeriodKeyUtc(date = new Date()): string {
  // YYYY-MM, in UTC
  return date.toISOString().slice(0, 7);
}

function getQuotaDocPath(): string {
  // Global quota configuration; usage is scoped per admin account.
  return "aiImageGenerationQuota/global";
}

function getUsageDocPath(periodKey: string, accountId: string): string {
  // One usage doc per month and account.
  return `aiImageGenerationUsageMonthly/${periodKey}/accounts/${accountId}`;
}

export async function getProjectWideImageGenerationBudgetUsage(): Promise<AiImageGenerationBudgetUsage> {
  const accountId = await getAuthenticatedAdminUid();

  const periodKey = getMonthlyPeriodKeyUtc();
  const db = getAdminDb();
  const quotaRef = db.doc(getQuotaDocPath());
  const usageRef = db.doc(getUsageDocPath(periodKey, accountId));

  const quotaSnap = await quotaRef.get();
  const quota = quotaSnap.exists
    ? (quotaSnap.data() as Partial<AiImageGenerationQuotaDoc>)
    : undefined;

  if (!quota?.enabled) {
    return {
      enabled: false,
      periodKey,
      monthlyLimitUsdCents: null,
      usedUsdCents: 0,
      reservedUsdCents: 0,
    };
  }

  const limitFromUsd =
    typeof quota.monthlyLimitUsd === "number" &&
    Number.isFinite(quota.monthlyLimitUsd)
      ? Math.round(quota.monthlyLimitUsd * 100)
      : undefined;

  const monthlyLimitUsdCents =
    typeof quota.monthlyLimitUsdCents === "number" &&
    Number.isFinite(quota.monthlyLimitUsdCents)
      ? quota.monthlyLimitUsdCents
      : (limitFromUsd ?? DEFAULT_MONTHLY_LIMIT_USD_CENTS);

  const usageSnap = await usageRef.get();
  const usage = usageSnap.exists
    ? (usageSnap.data() as Partial<AiImageGenerationUsageDoc>)
    : undefined;

  const usedUsdCents =
    typeof usage?.usedUsdCents === "number" ? usage.usedUsdCents : 0;
  const reservedUsdCents =
    typeof usage?.reservedUsdCents === "number" ? usage.reservedUsdCents : 0;

  return {
    enabled: true,
    periodKey,
    monthlyLimitUsdCents,
    usedUsdCents,
    reservedUsdCents,
  };
}

async function reserveProjectWideImageQuota(params: {
  accountId: string;
  request: ImageGenerationRequest;
}): Promise<AiImageGenerationReservation | null> {
  const { accountId, request } = params;

  const reservedUsdCents = estimateMaxUsdCentsForReservation(request);
  const periodKey = getMonthlyPeriodKeyUtc();

  const db = getAdminDb();
  const quotaRef = db.doc(getQuotaDocPath());
  const usageRef = db.doc(getUsageDocPath(periodKey, accountId));

  const isReserved = await db.runTransaction(async (tx) => {
    const quotaSnap = await tx.get(quotaRef);
    const quota = quotaSnap.exists
      ? (quotaSnap.data() as Partial<AiImageGenerationQuotaDoc>)
      : undefined;

    if (!quota?.enabled) {
      return false;
    }

    const limitFromUsd =
      typeof quota.monthlyLimitUsd === "number" &&
      Number.isFinite(quota.monthlyLimitUsd)
        ? Math.round(quota.monthlyLimitUsd * 100)
        : undefined;

    const limit =
      typeof quota.monthlyLimitUsdCents === "number" &&
      Number.isFinite(quota.monthlyLimitUsdCents)
        ? quota.monthlyLimitUsdCents
        : (limitFromUsd ?? DEFAULT_MONTHLY_LIMIT_USD_CENTS);

    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error(
        "AI image generation quota is enabled but monthlyLimitUsdCents is missing or invalid.",
      );
    }

    const usageSnap = await tx.get(usageRef);
    const usage = usageSnap.exists
      ? (usageSnap.data() as Partial<AiImageGenerationUsageDoc>)
      : undefined;
    const usedUsdCents =
      typeof usage?.usedUsdCents === "number" ? usage.usedUsdCents : 0;
    const alreadyReservedUsdCents =
      typeof usage?.reservedUsdCents === "number" ? usage.reservedUsdCents : 0;

    const wouldBe = usedUsdCents + alreadyReservedUsdCents + reservedUsdCents;
    if (wouldBe > limit) {
      const remainingUsdCents = Math.max(
        0,
        limit - usedUsdCents - alreadyReservedUsdCents,
      );
      throw new Error(
        `AI image generation quota exceeded for this account. Remaining this month: ${formatUsdCents(remainingUsdCents)}.`,
      );
    }

    tx.set(
      usageRef,
      {
        usedUsdCents,
        reservedUsdCents: alreadyReservedUsdCents + reservedUsdCents,
        updatedAt: Timestamp.now(),
      } satisfies AiImageGenerationUsageDoc,
      { merge: true },
    );

    return true;
  });

  return isReserved ? { accountId, periodKey, reservedUsdCents } : null;
}

async function finalizeProjectWideImageQuota(params: {
  reservation: AiImageGenerationReservation;
  chargedUsdCents: number;
}): Promise<void> {
  const { reservation, chargedUsdCents } = params;
  const { accountId, periodKey, reservedUsdCents } = reservation;

  const safeChargedUsdCents = roundUsdCents(chargedUsdCents);

  const db = getAdminDb();
  const quotaRef = db.doc(getQuotaDocPath());
  const usageRef = db.doc(getUsageDocPath(periodKey, accountId));

  await db.runTransaction(async (tx) => {
    // Only finalize when quota is still enabled; if it was disabled mid-flight,
    // we still want to release the reservation to avoid permanently blocking.
    const quotaSnap = await tx.get(quotaRef);
    const quota = quotaSnap.exists
      ? (quotaSnap.data() as Partial<AiImageGenerationQuotaDoc>)
      : undefined;

    const usageSnap = await tx.get(usageRef);
    const usage = usageSnap.exists
      ? (usageSnap.data() as Partial<AiImageGenerationUsageDoc>)
      : undefined;
    const currentReservedUsdCents =
      typeof usage?.reservedUsdCents === "number" ? usage.reservedUsdCents : 0;
    const nextReservedUsdCents = Math.max(
      0,
      currentReservedUsdCents - reservedUsdCents,
    );

    if (!usageSnap.exists) {
      tx.set(
        usageRef,
        {
          usedUsdCents: 0,
          reservedUsdCents: 0,
          updatedAt: Timestamp.now(),
        } satisfies AiImageGenerationUsageDoc,
        { merge: true },
      );
    }

    tx.update(usageRef, {
      reservedUsdCents: nextReservedUsdCents,
      updatedAt: Timestamp.now(),
      ...(quota?.enabled && safeChargedUsdCents > 0
        ? { usedUsdCents: FieldValue.increment(safeChargedUsdCents) }
        : {}),
    });
  });
}

function buildSizePromptHint(
  size: NonNullable<ImageGenerationRequest["size"]>,
): string {
  switch (size) {
    case "1K":
      return "Resolution: 1K.";
    case "2K":
      return "Resolution: 2K (high resolution).";
    case "4K":
      return "Resolution: 4K (very high resolution).";
    case "1024x1024":
      return "Resolution: 1024 x 1024.";
    case "1024x1536":
      return "Resolution: 1024 x 1536 (portrait).";
    case "1536x1024":
      return "Resolution: 1536 x 1024 (landscape).";
    default: {
      const parsed = parseGptImage2Size(size);
      if (parsed) {
        return `Resolution: ${parsed.width} x ${parsed.height}.`;
      }

      return `Resolution: ${size}.`;
    }
  }
}

function applySizeHintToPrompt(params: {
  prompt: string;
  size: ImageGenerationRequest["size"] | undefined;
  supportsSize: boolean;
}): string {
  const { prompt, size, supportsSize } = params;

  if (!size || supportsSize) {
    return prompt;
  }

  // If the prompt already contains a size mention, don't add another one.
  const sizeRegex = new RegExp(`\\b${size}\\b`, "i");
  if (sizeRegex.test(prompt)) {
    return prompt;
  }

  return `${prompt}\n\n${buildSizePromptHint(size)}`;
}

function toVertexSampleImageSize(
  size: ImageGenerationRequest["size"] | undefined,
): "1K" | "2K" | undefined {
  if (size === "1K" || size === "2K") return size;
  return undefined;
}

const GEMINI_IMAGE_CONFIG_ASPECT_RATIOS = new Set<
  NonNullable<ImageGenerationRequest["aspectRatio"]>
>(["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);

function toGeminiImageConfigAspectRatio(
  aspectRatio: ImageGenerationRequest["aspectRatio"] | undefined,
): NonNullable<ImageGenerationRequest["aspectRatio"]> | undefined {
  if (!aspectRatio) return undefined;
  return GEMINI_IMAGE_CONFIG_ASPECT_RATIOS.has(aspectRatio)
    ? aspectRatio
    : undefined;
}

function toGeminiImageConfigSize(params: {
  model: ImageGenerationRequest["model"];
  size: ImageGenerationRequest["size"] | undefined;
}): NonNullable<ImageGenerationRequest["size"]> | undefined {
  const { model, size } = params;

  if (!size) return undefined;
  if (size !== "1K" && size !== "2K" && size !== "4K") {
    return undefined;
  }

  // Be conservative: 4K is known to work for Gemini 3 Pro image preview
  // and Gemini 3.1 Flash Image.
  // For other Gemini image models, fall back to prompt hints.
  if (model === "gemini-3.1-flash-lite-image") {
    return size === "1K" ? size : undefined;
  }

  if (
    size === "4K" &&
    model !== "gemini-3-pro-image-preview" &&
    model !== "gemini-3.1-flash-image"
  ) {
    return undefined;
  }

  return size;
}

function buildAspectRatioPromptHint(
  aspectRatio: NonNullable<ImageGenerationRequest["aspectRatio"]>,
): string {
  switch (aspectRatio) {
    case "1:1":
      return "Composition: square 1:1.";
    case "3:4":
      return "Composition: portrait 3:4 (vertical).";
    case "4:3":
      return "Composition: classic 4:3 (landscape).";
    case "3:2":
      return "Composition: photo 3:2 (landscape).";
    case "2:3":
      return "Composition: photo 2:3 (portrait).";
    case "5:4":
      return "Composition: medium format 5:4 (landscape).";
    case "4:5":
      return "Composition: medium format 4:5 (portrait).";
    case "21:9":
      return "Composition: ultra wide 21:9 (cinematic).";
    case "9:16":
      return "Composition: vertical 9:16 (portrait).";
    case "16:9":
      return "Composition: wide cinematic 16:9 (landscape).";
  }
}

function applyAspectRatioHintToPrompt(params: {
  prompt: string;
  aspectRatio: ImageGenerationRequest["aspectRatio"] | undefined;
  supportsAspectRatio: boolean;
}): string {
  const { prompt, aspectRatio, supportsAspectRatio } = params;

  if (!aspectRatio || supportsAspectRatio) {
    return prompt;
  }

  // If the prompt already contains an aspect ratio mention, don't add another one.
  if (prompt.includes(aspectRatio)) {
    return prompt;
  }

  // Add as a trailing hint so we don't disrupt the original prompt structure.
  return `${prompt}\n\n${buildAspectRatioPromptHint(aspectRatio)}`;
}

function parseAspectRatioValue(
  aspectRatio: ImageGenerationRequest["aspectRatio"] | undefined,
): number | undefined {
  if (!aspectRatio) return undefined;
  const [w, h] = aspectRatio.split(":").map((part) => Number(part));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return undefined;
  }
  return w / h;
}

function clampBflDimension(value: number): number {
  return Math.min(
    BFL_DIMENSION_MAX,
    Math.max(BFL_DIMENSION_MIN, Math.round(value)),
  );
}

function getBflTargetMaxDimension(
  size: ImageGenerationRequest["size"] | undefined,
): number {
  switch (size) {
    case "1K":
      return 1024;
    case "2K":
    case "4K":
      return BFL_DIMENSION_MAX;
    default:
      return BFL_DEFAULT_MAX_DIMENSION;
  }
}

function getBflDimensions(params: {
  aspectRatio: ImageGenerationRequest["aspectRatio"] | undefined;
  size: ImageGenerationRequest["size"] | undefined;
}): { width: number; height: number } | undefined {
  const { aspectRatio, size } = params;

  if (!aspectRatio && !size) {
    return undefined;
  }

  const ratio = parseAspectRatioValue(aspectRatio);
  const maxDimension = getBflTargetMaxDimension(size);

  if (!ratio) {
    const side = clampBflDimension(maxDimension);
    return { width: side, height: side };
  }

  if (ratio >= 1) {
    const width = clampBflDimension(maxDimension);
    const height = clampBflDimension(maxDimension / ratio);
    return { width, height };
  }

  const height = clampBflDimension(maxDimension);
  const width = clampBflDimension(maxDimension * ratio);
  return { width, height };
}

function getStorageBucketName(): string {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  }
  return bucketName;
}

function buildFirebaseDownloadUrl(
  bucketName: string,
  storagePath: string,
  token: string,
): string {
  // This matches the URL format used by Firebase Storage downloads.
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

const REFERENCE_IMAGE_FIREBASE_STORAGE_HOSTNAME =
  "firebasestorage.googleapis.com";

function parseCsvLower(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function assertAllowedReferenceImageUrl(
  referenceImageUrl: string,
  params: { bucketName: string },
): void {
  let url: URL;
  try {
    url = new URL(referenceImageUrl);
  } catch {
    throw new Error("Invalid reference image URL.");
  }

  // Only allow https to avoid SSRF via plain http and to match Firebase download URLs.
  if (url.protocol !== "https:") {
    throw new Error("Reference image URL must use https.");
  }

  // Avoid URLs like https://user:pass@host/...
  if (url.username || url.password) {
    throw new Error("Reference image URL must not contain credentials.");
  }

  const hostname = url.hostname.toLowerCase();
  const firebasePathPrefix = `/v0/b/${params.bucketName}/o/`;
  const isFirebaseStorageDownloadUrl =
    hostname === REFERENCE_IMAGE_FIREBASE_STORAGE_HOSTNAME &&
    url.pathname.startsWith(firebasePathPrefix);

  if (isFirebaseStorageDownloadUrl) {
    return;
  }

  // Optional allowlist: additional trusted hostnames.
  // Configure as comma-separated hostnames in AI_REFERENCE_IMAGE_ALLOWED_HOSTS.
  const allowedHosts = new Set<string>(
    parseCsvLower(process.env.AI_REFERENCE_IMAGE_ALLOWED_HOSTS),
  );
  if (allowedHosts.has(hostname)) {
    return;
  }

  throw new Error(
    `Reference image URL host is not allowed (${url.hostname}). ` +
      "Upload the image to the Reference Image Library (Firebase Storage) " +
      "or configure AI_REFERENCE_IMAGE_ALLOWED_HOSTS to allow additional domains.",
  );
}

function normalizeGatewayReferenceImages(referenceImages: string[]): string[] {
  const bucketName = getStorageBucketName();
  return referenceImages.map((referenceImage) => {
    if (
      referenceImage.startsWith("http://") ||
      referenceImage.startsWith("https://")
    ) {
      assertAllowedReferenceImageUrl(referenceImage, { bucketName });
      return referenceImage;
    }
    if (referenceImage.startsWith("data:")) {
      const commaIndex = referenceImage.indexOf(",");
      return commaIndex >= 0
        ? referenceImage.slice(commaIndex + 1)
        : referenceImage;
    }
    return referenceImage;
  });
}

function buildGatewayPrompt(params: {
  prompt: string;
  referenceImages: string[];
}): GatewayPrompt {
  const { prompt, referenceImages } = params;
  if (referenceImages.length === 0) {
    return prompt;
  }
  return {
    text: prompt,
    images: referenceImages,
  };
}

function getGeneratedImageContentType(mediaType: string | undefined): string {
  const base = (mediaType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "image/jpg") return "image/jpeg";
  if (base.startsWith("image/")) return base;
  return "image/png";
}

function getGeneratedImageExtension(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

function getGeneratedImageIdFromStoragePath(storagePath: string): string {
  const fileName = storagePath.split("/").pop();
  return fileName?.replace(/\.[a-zA-Z0-9]+$/i, "") ?? randomUUID();
}

async function uploadImageToFirebaseStorage(params: {
  bytes: Uint8Array;
  contentType: string;
  storagePath: string;
  customMetadata: Record<string, string>;
}): Promise<GeneratedImageUrl> {
  const { bytes, contentType, storagePath, customMetadata } = params;

  const bucketName = getStorageBucketName();
  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);

  const token = randomUUID();

  await bucket.file(storagePath).save(Buffer.from(bytes), {
    contentType,
    resumable: false,
    metadata: {
      // Custom metadata in GCS; Firebase client reads this as `customMetadata`.
      metadata: {
        ...customMetadata,
        // Enables stable token-based download URLs (what `getDownloadURL()` uses).
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  return {
    id: getGeneratedImageIdFromStoragePath(storagePath),
    storagePath,
    url: buildFirebaseDownloadUrl(bucketName, storagePath, token),
  };
}

/**
 * Translate text to English using Gemini via AI SDK.
 * Preserves text that should appear on generated images (e.g., signs, banners, labels).
 */
async function translateToEnglish(text: string): Promise<string> {
  const vertex = await getVertexClient();

  const { text: translatedText } = await generateText({
    model: vertex(MODELS.GEMINI_3_FLASH_LITE),
    instructions: `You are a professional translator for image generation prompts. Translate the given text to English while following these rules:

    1. Translate the descriptive parts of the prompt to English.
    2. PRESERVE any text that should appear ON the generated image (signs, banners, labels, titles, slogans, etc.) in the original language.
    3. When preserving text, wrap it in quotes to make it clear it should appear as-is on the image.

    Examples:
    - Input: "Wygeneruj grafikę baneru z napisem SPRZEDAM DZIAŁKĘ"
      Output: "Generate a banner graphic with the text "SPRZEDAM DZIAŁKĘ""
    - Input: "Zrób logo z napisem Piekarnia u Janka"
      Output: "Create a logo with the text "Piekarnia u Janka""
    - Input: "Stwórz plakat z hasłem WIELKA WYPRZEDAŻ -50%"
      Output: "Create a poster with the slogan "WIELKA WYPRZEDAŻ -50%""
    - Input: "Narysuj znak drogowy z tekstem UWAGA DZIECI"
      Output: "Draw a road sign with the text "UWAGA DZIECI""

    Return ONLY the translated text, nothing else. If the text is already in English, return it as is.`,
    prompt: text,
    temperature: 0,
  });

  return translatedText.trim();
}

async function referenceImageToBase64(params: {
  referenceImage: string;
}): Promise<{ base64: string; mimeType: string }> {
  const { referenceImage } = params;

  const allowedMimeTypes = new Set<string>(GEMINI_REFERENCE_IMAGE_MIME_TYPES);

  const normalize = (mimeType: string | undefined): string => {
    const raw = (mimeType ?? "").trim().toLowerCase();
    const base = raw.split(";")[0]?.trim() ?? "";
    if (base === "image/jpg") return "image/jpeg";
    return base;
  };

  const guessFromPath = (pathOrUrl: string): string | null => {
    const lower = pathOrUrl.toLowerCase();
    if (lower.includes(".png")) return "image/png";
    if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
    if (lower.includes(".webp")) return "image/webp";
    if (lower.includes(".heic")) return "image/heic";
    if (lower.includes(".heif")) return "image/heif";
    return null;
  };

  const assertAllowed = (mimeType: string, sourceLabel: string): void => {
    if (!mimeType || !allowedMimeTypes.has(mimeType)) {
      throw new Error(
        `Unsupported reference image type (${sourceLabel}: ${mimeType || "unknown"}). Allowed: ${GEMINI_REFERENCE_IMAGE_MIME_TYPES.join(", ")}.`,
      );
    }
  };

  if (referenceImage.startsWith("data:")) {
    const parts = referenceImage.split(",");
    const base64 = parts.length > 1 ? parts[1] : "";
    const mimeTypeMatch = referenceImage.match(/^data:([^;]+);base64,/);
    const mimeType = normalize(mimeTypeMatch?.[1] ?? "image/png");
    assertAllowed(mimeType, "data-url");
    return {
      base64,
      mimeType,
    };
  }

  if (
    referenceImage.startsWith("http://") ||
    referenceImage.startsWith("https://")
  ) {
    // Prevent SSRF by only allowing trusted / allowlisted domains.
    assertAllowedReferenceImageUrl(referenceImage, {
      bucketName: getStorageBucketName(),
    });

    const res = await fetch(referenceImage);
    if (!res.ok) {
      throw new Error(`Failed to download reference image. HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const headerMimeType = normalize(res.headers.get("content-type") ?? "");
    const effectiveMimeType =
      headerMimeType && allowedMimeTypes.has(headerMimeType)
        ? headerMimeType
        : (guessFromPath(referenceImage) ?? "image/png");
    assertAllowed(effectiveMimeType, "url");
    return {
      base64: Buffer.from(arrayBuffer).toString("base64"),
      mimeType: effectiveMimeType,
    };
  }

  return { base64: referenceImage, mimeType: "image/png" };
}

/**
 * Generate images using AI SDK with Google Vertex/AI Gateway providers
 */
export async function generateImages(request: ImageGenerationRequest): Promise<{
  images: GeneratedImageUrl[];
  filteredReason?: string;
}> {
  const capabilities = IMAGE_MODEL_CAPABILITIES[request.model];
  const effectivePrompt = resolveEffectiveImagePrompt({
    request,
    supportsImageInput: capabilities.supportsImageInput,
  });
  const normalizedRequest: ImageGenerationRequest = {
    ...request,
    prompt: effectivePrompt,
    referenceImages: extractReferenceImages(request),
  };

  const accountId = await getAuthenticatedAdminUid();
  const tenantContext = await getTenantContextForRequest();
  if (
    isSharedSaasTenantRuntime(tenantContext) &&
    isGatewayImageModel(normalizedRequest.model)
  ) {
    throw new Error(
      "AI Gateway image models are not available in SaaS runtime.",
    );
  }
  assertPaidGatewayImageModelEnabled(normalizedRequest.model);

  const requestedImageGenerations = Math.max(
    1,
    getRequestedImageCountForModel(normalizedRequest),
  );
  const aiUsageReservation = await reserveAiUsage({
    context: tenantContext,
    firestore: getAdminDb(),
    imageGenerations: requestedImageGenerations,
    modality: "image",
    model: normalizedRequest.model,
    provider: isGatewayImageModel(normalizedRequest.model)
      ? "ai-gateway"
      : "google-vertex",
    source: "image",
    userId: accountId,
  });
  let quotaReservation: Awaited<
    ReturnType<typeof reserveProjectWideImageQuota>
  > = null;
  let chargedUsdCentsForQuota = 0;
  let generatedImageCountForUsage = 0;
  let completedAiUsage = false;

  try {
    quotaReservation = await reserveProjectWideImageQuota({
      accountId,
      request: normalizedRequest,
    });
    request = normalizedRequest;

    // Auto-translate prompts to English if user's language is not supported
    let translatedPrompt = request.prompt;
    let translatedNegativePrompt = request.negativePrompt;

    if (request.language && request.language !== "en") {
      if (!capabilities.supportedLanguages.includes(request.language)) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `Translating prompt from ${request.language} to English...`,
          );
        }
        translatedPrompt = await translateToEnglish(request.prompt);
        if (request.negativePrompt) {
          translatedNegativePrompt = await translateToEnglish(
            request.negativePrompt,
          );
        }
        if (process.env.NODE_ENV === "development") {
          console.log(`Original prompt: ${request.prompt}`);
          console.log(`Translated prompt: ${translatedPrompt}`);
        }
      }
    }

    // Handle Gemini models (image editing/generation) using generateText
    if (isGeminiImageModel(request.model)) {
      const vertex = await getVertexClient();
      const geminiAspectRatio = toGeminiImageConfigAspectRatio(
        request.aspectRatio,
      );
      const geminiImageSize = toGeminiImageConfigSize({
        model: request.model,
        size: request.size,
      });

      const geminiPrompt = applyAspectRatioHintToPrompt({
        prompt: translatedPrompt,
        aspectRatio: request.aspectRatio,
        // If we can pass the aspect ratio via imageConfig, don't also add a hint.
        supportsAspectRatio: Boolean(geminiAspectRatio),
      });

      const geminiPromptWithSize = applySizeHintToPrompt({
        prompt: geminiPrompt,
        size: request.size,
        // If we can pass the size via imageConfig, don't also add a hint.
        supportsSize: Boolean(geminiImageSize),
      });

      const geminiModelName = request.model;
      const requestedOutputImages = Math.max(
        1,
        Math.floor(request.numberOfImages ?? 1),
      );
      const maxOutputImages = capabilities.supportsMultipleImages
        ? Math.min(requestedOutputImages, capabilities.maxImages)
        : 1;

      // Build the prompt content
      type MessageContent = Array<
        | { type: "text"; text: string }
        | { type: "image"; image: string; mimeType: string }
      >;

      let promptContent:
        | string
        | Array<{ role: "user"; content: MessageContent }>;

      const referenceImagesRaw =
        Array.isArray(request.referenceImages) &&
        request.referenceImages.length > 0
          ? request.referenceImages
          : request.referenceImage
            ? [request.referenceImage]
            : [];

      const maxReferenceImages = getMaxReferenceImagesForModel(request.model);
      if (referenceImagesRaw.length > maxReferenceImages) {
        throw new Error(
          `Too many reference images for ${request.model}. Max allowed: ${maxReferenceImages}.`,
        );
      }

      const referenceImages = referenceImagesRaw.slice(0, maxReferenceImages);

      if (referenceImages.length > 0) {
        const resolved = await Promise.all(
          referenceImages.map(async (ri) =>
            referenceImageToBase64({ referenceImage: ri }),
          ),
        );

        promptContent = [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: geminiPromptWithSize },
              ...resolved.map(({ base64, mimeType }) => ({
                type: "image" as const,
                image: base64,
                mimeType,
              })),
            ],
          },
        ];
      } else {
        promptContent = geminiPromptWithSize;
      }

      // Use generateText for Gemini image generation
      const result = await generateText({
        model: vertex(geminiModelName),
        prompt: promptContent,
        providerOptions: {
          vertex: {
            responseModalities: ["TEXT", "IMAGE"],
            ...(geminiAspectRatio || geminiImageSize
              ? {
                  imageConfig: {
                    ...(geminiAspectRatio
                      ? { aspectRatio: geminiAspectRatio }
                      : {}),
                    ...(geminiImageSize ? { imageSize: geminiImageSize } : {}),
                  },
                }
              : {}),
          },
        },
      });

      chargedUsdCentsForQuota = calculateGeminiActualUsdCents({
        model: request.model,
        size: request.size,
        usage: result.usage,
      });

      // Extract images from the response files array and upload to Firebase Storage.
      const baseTimestamp = Date.now();
      const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const finalAspectRatio = request.aspectRatio ?? "1:1";

      // Prepare upload tasks from image files, then upload in parallel.
      const uploadTasks: Array<Promise<GeneratedImageUrl>> = [];

      if (result.files && result.files.length > 0) {
        let imageIndex = 0;
        for (const file of result.files) {
          if (imageIndex >= maxOutputImages) {
            break;
          }

          if (file.mediaType?.startsWith("image/")) {
            const bytes =
              file.uint8Array ??
              (file.base64
                ? Buffer.from(
                    file.base64.includes(",")
                      ? file.base64.split(",")[1]
                      : file.base64,
                    "base64",
                  )
                : undefined);

            if (!bytes) {
              continue;
            }

            const imageId = `${baseTimestamp}-${imageIndex}`;
            const contentType = getGeneratedImageContentType(file.mediaType);
            const extension = getGeneratedImageExtension(contentType);
            const storagePath = `ai/generated/accounts/${accountId}/${dateStr}/${request.model}/${imageId}.${extension}`;
            imageIndex += 1;

            uploadTasks.push(
              uploadImageToFirebaseStorage({
                bytes,
                contentType,
                storagePath,
                customMetadata: {
                  prompt: geminiPromptWithSize,
                  model: request.model,
                  aspectRatio: finalAspectRatio,
                  ...(request.size ? { size: request.size } : {}),
                  ...(translatedNegativePrompt
                    ? { negativePrompt: translatedNegativePrompt }
                    : {}),
                },
              }),
            );
          }
        }
      }

      const uploaded = await Promise.all(uploadTasks);

      if (uploaded.length === 0) {
        throw new Error(
          "Gemini did not generate any images. Try being more explicit in your prompt about generating or editing an image.",
        );
      }

      if (process.env.NODE_ENV === "development") {
        console.log(
          `Generated ${uploaded.length} image(s) using ${request.model}`,
        );
      }
      generatedImageCountForUsage = uploaded.length;
      completedAiUsage = true;
      return { images: uploaded, filteredReason: undefined };
    }

    const effectivePrompt = applyAspectRatioHintToPrompt({
      prompt: translatedPrompt,
      aspectRatio: request.aspectRatio,
      supportsAspectRatio: capabilities.supportsAspectRatio,
    });

    const effectivePromptWithSize = applySizeHintToPrompt({
      prompt: effectivePrompt,
      size: request.size,
      supportsSize: capabilities.supportsSize,
    });

    // Use the explicitly allowed non-Vertex image models through AI Gateway.
    const numberOfImages = getRequestedImageCountForModel(request);
    const uploaded: GeneratedImageUrl[] = [];
    let images: Awaited<ReturnType<typeof generateImage>>["images"];
    let resolvedOpenAiSize: GptImage2GenerationSize | undefined;
    let resolvedOpenAiQuality: ImageGenerationQuality | undefined;

    if (!isGatewayImageModel(request.model)) {
      throw new Error(`Unsupported non-Gemini image model: ${request.model}`);
    }

    {
      const gateway = await getGatewayClient();
      const referenceImagesRaw =
        Array.isArray(request.referenceImages) &&
        request.referenceImages.length > 0
          ? request.referenceImages
          : request.referenceImage
            ? [request.referenceImage]
            : [];

      const maxReferenceImages = getMaxReferenceImagesForModel(request.model);
      if (referenceImagesRaw.length > maxReferenceImages) {
        throw new Error(
          `Too many reference images for ${request.model}. Max allowed: ${maxReferenceImages}.`,
        );
      }

      const referenceImages = normalizeGatewayReferenceImages(
        referenceImagesRaw.slice(0, maxReferenceImages),
      );

      if (request.model === "bfl/flux-2-klein-9b") {
        const prompt = buildGatewayPrompt({
          prompt: effectivePromptWithSize,
          referenceImages,
        });
        const dimensions = getBflDimensions({
          aspectRatio: request.aspectRatio,
          size: request.size,
        });

        const providerOptions: {
          blackForestLabs: BlackForestLabsProviderOptions;
        } = {
          blackForestLabs: {
            outputFormat: BFL_OUTPUT_FORMAT,
            safetyTolerance: BFL_SAFETY_TOLERANCE,
            ...(dimensions
              ? { width: dimensions.width, height: dimensions.height }
              : {}),
          },
        };

        const aspectRatio = dimensions
          ? undefined
          : capabilities.supportsAspectRatio
            ? request.aspectRatio
            : undefined;

        ({ images } = await generateImage({
          model: gateway.imageModel(request.model),
          prompt,
          n: numberOfImages,
          aspectRatio,
          providerOptions,
        }));
      } else if (isOpenAiImageModel(request.model)) {
        const prompt = buildGatewayPrompt({
          prompt: effectivePromptWithSize,
          referenceImages,
        });

        resolvedOpenAiSize = resolveGptImage2Size({
          aspectRatio: request.aspectRatio,
          size: request.size,
        });
        resolvedOpenAiQuality = resolveGptImage2Quality(request.quality);

        ({ images } = await generateImage({
          model: gateway.imageModel(request.model),
          prompt,
          n: numberOfImages,
          ...(resolvedOpenAiSize ? { size: resolvedOpenAiSize } : {}),
          providerOptions: {
            openai: {
              quality: resolvedOpenAiQuality,
            },
          },
        }));
      } else if (request.model === "quiverai/arrow-1.1") {
        ({ images } = await generateImage({
          model: gateway.imageModel(request.model),
          prompt: effectivePromptWithSize,
          n: 1,
        }));
      } else {
        const unsupportedGatewayModel: never = request.model;
        throw new Error(
          `Unsupported AI Gateway image model: ${unsupportedGatewayModel}`,
        );
      }

      chargedUsdCentsForQuota = calculateGatewayUsdCents({
        model: request.model,
        request: {
          aspectRatio: request.aspectRatio,
          quality: resolvedOpenAiQuality ?? request.quality,
          size: resolvedOpenAiSize ?? request.size,
        },
        imageCount: images.length,
      });
    }

    const baseTimestamp = Date.now();
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const finalAspectRatio =
      request.aspectRatio ??
      (resolvedOpenAiSize
        ? getAspectRatioForGptImage2Size(resolvedOpenAiSize)
        : undefined);
    const finalImageSize =
      resolvedOpenAiSize ??
      (isGptImage2GenerationSize(request.size) ? request.size : undefined);
    const finalImageQuality = resolvedOpenAiQuality ?? request.quality;

    // Upload generated images to Firebase Storage in parallel.
    const uploadTasks = images.flatMap((img, index) => {
      const bytes =
        img.uint8Array ??
        (img.base64
          ? Buffer.from(
              img.base64.includes(",") ? img.base64.split(",")[1] : img.base64,
              "base64",
            )
          : undefined);

      if (!bytes) {
        return [];
      }

      const imageId = `${baseTimestamp}-${index}`;
      const contentType = getGeneratedImageContentType(img.mediaType);
      const extension = getGeneratedImageExtension(contentType);
      const storagePath = `ai/generated/accounts/${accountId}/${dateStr}/${request.model}/${imageId}.${extension}`;

      return [
        uploadImageToFirebaseStorage({
          bytes,
          contentType,
          storagePath,
          customMetadata: {
            prompt: effectivePromptWithSize,
            model: request.model,
            ...(finalAspectRatio ? { aspectRatio: finalAspectRatio } : {}),
            ...(finalImageSize ? { size: finalImageSize } : {}),
            ...(finalImageQuality ? { quality: finalImageQuality } : {}),
            ...(translatedNegativePrompt
              ? { negativePrompt: translatedNegativePrompt }
              : {}),
          },
        }),
      ];
    });
    uploaded.push(...(await Promise.all(uploadTasks)));

    if (process.env.NODE_ENV === "development") {
      console.log(`Generated ${uploaded.length} images using ${request.model}`);
    }

    generatedImageCountForUsage = uploaded.length;
    completedAiUsage = true;
    return {
      images: uploaded,
      filteredReason: undefined,
    };
  } finally {
    if (quotaReservation) {
      try {
        await finalizeProjectWideImageQuota({
          reservation: quotaReservation,
          chargedUsdCents: chargedUsdCentsForQuota,
        });
      } catch (error) {
        // Never fail the main request due to quota finalization.
        console.error("Failed to finalize AI image generation quota:", error);
      }
    }
    try {
      if (completedAiUsage) {
        await finalizeAiUsage({
          costUsdCents: chargedUsdCentsForQuota,
          firestore: getAdminDb(),
          imageGenerations:
            generatedImageCountForUsage || requestedImageGenerations,
          reservation: aiUsageReservation,
        });
      } else {
        await releaseAiUsageReservation({
          firestore: getAdminDb(),
          reservation: aiUsageReservation,
        });
      }
    } catch (error) {
      console.error("Failed to finalize AI image usage metering:", error);
    }
  }
}
