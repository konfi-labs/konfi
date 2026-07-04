import "server-only";

import { AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS } from "@/lib/ai/agent-harness";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import {
  normalizeExternalDeliveryTime,
  resolveExternalDeliveryTime,
} from "@/lib/external-products/delivery-time";
import {
  describeConfigurationForLog,
  hasOnlyZeroPrices,
  logStructured,
  summarizeConfiguration,
  summarizePriceInfo,
} from "@/lib/external-products/price-fetch-system-logging";
import {
  buildInitialBlockingAbortMessage,
  type FailedPricingFetchAttempt,
  getBatchPauseDelayMs,
  getBatchRequestDelayMs,
  getSeedDelayMs,
  INITIAL_BLOCKING_FAILURE_LIMIT,
  isLikelyAccessBlockedError,
  mapWithConcurrencyLimit,
  maybeRunWithinWorkflowRuntime,
  shouldLogFetchProgress,
  sleepWithinWorkflowRuntime,
} from "@/lib/external-products/price-fetch-system-runtime";
import {
  buildPricingEndpointCandidates,
  extractQueryParamNames,
  normalizeSelectionKey,
  type PricingEndpointCandidate,
  type PricingEndpointSelection,
  resolveTemplateEndpointCandidate,
  resolveUrlWithProductId,
  resolveUrlWithSampleProductId,
  sanitizePricingSelection,
} from "@/lib/external-products/price-fetch-system-url";
import {
  buildBrowserishRequestHeadersFromProvider,
  buildPricingCombinationRuleSchema,
  getDb,
  getVertexHighPrecisionModel,
  getVertexModel,
  removeUndefinedDeep,
  revalidateCachedTag,
  truncateJsonForPrompt,
} from "@/lib/external-products/price-fetch-system-shared";
import {
  normalizeExternalPriceConfigurationSelection,
  normalizeExternalPriceConfigurations,
} from "@/lib/external-products/price-configuration-normalization";
import { fetchExternalProviderUrl } from "@/lib/external-products/provider-url-policy";
import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";
import {
  getProviderOnlyPricingSelections,
  getVariablePricingAttributes,
} from "@/lib/external-products/provider-pricing";
import {
  OMIT_EXTERNAL_ATTRIBUTE_REQUEST_VALUE,
  resolveExternalRequestValue,
} from "@/lib/external-products/option-mapping-utils";
import {
  buildManualPricingCombinationStrategy,
  getPersistedManualPricingExclusionRules,
  isConfigurationValidForStrategy,
  summarizePricingCombinationStrategy,
  type PricingCombinationRule,
  type PricingCombinationStrategy,
} from "@/lib/external-products/pricing-combination-planner";
import {
  getRangedDimensionAttributeNames,
  inferExternalRangedDimensions,
} from "@/lib/external-products/ranged-dimensions";
import {
  buildPriceConfigurationReuseSignature,
  getReusableStoredPriceConfigurations,
  partitionPriceConfigurationsForReuse,
} from "@/lib/external-products/price-fetch-reuse";
import { resolvePriceFetchCandidateInputs } from "@/lib/external-products/price-fetch-candidate-planning";
import {
  hasDuplicateExternalAttributeNames,
  resolveConfigurationParamsForPricingAttributes,
} from "@/lib/external-products/pricing-selection-resolution";
import {
  deletePendingPriceConfigurations,
  readPriceConfigurations,
  writePendingPriceConfigurations,
  writePriceConfigurations,
} from "@/lib/external-products/price-configuration-storage";
import {
  applyPricingResponseCorrection,
  buildPricingStrategyFromUnavailableResponse,
  buildPricingStrategyFromCorrection,
  deriveDeterministicPricingResponseCorrections,
  extractPricingResponseSignals,
  looksLikeUnavailablePricingResponse,
  mergePricingCombinationStrategies,
  sanitizePricingResponseCorrection,
  sortPricingResponseCorrectionsBySimplicity,
  summarizeUnavailablePricingSignals,
  type PricingResponseCorrection,
} from "@/lib/external-products/pricing-response-analysis";
import {
  createExternalProductPriceFetchWorkflowCancellation,
  isExternalProductPriceFetchWorkflowCancelledError,
  type ExternalProductPriceFetchWorkflowCancellation,
} from "@/lib/external-products/price-fetch-workflow-cancellation";
import {
  assertWithinWorkflowRuntime,
  createWorkflowRuntimeDeadline,
  fetchWithinWorkflowRuntime,
  type WorkflowRuntimeDeadline,
  WorkflowRuntimeLimitError,
} from "@/lib/workflow-runtime-limit";
import { MODELS } from "@konfi/firebase";
import type {
  ExternalAttribute,
  ExternalPriceConfiguration,
  ExternalProduct,
  ExternalProductPriceFetchStrategy,
  ExternalProductPricingSelection,
  ExternalProvider,
  ExternalProviderEndpoint,
  PriceExtractionSchema,
} from "@konfi/types";
import { generateText as aiGenerateText, tool } from "ai";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

const EXTERNAL_PROVIDERS_TAG = "external-providers";
const EXTERNAL_PRODUCTS_TAG = "external-products";
const PRICE_MAX_FRACTION_DIGITS = 3;
const PRICE_FETCH_BATCH_SIZE = 25;
const PRICE_FETCH_BATCH_CONCURRENCY = 3;
const MAX_ADAPTIVE_UNAVAILABLE_RESPONSE_ANALYSES = 3;
const MAX_ADAPTIVE_UNAVAILABLE_CORRECTION_ATTEMPTS = 8;
const MAX_ADAPTIVE_UNAVAILABLE_CORRECTION_DEPTH = 4;
const generateText = createMeteredAdminGenerateText({
  generateText: aiGenerateText,
  model: MODELS.GEMINI_3_PRO,
  provider: "google-vertex",
  source: "external-import",
});

type FetchExternalProductPricesResult = {
  priceConfigurations: ExternalPriceConfiguration[];
  priceConfigurationReuseSignature?: string;
  pricingSelection?: ExternalProductPricingSelection;
  learnedCombinationStrategy?: PricingCombinationStrategy;
};

type FetchFromEndpointResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

type PricingFetchCandidate = {
  url: string;
  configuration: Record<string, string>;
};

type SuccessfulPricingFetchSeed = {
  index: number;
  candidate: PricingFetchCandidate;
  data: unknown;
  learnedCombinationStrategy?: PricingCombinationStrategy;
};

type PricingCombinationPlanningContext = {
  productData?: unknown;
  attributeAvailabilityData?: unknown;
};

function shouldReuseStoredPriceConfigurations(
  fetchStrategy: ExternalProductPriceFetchStrategy = "reuse",
): boolean {
  return fetchStrategy !== "full";
}

function summarizeSchemaExtraction(options: {
  apiData: unknown;
  schema: PriceExtractionSchema;
  priceInfo: ExternalProduct["priceInfo"] | null | undefined;
}): Record<string, unknown> {
  const { apiData, schema, priceInfo } = options;
  const divisor = schema.priceDivisor || 1;
  const schemaSummary = {
    singlePricePath: schema.singlePricePath,
    priceRangesPath: schema.priceRangesPath,
    pricePath: schema.pricePath,
    quantityPath: schema.quantityPath,
    unitPath: schema.unitPath,
    currencyPath: schema.currencyPath,
    deliveryTimePath: schema.deliveryTimePath,
    deliveryTimeFormat: schema.deliveryTimeFormat,
    staticCurrency: schema.staticCurrency,
    priceDivisor: schema.priceDivisor,
    priceIsPerUnit: schema.priceIsPerUnit ?? false,
  };

  if (schema.singlePricePath) {
    const rawPrice = getByPath(apiData, schema.singlePricePath);

    return {
      schema: schemaSummary,
      extracted: summarizePriceInfo(priceInfo),
      rawSinglePrice: rawPrice,
      parsedSinglePrice: parsePrice(rawPrice),
      rawCurrency: schema.currencyPath
        ? getByPath(apiData, schema.currencyPath)
        : undefined,
      rawDeliveryTime: schema.deliveryTimePath
        ? getByPath(apiData, schema.deliveryTimePath)
        : undefined,
    };
  }

  if (schema.priceRangesPath) {
    const rawRanges = getByPath(apiData, schema.priceRangesPath);

    return {
      schema: schemaSummary,
      extracted: summarizePriceInfo(priceInfo),
      rawRangeCount: Array.isArray(rawRanges) ? rawRanges.length : 0,
      rawRangeSamples: Array.isArray(rawRanges)
        ? rawRanges.slice(0, 3).map((range) => {
            const rawPrice = schema.pricePath
              ? getByPath(range, schema.pricePath)
              : undefined;
            const rawQuantity = schema.quantityPath
              ? getByPath(range, schema.quantityPath)
              : undefined;
            const parsedPrice = parsePrice(rawPrice);
            const parsedQuantity = parsePrice(rawQuantity);
            let computedUnitPrice: number | undefined;

            if (parsedPrice !== undefined) {
              if (schema.priceIsPerUnit) {
                computedUnitPrice = clampPriceFractionDigits(
                  parsedPrice / divisor,
                );
              } else if (parsedQuantity !== undefined && parsedQuantity > 0) {
                computedUnitPrice = clampPriceFractionDigits(
                  parsedPrice / divisor / parsedQuantity,
                );
              } else {
                computedUnitPrice = clampPriceFractionDigits(
                  parsedPrice / divisor,
                );
              }
            }

            return {
              rawPrice,
              parsedPrice,
              rawQuantity,
              parsedQuantity,
              computedUnitPrice,
              rawUnit: schema.unitPath
                ? getByPath(range, schema.unitPath)
                : undefined,
              rawDeliveryTime: schema.deliveryTimePath
                ? (getByPath(range, schema.deliveryTimePath) ??
                  getByPath(apiData, schema.deliveryTimePath))
                : undefined,
            };
          })
        : undefined,
    };
  }

  return {
    schema: schemaSummary,
    extracted: summarizePriceInfo(priceInfo),
  };
}

function getConfigurationComplexityScore(
  configuration: Record<string, string>,
): number {
  const values = Object.values(configuration);
  const definedAttributeCount = values.length;
  const nonNeutralValueCount = values.filter(
    (value) => normalizeSelectionKey(value) !== "none",
  ).length;

  return definedAttributeCount * 10 + nonNeutralValueCount;
}

function sortPricingFetchCandidatesByComplexity(
  candidates: PricingFetchCandidate[],
): PricingFetchCandidate[] {
  return [...candidates].toSorted((candidateA, candidateB) => {
    const complexityDiff =
      getConfigurationComplexityScore(candidateA.configuration) -
      getConfigurationComplexityScore(candidateB.configuration);

    if (complexityDiff !== 0) {
      return complexityDiff;
    }

    const summaryDiff = summarizeConfiguration(
      candidateA.configuration,
    ).localeCompare(summarizeConfiguration(candidateB.configuration));

    if (summaryDiff !== 0) {
      return summaryDiff;
    }

    return candidateA.url.localeCompare(candidateB.url);
  });
}

async function selectPricingEndpointWithAI(options: {
  provider: ExternalProvider;
  externalAttributes: ExternalAttribute[];
}): Promise<PricingEndpointSelection | null> {
  const { provider, externalAttributes } = options;
  const candidates = buildPricingEndpointCandidates(provider);

  if (candidates.length === 0) {
    return null;
  }

  const candidatePayload: PricingEndpointCandidate[] = candidates.map(
    (endpoint) => {
      const sampleUrl = resolveUrlWithSampleProductId(
        endpoint.sampleUrl ?? endpoint.url,
        provider.sampleProductId,
      );

      return {
        endpoint,
        sampleUrl: sampleUrl ?? undefined,
        queryParams: extractQueryParamNames(sampleUrl ?? endpoint.url),
      };
    },
  );
  const model = await getVertexHighPrecisionModel();

  const selectionTool = tool({
    description:
      "Select the best pricing/configuration endpoint and map attribute names and values to query parameters.",
    inputSchema: z.object({
      endpointId: z
        .string()
        .optional()
        .describe("ID of the endpoint best suited for pricing"),
      configurationParams: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Map of external attribute name to query parameter name (e.g. { 'Format': 'spiroFormat' })",
        ),
      staticQueryParams: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Static query params required by the endpoint (e.g. currency, lang)",
        ),
      valueMappings: z
        .record(z.string(), z.record(z.string(), z.string()))
        .optional()
        .describe(
          "Map of external attribute name to value mappings (external value -> API value).",
        ),
    }),
    execute: async (data) => data,
  });

  const prompt = `You are selecting the correct endpoint to fetch pricing for a specific product configuration.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

Rules:
- Choose the endpoint that returns pricing or configuration data for a single product/variant.
- Prefer endpoints that accept configuration query parameters and use {productId} placeholders.
- If you see both a TEMPLATE endpoint (no query params, {productId} placeholder) and a SAMPLE endpoint (query params filled), select the TEMPLATE endpointId and use the SAMPLE endpoint only to infer parameter names and value formats.
- Do NOT select the sample endpointId when a template endpoint with the same path exists.
- Provide a configurationParams mapping for ALL external attributes that affect pricing.
- Provide staticQueryParams only when clearly required by the endpoint (e.g. currency, lang).
- NEVER invent parameter names. If a parameter name is not explicitly visible in the candidate URL, sample URL, or endpoint schema description, do not make one up.
- If the chosen endpoint is a template URL with no visible query params, default the configuration param name to the external attribute id exactly as provided below.
- Do not invent names like 'spiroFormat', 'spiroColor', or 'spiroShipping' unless those exact names appear in the candidate data.
- IMPORTANT: Provide valueMappings to convert external attribute values to the API's expected values.
- Some extracted attribute values may be synthetic empty-branch placeholders such as "konfiSyntheticEmptyBranch_standardowy".
- If selecting a synthetic empty branch means the provider omits that query param entirely, set its valueMappings target to "${OMIT_EXTERNAL_ATTRIBUTE_REQUEST_VALUE}".
- If you can infer the hidden real API value for a synthetic empty branch, map it to that exact provider value instead.
- Output MUST use plain strings (no extra quotes inside strings).
- Use external attribute names EXACTLY as provided below.

External attributes (name, sample values):
${JSON.stringify(
  externalAttributes.map((attr) => ({
    id: attr.id,
    name: attr.name,
    values: attr.values,
    numberConfig: attr.numberConfig,
    affectsPricing: attr.affectsPricing,
  })),
  null,
  2,
)}

Endpoint candidates:
${JSON.stringify(
  candidatePayload.map((candidate) => ({
    id: candidate.endpoint.id,
    name: candidate.endpoint.name,
    url: candidate.endpoint.url,
    sampleUrl: candidate.sampleUrl,
    description: candidate.endpoint.description,
    queryParams: candidate.queryParams,
    schemaDescription: candidate.endpoint.schema?.description,
  })),
  null,
  2,
)}

Call the selection tool with your choice. Include valueMappings for all attributes that need value conversion.`;

  try {
    const result = await generateText({
      model,
      prompt,
      toolChoice: { type: "tool", toolName: "selectPricingEndpoint" },
      tools: { selectPricingEndpoint: selectionTool },
      temperature: 0.1,
    });

    const toolCall = result.toolCalls.find(
      (call) => !call.dynamic && call.toolName === "selectPricingEndpoint",
    );

    if (!toolCall || toolCall.dynamic) {
      return null;
    }

    const selection = toolCall.input as PricingEndpointSelection;
    const sanitizedSelection = sanitizePricingSelection(
      selection,
      externalAttributes,
    );
    if (!sanitizedSelection.endpointId) {
      return null;
    }

    return sanitizedSelection;
  } catch (error) {
    console.error("Error selecting pricing endpoint:", error);
    return null;
  }
}

