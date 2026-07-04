import { Attribute, Product } from "@konfi/types";
import {
  appendProductImageGenerationPromptEnhancement,
  isPurchasable,
} from "@konfi/utils";

const MAX_PROMPT_WORDS = 500;
const MIN_PROMPT_WORDS = 30;
const MAX_REFERENCE_FILES = 3;
const MAX_REFERENCE_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_MAX_ATTEMPTS = 2;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MONTHLY_BUDGET_USD_MICROS = 10_000_000;
const GENERATED_IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
// Approx. $0.07 per default 1K Gemini 3.1 Flash Image generation on Vertex AI:
// - 1,120 image output tokens × $60 / 1M = $0.0672
// - plus a small allowance for prompt input and text-response overhead
// Official pricing checked 2026-04:
// https://cloud.google.com/vertex-ai/generative-ai/pricing#google_models
const ESTIMATED_GENERATION_COST_USD_MICROS = 70_000;
const SUPPORTED_REFERENCE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
const BLOCKED_PROMPT_PATTERNS = [
  /https?:\/\//i,
  /file:\/\//i,
  /data:/i,
  /javascript:/i,
  /<script/i,
  /<iframe/i,
];
const ASPECT_RATIO_OPTIONS = [
  "1:1",
  "9:16",
  "16:9",
  "3:4",
  "4:3",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
] as const;
export const IMPROVE_GENERATION_PROMPT_SYSTEM = [
  "You rewrite short print-design briefs into clearer, more actionable prompts for flat production artwork.",
  "Keep the original intent and add only helpful visual direction.",
  "Explicitly avoid mockups or staged product scenes.",
  "Never invent personal data or factual claims.",
  "Preserve any user-provided literal copy exactly as written, including company names, brand names, phone numbers, email addresses, URLs, addresses, dates, prices, slogans, promo codes, and other text content meant to appear in the design.",
  "Do not translate, normalize, correct, shorten, expand, paraphrase, or replace such user-provided text information.",
  "Return only the improved brief.",
].join(" ");

type SupportedReferenceImageType =
  (typeof SUPPORTED_REFERENCE_IMAGE_TYPES)[number];

type SupportedAspectRatio = (typeof ASPECT_RATIO_OPTIONS)[number];

type SelectedAttributeOptions = Record<string, string>;

export const STORE_GENERATION_STYLES = [
  "minimalistyczny",
  "nowoczesny",
  "elegancki",
  "kreatywny",
] as const;

export type StoreGenerationStyle = (typeof STORE_GENERATION_STYLES)[number];

export const DEFAULT_STORE_GENERATION_STYLE: StoreGenerationStyle =
  "nowoczesny";

const STORE_GENERATION_STYLE_GUIDANCE: Record<StoreGenerationStyle, string> = {
  minimalistyczny:
    "Favor restraint, generous spacing, a reduced palette, and only the most essential visual elements.",
  nowoczesny:
    "Favor a contemporary layout, crisp hierarchy, clean geometry, and fresh high-clarity contrast.",
  elegancki:
    "Favor refined typography, sophisticated spacing, a premium palette, and polished editorial balance.",
  kreatywny:
    "Favor a more expressive concept, bold composition, surprising accents, and memorable visual energy while staying production-ready.",
};

export type StoreGenerationReferenceImage = {
  mimeType: SupportedReferenceImageType;
  base64: string;
};

export type StoreGenerationSide = "single" | "front" | "back";

export type StoreGenerationSelectedAttribute = {
  attributeId: string;
  attributeName: string;
  optionValue: string;
  optionLabel: string;
};

export type StoreGenerationContext = {
  productName: string;
  productCategory?: string;
  productType?: string;
  productDescription?: string;
  specialNotes?: string;
  pageCount?: number;
  pageLabel?: string;
  widthMm?: number;
  heightMm?: number;
  aspectRatio?: SupportedAspectRatio;
  aspectRatioLabel?: string;
  sizeLabel?: string;
  isLargeFormat: boolean;
  selectedAttributes: StoreGenerationSelectedAttribute[];
  combinationDescription?: string;
  printSideCount: 1 | 2;
};

