import type { AttributeDependencyRule, Price, Product } from "@konfi/types";
import { PriceTypeEnum } from "@konfi/types";
import { DEFAULT_COMBINATION } from "@konfi/utils";

export type ConnectedProductImportTarget = Pick<
  Product,
  | "attributeOptions"
  | "attributeDependencies"
  | "attributes"
  | "category"
  | "customSizes"
  | "defaultPrice"
  | "highPrice"
  | "lowPrice"
  | "pageCount"
  | "priceType"
  | "productType"
  | "customSize"
  | "spec"
  | "volumes"
>;

export type ImportedProductPricingDraft = Pick<
  Partial<Product>,
  | "attributeOptions"
  | "attributeDependencies"
  | "attributes"
  | "customSizes"
  | "defaultPrice"
  | "highPrice"
  | "lowPrice"
  | "pageCount"
  | "priceType"
  | "prices"
  | "productType"
  | "customSize"
  | "spec"
  | "volumes"
>;

export type GroupedProductPrices = {
  calculatedCombination: string;
  prices: Price[];
};

export type ConnectedProductImportApplyDraft = {
  attributeDependencies?: Product["attributeDependencies"];
  attributeOptions?: Product["attributeOptions"];
  attributes?: Product["attributes"];
  customSize?: Product["customSize"];
  customSizes?: Product["customSizes"];
  defaultPrice?: Product["defaultPrice"];
  highPrice?: Product["highPrice"];
  lowPrice?: Product["lowPrice"];
  pageCount?: Product["pageCount"];
  priceType: PriceTypeEnum;
  prices: Price[];
  productType?: Product["productType"];
  spec?: Product["spec"];
  volumes?: Product["volumes"];
};

function haveSameAttributeOrder(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function haveSameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftValues = new Set(left);

  if (leftValues.size !== right.length) {
    return false;
  }

  return right.every((value) => leftValues.has(value));
}

function normalizeSingleRule(
  rule: AttributeDependencyRule,
): AttributeDependencyRule {
  return {
    dependsOn: rule.dependsOn,
    ...(rule.dependencyValues?.length
      ? {
          dependencyValues: [...new Set(rule.dependencyValues)].toSorted(
            (left, right) => left.localeCompare(right),
          ),
        }
      : {}),
    ...(rule.when
      ? {
          when: Object.fromEntries(
            Object.entries(rule.when)
              .toSorted(([left], [right]) => left.localeCompare(right))
              .map(([attributeId, optionValues]) => [
                attributeId,
                [...new Set(optionValues)].toSorted((left, right) =>
                  left.localeCompare(right),
                ),
              ]),
          ),
        }
      : {}),
    ...(rule.conditionalOptions
      ? {
          conditionalOptions: Object.fromEntries(
            Object.entries(rule.conditionalOptions)
              .toSorted(([left], [right]) => left.localeCompare(right))
              .map(([parentValue, optionValues]) => [
                parentValue,
                [...new Set(optionValues)].toSorted((left, right) =>
                  left.localeCompare(right),
                ),
              ]),
          ),
        }
      : {}),
  };
}

function normalizeAttributeDependencies(
  dependencies?: Product["attributeDependencies"],
): NonNullable<Product["attributeDependencies"]> {
  if (!dependencies) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(dependencies)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([attributeId, entry]) => [
        attributeId,
        Array.isArray(entry)
          ? entry.map(normalizeSingleRule)
          : normalizeSingleRule(entry),
      ]),
  );
}

function haveSameAttributeDependencies(
  left?: Product["attributeDependencies"],
  right?: Product["attributeDependencies"],
): boolean {
  return (
    JSON.stringify(normalizeAttributeDependencies(left)) ===
    JSON.stringify(normalizeAttributeDependencies(right))
  );
}

export function groupProductPrices(prices: Price[]): GroupedProductPrices[] {
  const groupedPrices = new Map<string, Price[]>();

  for (const price of prices) {
    const calculatedCombination = price.combination?.id ?? DEFAULT_COMBINATION;
    const existingPrices = groupedPrices.get(calculatedCombination) ?? [];

    groupedPrices.set(calculatedCombination, [...existingPrices, price]);
  }

  return Array.from(groupedPrices.entries()).map(
    ([calculatedCombination, combinationPrices]) => ({
      calculatedCombination,
      prices: combinationPrices,
    }),
  );
}