function resolveAttributeAvailabilityUrl(options: {
  provider: ExternalProvider;
  sourceUrl: string;
}): string | null {
  const { provider, sourceUrl } = options;
  const endpoint = provider.attributeAvailabilityEndpoint?.trim();

  if (!endpoint) {
    return null;
  }

  if (!endpoint.includes("{productId}")) {
    return endpoint;
  }

  const productId = extractProductIdFromUrl(sourceUrl, provider);

  return productId ? endpoint.replace("{productId}", productId) : null;
}

async function fetchPricingCombinationPlanningContext(options: {
  provider: ExternalProvider;
  requestHeaders: Record<string, string>;
  sourceUrl: string;
  runtimeDeadline?: WorkflowRuntimeDeadline;
  cancellation?: ExternalProductPriceFetchWorkflowCancellation;
}): Promise<PricingCombinationPlanningContext> {
  const { provider, requestHeaders, runtimeDeadline, sourceUrl, cancellation } =
    options;
  const context: PricingCombinationPlanningContext = {};

  const productFetchUrl = sourceUrl.trim();
  const availabilityFetchUrl = resolveAttributeAvailabilityUrl({
    provider,
    sourceUrl,
  });

  const [productFetchResult, availabilityFetchResult] = await Promise.all([
    productFetchUrl
      ? fetchFromEndpoint(
          productFetchUrl,
          requestHeaders,
          runtimeDeadline,
          "fetching pricing combination planning product data",
          cancellation,
        )
      : null,
    availabilityFetchUrl
      ? fetchFromEndpoint(
          availabilityFetchUrl,
          requestHeaders,
          runtimeDeadline,
          "fetching pricing combination planning availability data",
          cancellation,
        )
      : null,
  ]);

  if (productFetchResult?.success && productFetchResult.data) {
    context.productData = productFetchResult.data;
  }

  if (availabilityFetchResult?.success && availabilityFetchResult.data) {
    context.attributeAvailabilityData = availabilityFetchResult.data;
  }

  return context;
}

async function learnPricingCombinationStrategy(options: {
  externalAttributes: ExternalAttribute[];
  fixedSelections: Record<string, string>;
  planningContext: PricingCombinationPlanningContext;
  sourceUrl: string;
}): Promise<PricingCombinationStrategy | null> {
  const { externalAttributes, fixedSelections, planningContext, sourceUrl } =
    options;

  if (
    !planningContext.productData &&
    !planningContext.attributeAvailabilityData
  ) {
    return null;
  }

  const model = await getVertexHighPrecisionModel();

  const strategyTool = tool({
    description:
      "Infer conservative pricing combination rules from provider configuration payloads.",
    inputSchema: z.object({
      rules: z
        .array(
          z.object({
            when: z
              .record(z.string(), z.string())
              .optional()
              .describe(
                "Exact external attribute conditions that activate the rule.",
              ),
            omitAttributes: z
              .array(z.string())
              .optional()
              .describe(
                "Attributes that must be omitted from the pricing request when the rule matches.",
              ),
            requiredAttributes: z
              .array(z.string())
              .optional()
              .describe(
                "Attributes that must be present in the pricing request when the rule matches.",
              ),
            allowedValues: z
              .record(z.string(), z.array(z.string()))
              .optional()
              .describe(
                "Exact allowed external values for affected attributes when the rule matches.",
              ),
            reason: z
              .string()
              .optional()
              .describe("Brief explanation grounded in the payload."),
          }),
        )
        .optional(),
    }),
    execute: async (data) => data,
  });

  const prompt = `You are optimizing external provider price fetching by pruning impossible product configurations.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

Your job is to produce ONLY conservative rules that are directly supported by the payloads.

Rules for your output:
- Use external attribute names EXACTLY as listed below in the rule keys.
- Use external attribute values EXACTLY as listed below.
- NEVER invent sizes, pricing values, "none", defaults, or pseudo-values.
- Use omitAttributes ONLY when the payload shows the entire attribute is unavailable for that condition.
- If the attribute remains available but only some values are valid, use allowedValues instead of omitAttributes.
- If an attribute must be present, put it in requiredAttributes.
- If only a subset of values is valid, use allowedValues.
- Prefer rules keyed by controlling attributes like size/format/paper so the fetcher can prune early.
- If the payloads are ambiguous, return an empty rules array.

Relevant external attributes:
${JSON.stringify(
  externalAttributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    values: attribute.values,
    numberConfig: attribute.numberConfig,
    affectsPricing: attribute.affectsPricing,
  })),
  null,
  2,
)}

Fixed selections already applied to every request:
${JSON.stringify(fixedSelections, null, 2)}

Product payload from ${sourceUrl}:
${truncateJsonForPrompt(planningContext.productData ?? null)}

Attribute availability payload:
${truncateJsonForPrompt(planningContext.attributeAvailabilityData ?? null)}

Call the strategy tool with only the rules that are clearly justified by the payload.`;

  try {
    const result = await generateText({
      model,
      prompt,
      toolChoice: {
        type: "tool",
        toolName: "definePricingCombinationStrategy",
      },
      tools: { definePricingCombinationStrategy: strategyTool },
      temperature: 0.1,
    });

    const toolCall = result.toolCalls.find(
      (call) =>
        !call.dynamic && call.toolName === "definePricingCombinationStrategy",
    );

    if (!toolCall || toolCall.dynamic) {
      return null;
    }

    const strategy = toolCall.input as { rules?: PricingCombinationRule[] };

    return strategy.rules?.length ? { rules: strategy.rules } : null;
  } catch (error) {
    console.error("Error learning pricing combination strategy:", error);
    return null;
  }
}

async function analyzeUnavailablePricingResponseWithAI(options: {
  currentConfiguration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
  responseData: unknown;
  url: string;
}): Promise<{
  corrections: PricingResponseCorrection[];
  learnedCombinationStrategy?: PricingCombinationStrategy;
} | null> {
  const { currentConfiguration, externalAttributes, responseData, url } =
    options;
  const responseSignals = extractPricingResponseSignals(responseData);

  if (!looksLikeUnavailablePricingResponse(responseData)) {
    return null;
  }

  const model = await getVertexHighPrecisionModel();
  const combinationRuleSchema = buildPricingCombinationRuleSchema();
  const correctionTool = tool({
    description:
      "Propose minimal corrections for an unavailable pricing configuration and optionally infer conservative future pruning rules.",
    inputSchema: z.object({
      corrections: z
        .array(
          z.object({
            omitAttributes: z.array(z.string()).optional(),
            reason: z.string().optional(),
            setValues: z.record(z.string(), z.string()).optional(),
          }),
        )
        .max(3)
        .optional(),
      strategy: z
        .object({
          rules: z.array(combinationRuleSchema).optional(),
        })
        .optional(),
    }),
    execute: async (data) => data,
  });

  const prompt = `You are fixing an unavailable provider pricing request.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

The request returned an explicit unavailable / empty-price response. Your job is to suggest MINIMAL corrections to the configuration.

Rules:
- Use external attribute names EXACTLY as listed below.
- Use external attribute values EXACTLY as listed below.
- NEVER invent values, defaults, sizes, or pricing tiers.
- You may either change an attribute to another EXISTING value or omit an attribute from the request.
- Keep unrelated attributes unchanged.
- Prefer minimal changes.
- If the response only excludes the currently selected value, prefer switching to another valid value over omitting the entire attribute.
- If the response strongly suggests a reusable pruning rule, return a conservative strategy too.
- If the response is ambiguous, return an empty corrections array.

Current request URL:
${url}

Current configuration:
${JSON.stringify(currentConfiguration, null, 2)}

External attributes:
${JSON.stringify(
  externalAttributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    values: attribute.values,
    numberConfig: attribute.numberConfig,
    affectsPricing: attribute.affectsPricing,
  })),
  null,
  2,
)}

Unavailable response signals:
${JSON.stringify(responseSignals, null, 2)}

Unavailable response payload:
${truncateJsonForPrompt(responseData)}

Call the correction tool with up to 3 candidate corrections ordered best-first.`;

  try {
    const result = await generateText({
      model,
      prompt,
      toolChoice: {
        type: "tool",
        toolName: "correctUnavailablePricingResponse",
      },
      tools: { correctUnavailablePricingResponse: correctionTool },
      temperature: 0.1,
    });

    const toolCall = result.toolCalls.find(
      (call) =>
        !call.dynamic && call.toolName === "correctUnavailablePricingResponse",
    );

    if (!toolCall || toolCall.dynamic) {
      return null;
    }

    const rawResult = toolCall.input as {
      corrections?: PricingResponseCorrection[];
      strategy?: { rules?: PricingCombinationRule[] };
    };
    const corrections = (rawResult.corrections ?? [])
      .map((correction) =>
        sanitizePricingResponseCorrection({
          correction,
          currentConfiguration,
          externalAttributes,
        }),
      )
      .filter((correction): correction is PricingResponseCorrection =>
        Boolean(correction),
      );

    return {
      corrections,
      learnedCombinationStrategy: rawResult.strategy?.rules?.length
        ? { rules: rawResult.strategy.rules }
        : undefined,
    };
  } catch (error) {
    console.error("Error analyzing unavailable pricing response:", error);
    return null;
  }
}

async function tryAdaptiveUnavailablePricingCorrection(options: {
  candidate: PricingFetchCandidate;
  combinationStrategy?: PricingCombinationStrategy;
  endpoint: ExternalProviderEndpoint;
  externalAttributes: ExternalAttribute[];
  fixedProviderPricingSelections: Record<string, string>;
  productId?: string;
  requestHeaders: Record<string, string>;
  responseData: unknown;
  sampleProductId?: string;
  staticQueryParams?: Record<string, string>;
  valueMappings?: Record<string, Record<string, string>>;
  configurationParams?: Record<string, string>;
  runtimeDeadline?: WorkflowRuntimeDeadline;
  cancellation?: ExternalProductPriceFetchWorkflowCancellation;
}): Promise<{
  candidate: PricingFetchCandidate;
  data: unknown;
  learnedCombinationStrategy?: PricingCombinationStrategy;
  correctionFailed?: boolean;
} | null> {
  const {
    candidate,
    combinationStrategy,
    endpoint,
    externalAttributes,
    fixedProviderPricingSelections,
    productId,
    requestHeaders,
    responseData,
    sampleProductId,
    staticQueryParams,
    valueMappings,
    configurationParams,
    runtimeDeadline,
    cancellation,
  } = options;

  const originalConfiguration = candidate.configuration;
  const visitedConfigurationKeys = new Set<string>([
    JSON.stringify(originalConfiguration),
  ]);
  const signalStrategy = buildPricingStrategyFromUnavailableResponse({
    currentConfiguration: originalConfiguration,
    externalAttributes,
    responseData,
  });
  const learnedStrategies: PricingCombinationStrategy[] = signalStrategy?.rules
    ?.length
    ? [signalStrategy]
    : [];
  const queue: Array<{
    candidate: PricingFetchCandidate;
    depth: number;
    responseData: unknown;
  }> = [{ candidate, depth: 0, responseData }];
  let correctionAttemptCount = 0;
  let aiAnalysisUsed = false;

  while (
    queue.length > 0 &&
    correctionAttemptCount < MAX_ADAPTIVE_UNAVAILABLE_CORRECTION_ATTEMPTS
  ) {
    await cancellation?.throwIfCancelled(
      "correcting unavailable pricing responses",
    );

    if (runtimeDeadline) {
      assertWithinWorkflowRuntime(
        runtimeDeadline,
        "correcting unavailable pricing responses",
      );
    }

    queue.sort(
      (queueItemA, queueItemB) =>
        getConfigurationComplexityScore(queueItemA.candidate.configuration) -
        getConfigurationComplexityScore(queueItemB.candidate.configuration),
    );

    const currentItem = queue.shift();

    if (!currentItem) {
      break;
    }

    const deterministicCorrections = sortPricingResponseCorrectionsBySimplicity(
      {
        corrections: deriveDeterministicPricingResponseCorrections({
          currentConfiguration: currentItem.candidate.configuration,
          externalAttributes,
          responseData: currentItem.responseData,
        }),
        currentConfiguration: currentItem.candidate.configuration,
      },
    );

    let aiCorrections: PricingResponseCorrection[] = [];

    if (deterministicCorrections.length === 0 && !aiAnalysisUsed) {
      const analysis = await maybeRunWithinWorkflowRuntime(
        runtimeDeadline,
        "analyzing unavailable pricing responses",
        () =>
          analyzeUnavailablePricingResponseWithAI({
            currentConfiguration: currentItem.candidate.configuration,
            externalAttributes,
            responseData: currentItem.responseData,
            url: currentItem.candidate.url,
          }),
        cancellation,
      );

      aiAnalysisUsed = true;

      if (analysis?.learnedCombinationStrategy?.rules?.length) {
        learnedStrategies.push(analysis.learnedCombinationStrategy);
      }

      aiCorrections = sortPricingResponseCorrectionsBySimplicity({
        corrections: analysis?.corrections ?? [],
        currentConfiguration: currentItem.candidate.configuration,
      });
    }

    const orderedCorrections = [...deterministicCorrections, ...aiCorrections];

    for (const correction of orderedCorrections) {
      if (
        correctionAttemptCount >= MAX_ADAPTIVE_UNAVAILABLE_CORRECTION_ATTEMPTS
      ) {
        break;
      }

      const correctedConfiguration = applyPricingResponseCorrection(
        currentItem.candidate.configuration,
        correction,
      );
      const correctedConfigurationKey = JSON.stringify(correctedConfiguration);

      if (visitedConfigurationKeys.has(correctedConfigurationKey)) {
        continue;
      }

      if (
        !isConfigurationValidForStrategy({
          configuration: correctedConfiguration,
          externalAttributes,
          fixedSelections: fixedProviderPricingSelections,
          strategy: combinationStrategy,
        })
      ) {
        continue;
      }

      const correctedUrl = buildPricingUrl({
        endpoint,
        productId,
        sampleProductId,
        configuration: correctedConfiguration,
        fixedConfiguration: fixedProviderPricingSelections,
        configurationParams,
        staticQueryParams,
        valueMappings,
      });

      if (!correctedUrl) {
        continue;
      }

      visitedConfigurationKeys.add(correctedConfigurationKey);
      correctionAttemptCount += 1;

      console.log(
        "[fetchPriceConfigurations] Retrying unavailable pricing response with correction chain",
        {
          rootConfiguration: originalConfiguration,
          currentConfiguration: currentItem.candidate.configuration,
          correctedConfiguration,
          originalUrl: currentItem.candidate.url,
          correctedUrl,
          correctionAttempt: correctionAttemptCount,
          correctionDepth: currentItem.depth + 1,
          correctionReason: correction.reason,
        },
      );

      const correctedFetchResult = await fetchFromEndpoint(
        correctedUrl,
        requestHeaders,
        runtimeDeadline,
        "fetching corrected pricing configuration",
        cancellation,
      );

      if (!correctedFetchResult.success || !correctedFetchResult.data) {
        continue;
      }

      if (!looksLikeUnavailablePricingResponse(correctedFetchResult.data)) {
        return {
          candidate: {
            configuration: correctedConfiguration,
            url: correctedUrl,
          },
          data: correctedFetchResult.data,
          learnedCombinationStrategy: mergePricingCombinationStrategies(
            ...learnedStrategies,
            buildPricingStrategyFromCorrection({
              correctedConfiguration,
              externalAttributes,
              originalConfiguration,
            }),
          ),
        };
      }

      if (currentItem.depth + 1 >= MAX_ADAPTIVE_UNAVAILABLE_CORRECTION_DEPTH) {
        continue;
      }

      queue.push({
        candidate: {
          configuration: correctedConfiguration,
          url: correctedUrl,
        },
        depth: currentItem.depth + 1,
        responseData: correctedFetchResult.data,
      });

      console.log(
        "[fetchPriceConfigurations] Queued a simpler unavailable pricing configuration for another correction step",
        {
          correctedConfiguration,
          correctionDepth: currentItem.depth + 1,
          queuedCandidateCount: queue.length,
        },
      );
    }
  }

  // All corrections exhausted. If AI analysis hasn't been used yet
  // (because deterministic corrections were always found first), run it
  // now to at least learn strategy rules for pruning future candidates.
  if (!aiAnalysisUsed) {
    const analysis = await maybeRunWithinWorkflowRuntime(
      runtimeDeadline,
      "analyzing unavailable pricing responses (fallback)",
      () =>
        analyzeUnavailablePricingResponseWithAI({
          currentConfiguration: candidate.configuration,
          externalAttributes,
          responseData,
          url: candidate.url,
        }),
      cancellation,
    );

    if (analysis?.learnedCombinationStrategy?.rules?.length) {
      learnedStrategies.push(analysis.learnedCombinationStrategy);
    }
  }

  // No correction succeeded, but if strategies were learned from AI analysis,
  // return them so they can prune future candidates.
  if (learnedStrategies.length > 0) {
    const mergedLearned = mergePricingCombinationStrategies(
      ...learnedStrategies,
    );
    if (mergedLearned?.rules?.length) {
      return {
        candidate,
        data: responseData,
        learnedCombinationStrategy: mergedLearned,
        correctionFailed: true,
      };
    }
  }

  return null;
}

