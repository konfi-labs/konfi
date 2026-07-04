import {
  PriceTypeEnum,
  productionGroupingClassificationVersion,
  type OrderItem,
  type ProductionGroupingAxis,
  type ProductionGroupingClassification,
  type ProductionGroupingClassifiedValue,
  type ProductionGroupingProfile,
} from "@konfi/types";
import { normalizeProductionGroupingSettings } from "@konfi/utils";

export const PRODUCTION_GROUPING_UNCLASSIFIED_KEY = "__unclassified__";
export const PRODUCTION_GROUPING_AI_CONFIDENCE_THRESHOLD = 0.82;

export const PRODUCTION_MATERIAL_UNCLASSIFIED_KEY =
  PRODUCTION_GROUPING_UNCLASSIFIED_KEY;
export const PRODUCTION_MATERIAL_AI_CONFIDENCE_THRESHOLD =
  PRODUCTION_GROUPING_AI_CONFIDENCE_THRESHOLD;

type PrimitiveGroupingValue = boolean | number | string | null | undefined;

export interface ProductionGroupingClassificationItem {
  advancedAttributeSelections?: unknown;
  calculatedCombination?: string | null;
  combination?: string | null;
  customFormat: boolean;
  customPrice: number | null;
  description: string;
  height?: number;
  id: string;
  name?: string;
  pageCount?: number | null;
  product?: {
    attributeOptions?: unknown;
    attributes?: string[];
    category?: {
      id?: string;
      name?: string;
      path?: unknown;
    } | null;
    id?: string;
    name?: string;
    priceType?: PriceTypeEnum;
    productType?: {
      id?: string;
      name?: string;
    } | null;
  } | null;
  unit: string;
  width?: number;
}

export interface ProductionGroupingItemRef {
  inputHash: string;
  itemId: string;
  orderId: string;
  profileHash: string;
  signatureHash: string;
}

export interface ProductionGroupingResolvedClassification extends ProductionGroupingClassification {
  needsAi: boolean;
}

export type ProductionMaterialClassificationItem =
  ProductionGroupingClassificationItem;
export type ProductionMaterialItemRef = ProductionGroupingItemRef;
export type ProductionMaterialResolvedClassification =
  ProductionGroupingResolvedClassification;

interface ConfigurationPart {
  name: string | null;
  value: string;
}

interface ResolvedAxisValue extends ProductionGroupingClassifiedValue {
  confidence: number;
}

function normalizeGroupingText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGroupingLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getComparableName(value: string | null | undefined): string {
  return normalizeGroupingText(value).replace(/[^\p{L}\p{N}]+/gu, " ");
}

function stableNormalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalizeValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, stableNormalizeValue(entryValue)]),
    );
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalizeValue(value));
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toOptionalNumber(value: PrimitiveGroupingValue): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseConfigurationParts(
  value: string | null | undefined,
): ConfigurationPart[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\n;|]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf(":");

      if (separatorIndex <= 0) {
        return {
          name: null,
          value: part,
        };
      }

      const name = part.slice(0, separatorIndex).trim();
      const partValue = part.slice(separatorIndex + 1).trim();

      if (!name || !partValue) {
        return {
          name: null,
          value: part,
        };
      }

      return {
        name,
        value: partValue,
      };
    });
}

function primitiveToString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return null;
}

function collectUnknownConfigurationParts(
  value: unknown,
  path: string[],
  parts: ConfigurationPart[],
  depth = 0,
) {
  if (depth > 5 || value === null || value === undefined) {
    return;
  }

  const primitiveValue = primitiveToString(value);
  if (primitiveValue !== null) {
    parts.push({
      name: path.length > 0 ? path.join(" ") : null,
      value: primitiveValue,
    });
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectUnknownConfigurationParts(entry, path, parts, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      collectUnknownConfigurationParts(
        entryValue,
        [...path, key],
        parts,
        depth + 1,
      );
    }
  }
}

function getConfigurationParts(
  item: ProductionGroupingClassificationItem,
): ConfigurationPart[] {
  const parts = [
    ...parseConfigurationParts(item.description),
    ...parseConfigurationParts(item.combination),
    ...parseConfigurationParts(item.calculatedCombination),
  ];

  collectUnknownConfigurationParts(
    item.advancedAttributeSelections,
    ["advanced attributes"],
    parts,
  );
  collectUnknownConfigurationParts(
    item.product?.attributeOptions,
    ["attribute options"],
    parts,
  );

  for (const attribute of item.product?.attributes ?? []) {
    parts.push({
      name: "attribute",
      value: attribute,
    });
  }

  return parts;
}