export type StoreGenerationImage = {
  id: string;
  imageDataUrl: string;
  side: StoreGenerationSide;
};

export type StoreGenerationResult = {
  images: StoreGenerationImage[];
  context: StoreGenerationContext;
  remainingAttempts: number;
  expiresAt: string;
  expiresAtMs: number;
};

export type StoreGeneratedImageHistoryEntry = {
  url: string;
  storagePath: string;
  generatedAt: string;
  generatedAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
  productId: string;
  prompt?: string;
  productName?: string;
  model?: string;
  side?: StoreGenerationSide;
  pageLabel?: string;
  sizeLabel?: string;
  aspectRatio?: string;
};

export type StoreGenerationRequest = {
  userId: string;
  tenantId?: string;
  prompt: string;
  improvePrompt: boolean;
  allowAdminPreview?: boolean;
  style?: StoreGenerationStyle;
  language?: string | null;
  productId: string;
  channelId: string;
  selectedAttributeOptions?: SelectedAttributeOptions;
  width?: number;
  height?: number;
  pageCount?: number;
  referenceImages?: StoreGenerationReferenceImage[];
};

export type StoreImageGenerationBudgetReservation = {
  nextReservedUsdMicros: number;
  remainingBudgetUsdMicros: number;
};

export const STORE_IMAGE_GENERATION_EXPIRED_ERROR = "IMAGE_GENERATION_EXPIRED";

export function resolveStoreGenerationStyle(
  value: string | null | undefined,
): StoreGenerationStyle {
  return STORE_GENERATION_STYLES.includes(value as StoreGenerationStyle)
    ? (value as StoreGenerationStyle)
    : DEFAULT_STORE_GENERATION_STYLE;
}

export function buildStoreGenerationStylePrompt(
  style: StoreGenerationStyle | undefined,
): string {
  const resolvedStyle = resolveStoreGenerationStyle(style);

  return [
    `Preferred user-selected style: ${resolvedStyle}.`,
    `Style direction: ${STORE_GENERATION_STYLE_GUIDANCE[resolvedStyle]}`,
  ].join(" ");
}

export function canAccessStoreImageGenerationProduct(
  product: Product,
  allowAdminPreview = false,
): boolean {
  return allowAdminPreview || isPurchasable(product);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join("");
}

function stripMarkdownLikeText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " "),
  );
}

export function countPromptWords(value: string): number {
  return normalizeWhitespace(value).split(" ").filter(Boolean).length;
}

export function sanitizePrompt(
  value: string,
  options?: { enforceWordCount?: boolean },
): string {
  const normalizedValue = stripMarkdownLikeText(
    stripControlCharacters(value.normalize("NFKC")),
  );
  const { enforceWordCount = true } = options ?? {};

  if (!normalizedValue) {
    throw new Error("Prompt is required.");
  }

  for (const pattern of BLOCKED_PROMPT_PATTERNS) {
    if (pattern.test(normalizedValue)) {
      throw new Error(
        "Prompt contains unsupported URL or markup content. Remove links, scripts, and embedded data.",
      );
    }
  }

  if (!enforceWordCount) {
    return normalizedValue;
  }

  const wordCount = countPromptWords(normalizedValue);

  if (wordCount < MIN_PROMPT_WORDS) {
    throw new Error(
      `Prompt must include at least ${MIN_PROMPT_WORDS} words so the model has enough design context.`,
    );
  }

  if (wordCount > MAX_PROMPT_WORDS) {
    throw new Error(`Prompt can contain at most ${MAX_PROMPT_WORDS} words.`);
  }

  return normalizedValue;
}