function buildPricingUrl(options: {
  endpoint: ExternalProviderEndpoint;
  productId?: string;
  sampleProductId?: string;
  configuration: Record<string, string>;
  fixedConfiguration?: Record<string, string>;
  configurationParams?: Record<string, string>;
  staticQueryParams?: Record<string, string>;
  valueMappings?: Record<string, Record<string, string>>;
}): string | null {
  const {
    endpoint,
    productId,
    sampleProductId,
    configuration,
    fixedConfiguration,
    configurationParams,
    staticQueryParams,
    valueMappings,
  } = options;

  const baseUrl =
    resolveUrlWithProductId(endpoint.url, productId) ??
    (endpoint.sampleUrl
      ? resolveUrlWithSampleProductId(endpoint.sampleUrl, sampleProductId)
      : resolveUrlWithSampleProductId(endpoint.url, sampleProductId));

  if (!baseUrl) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }

  if (staticQueryParams) {
    Object.entries(staticQueryParams).forEach(([key, value]) => {
      if (typeof value === "string" && value.length > 0) {
        parsed.searchParams.set(key, value);
      }
    });
  }

  if (configurationParams) {
    const resolvedConfiguration = {
      ...fixedConfiguration,
      ...configuration,
    };
    let hasUnresolvedSyntheticValue = false;

    Object.entries(configurationParams).forEach(
      ([attributeName, paramName]) => {
        const rawValue = resolvedConfiguration[attributeName];
        if (!rawValue || !paramName) {
          return;
        }

        const attrValueMappings = valueMappings?.[attributeName];
        const mappedValue = attrValueMappings?.[rawValue];
        const resolvedRequestValue = resolveExternalRequestValue({
          rawValue,
          mappedValue,
        });

        if (resolvedRequestValue.type === "unresolved") {
          hasUnresolvedSyntheticValue = true;
          return;
        }

        if (resolvedRequestValue.type === "omit") {
          return;
        }

        parsed.searchParams.set(paramName, resolvedRequestValue.value);
      },
    );

    if (hasUnresolvedSyntheticValue) {
      return null;
    }
  }

  return parsed.toString();
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== "object" || obj === null) {
    return undefined;
  }

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

async function learnPriceSchema(
  apiData: unknown,
  url: string,
  schemaHint?: ExternalProviderEndpoint["schema"],
): Promise<PriceExtractionSchema | null> {
  const model = await getVertexModel();

  const schemaTool = tool({
    description:
      "Define the JSON paths to extract pricing data from API responses",
    inputSchema: z.object({
      currencyPath: z.string().optional(),
      staticCurrency: z.string().optional(),
      priceRangesPath: z.string().optional(),
      quantityPath: z.string().optional(),
      pricePath: z.string().optional(),
      priceIsPerUnit: z
        .boolean()
        .optional()
        .describe(
          "Set to true when pricePath points to a per-unit price (price for a single item). " +
            "Leave false/omitted when pricePath points to a total price for the whole quantity.",
        ),
      deliveryTimeFormat: z
        .enum([
          "days",
          "hours",
          "date-string",
          "unix-seconds",
          "unix-milliseconds",
        ])
        .optional()
        .describe(
          "How to interpret the raw delivery field before converting it into days. " +
            "Use 'date-string' for ISO/date text like estimatedShipmentAt, 'unix-seconds' or 'unix-milliseconds' for timestamps, 'hours' for hour counts, and 'days' for day counts.",
        ),
      unitPath: z.string().optional(),
      deliveryTimePath: z.string().optional(),
      singlePricePath: z.string().optional(),
      priceDivisor: z.number().optional(),
    }),
    execute: async (data) => data,
  });

  const schemaHintContext = schemaHint
    ? `\n\nPROVIDER RESPONSE SCHEMA HINT:
Description: ${schemaHint.description || "N/A"}
Example: ${JSON.stringify(schemaHint.example || {}, null, 2)}

Use the schema hint to identify delivery-related fields even when they are represented as absolute dates or timestamps rather than day counts.`
    : "";

  const prompt = `Analyze this API response and identify the JSON paths where pricing data is located.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

URL: ${url}

API Response:
${JSON.stringify(apiData, null, 2)}${schemaHintContext}

Find:
1. Where is the currency located?
2. Is there an array of price ranges/tiers? What's the path?
3. Within each price range, what are the paths to quantity, price, and delivery/lead time?
4. CRITICAL: Is the price at the identified path a TOTAL price for the whole quantity, or a PER-UNIT price (price for a single item)?
   - If the price is PER-UNIT (e.g., "price_per_unit", "unit_price", or the value is clearly a small per-unit amount), set priceIsPerUnit to true.
   - If the price is a TOTAL price for the quantity tier, leave priceIsPerUnit as false or omit it.
   - Look at field names and values to determine this. For example, if quantity=1000 and price=0.50, the price is likely per-unit.
5. If delivery/lead time is shared for all tiers, what path contains it?
6. If the delivery field is not already a day count, set deliveryTimeFormat:
   - "days" for raw day counts like 3, "3 dni", "5 business days"
   - "hours" for raw hour counts like 24 or "48h"
   - "date-string" for ISO/date text like "2026-04-15T00:00:00Z" or "2026-04-15"
   - "unix-seconds" or "unix-milliseconds" for timestamps
   - For fields like estimatedShipmentAt, estimatedDispatchAt, or other delivery date fields, still set deliveryTimePath and choose the correct deliveryTimeFormat so the extractor can convert it into delivery days.
7. If prices are in cents/groszy, what divisor should be used?
8. If there's just a single price, what's the path?

Call the schema tool with the extraction paths.`;

  try {
    const { toolCalls } = await generateText({
      model,
      prompt,
      toolChoice: { type: "tool", toolName: "defineSchema" },
      tools: { defineSchema: schemaTool },
      temperature: 0.1,
    });

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "defineSchema",
    );

    if (!toolCall || toolCall.dynamic) {
      return null;
    }

    return toolCall.input as PriceExtractionSchema;
  } catch (error) {
    console.error("Error learning price schema:", error);
    return null;
  }
}

function parsePrice(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function clampPriceFractionDigits(value: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** PRICE_MAX_FRACTION_DIGITS;
  return Math.trunc(value * factor) / factor;
}

function extractPriceWithSchema(
  apiData: unknown,
  schema: PriceExtractionSchema,
): ExternalProduct["priceInfo"] | null {
  let currency =
    schema.staticCurrency ||
    (schema.currencyPath
      ? String(getByPath(apiData, schema.currencyPath) || "")
      : undefined);

  const divisor = schema.priceDivisor || 1;

  if (schema.singlePricePath) {
    const rawPrice = getByPath(apiData, schema.singlePricePath);
    const parsedPrice = parsePrice(rawPrice);
    const price =
      parsedPrice !== undefined
        ? clampPriceFractionDigits(parsedPrice / divisor)
        : undefined;
    const deliveryTime = schema.deliveryTimePath
      ? resolveExternalDeliveryTime(
          getByPath(apiData, schema.deliveryTimePath),
          {
            format: schema.deliveryTimeFormat,
          },
        )
      : undefined;

    return {
      currency,
      priceRanges:
        price !== undefined
          ? [
              {
                price,
                ...(deliveryTime !== undefined ? { deliveryTime } : {}),
              },
            ]
          : undefined,
    };
  }

  if (schema.priceRangesPath) {
    const ranges = getByPath(apiData, schema.priceRangesPath);

    if (Array.isArray(ranges)) {
      const priceRanges = ranges
        .map((range) => {
          const rawPrice = schema.pricePath
            ? getByPath(range, schema.pricePath)
            : undefined;
          const rawQuantity = schema.quantityPath
            ? getByPath(range, schema.quantityPath)
            : undefined;
          const unit = schema.unitPath
            ? String(getByPath(range, schema.unitPath) || "")
            : undefined;
          const rawDeliveryTime = schema.deliveryTimePath
            ? (getByPath(range, schema.deliveryTimePath) ??
              getByPath(apiData, schema.deliveryTimePath))
            : undefined;

          if (!currency && !schema.staticCurrency && schema.currencyPath) {
            const rangeCurrency = String(
              getByPath(range, schema.currencyPath) || "",
            );
            if (rangeCurrency) {
              currency = rangeCurrency;
            }
          }

          const parsedPrice = parsePrice(rawPrice);
          const parsedQuantity = parsePrice(rawQuantity);
          const deliveryTime = resolveExternalDeliveryTime(rawDeliveryTime, {
            format: schema.deliveryTimeFormat,
          });

          let perUnitPrice: number = Number.NaN;
          if (parsedPrice !== undefined) {
            if (schema.priceIsPerUnit) {
              // Price is already per-unit; only apply divisor (e.g. cents → major)
              perUnitPrice = parsedPrice / divisor;
            } else if (parsedQuantity !== undefined && parsedQuantity > 0) {
              // Price is total for the whole quantity
              perUnitPrice = parsedPrice / divisor / parsedQuantity;
            } else {
              perUnitPrice = parsedPrice / divisor;
            }
          }

          perUnitPrice = clampPriceFractionDigits(perUnitPrice);

          const result: {
            deliveryTime?: number;
            price: number;
            quantity?: number;
            unit?: string;
          } = {
            price: perUnitPrice,
          };
          if (parsedQuantity !== undefined) result.quantity = parsedQuantity;
          if (unit) result.unit = unit;
          if (deliveryTime !== undefined) result.deliveryTime = deliveryTime;

          return result;
        })
        .filter((range) => !Number.isNaN(range.price));

      if (priceRanges.length > 0) {
        return { currency, priceRanges };
      }
    }
  }

  return null;
}

async function extractPriceInfoFromAPI(
  apiData: unknown,
  url: string,
  schemaHint?: ExternalProviderEndpoint["schema"],
): Promise<ExternalProduct["priceInfo"] | null> {
  const model = await getVertexModel();

  const priceTool = tool({
    description: "Extract pricing information from API response",
    inputSchema: z.object({
      priceInfo: z.object({
        currency: z.string().optional(),
        priceText: z.string().optional(),
        priceRanges: z
          .array(
            z.object({
              quantity: z.number().optional(),
              totalPrice: z.number().optional(),
              deliveryTime: z.union([z.number(), z.string()]).optional(),
              unit: z.string().optional(),
            }),
          )
          .optional(),
      }),
    }),
    execute: async (data) => data,
  });

  const schemaHintContext = schemaHint
    ? `\n\nPROVIDER RESPONSE SCHEMA HINT:
Description: ${schemaHint.description || "N/A"}
Example: ${JSON.stringify(schemaHint.example || {}, null, 2)}

Use the schema hint to identify delivery-related fields such as estimatedShipmentAt even when they are represented as absolute dates or timestamps.`
    : "";

  const prompt = `Extract pricing data from the following API response.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

URL: ${url}

Rules:
- Extract currency if present.
- Extract price ranges with quantity and the TOTAL price for that quantity.
- Extract delivery/lead time when present.
- Delivery times must be returned in days, rounded up to whole days.
- If one delivery time applies to all tiers, repeat it on each returned range.
- If the source exposes an absolute date or timestamp such as estimatedShipmentAt, convert it into delivery days when possible. If conversion is uncertain, return the raw date/timestamp value and the system will normalize it.
- IMPORTANT: Extract the raw total price from the API, not per-unit price.
- If multiple ranges exist, include them all.
- If only a single price is available, return one range with quantity when possible.

API Response:
${JSON.stringify(apiData, null, 2)}${schemaHintContext}

Call the price tool with the priceInfo object.`;

  try {
    const { toolCalls } = await generateText({
      model,
      prompt,
      toolChoice: { type: "tool", toolName: "extractPrice" },
      tools: { extractPrice: priceTool },
      temperature: 0.1,
    });

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "extractPrice",
    );

    if (!toolCall || toolCall.dynamic) {
      return null;
    }

    const data = toolCall.input as {
      priceInfo: {
        currency?: string;
        priceText?: string;
        priceRanges?: Array<{
          deliveryTime?: number | string;
          quantity?: number;
          totalPrice?: number;
          unit?: string;
        }>;
      };
    };

    const priceRanges = data.priceInfo.priceRanges
      ?.map((range) => {
        const deliveryTime = resolveExternalDeliveryTime(range.deliveryTime);
        const result: {
          deliveryTime?: number;
          price?: number;
          quantity?: number;
          unit?: string;
        } = {};

        if (
          range.totalPrice !== undefined &&
          range.quantity !== undefined &&
          range.quantity > 0
        ) {
          result.price = clampPriceFractionDigits(
            range.totalPrice / range.quantity,
          );
          result.quantity = range.quantity;
        } else if (range.totalPrice !== undefined) {
          result.price = clampPriceFractionDigits(range.totalPrice);
        }

        if (range.unit) result.unit = range.unit;
        if (deliveryTime !== undefined) result.deliveryTime = deliveryTime;

        return result;
      })
      .filter(
        (
          range,
        ): range is {
          deliveryTime?: number;
          price: number;
          quantity?: number;
          unit?: string;
        } => range.price !== undefined,
      );

    return {
      currency: data.priceInfo.currency,
      priceText: data.priceInfo.priceText,
      priceRanges,
    };
  } catch (error) {
    console.error("Error extracting price info:", error);
    return null;
  }
}

