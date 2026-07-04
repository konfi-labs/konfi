import "server-only";

import { AttributeInputTypeEnum, PriceTypeEnum } from "@konfi/types";
import type { Attribute, Channel, Option, Product } from "@konfi/types";
import {
  DEFAULT_COMBINATION,
  resolveDynamicPricingRoutePrices,
} from "@konfi/utils";
import { normalizeIdentityText } from "../inbound-email/addressing";
import { ToolLayerError } from "./errors";
import { canAccessChannel, requireChannelAccess } from "./permissions";
import { isSensitiveBusinessRecordKey } from "./business-resources";
import type { ProductAgentCatalogChangeStatus } from "../durable-agents/product-workflow.types";
import type {
  BusinessJsonValue,
  BusinessResourceDescriptor,
  CatalogAttributeResource,
  ChannelToolSummary,
  ExplainProductPriceInput,
  ProductConfigurationAttribute,
  ProductConfigurationOption,
  ProductTypeResource,
  ResourceOption,
  ToolLayerRuntime,
} from "./types";
import type { BusinessUpdateDraftChange } from "./tool-inputs";

type PriceCalculationResult =
  | {
      deliveryTime?: number | null;
      formattedPrice: string;
      result: number;
    }
  | {
      error: string;
    };

const MAX_BUSINESS_UPDATE_CHANGES = 10;
const BUSINESS_UPDATE_FIELD_PATH_PATTERN =
  /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/;

export function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new ToolLayerError("validation_error", `${field} is required.`);
  }

  return trimmed;
}

export function optionalNonEmpty(
  value: string | undefined,
  field: string,
): string | undefined {
  return value === undefined ? undefined : requireNonEmpty(value, field);
}

export function optionalIsoDate(
  value: string | undefined,
  field: string,
): string | undefined {
  const normalized = optionalNonEmpty(value, field);
  if (!normalized) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ToolLayerError(
      "validation_error",
      `${field} must use YYYY-MM-DD format.`,
    );
  }

  return normalized;
}

export function optionalDraftRunId(
  value: string | undefined,
): string | undefined {
  const draftRunId = optionalNonEmpty(value, "draftRunId");

  if (!draftRunId) {
    return undefined;
  }

  if (draftRunId.includes("/") || draftRunId.length > 160) {
    throw new ToolLayerError(
      "validation_error",
      "draftRunId must be a Firestore document ID returned by a previous draft save.",
    );
  }

  return draftRunId;
}

function isBusinessJsonValue(
  value: unknown,
  depth: number = 0,
): value is BusinessJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return (
      depth < 8 && value.every((item) => isBusinessJsonValue(item, depth + 1))
    );
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    depth < 8 &&
    Object.entries(value as Record<string, unknown>).every(
      ([key, item]) =>
        key.trim().length > 0 && isBusinessJsonValue(item, depth + 1),
    )
  );
}

function requireBusinessJsonValue(
  value: unknown,
  field: string,
): BusinessJsonValue {
  if (!isBusinessJsonValue(value)) {
    throw new ToolLayerError(
      "validation_error",
      `${field} must be a finite JSON value.`,
    );
  }

  return value;
}

function normalizeBusinessUpdatePath(path: string, index: number): string {
  const normalizedPath = requireNonEmpty(path, `changes[${index}].path`);

  if (
    normalizedPath.length > 150 ||
    !BUSINESS_UPDATE_FIELD_PATH_PATTERN.test(normalizedPath)
  ) {
    throw new ToolLayerError(
      "validation_error",
      "Business update change paths must be dot-separated field names.",
      {
        details: {
          path: normalizedPath,
        },
      },
    );
  }

  const sensitiveSegment = normalizedPath
    .split(".")
    .find(isSensitiveBusinessRecordKey);

  if (sensitiveSegment) {
    throw new ToolLayerError(
      "validation_error",
      "Business update drafts cannot target sensitive credential fields.",
      {
        details: {
          field: sensitiveSegment,
        },
      },
    );
  }

  return normalizedPath;
}

