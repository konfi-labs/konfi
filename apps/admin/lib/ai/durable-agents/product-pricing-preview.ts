import type { Price, Product } from "@konfi/types";
import { CurrencyEnum, PriceTypeEnum } from "@konfi/types";
import {
  buildDynamicPricesForSelection,
  buildDynamicPricingSelections,
  calcPrice,
  DEFAULT_COMBINATION,
  applyProductPriceOffsets,
} from "@konfi/utils";
import type {
  ProductAgentPricingDiagnostic,
  ProductAgentPricingPreview,
  ProductAgentPricingPreviewRow,
  ProductAgentDraft,
} from "./product-workflow.types";

const PREVIEW_ROW_LIMIT = 12;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getFallbackSpec(product: Partial<Product>): Product["spec"] {
  const defaultOrder = Math.trunc(product.spec?.defaultOrder ?? 1);
  const minimumOrder = Math.trunc(product.spec?.minimumOrder ?? defaultOrder);
  const maximumOrder = Math.trunc(
    product.spec?.maximumOrder ?? Math.max(defaultOrder, minimumOrder),
  );

  return {
    defaultOrder,
    images: product.spec?.images ?? [],
    maximumHeight: Math.trunc(product.spec?.maximumHeight ?? 1000),
    maximumOrder,
    maximumRatio: product.spec?.maximumRatio ?? 5,
    maximumWidth: Math.trunc(product.spec?.maximumWidth ?? 1000),
    minimumHeight: Math.trunc(product.spec?.minimumHeight ?? 100),
    minimumOrder,
    minimumRatio: product.spec?.minimumRatio ?? 0.2,
    minimumWidth: Math.trunc(product.spec?.minimumWidth ?? 100),
    step: Math.trunc(product.spec?.step ?? 1),
    validateRatio: product.spec?.validateRatio ?? false,
    widthStep: product.spec?.widthStep ?? 1,
    heightStep: product.spec?.heightStep ?? 1,
  };
}

function getPreviewVolumes(
  product: Partial<Product>,
  prices: Price[],
): number[] {
  const spec = getFallbackSpec(product);
  const values = [
    ...(product.volumes ?? []).map((volume) => volume.value),
    ...prices.map((price) => price.volume?.value ?? price.threshold),
    spec.defaultOrder,
    spec.minimumOrder,
  ].filter((value): value is number => isFiniteNumber(value) && value > 0);

  return [...new Set(values.map((value) => Math.trunc(value)))].toSorted(
    (left, right) => left - right,
  );
}