function buildMatrixCombinationIds(
  attributeIds: string[],
  attributeOptions: Record<string, string[]>,
): Set<string> | null {
  const combinationIds = new Set<string>();
  const combinationsLimit = 100_000;

  function appendCombination(attributeIndex: number, parts: string[]) {
    if (combinationIds.size > combinationsLimit) {
      return;
    }

    if (attributeIndex >= attributeIds.length) {
      combinationIds.add(
        parts.length > 0 ? parts.join("-") : DEFAULT_COMBINATION,
      );
      return;
    }

    const attributeId = attributeIds[attributeIndex];
    const options = attributeOptions[attributeId] ?? [];

    for (const option of options) {
      appendCombination(attributeIndex + 1, [...parts, option]);
    }
  }

  appendCombination(0, []);

  if (combinationIds.size > combinationsLimit) {
    return null;
  }

  return combinationIds;
}

function getIntersectingMatrixAttributeOptions({
  importedAttributes,
  importedAttributeOptions,
  productAttributeOptions,
}: {
  importedAttributes: string[];
  importedAttributeOptions: Record<string, string[]>;
  productAttributeOptions: Record<string, string[]>;
}): Record<string, string[]> | null {
  const nextAttributeOptions: Record<string, string[]> = {};

  for (const attributeId of importedAttributes) {
    const productOptions = new Set(productAttributeOptions[attributeId] ?? []);
    const importedOptions = importedAttributeOptions[attributeId] ?? [];
    const sharedOptions = importedOptions.filter((option) =>
      productOptions.has(option),
    );

    if (sharedOptions.length === 0) {
      return null;
    }

    nextAttributeOptions[attributeId] = sharedOptions;
  }

  return nextAttributeOptions;
}

function filterImportedMatrixPricesForCurrentProduct({
  importedProduct,
  product,
}: {
  importedProduct: ImportedProductPricingDraft;
  product: Pick<
    ConnectedProductImportTarget,
    "attributeDependencies" | "attributeOptions" | "attributes"
  >;
}): Price[] | null {
  const importedAttributes = importedProduct.attributes ?? [];
  const importedPriceType = importedProduct.priceType ?? PriceTypeEnum.SINGLE;

  if (
    importedPriceType !== PriceTypeEnum.MATRIX ||
    importedAttributes.length === 0
  ) {
    return importedProduct.prices ?? [];
  }

  if (!haveSameAttributeOrder(product.attributes ?? [], importedAttributes)) {
    return null;
  }

  if (
    !haveSameAttributeDependencies(
      product.attributeDependencies,
      importedProduct.attributeDependencies,
    )
  ) {
    return null;
  }

  const intersectingAttributeOptions = getIntersectingMatrixAttributeOptions({
    importedAttributes,
    importedAttributeOptions: importedProduct.attributeOptions ?? {},
    productAttributeOptions: product.attributeOptions ?? {},
  });

  if (!intersectingAttributeOptions) {
    return null;
  }

  const allowedCombinationIds = buildMatrixCombinationIds(
    importedAttributes,
    intersectingAttributeOptions,
  );

  if (!allowedCombinationIds) {
    return null;
  }

  const filteredPrices = (importedProduct.prices ?? []).filter((price) =>
    allowedCombinationIds.has(price.combination?.id ?? DEFAULT_COMBINATION),
  );

  return filteredPrices.length > 0 ? filteredPrices : null;
}

export function hasCompatibleProductAttributesForImport(
  product: Pick<
    ConnectedProductImportTarget,
    "attributeDependencies" | "attributeOptions" | "attributes"
  >,
  importedProduct: ImportedProductPricingDraft,
): boolean {
  const importedAttributes = importedProduct.attributes ?? [];
  const importedPriceType = importedProduct.priceType ?? PriceTypeEnum.SINGLE;

  if (
    importedPriceType !== PriceTypeEnum.MATRIX ||
    importedAttributes.length === 0
  ) {
    return true;
  }

  if (
    filterImportedMatrixPricesForCurrentProduct({
      importedProduct,
      product,
    })
  ) {
    return true;
  }

  if (!haveSameAttributeOrder(product.attributes ?? [], importedAttributes)) {
    return false;
  }

  const currentAttributeOptions = product.attributeOptions ?? {};
  const importedAttributeOptions = importedProduct.attributeOptions ?? {};
  const hasCompatibleOptions = importedAttributes.every((attributeId) =>
    haveSameMembers(
      currentAttributeOptions[attributeId] ?? [],
      importedAttributeOptions[attributeId] ?? [],
    ),
  );

  if (!hasCompatibleOptions) {
    return false;
  }

  return haveSameAttributeDependencies(
    product.attributeDependencies,
    importedProduct.attributeDependencies,
  );
}