export function normalizeBusinessUpdateChanges(
  changes: readonly BusinessUpdateDraftChange[],
): BusinessUpdateDraftChange[] {
  if (changes.length === 0) {
    throw new ToolLayerError(
      "validation_error",
      "At least one business update change is required.",
    );
  }

  if (changes.length > MAX_BUSINESS_UPDATE_CHANGES) {
    throw new ToolLayerError(
      "validation_error",
      `Business update drafts are limited to ${MAX_BUSINESS_UPDATE_CHANGES} changes.`,
    );
  }

  const seenPaths = new Set<string>();

  return changes.map((change, index) => {
    const path = normalizeBusinessUpdatePath(change.path, index);
    if (seenPaths.has(path)) {
      throw new ToolLayerError(
        "validation_error",
        "Business update draft paths must be unique.",
        {
          details: {
            path,
          },
        },
      );
    }
    seenPaths.add(path);

    return {
      ...(change.note ? { note: requireNonEmpty(change.note, "note") } : {}),
      path,
      ...(change.previousValue !== undefined
        ? {
            previousValue: requireBusinessJsonValue(
              change.previousValue,
              `changes[${index}].previousValue`,
            ),
          }
        : {}),
      value: requireBusinessJsonValue(change.value, `changes[${index}].value`),
    };
  });
}

export function summarizeChannel(channel: Channel): ChannelToolSummary {
  return {
    active: channel.active,
    name: channel.name,
  };
}

export function enumOptions<TValue extends string>(
  values: Record<string, TValue>,
): ResourceOption[] {
  return Object.values(values).map((value) => ({
    id: value,
    label: value,
  }));
}

function channelDetails(channels: readonly Channel[]) {
  return {
    availableChannels: channels.map(summarizeChannel),
  };
}

export function businessResourceNotes(input?: {
  descriptor?: BusinessResourceDescriptor;
}): string[] {
  return [
    "These read-only MCP business resource reads never mutate final records. Use save_business_update_draft for small human-reviewed change proposals and save_draft for category, product type, quote, order, or product drafts.",
    "Generic records are sanitized and truncated to avoid leaking credentials or overloading the MCP client context. Use get_business_record for a single record when a search result needs more detail.",
    ...(input?.descriptor?.channelScoped
      ? [
          "This resource is channel-scoped. Prefer channelName from list_channels; channelId is accepted for backward compatibility.",
        ]
      : []),
    ...(input?.descriptor?.source === "fakturownia"
      ? [
          "This resource is read from the configured Fakturownia account rather than Firestore.",
        ]
      : []),
  ];
}

export function costReadNotes(): string[] {
  return [
    "Cost data contains only admin-approved Fakturownia cost mappings.",
    "This MCP surface is read-only and does not recommend, draft, or update product prices.",
  ];
}

function normalizeChannelLookupText(value: string): string {
  return normalizeIdentityText(value.replace(/ł/gi, "l"));
}

function normalizeChannelMatchValue(value: string): string {
  return normalizeChannelLookupText(value).replace(/[^a-z0-9]+/g, "");
}

function findMatchingChannels(
  channels: readonly Channel[],
  channelName: string,
): Channel[] {
  const normalizedRequestedName = normalizeChannelLookupText(channelName);
  const normalizedRequestedToken = normalizeChannelMatchValue(channelName);
  const exactMatches = channels.filter(
    (channel) =>
      normalizeChannelLookupText(channel.name) === normalizedRequestedName ||
      normalizeChannelLookupText(channel.id) === normalizedRequestedName,
  );

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return channels.filter((channel) => {
    const aliases = [
      normalizeChannelMatchValue(channel.name),
      normalizeChannelMatchValue(channel.id),
    ];

    return aliases.includes(normalizedRequestedToken);
  });
}

