import "server-only";

import { getGatewayClient } from "@/lib/ai/server-gateway";
import { assertPaidGatewayImageModelEnabled } from "@/lib/ai/server-gateway-image-models";
import { generateVertexContent } from "@/lib/ai/vertex-rest.server";
import { getAdminDb, getFirebaseAdminApp } from "@/lib/firebase/serverApp";
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
import { allMap } from "@konfi/utils";
import { all } from "better-all";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import { FatalError, RetryableError } from "workflow";
import { getMaxReferenceImagesForModel } from "@/lib/utils/reference-image";
import {
  finalizeAiUsage,
  releaseAiUsageReservation,
  type AiUsageReservation,
} from "@/lib/ai/usage-metering";

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
  "bfl/flux-2-klein-9b": 4,
  "quiverai/arrow-1.1": 2,
} as const satisfies Record<FlatPriceGatewayImageModel, number>;

// Gemini (token-based) pricing expressed as USD per 1M tokens.
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

const GEMINI_3_PRO_IMAGE_OUTPUT_TOKENS_1K_OR_2K = 1120;
const GEMINI_3_PRO_IMAGE_OUTPUT_TOKENS_4K = 2000;
const GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_TOKENS_1K = 1120;
const GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_1K = 1120;
const GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_2K = 1680;
const GEMINI_3_1_FLASH_IMAGE_OUTPUT_TOKENS_4K = 2520;
const GEMINI_RESERVED_OUTPUT_TEXT_TOKENS = 512;
const IMAGE_PROMPT_TRANSLATION_TIMEOUT_MS = 30_000;
const GEMINI_IMAGE_GENERATION_TIMEOUT_MS = 120_000;

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

type AiGenerateImage = (typeof import("ai"))["generateImage"];

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

async function getAiRuntime() {
  return await import("ai");
}

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

  throw new FatalError(
    "Prompt is required unless at least one reference image is provided for an image-input model.",
  );
}