function getAxisAliases(axis: ProductionGroupingAxis): string[] {
  return [axis.id, axis.label, ...(axis.aliases ?? [])]
    .map((alias) => normalizeGroupingText(alias))
    .filter(Boolean);
}

function isAxisFieldName(
  value: string | null,
  axis: ProductionGroupingAxis,
): boolean {
  if (!value) {
    return false;
  }

  const normalized = normalizeGroupingText(value);
  if (!normalized) {
    return false;
  }

  return getAxisAliases(axis).some(
    (alias) => normalized === alias || normalized.includes(alias),
  );
}

function createValueKey(label: string): string {
  return normalizeGroupingText(label)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createProductionGroupingGroupKey(
  axis: Pick<ProductionGroupingAxis, "id">,
  label: string,
): string {
  const key = createValueKey(label);

  return key ? `${axis.id}:${key}` : PRODUCTION_GROUPING_UNCLASSIFIED_KEY;
}

export function createProductionMaterialGroupKey(label: string): string {
  return createProductionGroupingGroupKey({ id: "material" }, label);
}

function createUnclassifiedValue(
  axis: ProductionGroupingAxis,
): ProductionGroupingClassifiedValue {
  return {
    axisId: axis.id,
    groupKey: PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
    key: PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
    label: "Unclassified",
  };
}

function valueContainsAlias(value: string, alias: string): boolean {
  if (!alias) {
    return false;
  }

  return (
    value === alias ||
    value.includes(` ${alias} `) ||
    value.startsWith(`${alias} `) ||
    value.endsWith(` ${alias}`)
  );
}

function normalizeAxisValue(
  axis: ProductionGroupingAxis,
  rawValue: string,
): ProductionGroupingClassifiedValue | null {
  const label = normalizeGroupingLabel(rawValue);
  const normalized = normalizeGroupingText(label);

  if (!normalized) {
    return null;
  }

  const matchingAllowedValue = axis.allowedValues
    ?.filter((value) => value.archived !== true)
    .find((value) => {
      const candidates = [value.key, value.label, ...(value.aliases ?? [])].map(
        (candidate) => normalizeGroupingText(candidate),
      );

      return candidates.some(
        (candidate) =>
          normalized === candidate || valueContainsAlias(normalized, candidate),
      );
    });

  if (matchingAllowedValue) {
    return {
      axisId: axis.id,
      groupKey: createProductionGroupingGroupKey(
        axis,
        matchingAllowedValue.label,
      ),
      key: matchingAllowedValue.key,
      label: matchingAllowedValue.label,
    };
  }

  if (axis.allowedValues?.length && axis.allowAiSuggestedValues === false) {
    return null;
  }

  const key = createValueKey(label);
  if (!key) {
    return null;
  }

  return {
    axisId: axis.id,
    groupKey: createProductionGroupingGroupKey(axis, label),
    key,
    label,
  };
}

export function createProductionGroupingClassifiedValue(
  axis: ProductionGroupingAxis,
  label: string,
): ProductionGroupingClassifiedValue | null {
  return normalizeAxisValue(axis, label);
}

function resolveAxisFromParts(
  axis: ProductionGroupingAxis,
  parts: readonly ConfigurationPart[],
): ResolvedAxisValue | null {
  for (const part of parts) {
    if (!isAxisFieldName(part.name, axis)) {
      continue;
    }

    const value = normalizeAxisValue(axis, part.value);
    if (value) {
      return {
        ...value,
        confidence: 0.95,
      };
    }
  }

  return null;
}

function isCustomOrAmbiguousItem(item: ProductionGroupingClassificationItem) {
  const priceType = item.product?.priceType;
  const ambiguousPriceType =
    priceType === PriceTypeEnum.SINGLE || priceType === PriceTypeEnum.THRESHOLD;
  const itemName = getComparableName(item.name);
  const productName = getComparableName(item.product?.name);
  const hasCustomName =
    itemName.length > 0 && productName.length > 0 && itemName !== productName;

  return ambiguousPriceType || hasCustomName || item.customPrice !== null;
}

function normalizeProfile(profile: ProductionGroupingProfile) {
  return normalizeProductionGroupingSettings({ profile }).profile;
}

function toProductionGroupingClassificationItem(
  item: OrderItem,
): ProductionGroupingClassificationItem {
  return {
    advancedAttributeSelections: item.advancedAttributeSelections,
    calculatedCombination: item.calculatedCombination ?? null,
    combination: item.combination ?? null,
    customFormat: item.customFormat,
    customPrice: item.customPrice,
    description: item.description,
    height: toOptionalNumber(item.height),
    id: item.id,
    name: item.name,
    pageCount: item.pageCount ?? null,
    product: item.product
      ? {
          attributeOptions: item.product.attributeOptions,
          attributes: item.product.attributes,
          category: item.product.category
            ? {
                id: item.product.category.id,
                name: item.product.category.name,
                path: item.product.category.path,
              }
            : null,
          id: item.product.id,
          name: item.product.name,
          priceType: item.product.priceType,
          productType: item.product.productType
            ? {
                id: item.product.productType.id,
                name: item.product.productType.name,
              }
            : null,
        }
      : null,
    unit: item.unit,
    width: toOptionalNumber(item.width),
  };
}

export function toSerializableProductionGroupingItems(
  items: readonly OrderItem[],
): ProductionGroupingClassificationItem[] {
  return items.map(toProductionGroupingClassificationItem);
}

export const toSerializableProductionMaterialItems =
  toSerializableProductionGroupingItems;

export function getProductionGroupingCacheKey(orderId: string, itemId: string) {
  return `${orderId}:${itemId}`;
}

export const getProductionMaterialCacheKey = getProductionGroupingCacheKey;

function getProductionGroupingSerializablePayload(
  item: OrderItem | ProductionGroupingClassificationItem,
) {
  return "unit" in item && typeof item.unit === "string"
    ? {
        advancedAttributeSelections: item.advancedAttributeSelections ?? null,
        calculatedCombination: item.calculatedCombination ?? null,
        combination: item.combination ?? null,
        customFormat: item.customFormat,
        customPrice: item.customPrice ?? null,
        description: item.description ?? "",
        height: toOptionalNumber(item.height),
        name: item.name ?? "",
        pageCount: item.pageCount ?? null,
        product: item.product
          ? {
              attributeOptions: item.product.attributeOptions ?? null,
              attributes: item.product.attributes ?? null,
              category: item.product.category
                ? {
                    id: item.product.category.id ?? "",
                    name: item.product.category.name ?? "",
                    path: item.product.category.path ?? null,
                  }
                : null,
              id: item.product.id ?? "",
              name: item.product.name ?? "",
              priceType: item.product.priceType ?? null,
              productType: item.product.productType
                ? {
                    id: item.product.productType.id ?? "",
                    name: item.product.productType.name ?? "",
                  }
                : null,
            }
          : null,
        unit: item.unit,
        width: toOptionalNumber(item.width),
      }
    : {};
}

export function getProductionGroupingProfileHash(
  profile: ProductionGroupingProfile,
): string {
  const normalizedProfile = normalizeProfile(profile);

  return `pgp-${hashString(stableStringify(normalizedProfile))}`;
}

export function getProductionGroupingInputHash(
  item: OrderItem | ProductionGroupingClassificationItem,
): string {
  return `pgi-${productionGroupingClassificationVersion}-${hashString(
    stableStringify(getProductionGroupingSerializablePayload(item)),
  )}`;
}

export const getProductionMaterialInputHash = getProductionGroupingInputHash;

export function getProductionGroupingSignatureHash(
  item: OrderItem | ProductionGroupingClassificationItem,
  profile: ProductionGroupingProfile,
): string {
  return `pgs-${hashString(
    stableStringify({
      item: getProductionGroupingSerializablePayload(item),
      profileHash: getProductionGroupingProfileHash(profile),
    }),
  )}`;
}

export function classifyProductionGroupingDeterministic(
  item: ProductionGroupingClassificationItem,
  profile: ProductionGroupingProfile,
): ProductionGroupingResolvedClassification {
  const normalizedProfile = normalizeProfile(profile);
  const profileHash = getProductionGroupingProfileHash(normalizedProfile);
  const inputHash = getProductionGroupingInputHash(item);
  const signatureHash = getProductionGroupingSignatureHash(
    item,
    normalizedProfile,
  );
  const parts = getConfigurationParts(item);
  const primary = resolveAxisFromParts(normalizedProfile.primaryAxis, parts);
  const secondary = normalizedProfile.secondaryAxis
    ? resolveAxisFromParts(normalizedProfile.secondaryAxis, parts)
    : null;
  const primaryValue =
    primary ?? createUnclassifiedValue(normalizedProfile.primaryAxis);
  const needsAi =
    !primary ||
    Boolean(normalizedProfile.secondaryAxis && !secondary) ||
    Boolean(
      primary && isCustomOrAmbiguousItem(item) && primary.confidence < 0.95,
    );

  return {
    classificationVersion: productionGroupingClassificationVersion,
    confidence: primary?.confidence ?? 0,
    inputHash,
    itemId: item.id,
    needsAi,
    primary: primaryValue,
    profileHash,
    profileId: normalizedProfile.id,
    reasoning: primary
      ? "Configured production grouping fields were resolved deterministically."
      : "No configured production grouping field was resolved.",
    secondary: secondary ?? undefined,
    signatureHash,
    source: primary ? "deterministic" : "unclassified",
  };
}

export function classifyProductionMaterialDeterministic(
  item: ProductionGroupingClassificationItem,
  profile = normalizeProductionGroupingSettings().profile,
): ProductionGroupingResolvedClassification {
  return classifyProductionGroupingDeterministic(item, profile);
}

export function isFreshProductionGroupingClassification(
  classification: ProductionGroupingClassification | null | undefined,
  inputHash: string,
  profile: ProductionGroupingProfile,
): boolean {
  const profileHash = getProductionGroupingProfileHash(profile);

  return (
    classification?.classificationVersion ===
      productionGroupingClassificationVersion &&
    classification.profileHash === profileHash &&
    (classification.source === "manual" ||
      classification.inputHash === inputHash)
  );
}

export function resolveProductionGroupingClassification(
  item: ProductionGroupingClassificationItem,
  profile: ProductionGroupingProfile,
  cached: ProductionGroupingClassification | null | undefined,
): ProductionGroupingResolvedClassification {
  const inputHash = getProductionGroupingInputHash(item);

  if (
    cached &&
    isFreshProductionGroupingClassification(cached, inputHash, profile)
  ) {
    return {
      ...cached,
      needsAi: false,
    };
  }

  return classifyProductionGroupingDeterministic(item, profile);
}

export function resolveProductionMaterialClassification(
  item: ProductionGroupingClassificationItem,
  cached: ProductionGroupingClassification | null | undefined,
  profile = normalizeProductionGroupingSettings().profile,
): ProductionGroupingResolvedClassification {
  return resolveProductionGroupingClassification(item, profile, cached);
}

export function productionGroupingNeedsAiClassification(
  item: ProductionGroupingClassificationItem,
  profile: ProductionGroupingProfile,
  cached: ProductionGroupingClassification | null | undefined,
): boolean {
  return resolveProductionGroupingClassification(item, profile, cached).needsAi;
}

export function productionMaterialNeedsAiClassification(
  item: ProductionGroupingClassificationItem,
  cached: ProductionGroupingClassification | null | undefined,
  profile = normalizeProductionGroupingSettings().profile,
): boolean {
  return productionGroupingNeedsAiClassification(item, profile, cached);
}

export function getProductionGroupingItemRef(
  orderId: string,
  item: OrderItem | ProductionGroupingClassificationItem,
  profile: ProductionGroupingProfile,
): ProductionGroupingItemRef {
  return {
    inputHash: getProductionGroupingInputHash(item),
    itemId: item.id,
    orderId,
    profileHash: getProductionGroupingProfileHash(profile),
    signatureHash: getProductionGroupingSignatureHash(item, profile),
  };
}

export function getProductionMaterialItemRef(
  orderId: string,
  item: OrderItem | ProductionGroupingClassificationItem,
  profile = normalizeProductionGroupingSettings().profile,
): ProductionGroupingItemRef {
  return getProductionGroupingItemRef(orderId, item, profile);
}