export async function listAuthorizedChannels(
  runtime: ToolLayerRuntime,
): Promise<Channel[]> {
  const channels = await runtime.readers.listChannels();
  return channels
    .filter((channel) => canAccessChannel(runtime.auth, channel.id))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export async function resolveToolChannel(
  runtime: ToolLayerRuntime,
  input: {
    channelId?: string;
    channelName?: string;
  },
): Promise<string> {
  const explicitChannelId = optionalNonEmpty(input.channelId, "channelId");

  if (explicitChannelId) {
    requireChannelAccess(runtime.auth, explicitChannelId);
    return explicitChannelId;
  }

  const authorizedChannels = await listAuthorizedChannels(runtime);
  const explicitChannelName = optionalNonEmpty(
    input.channelName,
    "channelName",
  );

  if (explicitChannelName) {
    const matches = findMatchingChannels(
      authorizedChannels,
      explicitChannelName,
    );

    if (matches.length === 0) {
      throw new ToolLayerError(
        "validation_error",
        "No authorized channel matched that name.",
        {
          details: channelDetails(authorizedChannels),
        },
      );
    }

    if (matches.length > 1) {
      throw new ToolLayerError(
        "ambiguous_channel",
        "Multiple authorized channels matched that name.",
        {
          details: channelDetails(matches),
        },
      );
    }

    return matches[0].id;
  }

  if (authorizedChannels.length === 1) {
    return authorizedChannels[0].id;
  }

  throw new ToolLayerError(
    "channel_required",
    "Choose a channel name before using this tool.",
    {
      details: {
        ...channelDetails(authorizedChannels),
        suggestedInput: "channelName",
      },
    },
  );
}

function readChannelTenantId(channel: Channel): string | undefined {
  const tenantId = (channel as Channel & { tenantId?: string | null }).tenantId;
  return typeof tenantId === "string" && tenantId.trim().length > 0
    ? tenantId.trim()
    : undefined;
}

export async function resolveToolTenantId(
  runtime: ToolLayerRuntime,
  channelId: string,
): Promise<string | undefined> {
  const authTenantId = runtime.auth.permissions.tenantId?.trim();
  if (authTenantId) {
    return authTenantId;
  }

  const authorizedChannels = await listAuthorizedChannels(runtime);
  const channel = authorizedChannels.find(
    (candidate) => candidate.id === channelId,
  );
  return channel ? readChannelTenantId(channel) : undefined;
}

export function toCalculationResult(value: unknown): PriceCalculationResult {
  if (!value || typeof value !== "object") {
    return { error: "Pricing did not return a result." };
  }

  if ("error" in value) {
    const error = (value as { error?: unknown }).error;
    return { error: typeof error === "string" ? error : "Pricing failed." };
  }

  const result = (value as { result?: unknown }).result;
  const formattedPrice = (value as { formattedPrice?: unknown }).formattedPrice;
  const deliveryTime = (value as { deliveryTime?: unknown }).deliveryTime;

  if (typeof result !== "number" || typeof formattedPrice !== "string") {
    return { error: "Pricing did not return a usable result." };
  }

  return {
    deliveryTime: typeof deliveryTime === "number" ? deliveryTime : null,
    formattedPrice,
    result,
  };
}

export async function resolvePricesForExplanation(
  runtime: ToolLayerRuntime,
  input: ExplainProductPriceInput & {
    channelId: string;
    productId: string;
    quantity: number;
  },
  product: Product,
) {
  if (product.priceType !== PriceTypeEnum.DYNAMIC) {
    return product.prices;
  }

  const result = await resolveDynamicPricingRoutePrices({
    allowAdminPreview: true,
    body: {
      calculatedCombination: input.calculatedCombination ?? DEFAULT_COMBINATION,
      channelId: input.channelId,
      combination: input.calculatedCombination ?? DEFAULT_COMBINATION,
      customFormat: input.customFormat ?? false,
      height: input.height,
      pageCount: input.pageCount,
      productId: input.productId,
      quantity: input.quantity,
      selectedAttributeOptions: input.selectedAttributeOptions ?? null,
      volume: input.volume,
      width: input.width,
    },
    readers: {
      getDynamicPricingAttributes: runtime.readers.getDynamicPricingAttributes,
      getDynamicPricingPresetsByIds: (channelId, presetIds) =>
        runtime.readers.getDynamicPricingPresetsByIds({
          channelId,
          presetIds,
        }),
      getProduct: async (channelId, productId) =>
        channelId === input.channelId && productId === product.id
          ? product
          : undefined,
      getProductDynamicPricing: async (channelId, productId) =>
        (await runtime.readers.getProductDynamicPricing({
          channelId,
          productId,
        })) ?? undefined,
    },
  });

  if (result.kind === "bad-request") {
    throw new ToolLayerError("validation_error", result.error);
  }

  return result.prices;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function summarizeConfigurationOption(
  value: string,
  option: Option | undefined,
): ProductConfigurationOption {
  return {
    ...(option?.color ? { color: option.color } : {}),
    customFormat: option?.customFormat ?? false,
    ...(option?.formatHeight !== undefined
      ? { formatHeight: option.formatHeight }
      : {}),
    ...(option?.formatWidth !== undefined
      ? { formatWidth: option.formatWidth }
      : {}),
    label: option?.label ?? value,
    ...(option?.pages !== undefined ? { pages: option.pages } : {}),
    value,
  };
}

export function summarizeConfigurationAttribute(
  product: Product,
  attribute: Attribute | undefined,
  attributeId: string,
): ProductConfigurationAttribute {
  const attributeOptions = attribute?.options ?? [];
  const optionByValue = new Map(
    attributeOptions.map((option) => [option.value, option]),
  );
  const productOptionValues =
    product.attributeOptions[attributeId] ??
    attributeOptions.map((option) => option.value);
  const options = uniqueValues(productOptionValues).flatMap((value) => {
    const option = optionByValue.get(value);

    return option?.hidden ? [] : [summarizeConfigurationOption(value, option)];
  });

  return {
    calculated: attribute?.calculated ?? false,
    format: attribute?.format ?? false,
    id: attributeId,
    name: attribute?.name ?? attributeId,
    options,
    pages: attribute?.pages ?? false,
    required: attribute?.required ?? false,
    type: attribute?.type ?? "DROPDOWN",
  };
}

export function summarizeCatalogAttribute(
  attribute: Attribute,
): CatalogAttributeResource {
  const options = (attribute.options ?? []).flatMap((option) =>
    option.hidden ? [] : [summarizeConfigurationOption(option.value, option)],
  );

  return {
    calculated: attribute.calculated ?? false,
    format: attribute.format ?? false,
    id: attribute.id,
    label: attribute.name,
    optionCount: options.length,
    options,
    pages: attribute.pages ?? false,
    required: attribute.required ?? false,
    type: attribute.type ?? "DROPDOWN",
  };
}

export function summarizeProductTypeResource(productType: {
  attributes?: string[];
  id: string;
  isShippable?: boolean;
  name: string;
}): ProductTypeResource {
  return {
    attributeIds: productType.attributes ?? [],
    id: productType.id,
    isShippable: productType.isShippable ?? true,
    label: productType.name,
  };
}

export function summarizeNamedResource(input: {
  id: string;
  name: string;
}): ResourceOption {
  return {
    id: input.id,
    label: input.name,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function optionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function optionalCatalogChangeStatus(
  value: unknown,
): ProductAgentCatalogChangeStatus {
  if (
    value === "approved" ||
    value === "applied" ||
    value === "blocked" ||
    value === "proposed"
  ) {
    return value;
  }

  return "proposed";
}

export function isAttributeInputType(
  value: unknown,
): value is AttributeInputTypeEnum {
  return (
    typeof value === "string" &&
    Object.values(AttributeInputTypeEnum).includes(
      value as AttributeInputTypeEnum,
    )
  );
}