export function buildConnectedProductImportUpdate({
  product,
  importedProduct,
  syncMappedAttributes,
}: {
  product: ConnectedProductImportTarget;
  importedProduct: ImportedProductPricingDraft;
  syncMappedAttributes: boolean;
}): {
  applyDraft: ConnectedProductImportApplyDraft;
  groupedPrices: GroupedProductPrices[];
  productUpdate: Partial<Product>;
  requiresAttributeSync: boolean;
} {
  const nextPriceType = importedProduct.priceType ?? product.priceType;
  const resolvedImportedPrices =
    !syncMappedAttributes && nextPriceType === PriceTypeEnum.MATRIX
      ? (filterImportedMatrixPricesForCurrentProduct({
          importedProduct,
          product,
        }) ??
        importedProduct.prices ??
        [])
      : (importedProduct.prices ?? []);
  const groupedPrices = groupProductPrices(resolvedImportedPrices);
  const nextVolumes =
    importedProduct.volumes && importedProduct.volumes.length > 0
      ? importedProduct.volumes
      : product.volumes;
  const nextDefaultOrder =
    importedProduct.spec?.defaultOrder ??
    nextVolumes?.[0]?.value ??
    product.spec.defaultOrder;
  const nextMinimumOrder =
    importedProduct.spec?.minimumOrder ??
    nextVolumes?.[0]?.value ??
    product.spec.minimumOrder;
  const requiresAttributeSync =
    nextPriceType === PriceTypeEnum.MATRIX &&
    !syncMappedAttributes &&
    !hasCompatibleProductAttributesForImport(product, importedProduct);
  const nextPageCount = importedProduct.pageCount ?? product.pageCount;
  const nextCustomSize = importedProduct.customSize ?? product.customSize;
  const nextCustomSizes =
    importedProduct.customSizes !== undefined
      ? importedProduct.customSizes
      : nextCustomSize
        ? (product.customSizes ?? [])
        : [];

  const productUpdate: Partial<Product> = {
    customSize: nextCustomSize,
    customSizes: nextCustomSize ? nextCustomSizes : [],
    defaultPrice: importedProduct.defaultPrice ?? product.defaultPrice,
    lowPrice: importedProduct.lowPrice ?? product.lowPrice,
    highPrice: importedProduct.highPrice ?? product.highPrice,
    pageCount: nextPageCount,
    priceType: nextPriceType,
    spec: {
      ...product.spec,
      ...importedProduct.spec,
      images: product.spec.images,
      defaultOrder: nextDefaultOrder,
      minimumOrder: nextMinimumOrder,
    },
    volumes: nextVolumes,
  };

  const applyDraftBase: ConnectedProductImportApplyDraft = {
    customSize: nextCustomSize,
    customSizes: productUpdate.customSizes,
    defaultPrice: productUpdate.defaultPrice,
    highPrice: productUpdate.highPrice,
    lowPrice: productUpdate.lowPrice,
    pageCount: nextPageCount,
    priceType: nextPriceType,
    prices: resolvedImportedPrices,
    spec: productUpdate.spec,
    volumes: productUpdate.volumes,
  };

  if (nextPriceType !== PriceTypeEnum.MATRIX) {
    productUpdate.attributeDependencies = {};
    productUpdate.attributeOptions = {};
    productUpdate.attributes = [];
    productUpdate.productType = null;

    return {
      applyDraft: {
        ...applyDraftBase,
        attributeDependencies: {},
        attributeOptions: {},
        attributes: [],
        productType: null,
      },
      groupedPrices,
      productUpdate,
      requiresAttributeSync: false,
    };
  }

  if (syncMappedAttributes) {
    productUpdate.attributeDependencies =
      importedProduct.attributeDependencies ?? {};
    productUpdate.attributeOptions = importedProduct.attributeOptions ?? {};
    productUpdate.attributes = importedProduct.attributes ?? [];

    if (importedProduct.productType !== undefined) {
      productUpdate.productType = importedProduct.productType;
    }
  }

  return {
    applyDraft: {
      ...applyDraftBase,
      attributeDependencies: syncMappedAttributes
        ? (importedProduct.attributeDependencies ?? {})
        : undefined,
      attributeOptions: syncMappedAttributes
        ? (importedProduct.attributeOptions ?? {})
        : undefined,
      attributes: syncMappedAttributes
        ? (importedProduct.attributes ?? [])
        : undefined,
      productType: syncMappedAttributes
        ? importedProduct.productType
        : undefined,
    },
    groupedPrices,
    productUpdate,
    requiresAttributeSync,
  };
}