async function findFirstSuccessfulPricingFetch(options: {
  candidates: PricingFetchCandidate[];
  configurationParams?: Record<string, string>;
  currentCombinationStrategy?: PricingCombinationStrategy;
  endpoint: ExternalProviderEndpoint;
  externalAttributes: ExternalAttribute[];
  fixedProviderPricingSelections: Record<string, string>;
  productId?: string;
  requestHeaders: Record<string, string>;
  sampleProductId?: string;
  staticQueryParams?: Record<string, string>;
  valueMappings?: Record<string, Record<string, string>>;
  runtimeDeadline?: WorkflowRuntimeDeadline;
  cancellation?: ExternalProductPriceFetchWorkflowCancellation;
}): Promise<SuccessfulPricingFetchSeed | null> {
  const {
    candidates,
    configurationParams,
    currentCombinationStrategy,
    endpoint,
    externalAttributes,
    fixedProviderPricingSelections,
    productId,
    requestHeaders,
    runtimeDeadline,
    sampleProductId,
    staticQueryParams,
    valueMappings,
    cancellation,
  } = options;
  const failedAttempts: FailedPricingFetchAttempt[] = [];
  let remainingAdaptiveUnavailableResponseAnalyses =
    MAX_ADAPTIVE_UNAVAILABLE_RESPONSE_ANALYSES;
  const processedConfigurationKeys = new Set<string>();
  let runtimeCombinationStrategy = currentCombinationStrategy;
  let runtimeCandidates = candidates;
  let attemptCount = 0;
  const pruneRuntimeCandidates = (strategy?: PricingCombinationStrategy) => {
    if (!strategy?.rules?.length) {
      return;
    }

    const previousCandidateCount = runtimeCandidates.length;
    runtimeCandidates = runtimeCandidates.filter((item) => {
      const configurationKey = JSON.stringify(item.configuration);

      if (processedConfigurationKeys.has(configurationKey)) {
        return false;
      }

      return isConfigurationValidForStrategy({
        configuration: item.configuration,
        externalAttributes,
        fixedSelections: fixedProviderPricingSelections,
        strategy,
      });
    });

    const prunedCandidateCount =
      previousCandidateCount - runtimeCandidates.length;

    if (prunedCandidateCount > 0) {
      logStructured(
        "log",
        "[fetchPriceConfigurations] Pruned remaining seed candidates from provider availability signals",
        {
          previousCandidateCount,
          nextCandidateCount: runtimeCandidates.length,
          prunedCandidateCount,
          strategySummary: summarizePricingCombinationStrategy(strategy),
        },
      );
    }
  };

  console.log(
    "[fetchPriceConfigurations] Searching for first successful price response",
    {
      totalCandidates: runtimeCandidates.length,
    },
  );

  while (true) {
    await cancellation?.throwIfCancelled(
      "searching for a successful external price response",
    );

    const candidate = runtimeCandidates.find(
      (item) =>
        !processedConfigurationKeys.has(JSON.stringify(item.configuration)),
    );

    if (!candidate) {
      break;
    }

    const index = attemptCount;
    attemptCount += 1;
    processedConfigurationKeys.add(JSON.stringify(candidate.configuration));

    const shouldLogAttempt = shouldLogFetchProgress(
      index,
      runtimeCandidates.length,
    );
    let delayMs = 0;

    if (index > 0) {
      delayMs = getSeedDelayMs(index);

      if (shouldLogAttempt) {
        logStructured(
          "log",
          "[fetchPriceConfigurations] Waiting before next seed fetch",
          {
            attempt: index + 1,
            totalCandidates: runtimeCandidates.length,
            delayMs,
          },
        );
      }

      await sleepWithinWorkflowRuntime(
        delayMs,
        runtimeDeadline,
        "waiting between seed pricing fetch attempts",
        cancellation,
      );
    }

    if (shouldLogAttempt) {
      logStructured("log", "[fetchPriceConfigurations] Seed fetch attempt", {
        attempt: index + 1,
        totalCandidates: runtimeCandidates.length,
        delayMs,
        configuration: candidate.configuration,
        configurationDetails: describeConfigurationForLog({
          configuration: candidate.configuration,
          externalAttributes,
        }),
        configurationSummary: summarizeConfiguration(candidate.configuration),
        url: candidate.url,
      });
    }

    const startedAt = Date.now();
    const fetchResult = await fetchFromEndpoint(
      candidate.url,
      requestHeaders,
      runtimeDeadline,
      "fetching seed pricing configuration",
      cancellation,
    );
    const durationMs = Date.now() - startedAt;

    if (fetchResult.success && fetchResult.data) {
      if (looksLikeUnavailablePricingResponse(fetchResult.data)) {
        const unavailableSignals = extractPricingResponseSignals(
          fetchResult.data,
        );

        logStructured(
          "warn",
          "[fetchPriceConfigurations] Seed fetch returned unavailable configuration response",
          {
            attempt: index + 1,
            totalCandidates: runtimeCandidates.length,
            durationMs,
            configuration: candidate.configuration,
            configurationDetails: describeConfigurationForLog({
              configuration: candidate.configuration,
              externalAttributes,
            }),
            configurationSummary: summarizeConfiguration(
              candidate.configuration,
            ),
            signals: unavailableSignals,
            url: candidate.url,
          },
        );

        if (remainingAdaptiveUnavailableResponseAnalyses > 0) {
          remainingAdaptiveUnavailableResponseAnalyses -= 1;

          const correctedResult = await tryAdaptiveUnavailablePricingCorrection(
            {
              candidate,
              combinationStrategy: runtimeCombinationStrategy,
              endpoint,
              externalAttributes,
              fixedProviderPricingSelections,
              productId,
              requestHeaders,
              responseData: fetchResult.data,
              sampleProductId,
              staticQueryParams,
              valueMappings,
              configurationParams,
              runtimeDeadline,
            },
          );

          if (correctedResult && !correctedResult.correctionFailed) {
            logStructured(
              "log",
              "[fetchPriceConfigurations] AI-guided correction produced a usable seed configuration",
              {
                attempt: index + 1,
                correctedConfiguration: correctedResult.candidate.configuration,
                correctedConfigurationDetails: describeConfigurationForLog({
                  configuration: correctedResult.candidate.configuration,
                  externalAttributes,
                }),
                correctedUrl: correctedResult.candidate.url,
                learnedCombinationStrategySummary:
                  summarizePricingCombinationStrategy(
                    correctedResult.learnedCombinationStrategy,
                  ),
              },
            );

            return {
              index,
              candidate: correctedResult.candidate,
              data: correctedResult.data,
              learnedCombinationStrategy: mergePricingCombinationStrategies(
                runtimeCombinationStrategy,
                correctedResult.learnedCombinationStrategy,
              ),
            };
          }

          // Correction failed but may have learned strategy rules — merge
          // them into the runtime strategy to prune future seed candidates.
          if (
            correctedResult?.correctionFailed &&
            correctedResult.learnedCombinationStrategy
          ) {
            runtimeCombinationStrategy = mergePricingCombinationStrategies(
              runtimeCombinationStrategy,
              correctedResult.learnedCombinationStrategy,
            );
            pruneRuntimeCandidates(runtimeCombinationStrategy);
          }
        }

        failedAttempts.push({
          index,
          url: candidate.url,
          error: summarizeUnavailablePricingSignals(unavailableSignals),
        });

        continue;
      }

      logStructured("log", "[fetchPriceConfigurations] Seed fetch succeeded", {
        attempt: index + 1,
        totalCandidates: runtimeCandidates.length,
        durationMs,
        configuration: candidate.configuration,
        configurationDetails: describeConfigurationForLog({
          configuration: candidate.configuration,
          externalAttributes,
        }),
        configurationSummary: summarizeConfiguration(candidate.configuration),
        url: candidate.url,
      });

      if (index > 0) {
        logStructured(
          "warn",
          "[fetchPriceConfigurations] Seed fetch skipped invalid earlier combinations",
          {
            attempt: index + 1,
            skippedAttemptCount: failedAttempts.length,
            failedAttempts: failedAttempts.slice(0, 5),
          },
        );
      }

      return {
        index,
        candidate,
        data: fetchResult.data,
        learnedCombinationStrategy: runtimeCombinationStrategy,
      };
    }

    if (shouldLogAttempt) {
      console.warn("[fetchPriceConfigurations] Seed fetch failed", {
        attempt: index + 1,
        totalCandidates: runtimeCandidates.length,
        durationMs,
        configuration: candidate.configuration,
        configurationSummary: summarizeConfiguration(candidate.configuration),
        url: candidate.url,
        error: fetchResult.error,
      });
    }

    failedAttempts.push({
      index,
      url: candidate.url,
      error: fetchResult.error,
    });

    if (
      failedAttempts.length === INITIAL_BLOCKING_FAILURE_LIMIT &&
      failedAttempts.every((attempt) =>
        isLikelyAccessBlockedError(attempt.error),
      )
    ) {
      const abortMessage = buildInitialBlockingAbortMessage(failedAttempts);

      console.error(
        "[fetchPriceConfigurations] Aborting early after repeated initial access-block responses",
        {
          attempts: failedAttempts,
          message: abortMessage,
        },
      );

      throw new Error(abortMessage);
    }
  }

  console.error(
    "[fetchPriceConfigurations] No successful pricing fetch seed found. Sample failures:",
    failedAttempts.slice(0, 5),
  );

  return null;
}