function getPriceLabel(price: Price, index: number): string {
  const parts = [
    price.combination?.id,
    isFiniteNumber(price.volume?.value) ? `${price.volume.value} pcs` : null,
    isFiniteNumber(price.threshold) ? `from ${price.threshold} pcs` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : `Price row ${index + 1}`;
}

function buildStoredPriceRows(draft: ProductAgentDraft): {
  diagnostics: ProductAgentPricingDiagnostic[];
  rows: ProductAgentPricingPreviewRow[];
} {
  const product = draft.product;
  const prices = applyProductPriceOffsets({
    prices: product.prices ?? [],
    product: {
      attributeOptions: product.attributeOptions ?? {},
      attributes: product.attributes ?? [],
      priceOffsets: product.priceOffsets,
    },
  });
  const spec = getFallbackSpec(product);
  const rows: ProductAgentPricingPreviewRow[] = [];
  const diagnostics: ProductAgentPricingDiagnostic[] = [];

  for (const [index, price] of prices.slice(0, PREVIEW_ROW_LIMIT).entries()) {
    const quantity = Math.trunc(
      price.volume?.value ?? price.threshold ?? spec.defaultOrder,
    );
    const volume = price.volume?.value ?? quantity;
    const combination =
      price.combination?.id ??
      (draft.priceType === PriceTypeEnum.MATRIX
        ? DEFAULT_COMBINATION
        : undefined);

    let totalPrice: number | undefined;

    if (
      draft.priceType === PriceTypeEnum.MATRIX ||
      draft.priceType === PriceTypeEnum.SINGLE ||
      draft.priceType === PriceTypeEnum.THRESHOLD
    ) {
      try {
        const result = calcPrice(
          quantity,
          prices,
          draft.priceType,
          undefined,
          combination,
          volume,
          false,
          undefined,
          undefined,
          spec.minimumOrder,
          null,
        );

        if ("error" in result) {
          diagnostics.push({
            label: getPriceLabel(price, index),
            reason: result.error ?? "Price calculation failed.",
            severity: "error",
            suggestedAction:
              "Adjust the generated price row so the real checkout calculator can resolve it.",
          });
        } else {
          totalPrice = result.result;
        }
      } catch (error) {
        diagnostics.push({
          label: getPriceLabel(price, index),
          reason:
            error instanceof Error
              ? error.message
              : "Price calculation failed.",
          severity: "error",
          suggestedAction:
            "Review the generated quantity, combination, and price values.",
        });
      }
    }

    rows.push({
      ...(combination ? { combination } : {}),
      deliveryTime: price.volume?.deliveryTime,
      label: getPriceLabel(price, index),
      quantity,
      ...(totalPrice !== undefined ? { totalPrice } : {}),
      ...(isFiniteNumber(price.value) ? { unitPrice: price.value } : {}),
      ...(isFiniteNumber(volume) ? { volume } : {}),
    });
  }

  return { diagnostics, rows };
}

function hasNoConditions(
  rule: NonNullable<Product["dynamicPricing"]>["globalRules"][number],
) {
  return (rule.conditions?.length ?? 0) === 0;
}

function buildDynamicDiagnostics(
  config: NonNullable<Product["dynamicPricing"]>,
): ProductAgentPricingDiagnostic[] {
  const diagnostics: ProductAgentPricingDiagnostic[] = [];
  const unconditionalFixedPriceRules = config.globalRules.filter(
    (rule) =>
      rule.target === "price" &&
      rule.calculator === "fixed" &&
      hasNoConditions(rule) &&
      isFiniteNumber(rule.fixedValue) &&
      rule.fixedValue !== 0,
  );

  if (unconditionalFixedPriceRules.length > 1) {
    diagnostics.push({
      label: "Dynamic fixed price rules",
      reason:
        "Multiple unconditional fixed price global rules will all be added for every generated volume and option selection.",
      severity: "error",
      suggestedAction:
        "Represent volume tiers as a unit-price curve with range rules, or add attribute-option conditions when the fixed values are option-specific.",
    });
  }

  const quantityMultipliers = config.globalRules.filter(
    (rule) =>
      rule.target === "price" &&
      rule.calculator === "multiplier" &&
      (rule.metric === "quantity" || rule.metric === "volume") &&
      isFiniteNumber(rule.multiplier) &&
      rule.multiplier !== 0,
  );

  for (const rule of quantityMultipliers) {
    diagnostics.push({
      label: rule.label || rule.id,
      reason:
        "A quantity/volume multiplier changes the generated unit price based on volume, then checkout multiplies by volume again.",
      severity: "warning",
      suggestedAction:
        "Use basePrice for a plain per-piece rate, or range rules for a volume-based unit-price curve.",
    });
  }

  return diagnostics;
}

function buildDynamicRows(draft: ProductAgentDraft): {
  diagnostics: ProductAgentPricingDiagnostic[];
  rows: ProductAgentPricingPreviewRow[];
} {
  const product = draft.product;
  const config = product.dynamicPricing;

  if (draft.priceType !== PriceTypeEnum.DYNAMIC || !config?.enabled) {
    return { diagnostics: [], rows: [] };
  }

  const prices = product.prices ?? [];
  const volumes = getPreviewVolumes(product, prices).map((value) => ({
    value,
  }));
  const spec = getFallbackSpec(product);
  const dynamicProduct = {
    attributeDependencies: product.attributeDependencies ?? {},
    attributeOptions: product.attributeOptions ?? {},
    attributes: product.attributes ?? [],
    customSize: product.customSize ?? false,
    pageCount: product.pageCount,
    priceOffsets: product.priceOffsets,
    spec,
    volumes,
  };
  const selections = buildDynamicPricingSelections(dynamicProduct).slice(0, 3);
  const rows: ProductAgentPricingPreviewRow[] = [];

  for (const [selectionIndex, selection] of selections.entries()) {
    const combination =
      Object.values(selection).join("-") ||
      (selectionIndex === 0
        ? DEFAULT_COMBINATION
        : `dynamic-${selectionIndex}`);
    const generatedPrices = applyProductPriceOffsets({
      calculatedCombination: combination,
      prices: buildDynamicPricesForSelection({
        calculatedCombination: combination,
        config,
        currency: CurrencyEnum.PLN,
        product: dynamicProduct,
        selectedAttributeOptions: selection,
      }),
      product: dynamicProduct,
      selectedAttributeOptions: selection,
    });

    for (const price of generatedPrices) {
      if (rows.length >= PREVIEW_ROW_LIMIT) {
        break;
      }

      const volume = price.volume?.value ?? spec.defaultOrder;
      rows.push({
        combination,
        deliveryTime: price.volume?.deliveryTime,
        label: `${combination}, ${volume} pcs`,
        quantity: volume,
        ...(isFiniteNumber(price.value) && isFiniteNumber(volume)
          ? { totalPrice: Math.floor(price.value * volume) }
          : {}),
        ...(isFiniteNumber(price.value) ? { unitPrice: price.value } : {}),
        volume,
      });
    }
  }

  return {
    diagnostics: buildDynamicDiagnostics(config),
    rows,
  };
}

export function buildProductDraftPricingPreview(
  draft: ProductAgentDraft,
): ProductAgentPricingPreview {
  const storedPreview = buildStoredPriceRows(draft);
  const dynamicPreview = buildDynamicRows(draft);

  return {
    diagnostics: [...storedPreview.diagnostics, ...dynamicPreview.diagnostics],
    rows:
      dynamicPreview.rows.length > 0 ? dynamicPreview.rows : storedPreview.rows,
  };
}