type AiImageGenerationQuotaDoc = {
  enabled: boolean;
  monthlyLimitUsdCents?: number;
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

type AiImageGenerationJobDoc = {
  jobId: string;
  accountId?: string;
  status: "created" | "reserved" | "completed" | "failed";
  request: ImageGenerationRequest;
  periodKey?: string;
  reservedUsdCents?: number;
  chargedUsdCents?: number;
  images?: GeneratedImageUrl[];
  filteredReason?: string;
  quotaFinalizedAt?: Timestamp;
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function formatUsdCents(usdCents: number): string {
  const safe = Math.max(0, usdCents);
  return `$${(safe / 100).toFixed(2)}`;
}

function roundUsdCents(usdCents: number): number {
  const safe = Number.isFinite(usdCents) ? Math.max(0, usdCents) : 0;
  return Math.round(safe * 10) / 10;
}

function estimateTextTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 1;
  // Rough approximation: ~4 chars per token.
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

  if (!isGeminiImageModel(request.model)) {
    throw new FatalError(
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

function getMonthlyPeriodKeyUtc(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function getQuotaDocPath(): string {
  return "aiImageGenerationQuota/global";
}

function getUsageDocPath(periodKey: string, accountId: string): string {
  return `aiImageGenerationUsageMonthly/${periodKey}/accounts/${accountId}`;
}

function getJobDocPath(jobId: string): string {
  return `aiImageGenerationJobs/${jobId}`;
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

  const sizeRegex = new RegExp(`\\b${RegExp.escape(size)}\\b`, "i");
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
  if (prompt.includes(aspectRatio)) {
    return prompt;
  }
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
    throw new FatalError("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  }
  return bucketName;
}

function buildFirebaseDownloadUrl(
  bucketName: string,
  storagePath: string,
  token: string,
): string {
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
    throw new FatalError("Invalid reference image URL.");
  }

  if (url.protocol !== "https:") {
    throw new FatalError("Reference image URL must use https.");
  }

  if (url.username || url.password) {
    throw new FatalError("Reference image URL must not contain credentials.");
  }

  const hostname = url.hostname.toLowerCase();
  const firebasePathPrefix = `/v0/b/${params.bucketName}/o/`;
  const isFirebaseStorageDownloadUrl =
    hostname === REFERENCE_IMAGE_FIREBASE_STORAGE_HOSTNAME &&
    url.pathname.startsWith(firebasePathPrefix);

  if (isFirebaseStorageDownloadUrl) {
    return;
  }

  const allowedHosts = new Set<string>(
    parseCsvLower(process.env.AI_REFERENCE_IMAGE_ALLOWED_HOSTS),
  );
  if (allowedHosts.has(hostname)) {
    return;
  }

  throw new FatalError(
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
      metadata: {
        ...customMetadata,
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

async function translateToEnglish(text: string): Promise<string> {
  const { text: translatedText } = await generateVertexContent({
    model: MODELS.GEMINI_3_FLASH_LITE,
    system: `You are a professional translator for image generation prompts. Translate the given text to English while following these rules:

    1. Translate the descriptive parts of the prompt to English.
    2. PRESERVE any text that should appear ON the generated image (signs, banners, labels, titles, slogans, etc.) in the original language.
    3. When preserving text, wrap it in quotes to make it clear it should appear as-is on the image.

    Return ONLY the translated text, nothing else. If the text is already in English, return it as is.`,
    prompt: text,
    generationConfig: {
      temperature: 0,
    },
    timeoutMs: IMAGE_PROMPT_TRANSLATION_TIMEOUT_MS,
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
      throw new FatalError(
        `Unsupported reference image type (${sourceLabel}: ${mimeType || "unknown"}). Allowed: ${GEMINI_REFERENCE_IMAGE_MIME_TYPES.join(", ")}.`,
      );
    }
  };

  // Data URL or raw base64
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

  // URL (Firebase download URL or any http(s) url)
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
      if (res.status === 429) {
        throw new RetryableError(
          "Rate limited while downloading reference image",
          {
            retryAfter: "5m",
          },
        );
      }

      if (res.status >= 500) {
        throw new RetryableError(
          `Upstream error while downloading reference image (HTTP ${res.status})`,
          { retryAfter: "1m" },
        );
      }

      throw new FatalError(
        `Failed to download reference image. HTTP ${res.status}`,
      );
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

  // Raw base64 string
  return { base64: referenceImage, mimeType: "image/png" };
}

export async function reserveProjectWideImageQuotaStep(params: {
  accountId: string;
  jobId: string;
  request: ImageGenerationRequest;
}): Promise<AiImageGenerationReservation | null> {
  const { accountId, jobId, request: incomingRequest } = params;

  const capabilities = IMAGE_MODEL_CAPABILITIES[incomingRequest.model];
  const effectivePrompt = resolveEffectiveImagePrompt({
    request: incomingRequest,
    supportsImageInput: capabilities.supportsImageInput,
  });
  const request: ImageGenerationRequest = {
    ...incomingRequest,
    prompt: effectivePrompt,
    referenceImages: extractReferenceImages(incomingRequest),
  };

  const reservedUsdCents = estimateMaxUsdCentsForReservation(request);
  const periodKey = getMonthlyPeriodKeyUtc();

  const db = getAdminDb();
  const quotaRef = db.doc(getQuotaDocPath());
  const usageRef = db.doc(getUsageDocPath(periodKey, accountId));
  const jobRef = db.doc(getJobDocPath(jobId));

  const isReserved = await db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    const job = jobSnap.exists
      ? (jobSnap.data() as Partial<AiImageGenerationJobDoc>)
      : undefined;

    // Idempotency: if we already reserved for this job, reuse.
    if (
      job?.status === "reserved" &&
      job.accountId === accountId &&
      job.periodKey === periodKey &&
      typeof job.reservedUsdCents === "number"
    ) {
      return true;
    }

    const quotaSnap = await tx.get(quotaRef);
    const quota = quotaSnap.exists
      ? (quotaSnap.data() as Partial<AiImageGenerationQuotaDoc>)
      : undefined;

    if (!quota?.enabled) {
      // When quota is disabled, we still create the job doc to record the request.
      tx.set(
        jobRef,
        {
          jobId,
          accountId,
          status: "created",
          request,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        } satisfies AiImageGenerationJobDoc,
        { merge: true },
      );
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
      throw new FatalError(
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
      throw new FatalError(
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

    tx.set(
      jobRef,
      {
        jobId,
        accountId,
        status: "reserved",
        request,
        periodKey,
        reservedUsdCents,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      } satisfies AiImageGenerationJobDoc,
      { merge: true },
    );

    return true;
  });

  return isReserved ? { accountId, periodKey, reservedUsdCents } : null;
}

export async function finalizeProjectWideImageQuotaStep(params: {
  jobId: string;
  reservation: AiImageGenerationReservation | null;
  chargedUsdCents: number;
  error?: string;
}): Promise<void> {
  const { jobId, reservation, chargedUsdCents, error } = params;
  if (!reservation) {
    if (error) {
      const db = getAdminDb();
      const jobRef = db.doc(getJobDocPath(jobId));
      await jobRef.set(
        {
          status: "failed",
          error,
          updatedAt: Timestamp.now(),
        } satisfies Partial<AiImageGenerationJobDoc>,
        { merge: true },
      );
    }
    return;
  }

  const { accountId, periodKey, reservedUsdCents } = reservation;
  const safeChargedUsdCents = roundUsdCents(chargedUsdCents);

  const db = getAdminDb();
  const quotaRef = db.doc(getQuotaDocPath());
  const usageRef = db.doc(getUsageDocPath(periodKey, accountId));
  const jobRef = db.doc(getJobDocPath(jobId));

  await db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    const job = jobSnap.exists
      ? (jobSnap.data() as Partial<AiImageGenerationJobDoc>)
      : undefined;

    // Idempotency: if already finalized for this job, no-op.
    if (job?.quotaFinalizedAt instanceof Timestamp) {
      return;
    }

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

    tx.set(
      jobRef,
      {
        status: error ? "failed" : "completed",
        chargedUsdCents: safeChargedUsdCents,
        quotaFinalizedAt: Timestamp.now(),
        ...(error ? { error } : {}),
        updatedAt: Timestamp.now(),
      } satisfies Partial<AiImageGenerationJobDoc>,
      { merge: true },
    );
  });
}

export async function finalizeAiImageUsageStep(params: {
  reservation: AiUsageReservation;
  chargedUsdCents: number;
  imageGenerations: number;
}): Promise<void> {
  await finalizeAiUsage({
    costUsdCents: params.chargedUsdCents,
    firestore: getAdminDb(),
    imageGenerations: params.imageGenerations,
    reservation: params.reservation,
  });
}

export async function releaseAiImageUsageStep(params: {
  reservation: AiUsageReservation;
}): Promise<void> {
  await releaseAiUsageReservation({
    firestore: getAdminDb(),
    reservation: params.reservation,
  });
}

export async function generateAndUploadImagesStep(params: {
  accountId: string;
  jobId: string;
  request: ImageGenerationRequest;
}): Promise<{
  images: GeneratedImageUrl[];
  filteredReason?: string;
  chargedUsdCents: number;
}> {
  const { accountId, jobId, request: incomingRequest } = params;

  const initialCapabilities = IMAGE_MODEL_CAPABILITIES[incomingRequest.model];
  const normalizedPrompt = resolveEffectiveImagePrompt({
    request: incomingRequest,
    supportsImageInput: initialCapabilities.supportsImageInput,
  });
  const request: ImageGenerationRequest = {
    ...incomingRequest,
    prompt: normalizedPrompt,
    referenceImages: extractReferenceImages(incomingRequest),
  };

  const db = getAdminDb();
  const jobRef = db.doc(getJobDocPath(jobId));
  const jobSnap = await jobRef.get();
  const job = jobSnap.exists
    ? (jobSnap.data() as Partial<AiImageGenerationJobDoc>)
    : undefined;

  // Idempotency: if already completed with images, return stored result.
  if (
    job?.status === "completed" &&
    Array.isArray(job.images) &&
    typeof job.chargedUsdCents === "number"
  ) {
    return {
      images: job.images,
      filteredReason:
        typeof job.filteredReason === "string" ? job.filteredReason : undefined,
      chargedUsdCents: job.chargedUsdCents,
    };
  }

  // Mark job as created if missing.
  await jobRef.set(
    {
      jobId,
      accountId,
      status: "created",
      request,
      createdAt:
        job?.createdAt instanceof Timestamp ? job.createdAt : Timestamp.now(),
      updatedAt: Timestamp.now(),
    } satisfies Partial<AiImageGenerationJobDoc>,
    { merge: true },
  );

  const capabilities = IMAGE_MODEL_CAPABILITIES[request.model];

  // Auto-translate prompts to English if user's language is not supported.
  let translatedPrompt = request.prompt;
  let translatedNegativePrompt = request.negativePrompt;

  if (request.language && request.language !== "en") {
    if (!capabilities.supportedLanguages.includes(request.language)) {
      const { promptTranslation, negativeTranslation } = await all({
        async promptTranslation() {
          return translateToEnglish(request.prompt);
        },
        async negativeTranslation() {
          return request.negativePrompt
            ? translateToEnglish(request.negativePrompt)
            : undefined;
        },
      });

      translatedPrompt = promptTranslation;
      translatedNegativePrompt =
        negativeTranslation ?? translatedNegativePrompt;
    }
  }

  let chargedUsdCentsForQuota = 0;

  // Gemini models
  if (isGeminiImageModel(request.model)) {
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
      supportsAspectRatio: Boolean(geminiAspectRatio),
    });

    const geminiPromptWithSize = applySizeHintToPrompt({
      prompt: geminiPrompt,
      size: request.size,
      supportsSize: Boolean(geminiImageSize),
    });

    const requestedOutputImages = Math.max(
      1,
      Math.floor(request.numberOfImages ?? 1),
    );
    const maxOutputImages = capabilities.supportsMultipleImages
      ? Math.min(requestedOutputImages, capabilities.maxImages)
      : 1;

    const referenceImagesRaw =
      Array.isArray(request.referenceImages) &&
      request.referenceImages.length > 0
        ? request.referenceImages
        : request.referenceImage
          ? [request.referenceImage]
          : [];

    const maxReferenceImages = getMaxReferenceImagesForModel(request.model);
    if (referenceImagesRaw.length > maxReferenceImages) {
      throw new FatalError(
        `Too many reference images for ${request.model}. Max allowed: ${maxReferenceImages}.`,
      );
    }

    const referenceImages = referenceImagesRaw.slice(0, maxReferenceImages);
    const resolvedReferenceImages =
      referenceImages.length > 0
        ? await allMap(referenceImages, (referenceImage) =>
            referenceImageToBase64({ referenceImage }),
          )
        : [];

    const result = await generateVertexContent({
      model: request.model,
      prompt:
        resolvedReferenceImages.length > 0
          ? {
              text: geminiPromptWithSize,
              images: resolvedReferenceImages,
            }
          : geminiPromptWithSize,
      generationConfig: {
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
      timeoutMs: GEMINI_IMAGE_GENERATION_TIMEOUT_MS,
    });

    chargedUsdCentsForQuota = calculateGeminiActualUsdCents({
      model: request.model,
      size: request.size,
      usage: result.usage,
    });

    let uploaded: GeneratedImageUrl[] = [];
    const baseTimestamp = Date.now();
    const dateStr = new Date().toISOString().split("T")[0];
    const finalAspectRatio = request.aspectRatio ?? "1:1";

    if (result.files.length > 0) {
      const imageFiles = result.files.filter((file) =>
        file.mediaType?.startsWith("image/"),
      );
      const limitedImageFiles = imageFiles.slice(0, maxOutputImages);
      type GeminiImageFile = (typeof limitedImageFiles)[number];

      const preparedUploads = limitedImageFiles.reduce<
        Array<{ file: GeminiImageFile; bytes: Uint8Array }>
      >((acc, file) => {
        const bytes = Buffer.from(
          file.base64.includes(",")
            ? (file.base64.split(",")[1] ?? "")
            : file.base64,
          "base64",
        );

        acc.push({ file, bytes });

        return acc;
      }, []);

      const limitedPreparedUploads = preparedUploads.slice(0, maxOutputImages);

      uploaded = await allMap(limitedPreparedUploads, async (entry, index) => {
        const imageId = `${jobId}-${baseTimestamp}-${index}`;
        const contentType = getGeneratedImageContentType(entry.file.mediaType);
        const extension = getGeneratedImageExtension(contentType);
        const storagePath = `ai/generated/accounts/${accountId}/${dateStr}/${request.model}/${imageId}.${extension}`;

        return uploadImageToFirebaseStorage({
          bytes: entry.bytes,
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
            jobId,
          },
        });
      });
    }

    if (uploaded.length === 0) {
      const errMsg =
        "Gemini did not generate any images. Try being more explicit in your prompt about generating or editing an image.";
      await jobRef.set(
        {
          status: "failed",
          error: errMsg,
          updatedAt: Timestamp.now(),
        } satisfies Partial<AiImageGenerationJobDoc>,
        { merge: true },
      );
      throw new FatalError(errMsg);
    }

    await jobRef.set(
      {
        status: "completed",
        images: uploaded,
        chargedUsdCents: chargedUsdCentsForQuota,
        updatedAt: Timestamp.now(),
      } satisfies Partial<AiImageGenerationJobDoc>,
      { merge: true },
    );

    return {
      images: uploaded,
      filteredReason: undefined,
      chargedUsdCents: chargedUsdCentsForQuota,
    };
  }

  // Non-Gemini models (AI Gateway).
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

  const numberOfImages = getRequestedImageCountForModel(request);
  let images: Awaited<ReturnType<AiGenerateImage>>["images"];
  let resolvedOpenAiSize: GptImage2GenerationSize | undefined;
  let resolvedOpenAiQuality: ImageGenerationQuality | undefined;

  if (!isGatewayImageModel(request.model)) {
    throw new FatalError(
      `Unsupported non-Gemini image model: ${request.model}`,
    );
  }
  try {
    assertPaidGatewayImageModelEnabled(request.model);
  } catch (error) {
    throw new FatalError(
      error instanceof Error ? error.message : String(error),
    );
  }

  {
    const { generateImage } = await getAiRuntime();
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
      throw new FatalError(
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
      throw new FatalError(
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

  let uploaded: GeneratedImageUrl[] = [];
  const baseTimestamp = Date.now();
  const dateStr = new Date().toISOString().split("T")[0];
  const finalAspectRatio =
    request.aspectRatio ??
    (resolvedOpenAiSize
      ? getAspectRatioForGptImage2Size(resolvedOpenAiSize)
      : undefined);
  const finalImageSize =
    resolvedOpenAiSize ??
    (isGptImage2GenerationSize(request.size) ? request.size : undefined);
  const finalImageQuality = resolvedOpenAiQuality ?? request.quality;

  const preparedUploads = images.reduce<
    Array<{ image: (typeof images)[number]; bytes: Uint8Array }>
  >((acc, image) => {
    const bytes =
      image.uint8Array ??
      (image.base64
        ? Buffer.from(
            image.base64.includes(",")
              ? image.base64.split(",")[1]
              : image.base64,
            "base64",
          )
        : undefined);

    if (bytes) {
      acc.push({ image, bytes });
    }

    return acc;
  }, []);

  uploaded = await allMap(preparedUploads, async (entry, index) => {
    const imageId = `${jobId}-${baseTimestamp}-${index}`;
    const contentType = getGeneratedImageContentType(entry.image.mediaType);
    const extension = getGeneratedImageExtension(contentType);
    const storagePath = `ai/generated/accounts/${accountId}/${dateStr}/${request.model}/${imageId}.${extension}`;

    return uploadImageToFirebaseStorage({
      bytes: entry.bytes,
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
        jobId,
      },
    });
  });

  await jobRef.set(
    {
      status: "completed",
      images: uploaded,
      chargedUsdCents: chargedUsdCentsForQuota,
      updatedAt: Timestamp.now(),
    } satisfies Partial<AiImageGenerationJobDoc>,
    { merge: true },
  );

  return {
    images: uploaded,
    filteredReason: undefined,
    chargedUsdCents: chargedUsdCentsForQuota,
  };
}