async function fetchPriceConfigurations(options: {
  endpoint: ExternalProviderEndpoint;
  provider: ExternalProvider;
  externalAttributes: ExternalAttribute[];
  attributeMappings?: ExternalProduct["attributeMappings"];
  combinationStrategy?: PricingCombinationStrategy;
  fallbackCombinationStrategies?: Array<PricingCombinationStrategy | undefined>;
  sourceUrl: string;
  providerId?: string;
  requestHeaders: Record<string, string>;
  configurationParams: Record<string, string> | undefined;
  fixedProviderPricingSelections: Record<string, string>;
  staticQueryParams: Record<string, string> | undefined;
  valueMappings: Record<string, Record<string, string>> | undefined;
  cachedPriceSchema?: PriceExtractionSchema;
  existingConfigurations?: ExternalPriceConfiguration[];
  reuseExistingConfigurations?: boolean;
  runtimeDeadline?: WorkflowRuntimeDeadline;
  cancellation?: ExternalProductPriceFetchWorkflowCancellation;
}): Promise<{
  configurations: ExternalPriceConfiguration[];
  learnedSchema?: PriceExtractionSchema;
  runtimeLearnedStrategy?: PricingCombinationStrategy;
}> {
  const {
    endpoint,
    provider,
    externalAttributes,
    attributeMappings,
    combinationStrategy,
    fallbackCombinationStrategies = [],
    sourceUrl,
    providerId,
    requestHeaders,
    configurationParams,
    fixedProviderPricingSelections,
    staticQueryParams,
    valueMappings,
    cachedPriceSchema,
    existingConfigurations = [],
    reuseExistingConfigurations = false,
    runtimeDeadline,
    cancellation,
  } = options;

  const variablePricingAttributes = getVariablePricingAttributes({
    externalAttributes,
    attributeMappings,
    configurationParams,
    fixedSelections: fixedProviderPricingSelections,
  });

  const productId = providerId
    ? extractProductIdFromUrl(sourceUrl, provider)
    : undefined;

  type PricingUrlCandidate = {
    url: string;
    configuration: Record<string, string>;
  };

  const buildCandidateBundle = (strategy?: PricingCombinationStrategy) => {
    const candidatePlanning = resolvePriceFetchCandidateInputs({
      externalAttributes,
      attributeMappings,
      configurationParams,
      fixedSelections: fixedProviderPricingSelections,
      primaryStrategy: strategy,
      fallbackStrategies: fallbackCombinationStrategies,
    });
    const candidates = sortPricingFetchCandidatesByComplexity(
      candidatePlanning.effectiveConfigurationInputs
        .map((input): PricingUrlCandidate | null => {
          const url = buildPricingUrl({
            endpoint,
            productId,
            sampleProductId: provider.sampleProductId,
            configuration: input.configuration,
            fixedConfiguration: fixedProviderPricingSelections,
            configurationParams,
            staticQueryParams,
            valueMappings,
          });

          return url ? { url, configuration: input.configuration } : null;
        })
        .filter((item): item is PricingUrlCandidate => Boolean(item)),
    );

    return {
      candidates,
      configurationInputs: candidatePlanning.configurationInputs,
      effectiveConfigurationInputs:
        candidatePlanning.effectiveConfigurationInputs,
      appliedStrategy: candidatePlanning.appliedStrategy,
      candidateLimitApplied: candidatePlanning.candidateLimitApplied,
      planningMode: candidatePlanning.planningMode,
    };
  };

  const initialCandidateBundle = buildCandidateBundle(combinationStrategy);
  const configurationInputs = initialCandidateBundle.configurationInputs;
  const effectiveConfigurationInputs =
    initialCandidateBundle.effectiveConfigurationInputs;
  const appliedCombinationStrategy = initialCandidateBundle.appliedStrategy;
  const { remainingCandidates: candidatesNeedingFetch, reusedConfigurations } =
    reuseExistingConfigurations
      ? partitionPriceConfigurationsForReuse({
          candidates: initialCandidateBundle.candidates,
          existingConfigurations,
        })
      : {
          remainingCandidates: initialCandidateBundle.candidates,
          reusedConfigurations: [] as ExternalPriceConfiguration[],
        };

  logStructured(
    "log",
    "[fetchPriceConfigurations] Starting configuration fetch",
    {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      endpointUrl: endpoint.url,
      sourceUrl,
      productId,
      hasCachedPriceSchema: Boolean(cachedPriceSchema),
      configurationParamCount: Object.keys(configurationParams ?? {}).length,
      staticQueryParams: staticQueryParams ?? {},
      fixedProviderPricingSelections,
      reusableConfigurationCount: reusedConfigurations.length,
      variableAttributeCount: variablePricingAttributes.length,
      requestedCombinationStrategySummary:
        summarizePricingCombinationStrategy(combinationStrategy),
      appliedCombinationStrategySummary: summarizePricingCombinationStrategy(
        appliedCombinationStrategy,
      ),
      candidatePlanningMode: initialCandidateBundle.planningMode,
      candidateLimitApplied: initialCandidateBundle.candidateLimitApplied,
      variableAttributes: variablePricingAttributes.map((attribute) => ({
        name: attribute.name,
        id: attribute.id,
        affectsPricing: attribute.affectsPricing ?? false,
        optionCount: attribute.values.length,
        configurationParam:
          configurationParams?.[getExternalAttributeKey(attribute)] ??
          configurationParams?.[attribute.name] ??
          null,
      })),
    },
  );

  if (
    combinationStrategy?.rules?.length &&
    configurationInputs.length === 0 &&
    effectiveConfigurationInputs.length > 0
  ) {
    const warningMessage =
      initialCandidateBundle.planningMode === "fallback-strategy"
        ? "[fetchPriceConfigurations] Combined strategy pruned all candidate configurations; retrying with fallback strategy"
        : "[fetchPriceConfigurations] Learned combination strategy pruned all candidate configurations; retrying without strategy";
    logStructured("warn", warningMessage, {
      endpointId: endpoint.id,
      requestedStrategySummary:
        summarizePricingCombinationStrategy(combinationStrategy),
      appliedStrategySummary: summarizePricingCombinationStrategy(
        appliedCombinationStrategy,
      ),
      candidatePlanningMode: initialCandidateBundle.planningMode,
    });
  }

  if (effectiveConfigurationInputs.length === 0) {
    console.log(
      "[fetchPriceConfigurations] No variable pricing attributes detected; using single fetch",
      {
        endpointId: endpoint.id,
        fixedProviderPricingSelections,
        staticQueryParams: staticQueryParams ?? {},
      },
    );

    const url = buildPricingUrl({
      endpoint,
      productId,
      sampleProductId: provider.sampleProductId,
      configuration: {},
      fixedConfiguration: fixedProviderPricingSelections,
      configurationParams: undefined,
      staticQueryParams,
      valueMappings,
    });

    if (!url) {
      console.warn(
        "[fetchPriceConfigurations] Could not build pricing URL for single fetch",
        {
          endpointId: endpoint.id,
          productId,
        },
      );
      return { configurations: [] };
    }

    if (reuseExistingConfigurations && existingConfigurations.length > 0) {
      const reusableSingleFetch = partitionPriceConfigurationsForReuse({
        candidates: [{ configuration: {}, url }],
        existingConfigurations,
      });

      if (reusableSingleFetch.reusedConfigurations.length > 0) {
        console.log(
          "[fetchPriceConfigurations] Reused existing single pricing configuration",
          {
            endpointId: endpoint.id,
            reusedConfigurationCount:
              reusableSingleFetch.reusedConfigurations.length,
            url,
          },
        );

        return {
          configurations: reusableSingleFetch.reusedConfigurations,
        };
      }
    }

    const startedAt = Date.now();
    const fetchResult = await fetchFromEndpoint(
      url,
      requestHeaders,
      runtimeDeadline,
      "fetching single pricing configuration",
      cancellation,
    );

    if (!fetchResult.success || !fetchResult.data) {
      console.warn("[fetchPriceConfigurations] Single pricing fetch failed", {
        endpointId: endpoint.id,
        durationMs: Date.now() - startedAt,
        url,
        error: fetchResult.error,
      });
      return { configurations: [] };
    }

    const priceInfo = await maybeRunWithinWorkflowRuntime(
      runtimeDeadline,
      "extracting price information from a single pricing response",
      () => extractPriceInfoFromAPI(fetchResult.data, url, endpoint.schema),
      cancellation,
    );
    if (!priceInfo) {
      console.warn(
        "[fetchPriceConfigurations] Single pricing fetch returned no extractable price info",
        {
          endpointId: endpoint.id,
          durationMs: Date.now() - startedAt,
          url,
        },
      );
      return { configurations: [] };
    }

    console.log("[fetchPriceConfigurations] Single pricing fetch succeeded", {
      endpointId: endpoint.id,
      durationMs: Date.now() - startedAt,
      url,
      priceRangeCount: priceInfo.priceRanges?.length ?? 0,
    });

    return {
      configurations: [
        {
          configuration: {},
          priceInfo,
          sourceUrl: url,
        },
      ],
    };
  }

  const urlsWithConfigs = initialCandidateBundle.candidates;

  logStructured(
    "log",
    "[fetchPriceConfigurations] Built pricing request candidates",
    {
      endpointId: endpoint.id,
      totalCandidates: urlsWithConfigs.length,
      candidatesNeedingFetch: candidatesNeedingFetch.length,
      reusedConfigurationCount: reusedConfigurations.length,
      strategyApplied: Boolean(appliedCombinationStrategy?.rules?.length),
      candidatePlanningMode: initialCandidateBundle.planningMode,
      candidateLimitApplied: initialCandidateBundle.candidateLimitApplied,
      sampleCandidates: urlsWithConfigs.slice(0, 3).map((candidate) => ({
        configurationDetails: describeConfigurationForLog({
          configuration: candidate.configuration,
          externalAttributes,
        }),
        configurationSummary: summarizeConfiguration(candidate.configuration),
        url: candidate.url,
      })),
    },
  );

  if (urlsWithConfigs.length > 100) {
    console.warn("[fetchPriceConfigurations] Large pricing search space", {
      endpointId: endpoint.id,
      totalCandidates: urlsWithConfigs.length,
    });
  }

  if (urlsWithConfigs.length === 0) {
    console.warn(
      "[fetchPriceConfigurations] No pricing request candidates could be built",
      {
        endpointId: endpoint.id,
        configurationParamCount: Object.keys(configurationParams ?? {}).length,
        fixedProviderPricingSelections,
      },
    );
    return { configurations: [] };
  }

  if (candidatesNeedingFetch.length === 0) {
    console.log(
      "[fetchPriceConfigurations] Reused all existing pricing configurations",
      {
        endpointId: endpoint.id,
        reusedConfigurationCount: reusedConfigurations.length,
        totalCandidates: urlsWithConfigs.length,
      },
    );

    return {
      configurations: reusedConfigurations,
    };
  }

  const successfulSeed = await findFirstSuccessfulPricingFetch({
    candidates: candidatesNeedingFetch,
    configurationParams,
    currentCombinationStrategy: combinationStrategy,
    endpoint,
    externalAttributes,
    fixedProviderPricingSelections,
    productId,
    requestHeaders,
    runtimeDeadline,
    sampleProductId: provider.sampleProductId,
    staticQueryParams,
    valueMappings,
    cancellation,
  });

  if (!successfulSeed) {
    return { configurations: [] };
  }

  const firstConfig = successfulSeed.candidate;
  const firstFetchData = successfulSeed.data;
  let runtimeCombinationStrategy = mergePricingCombinationStrategies(
    combinationStrategy,
    successfulSeed.learnedCombinationStrategy,
  );
  const allRuntimeLearnedStrategies: PricingCombinationStrategy[] = [];
  if (successfulSeed.learnedCombinationStrategy?.rules?.length) {
    allRuntimeLearnedStrategies.push(successfulSeed.learnedCombinationStrategy);
  }
  let runtimeCandidateBundle = successfulSeed.learnedCombinationStrategy?.rules
    ?.length
    ? buildCandidateBundle(runtimeCombinationStrategy)
    : initialCandidateBundle;

  if (successfulSeed.learnedCombinationStrategy?.rules?.length) {
    logStructured(
      "log",
      "[fetchPriceConfigurations] Refined combination strategy after unavailable-response correction",
      {
        endpointId: endpoint.id,
        previousCandidateCount: urlsWithConfigs.length,
        refinedCandidateCount: runtimeCandidateBundle.candidates.length,
        refinedStrategySummary: summarizePricingCombinationStrategy(
          runtimeCombinationStrategy,
        ),
      },
    );
  }

  let priceSchema: PriceExtractionSchema | undefined = cachedPriceSchema;
  let schemaWasLearned = false;
  let schemaWasAutoCorrected = false;

  if (!priceSchema) {
    logStructured(
      "log",
      "[fetchPriceConfigurations] Learning price schema from seed",
      {
        endpointId: endpoint.id,
        seedConfigurationSummary: summarizeConfiguration(
          firstConfig.configuration,
        ),
        seedConfigurationDetails: describeConfigurationForLog({
          configuration: firstConfig.configuration,
          externalAttributes,
        }),
        seedUrl: firstConfig.url,
      },
    );

    priceSchema =
      (await maybeRunWithinWorkflowRuntime(
        runtimeDeadline,
        "learning an external price extraction schema",
        () =>
          learnPriceSchema(firstFetchData, firstConfig.url, endpoint.schema),
        cancellation,
      )) ?? undefined;
    schemaWasLearned = Boolean(priceSchema);

    if (priceSchema && schemaWasLearned) {
      logStructured(
        "log",
        "[fetchPriceConfigurations] Learned reusable price schema",
        {
          endpointId: endpoint.id,
          priceSchema,
        },
      );
    }
  } else if (
    priceSchema &&
    !priceSchema.deliveryTimePath &&
    !priceSchema.singlePricePath
  ) {
    // Cached schema predates delivery-time extraction support. Try to learn a
    // fresh schema from the seed response and merge in delivery fields so
    // providers self-heal without requiring a manual refetch.
    logStructured(
      "log",
      "[fetchPriceConfigurations] Cached schema missing deliveryTimePath; attempting upgrade",
      {
        endpointId: endpoint.id,
        seedUrl: firstConfig.url,
      },
    );

    const upgradedSchema =
      (await maybeRunWithinWorkflowRuntime(
        runtimeDeadline,
        "upgrading cached price schema with delivery-time fields",
        () =>
          learnPriceSchema(firstFetchData, firstConfig.url, endpoint.schema),
        cancellation,
      )) ?? undefined;

    if (upgradedSchema?.deliveryTimePath) {
      priceSchema = {
        ...priceSchema,
        deliveryTimePath: upgradedSchema.deliveryTimePath,
        deliveryTimeFormat:
          upgradedSchema.deliveryTimeFormat ?? priceSchema.deliveryTimeFormat,
      };
      schemaWasAutoCorrected = true;
      logStructured(
        "log",
        "[fetchPriceConfigurations] Upgraded cached schema with delivery-time fields",
        {
          endpointId: endpoint.id,
          deliveryTimePath: priceSchema.deliveryTimePath,
          deliveryTimeFormat: priceSchema.deliveryTimeFormat,
        },
      );
    }
  }

  if (!priceSchema) {
    logStructured(
      "warn",
      "[fetchPriceConfigurations] No reusable price schema learned; returning only the seed configuration",
      {
        endpointId: endpoint.id,
        seedConfigurationSummary: summarizeConfiguration(
          firstConfig.configuration,
        ),
        seedConfigurationDetails: describeConfigurationForLog({
          configuration: firstConfig.configuration,
          externalAttributes,
        }),
        seedUrl: firstConfig.url,
      },
    );

    const priceInfo = await maybeRunWithinWorkflowRuntime(
      runtimeDeadline,
      "extracting price information from the seed pricing response",
      () =>
        extractPriceInfoFromAPI(
          firstFetchData,
          firstConfig.url,
          endpoint.schema,
        ),
      cancellation,
    );
    if (priceInfo) {
      return {
        configurations: [
          {
            configuration: firstConfig.configuration,
            priceInfo,
            sourceUrl: firstConfig.url,
          },
        ],
      };
    }
    return { configurations: [] };
  }

  const firstPriceInfo = extractPriceWithSchema(firstFetchData, priceSchema);

  // Sanity check: if the schema produces all-zero prices and has a quantityPath,
  // the pricePath likely points to a per-unit price that was incorrectly divided
  // by quantity. Retry with priceIsPerUnit toggled.
  if (
    firstPriceInfo?.priceRanges?.length &&
    priceSchema.quantityPath &&
    firstPriceInfo.priceRanges.every((range) => range.price === 0)
  ) {
    const correctedSchema: typeof priceSchema = {
      ...priceSchema,
      priceIsPerUnit: !priceSchema.priceIsPerUnit,
    };
    const correctedPriceInfo = extractPriceWithSchema(
      firstFetchData,
      correctedSchema,
    );

    if (
      correctedPriceInfo?.priceRanges?.length &&
      correctedPriceInfo.priceRanges.some((range) => (range.price ?? 0) > 0)
    ) {
      logStructured(
        "warn",
        "[fetchPriceConfigurations] Schema produced all-zero prices; auto-corrected priceIsPerUnit",
        {
          endpointId: endpoint.id,
          originalPriceIsPerUnit: priceSchema.priceIsPerUnit ?? false,
          correctedPriceIsPerUnit: correctedSchema.priceIsPerUnit,
          sampleCorrectedPrice: correctedPriceInfo.priceRanges[0]?.price,
        },
      );
      priceSchema = correctedSchema;
      schemaWasAutoCorrected = true;
    }
  }

  // Re-extract with the (potentially corrected) schema
  const effectiveFirstPriceInfo =
    firstPriceInfo?.priceRanges?.every((range) => range.price === 0) &&
    priceSchema !== cachedPriceSchema
      ? extractPriceWithSchema(firstFetchData, priceSchema)
      : firstPriceInfo;
  const seedHasOnlyZeroPrices = hasOnlyZeroPrices(effectiveFirstPriceInfo);

  if (!effectiveFirstPriceInfo || seedHasOnlyZeroPrices) {
    const aiDebugPriceInfo = await maybeRunWithinWorkflowRuntime(
      runtimeDeadline,
      "debugging anomalous seed price extraction",
      () =>
        extractPriceInfoFromAPI(
          firstFetchData,
          firstConfig.url,
          endpoint.schema,
        ),
      cancellation,
    );

    logStructured(
      "warn",
      "[fetchPriceConfigurations] Seed price extraction anomaly",
      {
        endpointId: endpoint.id,
        seedConfiguration: firstConfig.configuration,
        seedConfigurationDetails: describeConfigurationForLog({
          configuration: firstConfig.configuration,
          externalAttributes,
        }),
        seedUrl: firstConfig.url,
        schemaWasLearned,
        schemaWasAutoCorrected,
        schemaExtraction: summarizeSchemaExtraction({
          apiData: firstFetchData,
          schema: priceSchema,
          priceInfo: effectiveFirstPriceInfo,
        }),
        aiExtraction: summarizePriceInfo(aiDebugPriceInfo),
      },
    );
  }

  const results: ExternalPriceConfiguration[] = [...reusedConfigurations];

  if (effectiveFirstPriceInfo) {
    results.push({
      configuration: firstConfig.configuration,
      priceInfo: effectiveFirstPriceInfo,
      sourceUrl: firstConfig.url,
    });
  }

  const processedConfigurationKeys = new Set<string>([
    ...reusedConfigurations.map((configuration) =>
      JSON.stringify(configuration.configuration),
    ),
    JSON.stringify(firstConfig.configuration),
  ]);

  let remainingConfigs = runtimeCandidateBundle.candidates.filter(
    (item) =>
      !processedConfigurationKeys.has(JSON.stringify(item.configuration)),
  );

  if (remainingConfigs.length > 0) {
    let remainingAdaptiveBatchUnavailableResponseAnalyses =
      MAX_ADAPTIVE_UNAVAILABLE_RESPONSE_ANALYSES;

    logStructured(
      "log",
      "[fetchPriceConfigurations] Starting batched price fetches",
      {
        endpointId: endpoint.id,
        remainingCandidateCount: remainingConfigs.length,
        batchSize: PRICE_FETCH_BATCH_SIZE,
        batchConcurrency: PRICE_FETCH_BATCH_CONCURRENCY,
        strategySummary: summarizePricingCombinationStrategy(
          runtimeCombinationStrategy,
        ),
      },
    );

    let batchNumber = 0;

    while (remainingConfigs.length > 0) {
      await cancellation?.throwIfCancelled(
        "fetching batched external product prices",
      );

      if (runtimeDeadline) {
        assertWithinWorkflowRuntime(
          runtimeDeadline,
          "fetching batched external product prices",
        );
      }

      batchNumber += 1;
      const totalBatches = Math.ceil(
        remainingConfigs.length / PRICE_FETCH_BATCH_SIZE,
      );
      const batch = remainingConfigs.slice(0, PRICE_FETCH_BATCH_SIZE);
      const batchStartedAt = Date.now();

      logStructured("log", "[fetchPriceConfigurations] Starting price batch", {
        endpointId: endpoint.id,
        batchNumber,
        totalBatches,
        batchSize: batch.length,
        batchConcurrency: PRICE_FETCH_BATCH_CONCURRENCY,
        rangeStart: 1,
        rangeEnd: batch.length,
      });

      const batchResults = await mapWithConcurrencyLimit({
        items: batch,
        concurrency: PRICE_FETCH_BATCH_CONCURRENCY,
        cancellation,
        cancellationContext: "fetching batched external product prices",
        mapper: async ({ url, configuration }, batchItemIndex) => {
          try {
            if (batchItemIndex > 0) {
              await sleepWithinWorkflowRuntime(
                getBatchRequestDelayMs(),
                runtimeDeadline,
                "waiting between batched pricing requests",
                cancellation,
              );
            }

            const fetchResult = await fetchFromEndpoint(
              url,
              requestHeaders,
              runtimeDeadline,
              "fetching batched pricing configuration",
              cancellation,
            );
            if (!fetchResult.success || !fetchResult.data) {
              return {
                originalConfiguration: configuration,
              };
            }

            if (looksLikeUnavailablePricingResponse(fetchResult.data)) {
              if (remainingAdaptiveBatchUnavailableResponseAnalyses > 0) {
                remainingAdaptiveBatchUnavailableResponseAnalyses -= 1;

                const correctedResult =
                  await tryAdaptiveUnavailablePricingCorrection({
                    candidate: { configuration, url },
                    combinationStrategy: runtimeCombinationStrategy,
                    endpoint,
                    externalAttributes,
                    fixedProviderPricingSelections,
                    productId,
                    requestHeaders,
                    responseData: fetchResult.data,
                    sampleProductId: provider.sampleProductId,
                    staticQueryParams,
                    valueMappings,
                    configurationParams,
                    runtimeDeadline,
                    cancellation,
                  });

                if (correctedResult && !correctedResult.correctionFailed) {
                  const correctedPriceInfo = extractPriceWithSchema(
                    correctedResult.data,
                    priceSchema,
                  );

                  if (correctedPriceInfo) {
                    const zeroPriceOnly = hasOnlyZeroPrices(correctedPriceInfo);

                    return {
                      learnedCombinationStrategy:
                        correctedResult.learnedCombinationStrategy,
                      originalConfiguration: configuration,
                      configuration: correctedResult.candidate.configuration,
                      extractionDebug: zeroPriceOnly
                        ? summarizeSchemaExtraction({
                            apiData: correctedResult.data,
                            schema: priceSchema,
                            priceInfo: correctedPriceInfo,
                          })
                        : undefined,
                      priceInfo: correctedPriceInfo,
                      resolvedConfiguration:
                        correctedResult.candidate.configuration,
                      sourceUrl: correctedResult.candidate.url,
                      zeroPriceOnly,
                    };
                  }

                  // Correction couldn't extract prices but may have learned
                  // strategy rules — bubble them up so they can prune future
                  // candidates even when this particular config stays failed.
                  if (
                    correctedResult.learnedCombinationStrategy?.rules?.length
                  ) {
                    return {
                      learnedCombinationStrategy:
                        correctedResult.learnedCombinationStrategy,
                      originalConfiguration: configuration,
                    };
                  }
                }

                // Correction fully failed but may have learned-only strategies.
                if (
                  correctedResult?.correctionFailed &&
                  correctedResult.learnedCombinationStrategy?.rules?.length
                ) {
                  return {
                    learnedCombinationStrategy:
                      correctedResult.learnedCombinationStrategy,
                    originalConfiguration: configuration,
                  };
                }
              }

              return {
                originalConfiguration: configuration,
              };
            }

            const priceInfo = extractPriceWithSchema(
              fetchResult.data,
              priceSchema,
            );
            if (!priceInfo) {
              return {
                originalConfiguration: configuration,
              };
            }

            const zeroPriceOnly = hasOnlyZeroPrices(priceInfo);

            return {
              originalConfiguration: configuration,
              configuration,
              extractionDebug: zeroPriceOnly
                ? summarizeSchemaExtraction({
                    apiData: fetchResult.data,
                    schema: priceSchema,
                    priceInfo,
                  })
                : undefined,
              priceInfo,
              resolvedConfiguration: configuration,
              sourceUrl: url,
              zeroPriceOnly,
            };
          } catch (error) {
            if (
              error instanceof WorkflowRuntimeLimitError ||
              isExternalProductPriceFetchWorkflowCancelledError(error)
            ) {
              throw error;
            }

            return {
              originalConfiguration: configuration,
            };
          }
        },
      });

      let batchSuccessCount = 0;
      let batchZeroPriceCount = 0;
      const newlyLearnedStrategies: PricingCombinationStrategy[] = [];
      let zeroPriceSample:
        | {
            configuration: Record<string, string>;
            configurationDetails: Record<string, string>;
            extractionDebug: Record<string, unknown>;
            sourceUrl: string;
          }
        | undefined;

      for (const batchResult of batchResults) {
        processedConfigurationKeys.add(
          JSON.stringify(batchResult.originalConfiguration),
        );

        if (batchResult.learnedCombinationStrategy?.rules?.length) {
          newlyLearnedStrategies.push(batchResult.learnedCombinationStrategy);
        }

        if (batchResult.resolvedConfiguration) {
          processedConfigurationKeys.add(
            JSON.stringify(batchResult.resolvedConfiguration),
          );
        }

        if (batchResult.priceInfo) {
          results.push({
            configuration: batchResult.configuration,
            priceInfo: batchResult.priceInfo,
            sourceUrl: batchResult.sourceUrl,
          });
          batchSuccessCount += 1;

          if (batchResult.zeroPriceOnly) {
            batchZeroPriceCount += 1;
            if (!zeroPriceSample && batchResult.extractionDebug) {
              zeroPriceSample = {
                configuration: batchResult.configuration,
                configurationDetails: describeConfigurationForLog({
                  configuration: batchResult.configuration,
                  externalAttributes,
                }),
                extractionDebug: batchResult.extractionDebug,
                sourceUrl: batchResult.sourceUrl,
              };
            }
          }
        }
      }

      const batchSummary = {
        endpointId: endpoint.id,
        batchNumber,
        totalBatches,
        durationMs: Date.now() - batchStartedAt,
        attemptedCount: batch.length,
        successCount: batchSuccessCount,
        failureCount: batch.length - batchSuccessCount,
        cumulativeSuccessCount: results.length,
        learnedStrategyCount: newlyLearnedStrategies.length,
        zeroPriceCount: batchZeroPriceCount,
      };

      const lastSuccess = results[results.length - 1];
      const sampleRange = lastSuccess?.priceInfo?.priceRanges?.[0];
      const samplePrice = lastSuccess
        ? {
            configuration: lastSuccess.configuration,
            configurationDetails: describeConfigurationForLog({
              configuration: lastSuccess.configuration,
              externalAttributes,
            }),
            currency: lastSuccess.priceInfo?.currency,
            price: sampleRange?.price,
            quantity: sampleRange?.quantity,
            priceRangeCount: lastSuccess.priceInfo?.priceRanges?.length ?? 0,
          }
        : undefined;

      if (batchSuccessCount === 0) {
        logStructured(
          "warn",
          "[fetchPriceConfigurations] Completed price batch with no prices extracted",
          batchSummary,
        );
      } else if (batchZeroPriceCount > 0) {
        logStructured(
          "warn",
          "[fetchPriceConfigurations] Completed price batch with zero-price extractions",
          {
            ...batchSummary,
            ...(samplePrice ? { sample: samplePrice } : {}),
            ...(zeroPriceSample ? { zeroPriceSample } : {}),
          },
        );
      } else {
        logStructured(
          "log",
          "[fetchPriceConfigurations] Completed price batch",
          {
            ...batchSummary,
            ...(samplePrice ? { sample: samplePrice } : {}),
          },
        );
      }

      if (newlyLearnedStrategies.length > 0) {
        allRuntimeLearnedStrategies.push(...newlyLearnedStrategies);
        runtimeCombinationStrategy = mergePricingCombinationStrategies(
          runtimeCombinationStrategy,
          ...newlyLearnedStrategies,
        );
        runtimeCandidateBundle = buildCandidateBundle(
          runtimeCombinationStrategy,
        );

        logStructured(
          "log",
          "[fetchPriceConfigurations] Rebuilt remaining candidates from learned unavailable-response patterns",
          {
            endpointId: endpoint.id,
            nextRemainingCandidateCount:
              runtimeCandidateBundle.candidates.filter(
                (item) =>
                  !processedConfigurationKeys.has(
                    JSON.stringify(item.configuration),
                  ),
              ).length,
            strategySummary: summarizePricingCombinationStrategy(
              runtimeCombinationStrategy,
            ),
          },
        );
      }

      remainingConfigs = runtimeCandidateBundle.candidates.filter(
        (item) =>
          !processedConfigurationKeys.has(JSON.stringify(item.configuration)),
      );

      if (remainingConfigs.length > 0) {
        const pauseMs = getBatchPauseDelayMs();

        logStructured(
          "log",
          "[fetchPriceConfigurations] Pausing before next price batch",
          {
            endpointId: endpoint.id,
            batchNumber,
            totalBatches,
            pauseMs,
          },
        );

        await sleepWithinWorkflowRuntime(
          pauseMs,
          runtimeDeadline,
          "waiting between price batches",
          cancellation,
        );
      }
    }
  }

  logStructured(
    "log",
    "[fetchPriceConfigurations] Finished configuration fetch",
    {
      endpointId: endpoint.id,
      totalCandidates: runtimeCandidateBundle.candidates.length,
      successfulConfigurationCount: results.length,
      failedConfigurationCount:
        runtimeCandidateBundle.candidates.length - results.length,
      schemaSource: cachedPriceSchema
        ? "cached"
        : schemaWasLearned
          ? "learned"
          : "none",
    },
  );

  const runtimeLearnedStrategy =
    allRuntimeLearnedStrategies.length > 0
      ? mergePricingCombinationStrategies(...allRuntimeLearnedStrategies)
      : undefined;

  return {
    configurations: results,
    learnedSchema:
      schemaWasLearned || schemaWasAutoCorrected ? priceSchema : undefined,
    runtimeLearnedStrategy,
  };
}