export function assertReferenceImages(
  referenceImages: StoreGenerationReferenceImage[],
): void {
  if (referenceImages.length > MAX_REFERENCE_FILES) {
    throw new Error(
      `You can upload up to ${MAX_REFERENCE_FILES} reference images.`,
    );
  }
}

export function getStoreImageGenerationMonthKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

export function isStoreImageGenerationRateLimitEnabled(
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "production";
}

export function reserveStoreImageGenerationBudget(params: {
  currentReservedUsdMicros: number;
  estimatedGenerationCostUsdMicros?: number;
  monthlyBudgetUsdMicros?: number;
}): StoreImageGenerationBudgetReservation {
  const {
    currentReservedUsdMicros,
    estimatedGenerationCostUsdMicros = ESTIMATED_GENERATION_COST_USD_MICROS,
    monthlyBudgetUsdMicros = MONTHLY_BUDGET_USD_MICROS,
  } = params;
  const nextReservedUsdMicros =
    currentReservedUsdMicros + estimatedGenerationCostUsdMicros;

  if (nextReservedUsdMicros > monthlyBudgetUsdMicros) {
    throw new Error("MONTHLY_BUDGET_EXCEEDED");
  }

  return {
    nextReservedUsdMicros,
    remainingBudgetUsdMicros: Math.max(
      0,
      monthlyBudgetUsdMicros - nextReservedUsdMicros,
    ),
  };
}

function truncateText(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeMetadataText(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return undefined;
  }

  return truncateText(normalized, maxLength);
}

export function buildStoreGeneratedImageHistoryEntry(params: {
  context: StoreGenerationContext;
  generatedAt: Date;
  imageSide: StoreGenerationSide;
  model: string;
  productId: string;
  prompt: string;
  storagePath: string;
  url: string;
}): StoreGeneratedImageHistoryEntry {
  const generatedAtIso = params.generatedAt.toISOString();
  const expiresAt = getStoreGeneratedImageExpiresAt(params.generatedAt);

  return {
    url: params.url,
    storagePath: params.storagePath,
    generatedAt: generatedAtIso,
    generatedAtMs: params.generatedAt.getTime(),
    expiresAt: expiresAt.toISOString(),
    expiresAtMs: expiresAt.getTime(),
    productId: normalizeMetadataText(params.productId, 120) ?? params.productId,
    prompt: normalizeMetadataText(params.prompt, 500),
    productName: normalizeMetadataText(params.context.productName, 160),
    model: normalizeMetadataText(params.model, 120),
    side: params.imageSide,
    pageLabel: normalizeMetadataText(params.context.pageLabel, 80),
    sizeLabel: normalizeMetadataText(params.context.sizeLabel, 80),
    aspectRatio: normalizeMetadataText(params.context.aspectRatio, 20),
  };
}

export function getStoreGeneratedImageExpiresAt(generatedAt: Date): Date {
  return new Date(getStoreGeneratedImageExpiresAtMs(generatedAt.getTime()));
}

export function getStoreGeneratedImageExpiresAtMs(
  generatedAtMs: number,
): number {
  return generatedAtMs + GENERATED_IMAGE_RETENTION_MS;
}

function resolveTimestampMs(
  value: Date | number | string | null | undefined,
): number | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function resolveStoreGeneratedImageExpiryMs(params: {
  expiresAt?: Date | number | string | null;
  generatedAt?: Date | number | string | null;
}): number | null {
  const explicitExpiryMs = resolveTimestampMs(params.expiresAt);
  if (explicitExpiryMs !== null) {
    return explicitExpiryMs;
  }

  const generatedAtMs = resolveTimestampMs(params.generatedAt);
  if (generatedAtMs !== null) {
    return getStoreGeneratedImageExpiresAtMs(generatedAtMs);
  }

  return null;
}