function extractProductIdFromUrl(
  url: string,
  provider: ExternalProvider,
): string {
  if (!provider.productEndpoint) {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  }

  const template = provider.productEndpoint;
  const placeholderIndex = template.indexOf("{productId}");

  if (placeholderIndex === -1) {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  }

  const beforePlaceholder = template.substring(0, placeholderIndex);
  const afterPlaceholder = template.substring(
    placeholderIndex + "{productId}".length,
  );

  const startIndex = url.indexOf(beforePlaceholder) + beforePlaceholder.length;

  if (afterPlaceholder) {
    const endIndex = url.indexOf(afterPlaceholder, startIndex);
    if (endIndex !== -1) {
      return url.substring(startIndex, endIndex);
    }
  }

  return url.substring(startIndex).split("/")[0].split("?")[0];
}

async function fetchFromEndpoint(
  url: string,
  headers?: Record<string, string>,
  runtimeDeadline?: WorkflowRuntimeDeadline,
  context: string = "fetching an external provider endpoint",
  cancellation?: ExternalProductPriceFetchWorkflowCancellation,
): Promise<FetchFromEndpointResult> {
  try {
    await cancellation?.throwIfCancelled(context);

    const response = await fetchExternalProviderUrl(
      url,
      {
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        signal: cancellation?.signal,
      },
      {
        fetchImpl: (input, init) =>
          fetchWithinWorkflowRuntime(runtimeDeadline, context, input, init),
      },
    );

    if (!response.ok) {
      let responseBody = "";
      try {
        responseBody = await response.text();
        if (responseBody.length > 1000) {
          responseBody = responseBody.substring(0, 1000) + "…";
        }
      } catch {
        // ignore body read errors
      }

      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}${responseBody ? ` — ${responseBody}` : ""}`,
      };
    }

    const data = (await response.json()) as unknown;
    await cancellation?.throwIfCancelled(context);
    return { success: true, data };
  } catch (error) {
    if (
      error instanceof WorkflowRuntimeLimitError ||
      isExternalProductPriceFetchWorkflowCancelledError(error)
    ) {
      throw error;
    }

    console.error("Error fetching from endpoint:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function getProvider(
  providerId: string,
): Promise<ExternalProvider | null> {
  try {
    const db = getDb();
    const doc = await db.collection("externalProviders").doc(providerId).get();

    if (!doc.exists) {
      return null;
    }

    return { id: doc.id, ...doc.data() } as ExternalProvider;
  } catch (error) {
    console.error("Error getting provider:", error);
    return null;
  }
}

async function fetchExternalProductPricesInternal(options: {
  externalProductId: string;
  marginPercent?: number;
  taxPercent?: number;
  discountPercent?: number;
  cachedProvider?: ExternalProvider;
  reuseExistingConfigurations?: boolean;
  workflowStartedAtMs?: number;
  cancellation?: ExternalProductPriceFetchWorkflowCancellation;
}): Promise<{
  success: boolean;
  result?: FetchExternalProductPricesResult;
  error?: string;
}> {
  const {
    externalProductId,
    marginPercent = 0,
    taxPercent = 0,
    discountPercent = 0,
    cachedProvider,
    reuseExistingConfigurations = false,
    workflowStartedAtMs,
    cancellation,
  } = options;
  const startedAt = Date.now();
  const runtimeDeadline =
    typeof workflowStartedAtMs === "number"
      ? createWorkflowRuntimeDeadline(workflowStartedAtMs)
      : undefined;

  logStructured(
    "log",
    "[fetchExternalProductPrices] Starting external price fetch",
    {
      externalProductId,
      marginPercent,
      taxPercent,
      discountPercent,
    },
  );

  const db = getDb();
  const externalDoc = await db
    .collection("externalProducts")
    .doc(externalProductId)
    .get();

  if (!externalDoc.exists) {
    return { success: false, error: "External product not found" };
  }

  const externalProduct = externalDoc.data() as ExternalProduct;
  const providerId = externalProduct.source.providerId;
  const sourceUrl = externalProduct.source.url;
  const persistedPricingExclusionRules =
    externalProduct.pricingExclusionRules ?? [];
  const persistedManualPricingExclusionRules =
    getPersistedManualPricingExclusionRules(persistedPricingExclusionRules);
  const persistedAiPricingExclusionRules =
    persistedPricingExclusionRules.filter((rule) => rule.source === "ai");

  logStructured("log", "[fetchExternalProductPrices] Loaded external product", {
    externalProductId,
    originalName: externalProduct.originalName,
    attributeCount: externalProduct.attributes?.length ?? 0,
    mappingCount: externalProduct.attributeMappings?.length ?? 0,
    pricingExclusionRuleCount: persistedPricingExclusionRules.length,
    manualPricingExclusionRuleCount:
      persistedManualPricingExclusionRules.length,
    aiPricingExclusionRuleCount: persistedAiPricingExclusionRules.length,
    pricingExclusionRules: persistedPricingExclusionRules,
  });

  if (!providerId) {
    return {
      success: false,
      error: "No provider associated with this product",
    };
  }

  const provider = cachedProvider ?? (await getProvider(providerId));
  if (!provider) {
    return { success: false, error: "Provider not found" };
  }

  const requestHeaders = buildBrowserishRequestHeadersFromProvider(provider);

  try {
    const sourceOrigin = new URL(sourceUrl).origin;

    requestHeaders.Origin ??= sourceOrigin;
    requestHeaders.Referer ??= `${sourceOrigin}/`;
  } catch {
    // Ignore malformed source URLs and continue with provider headers only.
  }

  const cachedPricingSelection = externalProduct.pricingSelection ?? null;
  let pricingSelection = cachedPricingSelection;
  let pricingSelectionToPersist: ExternalProductPricingSelection | undefined;

  if (!pricingSelection?.endpointId) {
    pricingSelection = await maybeRunWithinWorkflowRuntime(
      runtimeDeadline,
      "selecting the pricing endpoint for an external product",
      () =>
        selectPricingEndpointWithAI({
          provider,
          externalAttributes: externalProduct.attributes ?? [],
        }),
      cancellation,
    );

    if (pricingSelection?.endpointId) {
      pricingSelectionToPersist = removeUndefinedDeep(
        pricingSelection,
      ) as ExternalProductPricingSelection;
    }
  }

  if (!pricingSelection?.endpointId) {
    return { success: false, error: "No suitable pricing endpoint found" };
  }

  const candidates = buildPricingEndpointCandidates(provider);
  let selectedEndpoint = candidates.find(
    (endpoint) => endpoint.id === pricingSelection.endpointId,
  );

  if (!selectedEndpoint) {
    return { success: false, error: "Selected endpoint not found" };
  }

  selectedEndpoint = resolveTemplateEndpointCandidate({
    candidates,
    selectedEndpoint,
    sampleProductId: provider.sampleProductId,
  });

  const endpointQueryParams = extractQueryParamNames(
    selectedEndpoint.sampleUrl ?? selectedEndpoint.url,
  );
  const fixedProviderPricingSelections = getProviderOnlyPricingSelections(
    externalProduct.attributeMappings,
    externalProduct.attributes ?? [],
  );
  const rangedDimensionAttributeNames = getRangedDimensionAttributeNames(
    inferExternalRangedDimensions(externalProduct.attributes ?? []),
  );
  const manualPricingCombinationStrategy =
    buildManualPricingCombinationStrategy(persistedManualPricingExclusionRules);
  const pricingAttributes = (externalProduct.attributes ?? []).some(
    (attr) => attr.affectsPricing,
  )
    ? (externalProduct.attributes ?? []).filter((attr) => attr.affectsPricing)
    : (externalProduct.attributes ?? []);

  // Build a key-based configurationParams that resolves duplicate display names.
  // Old persisted data uses display names as keys; we re-key by attribute key
  // (attr.id || attr.name) so two attributes with the same name get separate entries.
  const { resolvedConfigurationParams, correctedConfigurationParams } =
    resolveConfigurationParamsForPricingAttributes({
      pricingAttributes,
      savedConfigParams: pricingSelection.configurationParams,
      endpointQueryParams,
    });
  const resolvedValueMappings: Record<string, Record<string, string>> = {};
  const savedValueMappings = pricingSelection.valueMappings ?? {};
  const duplicateAttributeNames =
    hasDuplicateExternalAttributeNames(pricingAttributes);

  for (const attr of pricingAttributes) {
    if (
      attr.values.length === 0 &&
      !rangedDimensionAttributeNames.has(attr.name)
    ) {
      continue;
    }

    const attrKey = getExternalAttributeKey(attr);
    const attrValueMappings =
      savedValueMappings[attrKey] ??
      (duplicateAttributeNames.has(attr.name)
        ? undefined
        : savedValueMappings[attr.name]);
    if (attrValueMappings && Object.keys(attrValueMappings).length > 0) {
      resolvedValueMappings[attrKey] = attrValueMappings;
    }
  }

  if (correctedConfigurationParams) {
    pricingSelectionToPersist = removeUndefinedDeep({
      ...pricingSelection,
      configurationParams: resolvedConfigurationParams,
    }) as ExternalProductPricingSelection;
  }

  const cachedPriceSchema = provider.priceSchemas?.[selectedEndpoint.id];
  const effectiveConfigurationParams =
    Object.keys(resolvedConfigurationParams).length > 0
      ? resolvedConfigurationParams
      : pricingSelection.configurationParams;
  const effectiveValueMappings =
    Object.keys(resolvedValueMappings).length > 0
      ? resolvedValueMappings
      : pricingSelection.valueMappings;
  const variablePricingAttributes = getVariablePricingAttributes({
    externalAttributes: externalProduct.attributes ?? [],
    attributeMappings: externalProduct.attributeMappings,
    configurationParams: effectiveConfigurationParams,
    fixedSelections: fixedProviderPricingSelections,
  });
  const rawVariablePricingAttributes = getVariablePricingAttributes({
    externalAttributes: externalProduct.attributes ?? [],
    configurationParams: effectiveConfigurationParams,
    fixedSelections: fixedProviderPricingSelections,
  });
  const variableAttributeKeys = new Set(
    variablePricingAttributes.map((attribute) =>
      getExternalAttributeKey(attribute),
    ),
  );
  const mappingByExternalAttributeName = new Map(
    (externalProduct.attributeMappings ?? []).map((mapping) => [
      mapping.externalAttributeName,
      mapping,
    ]),
  );
  const activePricingSelection: ExternalProductPricingSelection = {
    ...pricingSelection,
    configurationParams: effectiveConfigurationParams,
  };
  const currentPriceConfigurationReuseSignature =
    buildPriceConfigurationReuseSignature({
      attributeMappings: externalProduct.attributeMappings,
      discountPercent,
      externalAttributes: externalProduct.attributes ?? [],
      marginPercent,
      pricingExclusionRules: externalProduct.pricingExclusionRules,
      pricingSelection: activePricingSelection,
      selectedEndpoint,
      taxPercent,
    });
  const reusableStoredConfigurations = reuseExistingConfigurations
    ? await getReusableStoredPriceConfigurations({
        docRef: db.collection("externalProducts").doc(externalProductId),
        externalProduct,
        currentSignature: currentPriceConfigurationReuseSignature,
      })
    : { configurations: [], source: "none" as const };
  const attributeUsageSummary = (externalProduct.attributes ?? []).map(
    (attribute) => {
      const attributeKey = getExternalAttributeKey(attribute);
      const mapping =
        mappingByExternalAttributeName.get(attributeKey) ??
        mappingByExternalAttributeName.get(attribute.name);
      const fixedSelection =
        fixedProviderPricingSelections[attributeKey] ??
        fixedProviderPricingSelections[attribute.name];
      const configurationParam =
        effectiveConfigurationParams?.[attributeKey] ??
        effectiveConfigurationParams?.[attribute.name] ??
        null;
      const usedForVariablePricing = variableAttributeKeys.has(attributeKey);

      let reason = "used_for_variable_pricing";

      if (!usedForVariablePricing) {
        if (fixedSelection) {
          reason = "fixed_provider_selection";
        } else if (!configurationParam) {
          reason = "no_configuration_param";
        } else if (
          (attribute.options?.length ?? 0) === 0 &&
          attribute.values.length === 0
        ) {
          reason = "no_selectable_values";
        } else if (
          attribute.affectsPricing === false &&
          (externalProduct.attributes ?? []).some((item) => item.affectsPricing)
        ) {
          reason = "ignored_not_price_affecting";
        } else {
          reason = "not_used_for_variable_pricing";
        }
      }

      return {
        name: attribute.name,
        id: attribute.id,
        affectsPricing: attribute.affectsPricing ?? false,
        optionCount: attribute.values.length,
        internalAttributeId: mapping?.internalAttributeId ?? null,
        providerOnlyPricing: mapping?.providerOnlyPricing ?? false,
        fixedExternalValue: mapping?.fixedExternalValue ?? null,
        configurationParam,
        usedForVariablePricing,
        reason,
      };
    },
  );

  let learnedPricingCombinationStrategy: PricingCombinationStrategy | undefined;

  if (variablePricingAttributes.length >= 2) {
    const planningContext = await fetchPricingCombinationPlanningContext({
      provider,
      requestHeaders,
      runtimeDeadline,
      sourceUrl,
      cancellation,
    });

    learnedPricingCombinationStrategy =
      (await maybeRunWithinWorkflowRuntime(
        runtimeDeadline,
        "learning pricing combination rules",
        () =>
          learnPricingCombinationStrategy({
            externalAttributes: externalProduct.attributes ?? [],
            fixedSelections: fixedProviderPricingSelections,
            planningContext,
            sourceUrl,
          }),
        cancellation,
      )) ?? undefined;
  }

  const combinationStrategy = mergePricingCombinationStrategies(
    manualPricingCombinationStrategy,
    learnedPricingCombinationStrategy,
  );

  logStructured(
    "log",
    "[fetchExternalProductPrices] Prepared pricing fetch context",
    {
      externalProductId,
      providerId,
      providerName: provider.name,
      sourceUrl,
      selectedEndpointId: selectedEndpoint.id,
      selectedEndpointName: selectedEndpoint.name,
      selectedEndpointUrl: selectedEndpoint.url,
      endpointQueryParams,
      usedCachedPricingSelection: Boolean(cachedPricingSelection?.endpointId),
      correctedConfigurationParams,
      hasCachedPriceSchema: Boolean(cachedPriceSchema),
      reuseExistingConfigurations,
      reusableStoredConfigurationCount:
        reusableStoredConfigurations.configurations.length,
      reusableStoredConfigurationSource: reusableStoredConfigurations.source,
      browserLikeHeadersApplied: {
        hasUserAgent: Boolean(requestHeaders["User-Agent"]),
        hasOrigin: Boolean(requestHeaders.Origin),
        hasReferer: Boolean(requestHeaders.Referer),
      },
      effectiveConfigurationParams: effectiveConfigurationParams ?? {},
      fixedProviderPricingSelections,
      rawVariableAttributeCount: rawVariablePricingAttributes.length,
      rawVariableCombinationCount: rawVariablePricingAttributes.reduce(
        (total, attribute) => total * Math.max(attribute.values.length, 1),
        rawVariablePricingAttributes.length > 0 ? 1 : 0,
      ),
      manualPricingExclusionRuleCount:
        persistedManualPricingExclusionRules.length,
      ignoredPersistedAiPricingExclusionRuleCount:
        persistedAiPricingExclusionRules.length,
      manualPricingCombinationStrategySummary:
        summarizePricingCombinationStrategy(manualPricingCombinationStrategy),
      learnedPricingCombinationStrategySummary:
        summarizePricingCombinationStrategy(learnedPricingCombinationStrategy),
      filteredVariableAttributeCount: variablePricingAttributes.length,
      filteredVariableCombinationCount: variablePricingAttributes.reduce(
        (total, attribute) => total * Math.max(attribute.values.length, 1),
        variablePricingAttributes.length > 0 ? 1 : 0,
      ),
      combinationStrategySummary:
        summarizePricingCombinationStrategy(combinationStrategy),
      attributeUsageSummary,
    },
  );

  const ignoredUnmappedAttributes = attributeUsageSummary.filter(
    (attribute) =>
      !attribute.usedForVariablePricing &&
      !attribute.internalAttributeId &&
      !attribute.providerOnlyPricing,
  );

  if (ignoredUnmappedAttributes.length > 0) {
    logStructured(
      "warn",
      "[fetchExternalProductPrices] Some unmapped attributes are currently not used for variable pricing",
      {
        externalProductId,
        attributes: ignoredUnmappedAttributes,
      },
    );
  }

  const fetchResult = await fetchPriceConfigurations({
    endpoint: selectedEndpoint,
    provider,
    externalAttributes: externalProduct.attributes ?? [],
    attributeMappings: externalProduct.attributeMappings,
    combinationStrategy,
    fallbackCombinationStrategies: [manualPricingCombinationStrategy],
    sourceUrl,
    providerId,
    requestHeaders,
    configurationParams: effectiveConfigurationParams,
    fixedProviderPricingSelections,
    staticQueryParams: pricingSelection.staticQueryParams,
    valueMappings: effectiveValueMappings,
    cachedPriceSchema,
    existingConfigurations: reusableStoredConfigurations.configurations,
    reuseExistingConfigurations,
    runtimeDeadline,
    cancellation,
  });

  const fetchedConfigurations = fetchResult.configurations;

  // Combine pre-fetch and runtime-learned strategies for persistence
  if (fetchResult.runtimeLearnedStrategy?.rules?.length) {
    learnedPricingCombinationStrategy = mergePricingCombinationStrategies(
      learnedPricingCombinationStrategy,
      fetchResult.runtimeLearnedStrategy,
    );
  }

  if (fetchResult.learnedSchema && providerId) {
    try {
      await cancellation?.throwIfCancelled(
        "persisting learned external price schemas",
      );

      if (runtimeDeadline) {
        assertWithinWorkflowRuntime(
          runtimeDeadline,
          "persisting learned external price schemas",
        );
      }

      const providerDb = getDb();
      await providerDb
        .collection("externalProviders")
        .doc(providerId)
        .update({
          [`priceSchemas.${selectedEndpoint.id}`]: fetchResult.learnedSchema,
          updatedAt: FieldValue.serverTimestamp(),
        });
      revalidateCachedTag(EXTERNAL_PROVIDERS_TAG);
    } catch (schemaError) {
      console.error("Failed to persist price schema:", schemaError);
    }
  }

  if (fetchedConfigurations.length === 0) {
    logStructured(
      "warn",
      "[fetchExternalProductPrices] No prices could be fetched",
      {
        externalProductId,
        durationMs: Date.now() - startedAt,
        selectedEndpointId: selectedEndpoint.id,
        selectedEndpointName: selectedEndpoint.name,
      },
    );
    return { success: false, error: "No prices could be fetched" };
  }

  const discountMultiplier = 1 - discountPercent / 100;
  const marginMultiplier = 1 + marginPercent / 100;
  const taxMultiplier = 1 + taxPercent / 100;
  const shouldAdjust =
    marginPercent > 0 || taxPercent > 0 || discountPercent > 0;
  const applyAdjustments = (price: number) => {
    if (!Number.isFinite(price)) return price;
    const adjusted =
      price * discountMultiplier * marginMultiplier * taxMultiplier;
    return clampPriceFractionDigits(Math.max(0, adjusted));
  };

  const configurationsWithAdjustments = shouldAdjust
    ? fetchedConfigurations.map((configuration) => ({
        ...configuration,
        priceInfo: configuration.priceInfo
          ? {
              ...configuration.priceInfo,
              priceRanges: configuration.priceInfo.priceRanges?.map(
                (range) => ({
                  ...range,
                  price:
                    range.price !== undefined
                      ? applyAdjustments(range.price)
                      : range.price,
                }),
              ),
            }
          : configuration.priceInfo,
      }))
    : fetchedConfigurations;

  const configurationsWithDeliveryOffset = externalProduct.deliveryTimeExtraDay
    ? configurationsWithAdjustments.map((configuration) => ({
        ...configuration,
        priceInfo: configuration.priceInfo
          ? {
              ...configuration.priceInfo,
              priceRanges: configuration.priceInfo.priceRanges?.map(
                (range) => ({
                  ...range,
                  ...(range.deliveryTime !== undefined
                    ? { deliveryTime: range.deliveryTime + 1 }
                    : {}),
                }),
              ),
            }
          : configuration.priceInfo,
      }))
    : configurationsWithAdjustments;

  const sanitizedConfigurations = normalizeExternalPriceConfigurations(
    configurationsWithDeliveryOffset,
  ) as ExternalPriceConfiguration[];

  const sampleConfig = sanitizedConfigurations[0];
  const samplePriceRange = sampleConfig?.priceInfo?.priceRanges?.[0];
  const zeroPriceConfigurations = sanitizedConfigurations.filter(
    (configuration) => hasOnlyZeroPrices(configuration.priceInfo),
  );
  const sampleZeroPriceConfig = zeroPriceConfigurations[0];

  logStructured(
    "log",
    "[fetchExternalProductPrices] Finished external price fetch",
    {
      externalProductId,
      durationMs: Date.now() - startedAt,
      fetchedConfigurationCount: sanitizedConfigurations.length,
      zeroPriceConfigurationCount: zeroPriceConfigurations.length,
      nonZeroPriceConfigurationCount:
        sanitizedConfigurations.length - zeroPriceConfigurations.length,
      adjustmentApplied: shouldAdjust,
      marginPercent,
      taxPercent,
      discountPercent,
      sample: sampleConfig
        ? {
            configuration: sampleConfig.configuration,
            configurationDetails: describeConfigurationForLog({
              configuration: sampleConfig.configuration,
              externalAttributes: externalProduct.attributes ?? [],
            }),
            currency: sampleConfig.priceInfo?.currency,
            priceText: sampleConfig.priceInfo?.priceText,
            priceRangeCount: sampleConfig.priceInfo?.priceRanges?.length ?? 0,
            firstPriceRange: samplePriceRange
              ? {
                  quantity: samplePriceRange.quantity,
                  price: samplePriceRange.price,
                  unit: samplePriceRange.unit,
                }
              : undefined,
          }
        : undefined,
      sampleZeroPrice: sampleZeroPriceConfig
        ? {
            configuration: sampleZeroPriceConfig.configuration,
            configurationDetails: describeConfigurationForLog({
              configuration: sampleZeroPriceConfig.configuration,
              externalAttributes: externalProduct.attributes ?? [],
            }),
            priceInfo: summarizePriceInfo(sampleZeroPriceConfig.priceInfo),
          }
        : undefined,
    },
  );

  return {
    success: true,
    result: {
      priceConfigurations: sanitizedConfigurations,
      priceConfigurationReuseSignature: currentPriceConfigurationReuseSignature,
      pricingSelection: pricingSelectionToPersist,
      learnedCombinationStrategy: learnedPricingCombinationStrategy,
    },
  };
}

export async function fetchExternalProductPricesSystem(
  externalProductId: string,
  marginPercent: number = 0,
  taxPercent: number = 0,
  discountPercent: number = 0,
  fetchStrategy: ExternalProductPriceFetchStrategy = "reuse",
  workflowStartedAtMs?: number,
  workflowRunId?: string,
): Promise<{
  success: boolean;
  priceConfigurations?: ExternalPriceConfiguration[];
  error?: string;
}> {
  const cancellation = createExternalProductPriceFetchWorkflowCancellation({
    externalProductId,
    workflowRunId,
  });

  try {
    const db = getDb();
    const runtimeDeadline =
      typeof workflowStartedAtMs === "number"
        ? createWorkflowRuntimeDeadline(workflowStartedAtMs)
        : undefined;

    const fetchResult = await fetchExternalProductPricesInternal({
      externalProductId,
      marginPercent,
      taxPercent,
      discountPercent,
      reuseExistingConfigurations:
        shouldReuseStoredPriceConfigurations(fetchStrategy),
      workflowStartedAtMs,
      cancellation,
    });

    if (!fetchResult.success || !fetchResult.result) {
      return {
        success: false,
        error: fetchResult.error || "Unknown error",
      };
    }

    const {
      priceConfigurations,
      priceConfigurationReuseSignature,
      pricingSelection,
      learnedCombinationStrategy,
    } = fetchResult.result;

    const docRef = db.collection("externalProducts").doc(externalProductId);
    const currentDoc = await docRef.get();
    const currentExternalProduct = currentDoc.data() as
      | ExternalProduct
      | undefined;
    const existingRules = currentExternalProduct?.pricingExclusionRules ?? [];
    const manualRules = getPersistedManualPricingExclusionRules(existingRules);
    const removedPersistedAiRuleCount =
      existingRules.length - manualRules.length;

    if (learnedCombinationStrategy?.rules?.length) {
      logStructured(
        "log",
        "[fetchExternalProductPrices] Learned AI pricing rules for runtime only",
        {
          externalProductId,
          learnedRuleCount: learnedCombinationStrategy.rules.length,
          removedPersistedAiRuleCount,
        },
      );
    }

    if (runtimeDeadline) {
      assertWithinWorkflowRuntime(
        runtimeDeadline,
        "persisting fetched external product prices",
      );
    }

    await cancellation?.throwIfCancelled(
      "persisting fetched external product prices",
    );

    const appliedFields = await writePriceConfigurations({
      docRef,
      configurations: priceConfigurations,
      db,
    });
    const deletedPendingFields = await deletePendingPriceConfigurations({
      docRef,
      db,
    });

    const updateData: Record<string, unknown> = {
      ...appliedFields,
      ...deletedPendingFields,
      priceRefreshStatus: "applied",
      priceRefreshError: FieldValue.delete(),
      priceRefreshLastFetchedAt: FieldValue.serverTimestamp(),
      priceRefreshLastAppliedAt: FieldValue.serverTimestamp(),
      priceMarginPercent:
        marginPercent > 0 ? marginPercent : FieldValue.delete(),
      priceTaxPercent: taxPercent > 0 ? taxPercent : FieldValue.delete(),
      priceDiscountPercent:
        discountPercent > 0 ? discountPercent : FieldValue.delete(),
      priceConfigurationReuseSignature,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (removedPersistedAiRuleCount > 0) {
      updateData.pricingExclusionRules =
        manualRules.length > 0
          ? removeUndefinedDeep(manualRules)
          : FieldValue.delete();
    }

    if (pricingSelection) {
      updateData.pricingSelection = pricingSelection;
    }

    await cancellation?.throwIfCancelled(
      "saving fetched external product prices",
    );
    await docRef.update(updateData);
    revalidateCachedTag(EXTERNAL_PRODUCTS_TAG);

    if (removedPersistedAiRuleCount > 0) {
      logStructured(
        "log",
        "[fetchExternalProductPrices] Removed persisted AI exclusion rules",
        {
          externalProductId,
          removedPersistedAiRuleCount,
          remainingManualRuleCount: manualRules.length,
        },
      );
    }

    return {
      success: true,
      priceConfigurations,
    };
  } catch (error) {
    if (!isExternalProductPriceFetchWorkflowCancelledError(error)) {
      console.error("Error fetching external product prices (system):", error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    cancellation?.dispose();
  }
}

function normalizeConfiguration(
  configuration: Record<string, string>,
): Record<string, string> {
  return normalizeExternalPriceConfigurationSelection(configuration);
}

function normalizePriceConfigurationsForComparison(
  configurations: ExternalPriceConfiguration[],
): ExternalPriceConfiguration[] {
  return configurations
    .map((configuration) => ({
      ...configuration,
      configuration: normalizeConfiguration(configuration.configuration),
      priceInfo: {
        ...configuration.priceInfo,
        priceRanges: [...(configuration.priceInfo.priceRanges ?? [])]
          .map((range) => ({
            ...range,
            deliveryTime: normalizeExternalDeliveryTime(range.deliveryTime),
          }))
          .toSorted((a, b) => {
            const quantityA = a.quantity ?? Number.POSITIVE_INFINITY;
            const quantityB = b.quantity ?? Number.POSITIVE_INFINITY;

            if (quantityA !== quantityB) {
              return quantityA - quantityB;
            }

            const priceA = a.price ?? Number.POSITIVE_INFINITY;
            const priceB = b.price ?? Number.POSITIVE_INFINITY;

            if (priceA !== priceB) {
              return priceA - priceB;
            }

            const deliveryTimeA = a.deliveryTime ?? Number.POSITIVE_INFINITY;
            const deliveryTimeB = b.deliveryTime ?? Number.POSITIVE_INFINITY;

            if (deliveryTimeA !== deliveryTimeB) {
              return deliveryTimeA - deliveryTimeB;
            }

            return (a.unit ?? "").localeCompare(b.unit ?? "");
          }),
      },
    }))
    .toSorted((a, b) => {
      const configDiff = JSON.stringify(a.configuration).localeCompare(
        JSON.stringify(b.configuration),
      );

      if (configDiff !== 0) {
        return configDiff;
      }

      return (a.sourceUrl ?? "").localeCompare(b.sourceUrl ?? "");
    });
}

function arePriceConfigurationsEqual(
  current: ExternalPriceConfiguration[],
  next: ExternalPriceConfiguration[],
): boolean {
  const normalizedCurrent = normalizePriceConfigurationsForComparison(current);
  const normalizedNext = normalizePriceConfigurationsForComparison(next);

  return JSON.stringify(normalizedCurrent) === JSON.stringify(normalizedNext);
}

export async function checkExternalProductPriceChangesSystem(
  externalProductId: string,
  marginPercent?: number,
  taxPercent?: number,
  discountPercent?: number,
): Promise<{
  success: boolean;
  hasPriceChanges?: boolean;
  currentCount?: number;
  fetchedCount?: number;
  error?: string;
}> {
  try {
    const db = getDb();

    const externalDoc = await db
      .collection("externalProducts")
      .doc(externalProductId)
      .get();

    if (!externalDoc.exists) {
      return { success: false, error: "External product not found" };
    }

    const externalProduct = externalDoc.data() as ExternalProduct;
    const resolvedMarginPercent =
      marginPercent ?? externalProduct.priceMarginPercent ?? 0;
    const resolvedTaxPercent =
      taxPercent ?? externalProduct.priceTaxPercent ?? 0;
    const resolvedDiscountPercent =
      discountPercent ?? externalProduct.priceDiscountPercent ?? 0;

    const fetchResult = await fetchExternalProductPricesInternal({
      externalProductId,
      marginPercent: resolvedMarginPercent,
      taxPercent: resolvedTaxPercent,
      discountPercent: resolvedDiscountPercent,
      reuseExistingConfigurations: false,
    });

    if (!fetchResult.success || !fetchResult.result) {
      return {
        success: false,
        error: fetchResult.error || "Unknown error",
      };
    }

    const currentConfigurations = await readPriceConfigurations({
      docRef: db.collection("externalProducts").doc(externalProductId),
      externalProduct,
    });
    const fetchedConfigurations = fetchResult.result.priceConfigurations;
    const hasPriceChanges = !arePriceConfigurationsEqual(
      currentConfigurations,
      fetchedConfigurations,
    );

    return {
      success: true,
      hasPriceChanges,
      currentCount: currentConfigurations.length,
      fetchedCount: fetchedConfigurations.length,
    };
  } catch (error) {
    console.error("Error checking external product price changes:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function stageExternalProductPricesForReviewSystem(
  externalProductId: string,
  marginPercent: number = 0,
  taxPercent: number = 0,
  discountPercent: number = 0,
  fetchStrategy: ExternalProductPriceFetchStrategy = "reuse",
  workflowStartedAtMs?: number,
  workflowRunId?: string,
): Promise<{
  success: boolean;
  priceConfigurations?: ExternalPriceConfiguration[];
  error?: string;
}> {
  const cancellation = createExternalProductPriceFetchWorkflowCancellation({
    externalProductId,
    workflowRunId,
  });

  try {
    const db = getDb();
    const runtimeDeadline =
      typeof workflowStartedAtMs === "number"
        ? createWorkflowRuntimeDeadline(workflowStartedAtMs)
        : undefined;

    const fetchResult = await fetchExternalProductPricesInternal({
      externalProductId,
      marginPercent,
      taxPercent,
      discountPercent,
      reuseExistingConfigurations:
        shouldReuseStoredPriceConfigurations(fetchStrategy),
      workflowStartedAtMs,
      cancellation,
    });

    if (!fetchResult.success || !fetchResult.result) {
      return {
        success: false,
        error: fetchResult.error || "Unknown error",
      };
    }

    const {
      priceConfigurations,
      priceConfigurationReuseSignature,
      pricingSelection,
    } = fetchResult.result;

    const docRef = db.collection("externalProducts").doc(externalProductId);

    if (runtimeDeadline) {
      assertWithinWorkflowRuntime(
        runtimeDeadline,
        "persisting staged external product prices",
      );
    }

    await cancellation?.throwIfCancelled(
      "persisting staged external product prices",
    );

    const pendingFields = await writePendingPriceConfigurations({
      docRef,
      configurations: priceConfigurations,
      db,
    });

    const updateData: Record<string, unknown> = {
      ...pendingFields,
      priceRefreshStatus: "pending-review",
      priceRefreshError: FieldValue.delete(),
      priceRefreshLastFetchedAt: FieldValue.serverTimestamp(),
      priceMarginPercent:
        marginPercent > 0 ? marginPercent : FieldValue.delete(),
      priceTaxPercent: taxPercent > 0 ? taxPercent : FieldValue.delete(),
      priceDiscountPercent:
        discountPercent > 0 ? discountPercent : FieldValue.delete(),
      priceConfigurationReuseSignature,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (pricingSelection) {
      updateData.pricingSelection = pricingSelection;
    }

    await cancellation?.throwIfCancelled(
      "saving staged external product prices",
    );
    await docRef.update(updateData);

    revalidateCachedTag(EXTERNAL_PRODUCTS_TAG);

    return {
      success: true,
      priceConfigurations,
    };
  } catch (error) {
    if (!isExternalProductPriceFetchWorkflowCancelledError(error)) {
      console.error("Error staging external product prices for review:", error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    cancellation?.dispose();
  }
}