export function isStoreGeneratedImageExpired(params: {
  expiresAt?: Date | number | string | null;
  generatedAt?: Date | number | string | null;
  nowMs?: number;
}): boolean {
  const expiryMs = resolveStoreGeneratedImageExpiryMs(params);
  if (expiryMs === null) {
    return false;
  }

  return expiryMs <= (params.nowMs ?? Date.now());
}

function parseFiniteNumber(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  if (typeof value !== "number") {
    return undefined;
  }

  return value > 0 ? value : undefined;
}

function summarizeSelectedAttributes(params: {
  attributes: Attribute[];
  selectedAttributeOptions?: SelectedAttributeOptions;
}): StoreGenerationSelectedAttribute[] {
  const { attributes, selectedAttributeOptions } = params;

  if (!selectedAttributeOptions) {
    return [];
  }

  return attributes.reduce<StoreGenerationSelectedAttribute[]>(
    (accumulator, attribute) => {
      const selectedValue = selectedAttributeOptions[attribute.id];
      if (!selectedValue) {
        return accumulator;
      }

      const selectedOption = attribute.options.find(
        (option) => option.value === selectedValue,
      );

      accumulator.push({
        attributeId: attribute.id,
        attributeName: normalizeWhitespace(attribute.name || attribute.id),
        optionValue: selectedValue,
        optionLabel: normalizeWhitespace(
          selectedOption?.label ?? selectedValue,
        ),
      });

      return accumulator;
    },
    [],
  );
}

function buildCombinationDescription(
  selectedAttributes: StoreGenerationSelectedAttribute[],
) {
  return selectedAttributes.length > 0
    ? selectedAttributes
        .map(
          (selectedAttribute) =>
            `${selectedAttribute.attributeName}: ${selectedAttribute.optionLabel}`,
        )
        .join("; ")
    : undefined;
}

function formatMillimeters(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function toAspectRatioValue(aspectRatio: SupportedAspectRatio): number {
  const [width, height] = aspectRatio.split(":").map(Number);
  return width / height;
}

function findClosestAspectRatio(
  widthMm: number,
  heightMm: number,
): SupportedAspectRatio {
  const targetRatio = widthMm / heightMm;

  return ASPECT_RATIO_OPTIONS.reduce<{
    ratio: SupportedAspectRatio;
    difference: number;
  }>(
    (closest, currentRatio) => {
      const currentDifference = Math.abs(
        toAspectRatioValue(currentRatio) - targetRatio,
      );

      if (currentDifference < closest.difference) {
        return { ratio: currentRatio, difference: currentDifference };
      }

      return closest;
    },
    {
      ratio: "1:1",
      difference: Number.POSITIVE_INFINITY,
    },
  ).ratio;
}

function resolvePageCount(params: {
  product: Product;
  attributes: Attribute[];
  selectedAttributeOptions?: SelectedAttributeOptions;
  requestedPageCount?: number;
}): number | undefined {
  const { product, attributes, selectedAttributeOptions, requestedPageCount } =
    params;

  if (product.pageCount?.enabled) {
    const minimum = product.pageCount.minimum;
    const maximum = product.pageCount.maximum;
    const step = product.pageCount.step;
    const fallback = minimum;
    const candidate = parseFiniteNumber(requestedPageCount) ?? fallback;
    const clamped = Math.min(maximum, Math.max(minimum, candidate));
    const normalized = minimum + Math.round((clamped - minimum) / step) * step;
    return Math.min(maximum, Math.max(minimum, normalized));
  }

  const pagesAttribute = attributes.find(
    (attribute) => attribute.pages === true,
  );
  if (!pagesAttribute) {
    return undefined;
  }

  const selectedValue = selectedAttributeOptions?.[pagesAttribute.id];
  if (!selectedValue) {
    return undefined;
  }

  const selectedOption = pagesAttribute.options.find(
    (option) => option.value === selectedValue,
  );

  return parseFiniteNumber(selectedOption?.pages ?? undefined);
}

function resolveDimensions(params: {
  product: Product;
  attributes: Attribute[];
  selectedAttributeOptions?: SelectedAttributeOptions;
  requestedWidth?: number;
  requestedHeight?: number;
}): { widthMm?: number; heightMm?: number } {
  const {
    product,
    attributes,
    selectedAttributeOptions,
    requestedWidth,
    requestedHeight,
  } = params;

  const width = parseFiniteNumber(requestedWidth);
  const height = parseFiniteNumber(requestedHeight);

  if (product.customSize && width && height) {
    return {
      widthMm: width,
      heightMm: height,
    };
  }

  const formatAttribute = attributes.find(
    (attribute) => attribute.format === true,
  );
  const selectedFormatValue = formatAttribute
    ? selectedAttributeOptions?.[formatAttribute.id]
    : undefined;
  const selectedFormatOption = formatAttribute?.options.find(
    (option) => option.value === selectedFormatValue,
  );

  if (selectedFormatOption?.formatWidth && selectedFormatOption?.formatHeight) {
    return {
      widthMm: selectedFormatOption.formatWidth,
      heightMm: selectedFormatOption.formatHeight,
    };
  }

  if (width && height) {
    return {
      widthMm: width,
      heightMm: height,
    };
  }

  if (product.spec.minimumWidth && product.spec.minimumHeight) {
    return {
      widthMm: product.spec.minimumWidth,
      heightMm: product.spec.minimumHeight,
    };
  }

  return {};
}

export function deriveGenerationContext(params: {
  product: Product;
  attributes: Attribute[];
  selectedAttributeOptions?: SelectedAttributeOptions;
  requestedWidth?: number;
  requestedHeight?: number;
  requestedPageCount?: number;
}): StoreGenerationContext {
  const {
    product,
    attributes,
    selectedAttributeOptions,
    requestedWidth,
    requestedHeight,
  } = params;
  const { widthMm, heightMm } = resolveDimensions({
    product,
    attributes,
    selectedAttributeOptions,
    requestedWidth,
    requestedHeight,
  });
  const pageCount = resolvePageCount({
    product,
    attributes,
    selectedAttributeOptions,
    requestedPageCount: params.requestedPageCount,
  });
  const selectedAttributes = summarizeSelectedAttributes({
    attributes,
    selectedAttributeOptions,
  });
  const combinationDescription =
    buildCombinationDescription(selectedAttributes);
  const aspectRatio =
    widthMm && heightMm ? findClosestAspectRatio(widthMm, heightMm) : undefined;
  const orientation =
    widthMm && heightMm
      ? widthMm === heightMm
        ? "square"
        : widthMm > heightMm
          ? "landscape"
          : "portrait"
      : undefined;

  return {
    productName: product.name,
    productCategory: product.category?.name,
    productType:
      typeof product.productType === "object" && product.productType
        ? product.productType.name
        : undefined,
    productDescription: truncateText(
      normalizeWhitespace(product.description ?? ""),
      220,
    ),
    specialNotes: truncateText(
      normalizeWhitespace(product.specialNotes ?? ""),
      160,
    ),
    pageCount,
    pageLabel:
      pageCount && pageCount > 1
        ? `${pageCount} pages`
        : pageCount === 1
          ? "1 page"
          : undefined,
    widthMm,
    heightMm,
    aspectRatio,
    aspectRatioLabel:
      aspectRatio && orientation
        ? `${aspectRatio} ${orientation}`
        : aspectRatio,
    sizeLabel:
      widthMm && heightMm
        ? `${formatMillimeters(widthMm)} × ${formatMillimeters(heightMm)} mm`
        : undefined,
    isLargeFormat:
      (widthMm !== undefined && widthMm > 500) ||
      (heightMm !== undefined && heightMm > 500),
    selectedAttributes,
    combinationDescription,
    printSideCount: 1,
  };
}

export function buildGenerationPrompt(params: {
  prompt: string;
  context: StoreGenerationContext;
  style?: StoreGenerationStyle;
  language?: string | null;
  promptEnhancement?: string;
  targetSide?: Exclude<StoreGenerationSide, "single">;
}): string {
  const { prompt, context, style, language, promptEnhancement, targetSide } =
    params;
  const promptWithProductGuidance =
    appendProductImageGenerationPromptEnhancement(prompt, promptEnhancement);
  const selectedConfiguration = context.selectedAttributes.length
    ? `Selected configuration: ${context.combinationDescription}.`
    : undefined;
  const printSideInstruction =
    context.printSideCount > 1
      ? targetSide === "back"
        ? "This product is printed on both sides. Generate only the BACK side artwork as its own flat print file. Do not show the front side and do not combine both sides on one canvas."
        : "This product is printed on both sides. Generate only the FRONT side artwork as its own flat print file. Do not show the back side and do not combine both sides on one canvas."
      : "Generate a single flat print-ready artwork for the printable front side only.";
  const promptSections = [
    `Create the final print-ready artwork for ${context.productName}.`,
    `Product: ${context.productName}.`,
    context.productCategory
      ? `Category: ${context.productCategory}.`
      : undefined,
    context.productType ? `Product type: ${context.productType}.` : undefined,
    context.sizeLabel ? `Target size: ${context.sizeLabel}.` : undefined,
    context.aspectRatioLabel
      ? `Aim for an aspect ratio close to ${context.aspectRatioLabel}.`
      : undefined,
    context.pageLabel
      ? `The product has ${context.pageLabel}. Keep the concept suitable for a multi-page printed product when relevant.`
      : undefined,
    selectedConfiguration,
    buildStoreGenerationStylePrompt(style),
    printSideInstruction,
    context.isLargeFormat
      ? "This is a large-format print. Keep the composition bold, readable from distance, and suitable for later upscaling and manual verification before production."
      : undefined,
    "Output only the flat 2D printable design itself. Do not render the physical product, a photographed sheet, a desk, a hand, a wall, packaging, or any other mockup scene.",
    "Do not use perspective, angled product shots, folds, staging, or 3D visualization. The output must be only the artwork surface that will be printed.",
    "Treat the output as final production artwork, not a concept, moodboard, or promotional visualization.",
    "Do not add crop marks, bleed marks, registration marks, measurement labels, printer guides, or watermarks.",
    "Keep proper safe margins near every edge, avoid placing important text or logos too close to the trim, and leave enough background continuity so production can later scale or mirror the edges to add bleed for cutting.",
    context.productDescription
      ? `Product context: ${context.productDescription}`
      : undefined,
    context.specialNotes ? `Special notes: ${context.specialNotes}` : undefined,
    language
      ? `Keep any visible copy in ${language}.`
      : "Keep any visible copy in the same language as the user's brief.",
    "Do not add brand names, phone numbers, websites, email addresses, QR codes, barcodes, personal data, or copyrighted characters unless the user explicitly provided them.",
    `User brief: ${promptWithProductGuidance}`,
  ];

  return promptSections.filter(Boolean).join("\n\n");
}

export const storeImageGenerationLimits = {
  imageModel: "gemini-3.1-flash-image",
  maxPromptWords: MAX_PROMPT_WORDS,
  minPromptWords: MIN_PROMPT_WORDS,
  maxReferenceFiles: MAX_REFERENCE_FILES,
  maxReferenceFileSizeBytes: MAX_REFERENCE_FILE_SIZE_BYTES,
  generatedImageRetentionMs: GENERATED_IMAGE_RETENTION_MS,
  supportedReferenceImageTypes: SUPPORTED_REFERENCE_IMAGE_TYPES,
  rateLimitMaxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
  rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
  monthlyBudgetUsdMicros: MONTHLY_BUDGET_USD_MICROS,
  estimatedGenerationCostUsdMicros: ESTIMATED_GENERATION_COST_USD_MICROS,
} as const;
