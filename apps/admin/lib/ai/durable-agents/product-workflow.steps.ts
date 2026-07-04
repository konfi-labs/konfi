import "server-only";

import { AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS } from "@/lib/ai/agent-harness";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import type { Category, NestedMember, ProductType } from "@konfi/types";
import {
  Attribute,
  AttributeInputTypeEnum,
  CurrencyEnum,
  Price,
  PriceTypeEnum,
  Product,
  ShippingTypes,
  Unit,
} from "@konfi/types";
import {
  DEFAULT_COMBINATION,
  DEFAULT_PAGE_COUNT_COVER_PAGES,
  PAGE_COUNT_DIVISOR,
  calculateDynamicListingPrices,
  generateKeywords,
  isMatrixLikePriceType,
} from "@konfi/utils";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { buildProductDraftPricingPreview } from "./product-pricing-preview";
import type {
  ProductAgentBlockedItem,
  ProductAgentCatalogSetupOption,
  ProductAgentCatalogSetupPlan,
  ProductAgentCatalogSetupProductTypeAttributeRef,
  ProductAgentDraft,
  ProductAgentMissingAttribute,
  ProductAgentMissingOption,
  ProductAgentSelectedAttribute,
} from "./product-workflow.types";

const MINOR_UNITS_MULTIPLIER = 100;
const DEFAULT_DELIVERY_TIME_DAYS = 2;

type CatalogAttribute = Pick<
  Attribute,
  "calculated" | "format" | "id" | "name" | "options" | "required" | "type"
>;

type CatalogProductType = Pick<
  ProductType,
  "attributes" | "id" | "isShippable" | "name"
>;

type CatalogCategory = Pick<Category, "id" | "name">;

export interface ProductCreationCatalog {
  attributes: CatalogAttribute[];
  categories: CatalogCategory[];
  productTypes: CatalogProductType[];
}

const planOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const dynamicPricingMetricSchema = z.enum([
  "quantity",
  "volume",
  "pageCount",
  "width",
  "height",
  "area",
  "perimeter",
  "itemsPerSheet",
  "sheetsNeeded",
  "innerSheetsPerUnit",
  "coverSheetsPerUnit",
  "totalSheetsPerUnit",
  "innerSheetVolume",
  "coverSheetVolume",
  "totalSheetVolume",
]);

const dynamicPricingConditionSchema = z.object({
  attributeId: z.string(),
  optionValues: z.array(z.string()),
});

const dynamicPricingInputSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string().nullable(),
  value: z.number(),
});

const dynamicPricingGlobalRuleSchema = z.object({
  calculator: z.enum(["fixed", "multiplier", "range", "tier"]),
  conditions: z.array(dynamicPricingConditionSchema),
  fixedValue: z.number().nullable(),
  id: z.string(),
  inputId: z.string().nullable(),
  inverse: z.boolean().nullable(),
  label: z.string(),
  maximumMetricValue: z.number().nullable(),
  maximumOutputValue: z.number().nullable(),
  metric: dynamicPricingMetricSchema.nullable(),
  minimumMetricValue: z.number().nullable(),
  minimumOutputValue: z.number().nullable(),
  multiplier: z.number().nullable(),
  outputMultiplierInputId: z.string().nullable().optional(),
  outputMultiplierMetric: dynamicPricingMetricSchema.nullable().optional(),
  target: z.enum(["price", "deliveryTime"]),
});

const dynamicPricingAttributeRuleSchema = z.object({
  adjustments: z.array(
    z.object({
      deliveryTimeAdjustment: z.number().nullable(),
      optionValue: z.string(),
      priceAdjustment: z.number().nullable(),
    }),
  ),
  attributeId: z.string(),
  mode: z.enum(["ignore", "adjust"]),
});

const dynamicPricingPlanSchema = z.object({
  attributeRules: z.array(dynamicPricingAttributeRuleSchema),
  baseDeliveryTime: z.number().nullable(),
  basePrice: z.number(),
  enabled: z.boolean(),
  globalRules: z.array(dynamicPricingGlobalRuleSchema),
  inputs: z.array(dynamicPricingInputSchema),
  linkedPresetIds: z.array(z.string()),
});

const pricePlanRowSchema = z.object({
  active: z.boolean(),
  attributeValues: z.record(z.string(), z.string()),
  deliveryTime: z.number().nullable(),
  quantity: z.number().nullable(),
  source: z.string().nullable(),
  threshold: z.number().nullable(),
  valueGross: z.number().nullable(),
});

const pageCountPricingPlanSchema = z.object({
  exactPrices: z.array(
    z.object({
      pageCount: z.number(),
      prices: z.array(pricePlanRowSchema),
    }),
  ),
  mode: z.enum(["step", "segmented", "exact"]).nullable(),
  segmentPrices: z.array(
    z.object({
      basePrices: z.array(pricePlanRowSchema),
      maximum: z.number(),
      minimum: z.number(),
      stepPrices: z.array(pricePlanRowSchema),
    }),
  ),
  stepPrices: z.array(pricePlanRowSchema),
});

const pageCountPlanSchema = z.object({
  coverPages: z.number().nullable(),
  enabled: z.boolean(),
  externalAttributeName: z.string().nullable(),
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  placement: z
    .object({
      afterAttributeId: z.string().nullable(),
    })
    .nullable(),
  pricing: pageCountPricingPlanSchema.nullable().optional(),
  pricingMode: z.enum(["step", "segmented", "exact"]).nullable(),
  step: z.number().nullable(),
});

const productDraftPlanSchema = z.object({
  categoryId: z.string().nullable(),
  description: z.string(),
  dynamicPricing: dynamicPricingPlanSchema.nullable(),
  grossPrices: z.boolean(),
  missingAttributes: z.array(
    z.object({
      name: z.string(),
      options: z.array(planOptionSchema),
      reason: z.string(),
      suggestedType: z.enum([
        AttributeInputTypeEnum.DROPDOWN,
        AttributeInputTypeEnum.DROPDOWN_COLOR,
        AttributeInputTypeEnum.RADIO_GROUP,
        AttributeInputTypeEnum.RADIO_GROUP_COLOR,
        AttributeInputTypeEnum.RADIO_GROUP_IMAGE,
      ]),
    }),
  ),
  missingOptions: z.array(
    z.object({
      attributeId: z.string(),
      attributeName: z.string(),
      options: z.array(planOptionSchema),
    }),
  ),
  name: z.string(),
  pageCount: pageCountPlanSchema.nullable().optional(),
  priceType: z.enum([
    PriceTypeEnum.SINGLE,
    PriceTypeEnum.THRESHOLD,
    PriceTypeEnum.MATRIX,
    PriceTypeEnum.DYNAMIC,
  ]),
  priceTypeReason: z.string(),
  prices: z.array(pricePlanRowSchema),
  productTypeId: z.string().nullable(),
  reviewSummary: z.string(),
  selectedAttributes: z.array(
    z.object({
      attributeId: z.string(),
      optionValues: z.array(z.string()),
      role: z.string().nullable(),
    }),
  ),
  seoDescription: z.string(),
  seoTitle: z.string(),
  specialNotes: z.string(),
  spec: z.object({
    defaultOrder: z.number().nullable(),
    maximumHeight: z.number().nullable(),
    maximumOrder: z.number().nullable(),
    maximumWidth: z.number().nullable(),
    minimumHeight: z.number().nullable(),
    minimumOrder: z.number().nullable(),
    minimumWidth: z.number().nullable(),
    step: z.number().nullable(),
  }),
  volumes: z.array(z.object({ value: z.number() })),
});

export type ProductDraftPlan = z.infer<typeof productDraftPlanSchema>;

function formatHumanPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${(value / MINOR_UNITS_MULTIPLIER).toFixed(2)} PLN`;
}

function formatPreviewRowPrice(
  label: string,
  value: number | undefined,
): string {
  return `${label}=${formatHumanPrice(value)}`;
}

export function formatProductDraftPricePreview(
  draft: ProductAgentDraft,
): string {
  const product = draft.product;
  const pricingPreview =
    draft.pricingPreview ?? buildProductDraftPricingPreview(draft);
  const lines: string[] = [
    `Price type: ${draft.priceType}`,
    `Reason: ${draft.priceTypeReason}`,
  ];

  const prices = product.prices ?? [];

  if (prices.length > 0) {
    lines.push("Prices:");
    for (const price of prices.slice(0, 12)) {
      const parts = [
        price.combination?.id ? `combination=${price.combination.id}` : null,
        typeof price.volume?.value === "number"
          ? `volume=${price.volume.value}`
          : null,
        typeof price.threshold === "number"
          ? `threshold=${price.threshold}`
          : null,
      ].filter((part): part is string => Boolean(part));

      lines.push(
        `- ${parts.length > 0 ? `${parts.join(", ")}: ` : ""}${formatHumanPrice(price.value)}`,
      );
    }

    if (prices.length > 12) {
      lines.push(`- ...and ${prices.length - 12} more price rows`);
    }
  } else if (
    draft.priceType === PriceTypeEnum.DYNAMIC &&
    product.dynamicPricing
  ) {
    lines.push(
      `Dynamic base price: ${formatHumanPrice(product.dynamicPricing.basePrice)}`,
      `Attribute rules: ${product.dynamicPricing.attributeRules.length}`,
      `Global rules: ${product.dynamicPricing.globalRules.length}`,
      `Listing preview: default ${formatHumanPrice(product.defaultPrice?.value)}, low ${formatHumanPrice(product.lowPrice?.value)}, high ${formatHumanPrice(product.highPrice?.value)}`,
    );
  } else {
    lines.push("Prices: no price rows generated yet.");
  }

  if (product.pageCount?.enabled) {
    lines.push(
      `Page count: ${product.pageCount.minimum}-${product.pageCount.maximum} inner pages, step ${product.pageCount.step}, cover ${product.pageCount.coverPages}`,
    );
  }

  if (pricingPreview.rows.length > 0) {
    lines.push("Calculated checkout preview:");
    for (const row of pricingPreview.rows.slice(0, 8)) {
      const parts = [
        row.combination ? `combination=${row.combination}` : null,
        `quantity=${row.quantity}`,
        typeof row.volume === "number" ? `volume=${row.volume}` : null,
        formatPreviewRowPrice("unit", row.unitPrice),
        formatPreviewRowPrice("total", row.totalPrice),
        typeof row.deliveryTime === "number"
          ? `delivery=${row.deliveryTime}d`
          : null,
      ].filter((part): part is string => Boolean(part));

      lines.push(`- ${row.label}: ${parts.join(", ")}`);
    }

    if (pricingPreview.rows.length > 8) {
      lines.push(
        `- ...and ${pricingPreview.rows.length - 8} more calculated rows`,
      );
    }
  }

  if (pricingPreview.diagnostics.length > 0) {
    lines.push("Pricing checks:");
    for (const diagnostic of pricingPreview.diagnostics) {
      lines.push(
        `- ${diagnostic.severity.toUpperCase()} ${diagnostic.label}: ${diagnostic.reason} ${diagnostic.suggestedAction}`,
      );
    }
  }

  if (draft.selectedAttributes.length > 0) {
    lines.push("Selectable attributes:");
    for (const attribute of draft.selectedAttributes) {
      lines.push(
        `- ${attribute.attributeName}: ${attribute.optionValues.join(", ")}`,
      );
    }
  }

  return lines.join("\n");
}

function getDb() {
  return getAdminDb();
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isPageCountLikeLabel(value: string): boolean {
  const token = normalizeToken(value);

  return [
    "page-count",
    "page-counts",
    "page-number",
    "page-numbers",
    "pages",
    "stron",
    "strona",
    "strony",
    "liczba-stron",
    "ilosc-stron",
    "ilosc-strony",
    "ilosc-stron-wewnetrznych",
    "liczba-stron-wewnetrznych",
  ].includes(token);
}

function normalizeAscii(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");
}

function toOptionValue(label: string): string {
  return normalizeToken(label) || "option";
}

function toSlug(value: string): string {
  return normalizeToken(value) || "product";
}

function toIdentifier(value: string, fallback: string): string {
  const words = normalizeAscii(value)
    .split(/[^a-zA-Z]+/)
    .filter(Boolean);

  if (words.length === 0) {
    return fallback;
  }

  const identifier = words
    .map((word, index) => {
      const lowerCasedWord = word.toLowerCase();

      if (index === 0) {
        return lowerCasedWord;
      }

      return lowerCasedWord.charAt(0).toUpperCase() + lowerCasedWord.slice(1);
    })
    .join("");

  return identifier || fallback;
}

function toAlphabeticSuffix(index: number): string {
  let currentIndex = index;
  let result = "";

  while (currentIndex > 0) {
    const remainder = (currentIndex - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    currentIndex = Math.floor((currentIndex - 1) / 26);
  }

  return result;
}

function getUniqueId(baseId: string, existingIds: Set<string>): string {
  const normalizedBaseId = toIdentifier(baseId, "item");

  if (!existingIds.has(normalizedBaseId)) {
    return normalizedBaseId;
  }

  let suffix = 1;
  let candidate = `${normalizedBaseId}${toAlphabeticSuffix(suffix)}`;

  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${normalizedBaseId}${toAlphabeticSuffix(suffix)}`;
  }

  return candidate;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function dedupeCatalogSetupOptions(
  options: Array<{
    label: string;
    value: string;
  }>,
): ProductAgentCatalogSetupOption[] {
  const optionMap = new Map<string, ProductAgentCatalogSetupOption>();

  for (const option of options) {
    const label = option.label.trim();
    const value = option.value.trim() || toOptionValue(label);
    const key = normalizeToken(value) || normalizeToken(label);

    if (!key || optionMap.has(key)) {
      continue;
    }

    optionMap.set(key, {
      label: label || value,
      value,
    });
  }

  return [...optionMap.values()].toSorted((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function buildMissingAttributeCatalogSetup(
  draft: ProductAgentDraft,
): ProductAgentCatalogSetupPlan["attributes"] {
  const missingAttributeMap = new Map<
    string,
    ProductAgentCatalogSetupPlan["attributes"][number]
  >();

  for (const attribute of draft.missingAttributes) {
    const attributeName = attribute.name.trim();
    const attributeKey = normalizeToken(attributeName);

    if (
      !attributeName ||
      !attributeKey ||
      isPageCountLikeLabel(attributeName)
    ) {
      continue;
    }

    const existingAttribute = missingAttributeMap.get(attributeKey);
    const options = dedupeCatalogSetupOptions([
      ...(existingAttribute?.options ?? []),
      ...attribute.options,
    ]);

    missingAttributeMap.set(attributeKey, {
      calculated:
        existingAttribute?.calculated ??
        draft.priceType === PriceTypeEnum.MATRIX,
      name: attributeName,
      options,
      reason: existingAttribute?.reason || attribute.reason,
      suggestedId:
        existingAttribute?.suggestedId ||
        toIdentifier(attributeName, "attribute"),
      suggestedType:
        existingAttribute?.suggestedType || attribute.suggestedType,
    });
  }

  return [...missingAttributeMap.values()].toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function buildMissingOptionCatalogSetup(
  draft: ProductAgentDraft,
): ProductAgentCatalogSetupPlan["options"] {
  const optionUpdateMap = new Map<
    string,
    ProductAgentCatalogSetupPlan["options"][number]
  >();

  const addOption = (options: {
    attributeId: string;
    attributeName: string;
    optionLabel: string;
    optionValue: string;
  }) => {
    const { attributeId, attributeName, optionLabel, optionValue } = options;
    const normalizedAttributeId = attributeId.trim();

    if (!normalizedAttributeId) {
      return;
    }

    const existingOptionUpdate = optionUpdateMap.get(normalizedAttributeId);
    const nextOptions = dedupeCatalogSetupOptions([
      ...(existingOptionUpdate?.options ?? []),
      {
        label: optionLabel,
        value: optionValue,
      },
    ]);

    optionUpdateMap.set(normalizedAttributeId, {
      attributeId: normalizedAttributeId,
      attributeName: attributeName.trim() || normalizedAttributeId,
      options: nextOptions,
    });
  };

  for (const missingOption of draft.missingOptions) {
    for (const option of missingOption.options) {
      addOption({
        attributeId: missingOption.attributeId,
        attributeName: missingOption.attributeName,
        optionLabel: option.label,
        optionValue: option.value,
      });
    }
  }

  for (const blockedItem of draft.blockedItems) {
    if (
      blockedItem.type !== "option" ||
      !blockedItem.attributeId ||
      !blockedItem.optionValue
    ) {
      continue;
    }

    const [attributeNamePart, optionLabelPart] = blockedItem.label
      .split(/:(.+)/)
      .map((part) => part?.trim() ?? "");

    addOption({
      attributeId: blockedItem.attributeId,
      attributeName: attributeNamePart || blockedItem.attributeId,
      optionLabel: optionLabelPart || blockedItem.optionValue,
      optionValue: blockedItem.optionValue,
    });
  }

  return [...optionUpdateMap.values()].toSorted((left, right) =>
    left.attributeName.localeCompare(right.attributeName),
  );
}

function buildCatalogSetupProductTypeAttributeRefs(options: {
  draft: ProductAgentDraft;
  plannedAttributes: ProductAgentCatalogSetupPlan["attributes"];
  plannedOptionUpdates: ProductAgentCatalogSetupPlan["options"];
}): ProductAgentCatalogSetupProductTypeAttributeRef[] {
  const { draft, plannedAttributes, plannedOptionUpdates } = options;
  const attributeRefMap = new Map<
    string,
    ProductAgentCatalogSetupProductTypeAttributeRef
  >();

  const addAttributeRef = (
    attributeRef: ProductAgentCatalogSetupProductTypeAttributeRef,
  ) => {
    const key =
      attributeRef.attributeId ?? normalizeToken(attributeRef.attributeName);

    if (!key || attributeRefMap.has(key)) {
      return;
    }

    attributeRefMap.set(key, attributeRef);
  };

  for (const selectedAttribute of draft.selectedAttributes) {
    addAttributeRef({
      attributeId: selectedAttribute.attributeId,
      attributeName: selectedAttribute.attributeName,
    });
  }

  for (const optionUpdate of plannedOptionUpdates) {
    addAttributeRef({
      attributeId: optionUpdate.attributeId,
      attributeName: optionUpdate.attributeName,
    });
  }

  for (const attribute of plannedAttributes) {
    addAttributeRef({
      attributeName: attribute.name,
    });
  }

  return [...attributeRefMap.values()].toSorted((left, right) =>
    left.attributeName.localeCompare(right.attributeName),
  );
}

function buildProductTypeCatalogSetup(options: {
  draft: ProductAgentDraft;
  plannedAttributes: ProductAgentCatalogSetupPlan["attributes"];
  plannedOptionUpdates: ProductAgentCatalogSetupPlan["options"];
}): ProductAgentCatalogSetupPlan["productType"] | undefined {
  const { draft, plannedAttributes, plannedOptionUpdates } = options;

  if (
    draft.priceType !== PriceTypeEnum.MATRIX ||
    !draft.blockedItems.some((item) => item.type === "productType")
  ) {
    return undefined;
  }

  const productTypeName = draft.product.name?.trim();

  if (!productTypeName) {
    return undefined;
  }

  const attributeRefs = buildCatalogSetupProductTypeAttributeRefs({
    draft,
    plannedAttributes,
    plannedOptionUpdates,
  });

  if (attributeRefs.length === 0) {
    return undefined;
  }

  return {
    attributeRefs,
    isShippable: true,
    name: productTypeName,
    suggestedId: toIdentifier(productTypeName, "productType"),
  };
}

export function buildProductCreationCatalogSetupPlan({
  draft,
}: {
  draft: ProductAgentDraft;
}): ProductAgentCatalogSetupPlan | null {
  const attributes = buildMissingAttributeCatalogSetup(draft);
  const options = buildMissingOptionCatalogSetup(draft);
  const productType = buildProductTypeCatalogSetup({
    draft,
    plannedAttributes: attributes,
    plannedOptionUpdates: options,
  });

  if (attributes.length === 0 && options.length === 0 && !productType) {
    return null;
  }

  return {
    attributes,
    options,
    ...(productType ? { productType } : {}),
  };
}

export function sanitizeProductCreationCatalogSetupPlan(
  plan: ProductAgentCatalogSetupPlan,
): ProductAgentCatalogSetupPlan {
  const attributes = plan.attributes
    .flatMap((attribute) => {
      const name = attribute.name.trim();

      if (!name) {
        return [];
      }

      return [
        {
          calculated: Boolean(attribute.calculated),
          name,
          options: dedupeCatalogSetupOptions(attribute.options),
          reason: attribute.reason.trim(),
          suggestedId: toIdentifier(attribute.suggestedId || name, "attribute"),
          suggestedType: attribute.suggestedType,
        },
      ];
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));

  const options = plan.options
    .flatMap((optionUpdate) => {
      const attributeId = optionUpdate.attributeId.trim();
      const attributeName = optionUpdate.attributeName.trim();

      if (!attributeId || !attributeName) {
        return [];
      }

      return [
        {
          attributeId,
          attributeName,
          options: dedupeCatalogSetupOptions(optionUpdate.options),
        },
      ];
    })
    .toSorted((left, right) =>
      left.attributeName.localeCompare(right.attributeName),
    );

  const productType =
    plan.productType &&
    plan.productType.name.trim() &&
    plan.productType.attributeRefs.length > 0
      ? {
          attributeRefs: plan.productType.attributeRefs.flatMap(
            (attributeRef) => {
              const attributeName = attributeRef.attributeName.trim();
              const attributeId = attributeRef.attributeId?.trim();

              if (!attributeName && !attributeId) {
                return [];
              }

              return [
                {
                  ...(attributeId ? { attributeId } : {}),
                  attributeName: attributeName || attributeId || "",
                },
              ];
            },
          ),
          isShippable: Boolean(plan.productType.isShippable),
          name: plan.productType.name.trim(),
          suggestedId: toIdentifier(
            plan.productType.suggestedId || plan.productType.name,
            "productType",
          ),
        }
      : undefined;

  return {
    attributes,
    options,
    ...(productType ? { productType } : {}),
  };
}

export function getProductCreationCatalogSetupPlanKey(
  plan: ProductAgentCatalogSetupPlan,
): string {
  return JSON.stringify({
    attributes: plan.attributes.map((attribute) => ({
      name: attribute.name,
      options: attribute.options.map((option) => option.value),
      suggestedType: attribute.suggestedType,
    })),
    options: plan.options.map((optionUpdate) => ({
      attributeId: optionUpdate.attributeId,
      options: optionUpdate.options.map((option) => option.value),
    })),
    productType: plan.productType
      ? {
          attributeRefs: plan.productType.attributeRefs.map((attributeRef) => ({
            attributeId: attributeRef.attributeId ?? null,
            attributeName: attributeRef.attributeName,
          })),
          name: plan.productType.name,
        }
      : null,
  });
}

export function formatProductCreationCatalogSetupSummary(
  plan: ProductAgentCatalogSetupPlan,
): string {
  const lines: string[] = [];

  if (plan.attributes.length > 0) {
    lines.push(
      `- Atrybuty: ${plan.attributes
        .map(
          (attribute) =>
            `${attribute.name} (${attribute.options
              .map((option) => option.label)
              .join(", ")})`,
        )
        .join("; ")}`,
    );
  }

  if (plan.options.length > 0) {
    lines.push(
      `- Opcje: ${plan.options
        .map(
          (optionUpdate) =>
            `${optionUpdate.attributeName} → ${optionUpdate.options
              .map((option) => option.label)
              .join(", ")}`,
        )
        .join("; ")}`,
    );
  }

  if (plan.productType) {
    lines.push(
      `- Typ produktu: ${plan.productType.name} (${plan.productType.attributeRefs
        .map((attributeRef) => attributeRef.attributeName)
        .join(", ")})`,
    );
  }

  return lines.join("\n");
}

export function buildProductCreationCatalogSetupConfirmationQuestion(
  plan: ProductAgentCatalogSetupPlan,
): string {
  const summary = formatProductCreationCatalogSetupSummary(plan);

  return [
    "Żeby dokończyć szkic produktu, mogę automatycznie uzupełnić brakujące dane w katalogu:",
    summary,
    'Napisz "tak", jeśli mam to zrobić teraz, albo doprecyzuj co zmienić.',
  ]
    .filter(Boolean)
    .join("\n");
}

const DEFAULT_STOCK_FROM_SHEET = {
  enabled: false,
  sheetWidth: 450,
  sheetHeight: 320,
  margin: 0,
  bleed: 3,
} satisfies NonNullable<Attribute["calculateStockFromSheet"]>;

export async function applyProductCreationCatalogSetupStep({
  createdBy,
  plan,
}: {
  createdBy: NestedMember;
  plan: ProductAgentCatalogSetupPlan;
}): Promise<{
  createdAttributes: Array<{ id: string; name: string }>;
  createdProductType?: { id: string; name: string };
  summary: string;
  updatedOptions: Array<{
    attributeId: string;
    attributeName: string;
    optionValues: string[];
  }>;
  warnings: string[];
}> {
  "use step";

  const db = getDb();
  const batch = db.batch();
  let hasCatalogWrites = false;
  const now = Timestamp.now();
  const warnings: string[] = [];
  const createdAttributes: Array<{ id: string; name: string }> = [];
  const updatedOptions: Array<{
    attributeId: string;
    attributeName: string;
    optionValues: string[];
  }> = [];
  const createdAttributeIdsByName = new Map<string, string>();
  const attributeCollection = db.collection("attributes");
  const productTypeCollection = db.collection("productTypes");

  const [attributeSnapshot, productTypeSnapshot] = await Promise.all([
    attributeCollection.limit(500).get(),
    productTypeCollection.limit(300).get(),
  ]);

  const existingAttributeIds = new Set(
    attributeSnapshot.docs.map((doc) => doc.id),
  );
  const existingProductTypeIds = new Set(
    productTypeSnapshot.docs.map((doc) => doc.id),
  );
  const existingAttributesById = new Map(
    attributeSnapshot.docs.map((doc) => [
      doc.id,
      {
        data: doc.data() as Attribute,
        ref: doc.ref,
      },
    ]),
  );

  for (const attribute of plan.attributes) {
    const attributeId = getUniqueId(
      attribute.suggestedId,
      existingAttributeIds,
    );
    existingAttributeIds.add(attributeId);

    const nextAttribute: Attribute = {
      active: true,
      calculateStockFromSheet: DEFAULT_STOCK_FROM_SHEET,
      calculated: attribute.calculated,
      createdAt: now,
      createdBy,
      format: false,
      id: attributeId,
      keywords: generateKeywords(attribute.name),
      name: attribute.name,
      options: attribute.options.map((option) => ({
        customFormat: false,
        hidden: false,
        label: option.label,
        value: option.value,
      })),
      pages: false,
      required: true,
      trackStock: false,
      type: attribute.suggestedType,
      updatedAt: now,
      updatedBy: createdBy,
    };

    const attributeRef = attributeCollection.doc(attributeId);
    batch.set(attributeRef, nextAttribute);
    hasCatalogWrites = true;
    createdAttributeIdsByName.set(normalizeToken(attribute.name), attributeId);
    createdAttributes.push({
      id: attributeId,
      name: attribute.name,
    });
    existingAttributesById.set(attributeId, {
      data: nextAttribute,
      ref: attributeRef,
    });
  }

  for (const optionUpdate of plan.options) {
    const attributeEntry = existingAttributesById.get(optionUpdate.attributeId);

    if (!attributeEntry) {
      warnings.push(
        `Nie udało się znaleźć atrybutu ${optionUpdate.attributeName} (${optionUpdate.attributeId}) do aktualizacji opcji.`,
      );
      continue;
    }

    const existingOptions = attributeEntry.data.options ?? [];
    const nextOptions = [...existingOptions];
    const existingOptionKeys = new Set(
      existingOptions.flatMap((option) => {
        const keys = [
          normalizeToken(option.value),
          normalizeToken(option.label),
        ].filter((key): key is string => Boolean(key));

        return keys;
      }),
    );
    const addedOptions = dedupeCatalogSetupOptions(
      optionUpdate.options,
    ).flatMap((option) => {
      const optionKeys = [
        normalizeToken(option.value),
        normalizeToken(option.label),
      ].filter((key): key is string => Boolean(key));

      if (optionKeys.some((key) => existingOptionKeys.has(key))) {
        return [];
      }

      optionKeys.forEach((key) => existingOptionKeys.add(key));
      return [
        {
          customFormat: false,
          hidden: false,
          label: option.label,
          value: option.value,
        },
      ];
    });

    if (addedOptions.length === 0) {
      continue;
    }

    nextOptions.push(...addedOptions);
    batch.update(attributeEntry.ref, {
      options: nextOptions,
      updatedAt: now,
      updatedBy: createdBy,
    });
    hasCatalogWrites = true;
    attributeEntry.data = {
      ...attributeEntry.data,
      options: nextOptions,
      updatedAt: now,
      updatedBy: createdBy,
    };
    updatedOptions.push({
      attributeId: optionUpdate.attributeId,
      attributeName: optionUpdate.attributeName,
      optionValues: addedOptions.map((option) => option.value),
    });
  }

  let createdProductType:
    | {
        id: string;
        name: string;
      }
    | undefined;

  if (plan.productType) {
    const productTypeAttributeIds = uniqueSorted(
      plan.productType.attributeRefs.flatMap((attributeRef) => {
        if (attributeRef.attributeId) {
          return [attributeRef.attributeId];
        }

        const createdAttributeId = createdAttributeIdsByName.get(
          normalizeToken(attributeRef.attributeName),
        );

        return createdAttributeId ? [createdAttributeId] : [];
      }),
    );

    if (productTypeAttributeIds.length === 0) {
      warnings.push(
        `Nie udało się zbudować typu produktu ${plan.productType.name}, bo nie udało się rozpoznać żadnych atrybutów.`,
      );
    } else {
      const productTypeId = getUniqueId(
        plan.productType.suggestedId,
        existingProductTypeIds,
      );
      existingProductTypeIds.add(productTypeId);

      const nextProductType: ProductType = {
        active: true,
        attributes: productTypeAttributeIds,
        createdAt: now,
        createdBy,
        id: productTypeId,
        isShippable: plan.productType.isShippable,
        keywords: generateKeywords(plan.productType.name),
        name: plan.productType.name,
        updatedAt: now,
        updatedBy: createdBy,
      };

      batch.set(productTypeCollection.doc(productTypeId), nextProductType);
      hasCatalogWrites = true;
      createdProductType = {
        id: productTypeId,
        name: plan.productType.name,
      };
    }
  }

  if (hasCatalogWrites) {
    await batch.commit();
  }

  const summaryParts: string[] = [];

  if (createdAttributes.length > 0) {
    summaryParts.push(
      `utworzone atrybuty: ${createdAttributes
        .map((attribute) => `${attribute.name} (${attribute.id})`)
        .join(", ")}`,
    );
  }

  if (updatedOptions.length > 0) {
    summaryParts.push(
      `dodane opcje: ${updatedOptions
        .map(
          (optionUpdate) =>
            `${optionUpdate.attributeName} → ${optionUpdate.optionValues.join(", ")}`,
        )
        .join("; ")}`,
    );
  }

  if (createdProductType) {
    summaryParts.push(
      `utworzony typ produktu: ${createdProductType.name} (${createdProductType.id})`,
    );
  }

  if (warnings.length > 0) {
    summaryParts.push(`ostrzeżenia: ${warnings.join(" ")}`);
  }

  return {
    createdAttributes,
    ...(createdProductType ? { createdProductType } : {}),
    summary:
      summaryParts.length > 0
        ? `Uzupełniłem katalog: ${summaryParts.join("; ")}.`
        : "Nie było nic do utworzenia w katalogu.",
    updatedOptions,
    warnings,
  };
}

function toMinorUnits(value: number): number {
  return Math.round((value + Number.EPSILON) * MINOR_UNITS_MULTIPLIER);
}

function normalizeDynamicPricingMoney(
  value: number | null | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? toMinorUnits(value)
    : undefined;
}

function getFinitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function createBlock(block: ProductAgentBlockedItem): ProductAgentBlockedItem {
  return block;
}

function pushUniqueBlock(
  blockedItems: ProductAgentBlockedItem[],
  block: ProductAgentBlockedItem,
) {
  const duplicate = blockedItems.some(
    (item) =>
      item.type === block.type &&
      item.label === block.label &&
      item.reason === block.reason &&
      item.attributeId === block.attributeId &&
      item.optionValue === block.optionValue,
  );

  if (!duplicate) {
    blockedItems.push(createBlock(block));
  }
}

function findOptionValue(
  attribute: CatalogAttribute,
  candidate: string,
): string | null {
  const candidateToken = normalizeToken(candidate);
  const exact = attribute.options.find(
    (option) => option.value === candidate || option.label === candidate,
  );

  if (exact) {
    return exact.value;
  }

  return (
    attribute.options.find(
      (option) =>
        normalizeToken(option.value) === candidateToken ||
        normalizeToken(option.label) === candidateToken,
    )?.value ?? null
  );
}

function getAttributeMap(
  attributes: CatalogAttribute[],
): Map<string, CatalogAttribute> {
  return new Map(attributes.map((attribute) => [attribute.id, attribute]));
}

function getSelectedCategory(
  catalog: ProductCreationCatalog,
  categoryId: string | null,
): CatalogCategory | null {
  if (!categoryId) {
    return null;
  }

  return (
    catalog.categories.find((category) => category.id === categoryId) ?? null
  );
}

function getSelectedProductType(
  catalog: ProductCreationCatalog,
  productTypeId: string | null,
): CatalogProductType | null {
  if (!productTypeId) {
    return null;
  }

  return (
    catalog.productTypes.find(
      (productType) => productType.id === productTypeId,
    ) ?? null
  );
}

function normalizeMissingAttributes(
  plan: ProductDraftPlan,
): ProductAgentMissingAttribute[] {
  return plan.missingAttributes
    .filter(
      (attribute) =>
        !(plan.pageCount?.enabled && isPageCountLikeLabel(attribute.name)),
    )
    .map((attribute) => ({
      name: attribute.name.trim(),
      options: attribute.options.map((option) => ({
        label: option.label.trim(),
        value: option.value.trim() || toOptionValue(option.label),
      })),
      reason: attribute.reason.trim(),
      suggestedType: attribute.suggestedType,
    }));
}

function normalizePlanMissingOptions(
  plan: ProductDraftPlan,
): ProductAgentMissingOption[] {
  return plan.missingOptions.map((entry) => ({
    attributeId: entry.attributeId,
    attributeName: entry.attributeName,
    options: entry.options.map((option) => ({
      label: option.label.trim(),
      value: option.value.trim() || toOptionValue(option.label),
    })),
  }));
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePageCountMultiple(
  value: number | null | undefined,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const rounded =
    Math.round(Math.trunc(value) / PAGE_COUNT_DIVISOR) * PAGE_COUNT_DIVISOR;
  return Math.max(PAGE_COUNT_DIVISOR, rounded);
}

function getPageCountPriceType(
  plan: ProductDraftPlan,
): ProductDraftPlan["priceType"] {
  return plan.priceType === PriceTypeEnum.DYNAMIC
    ? PriceTypeEnum.MATRIX
    : plan.priceType;
}

function buildOptionalPrices(options: {
  attributeDefinitions: CatalogAttribute[];
  blockedItems: ProductAgentBlockedItem[];
  plan: ProductDraftPlan;
  priceRows: ProductDraftPlan["prices"];
  priceType: ProductDraftPlan["priceType"];
}): Price[] {
  if (options.priceRows.length === 0) {
    return [];
  }

  return buildPrices(options);
}

function normalizeProductPageCountPricing(options: {
  attributeDefinitions: CatalogAttribute[];
  blockedItems: ProductAgentBlockedItem[];
  pageCountMaximum: number;
  pageCountMinimum: number;
  plan: ProductDraftPlan;
  pricingMode: "step" | "segmented" | "exact";
}): NonNullable<NonNullable<Product["pageCount"]>["pricing"]> {
  const {
    attributeDefinitions,
    blockedItems,
    pageCountMaximum,
    pageCountMinimum,
    plan,
    pricingMode,
  } = options;
  const pageCountPricing = plan.pageCount?.pricing;
  const priceType = getPageCountPriceType(plan);

  if (pricingMode === "exact") {
    const exactPrices = (pageCountPricing?.exactPrices ?? [])
      .map((entry) => ({
        pageCount: normalizePageCountMultiple(
          entry.pageCount,
          pageCountMinimum,
        ),
        prices: buildOptionalPrices({
          attributeDefinitions,
          blockedItems,
          plan,
          priceRows: entry.prices,
          priceType,
        }),
      }))
      .filter(
        (entry) =>
          entry.pageCount >= pageCountMinimum &&
          entry.pageCount <= pageCountMaximum &&
          entry.prices.length > 0,
      )
      .toSorted((left, right) => left.pageCount - right.pageCount);

    return {
      exactPrices,
      mode: "exact",
      stepPrices: [],
    };
  }

  if (pricingMode === "segmented") {
    const segmentPrices = (pageCountPricing?.segmentPrices ?? [])
      .map((segment) => {
        const minimum = normalizePageCountMultiple(
          segment.minimum,
          pageCountMinimum,
        );
        const maximum = Math.max(
          minimum,
          normalizePageCountMultiple(segment.maximum, minimum),
        );

        return {
          basePrices: buildOptionalPrices({
            attributeDefinitions,
            blockedItems,
            plan,
            priceRows: segment.basePrices,
            priceType,
          }),
          maximum,
          minimum,
          stepPrices: buildOptionalPrices({
            attributeDefinitions,
            blockedItems,
            plan,
            priceRows: segment.stepPrices,
            priceType,
          }),
        };
      })
      .filter(
        (segment) =>
          segment.minimum >= pageCountMinimum &&
          segment.minimum <= pageCountMaximum &&
          segment.maximum <= pageCountMaximum &&
          (segment.basePrices.length > 0 || segment.stepPrices.length > 0),
      )
      .toSorted((left, right) => left.minimum - right.minimum);

    return {
      mode: "segmented",
      segments: segmentPrices.map(({ maximum, minimum }) => ({
        maximum,
        minimum,
      })),
      segmentPrices,
      stepPrices: segmentPrices[0]?.stepPrices ?? [],
    };
  }

  return {
    mode: "step",
    stepPrices: buildOptionalPrices({
      attributeDefinitions,
      blockedItems,
      plan,
      priceRows: pageCountPricing?.stepPrices ?? [],
      priceType,
    }),
  };
}

function normalizeProductPageCountConfig(options: {
  attributeDefinitions: CatalogAttribute[];
  blockedItems: ProductAgentBlockedItem[];
  plan: ProductDraftPlan;
  productAttributes: string[];
}): Product["pageCount"] | undefined {
  const { attributeDefinitions, blockedItems, plan, productAttributes } =
    options;
  const pageCount = plan.pageCount;

  if (!pageCount?.enabled) {
    return undefined;
  }

  const minimum = normalizePageCountMultiple(
    pageCount.minimum,
    PAGE_COUNT_DIVISOR,
  );
  const maximum = Math.max(
    minimum,
    normalizePageCountMultiple(pageCount.maximum, minimum),
  );
  const step = normalizePageCountMultiple(pageCount.step, PAGE_COUNT_DIVISOR);
  const coverPages = normalizePageCountMultiple(
    pageCount.coverPages,
    DEFAULT_PAGE_COUNT_COVER_PAGES,
  );
  const afterAttributeId = normalizeOptionalText(
    pageCount.placement?.afterAttributeId,
  );
  const externalAttributeName = normalizeOptionalText(
    pageCount.externalAttributeName,
  );
  const pricingMode =
    pageCount.pricing?.mode ?? pageCount.pricingMode ?? "step";
  const pricing = normalizeProductPageCountPricing({
    attributeDefinitions,
    blockedItems,
    pageCountMaximum: maximum,
    pageCountMinimum: minimum,
    plan,
    pricingMode,
  });

  return {
    enabled: true,
    minimum,
    maximum,
    step,
    coverPages,
    ...(externalAttributeName ? { externalAttributeName } : {}),
    placement: {
      afterAttributeId:
        afterAttributeId && productAttributes.includes(afterAttributeId)
          ? afterAttributeId
          : null,
    },
    pricing,
  };
}

function normalizeDynamicPricingConfig(
  plan: ProductDraftPlan,
): NonNullable<Product["dynamicPricing"]> | undefined {
  if (!plan.dynamicPricing) {
    return undefined;
  }

  const attributeRules = plan.dynamicPricing.attributeRules
    .map((rule) => ({
      adjustments: rule.adjustments
        .map((adjustment) => ({
          ...(typeof adjustment.deliveryTimeAdjustment === "number"
            ? { deliveryTimeAdjustment: adjustment.deliveryTimeAdjustment }
            : {}),
          optionValue: adjustment.optionValue.trim(),
          ...(typeof adjustment.priceAdjustment === "number"
            ? {
                priceAdjustment: normalizeDynamicPricingMoney(
                  adjustment.priceAdjustment,
                ),
              }
            : {}),
        }))
        .filter((adjustment) => adjustment.optionValue.length > 0),
      attributeId: rule.attributeId.trim(),
      mode: rule.mode,
    }))
    .filter((rule) => rule.attributeId.length > 0);

  const globalRules = plan.dynamicPricing.globalRules
    .map((rule) => {
      const shouldConvertPriceOutputs = rule.target === "price";

      return {
        calculator: rule.calculator,
        ...(rule.conditions.length > 0
          ? {
              conditions: rule.conditions
                .map((condition) => ({
                  attributeId: condition.attributeId.trim(),
                  optionValues: uniqueSorted(
                    condition.optionValues
                      .map((optionValue) => optionValue.trim())
                      .filter((optionValue) => optionValue.length > 0),
                  ),
                }))
                .filter(
                  (condition) =>
                    condition.attributeId.length > 0 &&
                    condition.optionValues.length > 0,
                ),
            }
          : {}),
        ...(typeof rule.fixedValue === "number"
          ? {
              fixedValue: shouldConvertPriceOutputs
                ? normalizeDynamicPricingMoney(rule.fixedValue)
                : rule.fixedValue,
            }
          : {}),
        id: rule.id.trim(),
        ...(normalizeOptionalText(rule.inputId)
          ? { inputId: normalizeOptionalText(rule.inputId) }
          : {}),
        ...(typeof rule.inverse === "boolean" ? { inverse: rule.inverse } : {}),
        label: rule.label.trim(),
        ...(typeof rule.maximumMetricValue === "number"
          ? { maximumMetricValue: rule.maximumMetricValue }
          : {}),
        ...(typeof rule.maximumOutputValue === "number"
          ? {
              maximumOutputValue: shouldConvertPriceOutputs
                ? normalizeDynamicPricingMoney(rule.maximumOutputValue)
                : rule.maximumOutputValue,
            }
          : {}),
        ...(rule.metric ? { metric: rule.metric } : {}),
        ...(typeof rule.minimumMetricValue === "number"
          ? { minimumMetricValue: rule.minimumMetricValue }
          : {}),
        ...(typeof rule.minimumOutputValue === "number"
          ? {
              minimumOutputValue: shouldConvertPriceOutputs
                ? normalizeDynamicPricingMoney(rule.minimumOutputValue)
                : rule.minimumOutputValue,
            }
          : {}),
        ...(typeof rule.multiplier === "number"
          ? {
              multiplier: shouldConvertPriceOutputs
                ? normalizeDynamicPricingMoney(rule.multiplier)
                : rule.multiplier,
            }
          : {}),
        ...(normalizeOptionalText(rule.outputMultiplierInputId)
          ? {
              outputMultiplierInputId: normalizeOptionalText(
                rule.outputMultiplierInputId,
              ),
            }
          : {}),
        ...(rule.outputMultiplierMetric
          ? { outputMultiplierMetric: rule.outputMultiplierMetric }
          : {}),
        target: rule.target,
      };
    })
    .filter((rule) => rule.id.length > 0 && rule.label.length > 0);

  const inputs = plan.dynamicPricing.inputs
    .map((input) => ({
      id: input.id.trim(),
      label: input.label.trim(),
      ...(normalizeOptionalText(input.unit)
        ? { unit: normalizeOptionalText(input.unit) }
        : {}),
      value: input.value,
    }))
    .filter((input) => input.id.length > 0 && input.label.length > 0);

  return {
    attributeRules,
    ...(typeof plan.dynamicPricing.baseDeliveryTime === "number"
      ? { baseDeliveryTime: plan.dynamicPricing.baseDeliveryTime }
      : {}),
    basePrice: toMinorUnits(plan.dynamicPricing.basePrice),
    enabled: plan.dynamicPricing.enabled,
    globalRules,
    ...(inputs.length > 0 ? { inputs } : {}),
    ...(plan.dynamicPricing.linkedPresetIds.length > 0
      ? {
          linkedPresetIds: uniqueSorted(
            plan.dynamicPricing.linkedPresetIds
              .map((presetId) => presetId.trim())
              .filter((presetId) => presetId.length > 0),
          ),
        }
      : {}),
  };
}

function hasUsableDynamicPricingConfig(
  config: NonNullable<Product["dynamicPricing"]> | undefined,
): boolean {
  if (!config?.enabled) {
    return false;
  }

  return (
    config.basePrice !== 0 ||
    config.attributeRules.length > 0 ||
    config.globalRules.length > 0
  );
}

function mergeSelectedAttributesWithDynamicPricing(options: {
  catalog: ProductCreationCatalog;
  dynamicPricing: NonNullable<Product["dynamicPricing"]> | undefined;
  selectedAttributes: ProductDraftPlan["selectedAttributes"];
}): ProductDraftPlan["selectedAttributes"] {
  const { catalog, dynamicPricing, selectedAttributes } = options;
  const attributesById = getAttributeMap(catalog.attributes);
  const selectedAttributeMap = new Map<
    string,
    ProductDraftPlan["selectedAttributes"][number]
  >();

  const addSelectedAttribute = (
    selectedAttribute: ProductDraftPlan["selectedAttributes"][number],
  ) => {
    const attributeId = selectedAttribute.attributeId.trim();

    if (!attributeId) {
      return;
    }

    const existing = selectedAttributeMap.get(attributeId);
    selectedAttributeMap.set(attributeId, {
      attributeId,
      optionValues: uniqueSorted([
        ...(existing?.optionValues ?? []),
        ...selectedAttribute.optionValues
          .map((optionValue) => optionValue.trim())
          .filter((optionValue) => optionValue.length > 0),
      ]),
      role: existing?.role ?? selectedAttribute.role,
    });
  };

  selectedAttributes.forEach(addSelectedAttribute);
  const explicitlySelectedAttributeIds = new Set(
    selectedAttributes
      .map((attribute) => attribute.attributeId.trim())
      .filter((attributeId) => attributeId.length > 0),
  );

  for (const attributeRule of dynamicPricing?.attributeRules ?? []) {
    if (explicitlySelectedAttributeIds.has(attributeRule.attributeId)) {
      continue;
    }

    addSelectedAttribute({
      attributeId: attributeRule.attributeId,
      optionValues: attributeRule.adjustments.map(
        (adjustment) => adjustment.optionValue,
      ),
      role: "dynamic pricing adjustment",
    });
  }

  for (const globalRule of dynamicPricing?.globalRules ?? []) {
    for (const condition of globalRule.conditions ?? []) {
      if (explicitlySelectedAttributeIds.has(condition.attributeId)) {
        continue;
      }

      const catalogAttribute = attributesById.get(condition.attributeId);
      addSelectedAttribute({
        attributeId: condition.attributeId,
        optionValues:
          catalogAttribute?.options.map((option) => option.value) ??
          condition.optionValues,
        role: "dynamic pricing condition",
      });
    }
  }

  return [...selectedAttributeMap.values()];
}

function resolveSelectedAttributes(options: {
  catalog: ProductCreationCatalog;
  plan: ProductDraftPlan;
  blockedItems: ProductAgentBlockedItem[];
}): {
  attributeDefinitions: CatalogAttribute[];
  attributeOptions: Product["attributeOptions"];
  selectedAttributes: ProductAgentSelectedAttribute[];
} {
  const { catalog, plan, blockedItems } = options;
  const attributesById = getAttributeMap(catalog.attributes);
  const attributeDefinitions: CatalogAttribute[] = [];
  const attributeOptions: Product["attributeOptions"] = {};
  const selectedAttributes: ProductAgentSelectedAttribute[] = [];

  for (const selectedAttribute of plan.selectedAttributes) {
    const attribute = attributesById.get(selectedAttribute.attributeId);

    if (!attribute) {
      blockedItems.push(
        createBlock({
          type: "attribute",
          label: selectedAttribute.attributeId,
          reason: "The selected attribute does not exist in Konfi.",
          suggestedAction:
            "Create the attribute first, then rerun or continue the product creation agent.",
          attributeId: selectedAttribute.attributeId,
        }),
      );
      continue;
    }

    if (isPageCountLikeLabel(attribute.name)) {
      blockedItems.push(
        createBlock({
          type: "attribute",
          label: attribute.name,
          reason:
            "Page count is modeled by product.pageCount and must not be selected as a catalog attribute.",
          suggestedAction:
            "Remove the page-count attribute and fill pageCount with minimum, maximum, step, and coverPages.",
          attributeId: attribute.id,
        }),
      );
      continue;
    }

    const resolvedOptionValues: string[] = [];

    for (const optionValue of selectedAttribute.optionValues) {
      const resolvedValue = findOptionValue(attribute, optionValue);

      if (resolvedValue) {
        resolvedOptionValues.push(resolvedValue);
        continue;
      }

      const suggestedValue = toOptionValue(optionValue);
      blockedItems.push(
        createBlock({
          type: "option",
          label: `${attribute.name}: ${optionValue}`,
          reason:
            "The option required by the generated product does not exist.",
          suggestedAction: `Add option "${optionValue}" (${suggestedValue}) to attribute "${attribute.name}" first.`,
          attributeId: attribute.id,
          optionValue: suggestedValue,
        }),
      );
    }

    const uniqueOptionValues = uniqueSorted(resolvedOptionValues);
    attributeDefinitions.push(attribute);
    attributeOptions[attribute.id] = uniqueOptionValues;
    selectedAttributes.push({
      attributeId: attribute.id,
      attributeName: attribute.name,
      optionValues: uniqueOptionValues,
      ...(selectedAttribute.role ? { role: selectedAttribute.role } : {}),
    });
  }

  return {
    attributeDefinitions,
    attributeOptions,
    selectedAttributes,
  };
}

function addExplicitMissingBlocks(options: {
  blockedItems: ProductAgentBlockedItem[];
  missingAttributes: ProductAgentMissingAttribute[];
  missingOptions: ProductAgentMissingOption[];
}) {
  const { blockedItems, missingAttributes, missingOptions } = options;

  for (const attribute of missingAttributes) {
    if (isPageCountLikeLabel(attribute.name)) {
      blockedItems.push(
        createBlock({
          type: "attribute",
          label: attribute.name,
          reason:
            "Page count must use product.pageCount, not a catalog attribute.",
          suggestedAction:
            "Move page options into the pageCount field with minimum, maximum, step, and coverPages.",
        }),
      );
      continue;
    }

    blockedItems.push(
      createBlock({
        type: "attribute",
        label: attribute.name,
        reason: attribute.reason,
        suggestedAction: `Create attribute "${attribute.name}" with ${attribute.options.length} option(s), then continue the agent.`,
      }),
    );
  }

  for (const entry of missingOptions) {
    for (const option of entry.options) {
      blockedItems.push(
        createBlock({
          type: "option",
          label: `${entry.attributeName}: ${option.label}`,
          reason: "The planning step identified this option as missing.",
          suggestedAction: `Add option "${option.label}" (${option.value}) to attribute "${entry.attributeName}" first.`,
          attributeId: entry.attributeId,
          optionValue: option.value,
        }),
      );
    }
  }
}

function buildMatrixCombinationIds(options: {
  attributeDefinitions: CatalogAttribute[];
  attributeValues: Record<string, string>;
  blockedItems: ProductAgentBlockedItem[];
  plan: ProductDraftPlan;
}): string[] {
  const { attributeDefinitions, attributeValues, blockedItems, plan } = options;
  let combinationParts: string[][] = [[]];
  const selectedOptionsByAttribute = new Map(
    plan.selectedAttributes.map((attribute) => [
      attribute.attributeId,
      attribute.optionValues,
    ]),
  );

  for (const attribute of attributeDefinitions) {
    if (!attribute.calculated) {
      continue;
    }

    const rawValue =
      attributeValues[attribute.id] ?? attributeValues[attribute.name];
    let resolvedValues: string[] = [];

    if (rawValue) {
      const resolvedValue = findOptionValue(attribute, rawValue);
      if (!resolvedValue) {
        pushUniqueBlock(blockedItems, {
          type: "price",
          label: `${attribute.name}: ${rawValue}`,
          reason:
            "A matrix price row references an option that does not exist.",
          suggestedAction:
            "Add the option first or adjust the source table before creating the product.",
          attributeId: attribute.id,
          optionValue: toOptionValue(rawValue),
        });
        return [];
      }

      resolvedValues = [resolvedValue];
    } else {
      resolvedValues = uniqueSorted(
        (selectedOptionsByAttribute.get(attribute.id) ?? [])
          .map((optionValue) => findOptionValue(attribute, optionValue))
          .filter((optionValue): optionValue is string => Boolean(optionValue)),
      );

      if (resolvedValues.length === 0) {
        pushUniqueBlock(blockedItems, {
          type: "price",
          label: attribute.name,
          reason:
            "A matrix price row is missing a value for a calculated attribute.",
          suggestedAction:
            "Review the source price table or select product options so the row can be expanded across shared-price variants.",
          attributeId: attribute.id,
        });
        return [];
      }
    }

    combinationParts = combinationParts.flatMap((parts) =>
      resolvedValues.map((resolvedValue) => [...parts, resolvedValue]),
    );
  }

  return combinationParts.length > 0
    ? combinationParts.map((parts) =>
        parts.length > 0 ? parts.join("-") : DEFAULT_COMBINATION,
      )
    : [];
}

function buildPrices(options: {
  attributeDefinitions: CatalogAttribute[];
  blockedItems: ProductAgentBlockedItem[];
  plan: ProductDraftPlan;
  priceRows?: ProductDraftPlan["prices"];
  priceType?: ProductDraftPlan["priceType"];
}): Price[] {
  const { attributeDefinitions, blockedItems, plan } = options;
  const priceRows = options.priceRows ?? plan.prices;
  const priceType = options.priceType ?? plan.priceType;
  const currency = CurrencyEnum.PLN;

  if (priceType === PriceTypeEnum.DYNAMIC) {
    return [];
  }

  if (priceType === PriceTypeEnum.SINGLE) {
    const firstPrice = priceRows.find((price) => price.active !== false);
    const grossValue = getFinitePositive(firstPrice?.valueGross);

    if (!grossValue) {
      blockedItems.push(
        createBlock({
          type: "price",
          label: "Base price",
          reason: "No positive single price was detected.",
          suggestedAction: "Provide a valid gross price for the product.",
        }),
      );
      return [];
    }

    return [{ currency, value: toMinorUnits(grossValue) }];
  }

  if (priceType === PriceTypeEnum.THRESHOLD) {
    const thresholdPrices = priceRows.flatMap((price) => {
      if (price.active === false) {
        return [];
      }

      const grossValue = getFinitePositive(price.valueGross);
      const threshold = getFinitePositive(price.threshold ?? price.quantity);

      if (!grossValue || !threshold) {
        return [];
      }

      return [
        {
          currency,
          threshold,
          value: toMinorUnits(grossValue),
        } satisfies Price,
      ];
    });

    if (thresholdPrices.length === 0) {
      blockedItems.push(
        createBlock({
          type: "price",
          label: "Threshold prices",
          reason: "No valid threshold price rows were detected.",
          suggestedAction: "Provide at least one quantity and gross price row.",
        }),
      );
    }

    return thresholdPrices.toSorted(
      (left, right) => (left.threshold ?? 0) - (right.threshold ?? 0),
    );
  }

  const matrixPrices: Price[] = [];
  const seenPriceKeys = new Set<string>();

  for (const price of priceRows) {
    if (price.active === false) {
      continue;
    }

    const grossValue = getFinitePositive(price.valueGross);
    const quantity = getFinitePositive(price.quantity);

    if (!grossValue) {
      blockedItems.push(
        createBlock({
          type: "price",
          label: price.source ?? "Matrix price row",
          reason: "A matrix price row is missing a positive gross price.",
          suggestedAction:
            "Fill every required matrix price cell or remove impossible combinations.",
        }),
      );
      continue;
    }

    const combinationIds = buildMatrixCombinationIds({
      attributeDefinitions,
      attributeValues: price.attributeValues,
      blockedItems,
      plan,
    });

    if (combinationIds.length === 0) {
      continue;
    }

    const volumeValue = quantity ?? 1;
    for (const combinationId of combinationIds) {
      const priceKey = `${combinationId}:${volumeValue}`;
      if (seenPriceKeys.has(priceKey)) {
        continue;
      }
      seenPriceKeys.add(priceKey);

      matrixPrices.push({
        combination: {
          active: true,
          customFormat: false,
          id: combinationId,
        },
        currency,
        value: toMinorUnits(grossValue),
        volume: {
          deliveryTime:
            price.deliveryTime && price.deliveryTime > 0
              ? Math.trunc(price.deliveryTime)
              : DEFAULT_DELIVERY_TIME_DAYS,
          value: volumeValue,
        },
      });
    }
  }

  if (matrixPrices.length === 0) {
    blockedItems.push(
      createBlock({
        type: "price",
        label: "Matrix prices",
        reason: "No valid matrix price rows were generated.",
        suggestedAction:
          "Provide a complete table with attribute values and gross prices.",
      }),
    );
  }

  return matrixPrices;
}

function getVolumes(
  plan: ProductDraftPlan,
  prices: Price[],
): Product["volumes"] {
  const fromPlan = plan.volumes
    .map((volume) => Math.trunc(volume.value))
    .filter((value) => Number.isFinite(value) && value > 0);
  const fromPrices = prices
    .map((price) => price.volume?.value ?? price.threshold)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    );
  const values = [...new Set([...fromPlan, ...fromPrices])].toSorted(
    (left, right) => left - right,
  );

  return values.length > 0
    ? values.map((value) => ({ value }))
    : [{ value: 1 }];
}

function getListingPrice(prices: Price[]): {
  defaultPrice: Price;
  highPrice: Price;
  lowPrice: Price;
} {
  const values = prices
    .map((price) => price.value)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    );
  const fallback: Price = {
    currency: CurrencyEnum.PLN,
    threshold: 0,
    value: 0,
  };

  if (values.length === 0) {
    return {
      defaultPrice: fallback,
      highPrice: fallback,
      lowPrice: fallback,
    };
  }

  const low = Math.min(...values);
  const high = Math.max(...values);
  return {
    defaultPrice: { currency: CurrencyEnum.PLN, value: values[0] ?? low },
    highPrice: { currency: CurrencyEnum.PLN, value: high },
    lowPrice: { currency: CurrencyEnum.PLN, value: low },
  };
}

function validateProductType(options: {
  blockedItems: ProductAgentBlockedItem[];
  plan: ProductDraftPlan;
  productAttributes: string[];
  productType: CatalogProductType | null;
}) {
  const { blockedItems, plan, productAttributes, productType } = options;

  if (plan.priceType !== PriceTypeEnum.MATRIX) {
    return;
  }

  if (!productType) {
    blockedItems.push(
      createBlock({
        type: "productType",
        label: "Product type",
        reason: "Matrix-priced products require a matching product type.",
        suggestedAction:
          "Create or choose a product type containing the selected calculated attributes.",
      }),
    );
    return;
  }

  const missingAttributeIds = productAttributes.filter(
    (attributeId) => !productType.attributes.includes(attributeId),
  );

  if (missingAttributeIds.length > 0) {
    blockedItems.push(
      createBlock({
        type: "productType",
        label: productType.name,
        reason: `The selected product type is missing attributes: ${missingAttributeIds.join(", ")}.`,
        suggestedAction:
          "Update the product type or create a new product type before creating this product.",
      }),
    );
  }
}

export function buildProductCreationDraftFromPlan(options: {
  catalog: ProductCreationCatalog;
  channelId: string;
  plan: ProductDraftPlan;
  prompt: string;
}): ProductAgentDraft {
  const { catalog, channelId, plan, prompt } = options;
  const blockedItems: ProductAgentBlockedItem[] = [];
  const dynamicPricing = normalizeDynamicPricingConfig(plan);
  const missingAttributes = normalizeMissingAttributes(plan);
  const missingOptions = normalizePlanMissingOptions(plan);
  const category = getSelectedCategory(catalog, plan.categoryId);
  const productType = getSelectedProductType(catalog, plan.productTypeId);
  const effectiveSelectedAttributes = mergeSelectedAttributesWithDynamicPricing(
    {
      catalog,
      dynamicPricing,
      selectedAttributes: plan.selectedAttributes,
    },
  );

  if (!plan.name.trim()) {
    blockedItems.push(
      createBlock({
        type: "field",
        label: "Product name",
        reason: "A product name is required.",
        suggestedAction: "Provide a product name before creating the product.",
      }),
    );
  }

  if (!category) {
    blockedItems.push(
      createBlock({
        type: "category",
        label: plan.categoryId ?? "Category",
        reason: plan.categoryId
          ? "The selected category was not found."
          : "No existing category was selected with enough confidence.",
        suggestedAction:
          "Choose an existing category or create one before opening the product form.",
      }),
    );
  }

  addExplicitMissingBlocks({ blockedItems, missingAttributes, missingOptions });

  const resolvedAttributes = resolveSelectedAttributes({
    blockedItems,
    catalog,
    plan: {
      ...plan,
      selectedAttributes: effectiveSelectedAttributes,
    },
  });
  const productAttributes = resolvedAttributes.attributeDefinitions.map(
    (attribute) => attribute.id,
  );
  const pageCount = normalizeProductPageCountConfig({
    attributeDefinitions: resolvedAttributes.attributeDefinitions,
    blockedItems,
    plan,
    productAttributes,
  });

  if (
    plan.priceType === PriceTypeEnum.DYNAMIC &&
    !hasUsableDynamicPricingConfig(dynamicPricing)
  ) {
    blockedItems.push(
      createBlock({
        type: "price",
        label: "Dynamic pricing",
        reason:
          "Dynamic pricing was selected, but no usable dynamic pricing configuration was generated from the provided prices.",
        suggestedAction:
          "Encode the provided prices as a dynamic pricing base price, attribute adjustments, or global rules before creating the product.",
      }),
    );
  }

  if (!isMatrixLikePriceType(plan.priceType) && productAttributes.length > 0) {
    blockedItems.push(
      createBlock({
        type: "price",
        label: "Configurable attributes",
        reason:
          "SINGLE and THRESHOLD products do not expose customer-selectable attributes in the Konfi configurator.",
        suggestedAction:
          "Use MATRIX for explicit combination prices or DYNAMIC for formula/fixed-price configurable products.",
      }),
    );
  }

  validateProductType({
    blockedItems,
    plan,
    productAttributes,
    productType,
  });

  const prices = buildPrices({
    attributeDefinitions: resolvedAttributes.attributeDefinitions,
    blockedItems,
    plan,
  });
  const volumes = getVolumes(plan, prices);
  const firstVolume = volumes[0]?.value ?? 1;
  const maximumVolume = volumes[volumes.length - 1]?.value ?? firstVolume;
  const listingPrices = getListingPrice(prices);
  const productName = plan.name.trim();
  const seoTitle = plan.seoTitle.trim() || productName;
  const seoDescription = plan.seoDescription.trim() || plan.description.trim();
  const specMinimumOrder = Math.trunc(plan.spec.minimumOrder ?? firstVolume);
  const specMaximumOrder = Math.trunc(
    plan.spec.maximumOrder ?? Math.max(maximumVolume, specMinimumOrder),
  );
  const specStep = Math.trunc(plan.spec.step ?? 1);
  const productSpec: Product["spec"] = {
    defaultOrder: Math.trunc(plan.spec.defaultOrder ?? firstVolume),
    images: [],
    maximumHeight: Math.trunc(plan.spec.maximumHeight ?? 1000),
    maximumOrder: specMaximumOrder,
    maximumRatio: 5,
    maximumWidth: Math.trunc(plan.spec.maximumWidth ?? 1000),
    minimumHeight: Math.trunc(plan.spec.minimumHeight ?? 100),
    minimumOrder: specMinimumOrder,
    minimumRatio: 0.2,
    minimumWidth: Math.trunc(plan.spec.minimumWidth ?? 100),
    step: specStep > 0 ? specStep : 1,
    validateRatio: false,
    widthStep: 1,
    heightStep: 1,
  };
  const calculatedDynamicListingPrices =
    plan.priceType === PriceTypeEnum.DYNAMIC && dynamicPricing?.enabled
      ? calculateDynamicListingPrices({
          config: dynamicPricing,
          currency: CurrencyEnum.PLN,
          product: {
            attributeDependencies: {},
            attributeOptions: resolvedAttributes.attributeOptions,
            attributes: productAttributes,
            customSize: false,
            pageCount,
            spec: productSpec,
            volumes,
          },
        })
      : null;
  const product: Partial<Product> = {
    active: true,
    allowCustomPrice: false,
    attributeDependencies: {},
    attributeOptions: resolvedAttributes.attributeOptions,
    attributes: productAttributes,
    availability: {
      availableForPurchase: false,
      expirationString: "",
      publicationString: "",
      published: false,
    },
    category: category ?? { id: "", name: "" },
    channelId,
    customSize: false,
    customSizes: [],
    defaultPrice:
      calculatedDynamicListingPrices?.defaultPrice ??
      listingPrices.defaultPrice,
    description: plan.description,
    designSpec: {
      bleed: 4,
      dpi: 300,
      includeBleed: false,
    },
    difficulty: 5,
    dynamicPricing,
    highPrice:
      calculatedDynamicListingPrices?.highPrice ?? listingPrices.highPrice,
    lowPrice:
      calculatedDynamicListingPrices?.lowPrice ?? listingPrices.lowPrice,
    name: productName,
    pageCount,
    prefferedUnit: Unit.PCS,
    priceType: plan.priceType,
    prices,
    productType:
      plan.priceType === PriceTypeEnum.MATRIX && productType
        ? {
            attributes: productType.attributes,
            id: productType.id,
            isShippable: productType.isShippable,
            name: productType.name,
          }
        : null,
    recommended: false,
    seo: {
      description: seoDescription,
      slug: toSlug(productName),
      title: seoTitle,
    },
    shipping: {
      types: productType?.isShippable ? [ShippingTypes.COURIER] : [],
    },
    spec: productSpec,
    specialNotes: plan.specialNotes,
    volumes,
  };
  const draftWithoutPreview: ProductAgentDraft = {
    blockedItems,
    grossPrices: plan.grossPrices,
    missingAttributes,
    missingOptions,
    priceType: plan.priceType,
    priceTypeReason: plan.priceTypeReason,
    product,
    readyForCreate: false,
    reviewSummary: plan.reviewSummary,
    selectedAttributes: resolvedAttributes.selectedAttributes,
    sourcePrompt: prompt,
  };
  const pricingPreview = buildProductDraftPricingPreview(draftWithoutPreview);

  for (const diagnostic of pricingPreview.diagnostics) {
    if (diagnostic.severity !== "error") {
      continue;
    }

    pushUniqueBlock(blockedItems, {
      type: "price",
      label: diagnostic.label,
      reason: diagnostic.reason,
      suggestedAction: diagnostic.suggestedAction,
    });
  }

  return {
    ...draftWithoutPreview,
    pricingPreview,
    readyForCreate: blockedItems.length === 0,
  };
}

function summarizeCatalog(catalog: ProductCreationCatalog) {
  return {
    attributes: catalog.attributes.map((attribute) => ({
      calculated: attribute.calculated,
      id: attribute.id,
      name: attribute.name,
      options: attribute.options.map((option) => ({
        label: option.label,
        value: option.value,
      })),
      type: attribute.type,
    })),
    categories: catalog.categories,
    productTypes: catalog.productTypes,
  };
}

export function buildProductCreationDraftSystemPrompt(
  catalog: ProductCreationCatalog,
): string {
  return `You prepare Konfi product creation drafts for a printing/e-commerce admin.

Return structured data only through the schema.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

Rules:
- Existing categories, attributes, attribute options, and product types are listed in the catalog. Use their exact IDs and option values when available.
- Do not invent IDs for existing Konfi entities.
- If an attribute or option is needed but missing, put it in missingAttributes or missingOptions and still build as much of the draft as possible.
- If category or product type choice is ambiguous, set it to null so the workflow can mark it blocked for review.
- Choose priceType:
  * SINGLE for one fixed product price only when the product has no customer-selectable attributes/options.
  * THRESHOLD for unit prices that vary only by quantity/volume and the product has no customer-selectable attributes/options.
  * MATRIX for configurable products only when you can provide per-piece/unit prices for each attribute combination, or for each attribute combination plus volume.
  * DYNAMIC when the request describes a formula/rule or additive component pricing rather than explicit final prices for every combination, especially if the product still needs customer-selectable attributes.
- Konfi storefront/admin configuration only exposes attributes for matrix-like products: MATRIX and DYNAMIC. Do not choose SINGLE or THRESHOLD for a product that needs option selectors such as size, material, color, finishing, base, shape, or any other customer-selectable attribute, even if those options do not change the price.
- selectedAttributes is the exact customer-visible option set requested for this product. If the user lists specific options, include only those option values, not every available catalog option for that attribute.
- Do not expand selectedAttributes just because the catalog has more options. Use all available options only when the user explicitly asks for all variants, the source table covers every catalog option, or no narrower option set is given.
- dynamicPricing.attributeRules and dynamicPricing.globalRules.conditions must reference options from selectedAttributes for the same attribute. They must not silently widen the product to unrelated catalog options.
- Only put customer-visible choices in selectedAttributes. Internal production parameters such as source sheet format (for example A3/SRA3 used to produce folded A4), imposition, folding scheme, machine/process type, helper dimensions, or manufacturing notes are not storefront attributes unless the user explicitly says the customer should choose them.
- If the user says there is only one available value for an attribute, include that one value only when it is useful for storefront clarity or pricing combinations. Do not add extra production-only attributes just to document how the price was calculated; put that context in reviewSummary or specialNotes instead.
- If a configurable product has one fixed price for all options, choose DYNAMIC with that price as basePrice and include the selectable attributes in selectedAttributes. Use zero price adjustments only when needed to document option participation.
- If a configurable product has quantity tiers plus selectable options with the same tier price for every option, choose DYNAMIC with unit-price rules if the source gives a formula or already-total volume prices; otherwise use MATRIX only after converting each final volume total into a per-piece/unit price for every selectable attribute combination.
- Page count is not a catalog attribute in Konfi. Do not create attributes or options for page count, pages, page numbers, "liczba stron", "ilość stron", or "strony".
- For booklets, catalogs, brochures, magazines, manuals, and other products where the customer chooses page count, fill product.pageCount instead. Use minimum, maximum, step, coverPages, optional externalAttributeName, and optional placement.afterAttributeId.
- Page count minimum, maximum, step, and coverPages are counts of inner pages/cover pages and must be positive multiples of ${PAGE_COUNT_DIVISOR}. Use coverPages=${DEFAULT_PAGE_COUNT_COVER_PAGES} for standard covers unless the prompt says otherwise.
- product.pageCount.minimum and maximum are inner customer-selectable pages only. Do not include coverPages in minimum/maximum.
- If the user says "4 + cover 4", "4 + our system adds another 4 for the cover", or "total 8 including cover", set pageCount.minimum=4, pageCount.maximum=4, pageCount.step=4, coverPages=4. Do not set minimum=8 in that case.
- A default page count is not the same as the allowed selectable page-count range. If the user asks for the customer to select number of pages but only provides a default page count, do not silently set minimum=maximum to that default. Create a blocked price/field note asking for the allowed minimum, maximum, and step for page count.
- Set pageCount.minimum=pageCount.maximum only when the user explicitly says page count is fixed, only one page count is available, or this first draft should intentionally be fixed to the default page count.
- For folded brochures printed on A3/SRA3 and finished as A4 after folding, one double-sided A3/SRA3 sheet normally represents 4 finished A4 pages. Use innerSheetCount = innerPages / 4 and coverSheetCount = coverPages / 4 when applying sheet-level paper, print, or foil tables, unless the prompt gives a different imposition.
- Page count by itself does not force MATRIX or DYNAMIC because it is not an attribute selector. A product whose only customer choice is page count can still use SINGLE or THRESHOLD with product.pageCount.
- If every page count has its own complete quantity table, set pageCount.pricing.mode="exact" and put each page count's price rows under exactPrices. This is the preferred model for brochures where the number of sheets changes the quantity thresholds.
- If page counts fall into ranges with a different base and per-step surcharge per range, set pageCount.pricing.mode="segmented" and fill segmentPrices.
- If each extra page-count step adds the same surcharge table on top of the base product price, set pageCount.pricing.mode="step" and fill stepPrices.
- DYNAMIC pricing supports page-count sheet metrics for brochure component pricing:
  * innerSheetsPerUnit = innerPages / ${PAGE_COUNT_DIVISOR}
  * coverSheetsPerUnit = coverPages / ${PAGE_COUNT_DIVISOR}
  * totalSheetsPerUnit = innerSheetsPerUnit + coverSheetsPerUnit
  * innerSheetVolume = volume * innerSheetsPerUnit
  * coverSheetVolume = volume * coverSheetsPerUnit
  * totalSheetVolume = volume * totalSheetsPerUnit
- For sheet-volume tier tables, create calculator="tier" globalRules. Choose the tier using metric="innerSheetVolume", "coverSheetVolume", or "totalSheetVolume", set minimumMetricValue/maximumMetricValue to the source bracket, set fixedValue to the per-sheet rate for that bracket, then set outputMultiplierMetric to the matching per-unit sheet count ("innerSheetsPerUnit", "coverSheetsPerUnit", or "totalSheetsPerUnit") so the selected per-sheet rate is added as a per-brochure unit price.
- Use DYNAMIC for variable page-count brochure component pricing when the source tables are per-sheet rates by sheet volume. Use pageCount.pricing exact/segmented only when full page-count-specific finished-unit tables are provided.
- Do not recommend implementing a separate dedicated brochure calculator when the source can be represented with product.pageCount.pricing. If the source data is insufficient to fill exact/segmented/step page-count pricing, create a blocked price item instead of putting the limitation in reviewSummary or specialNotes.
- For brochure component pricing, calculate the unit price per finished brochure at each quantity breakpoint by summing every required component: paper sheets, color print sheets, foil sheets, binding, trimming/cutting, and other mandatory finishing.
- "za broszurę", "per brochure", and mandatory finishing rows such as manual binding or trimming are per-unit brochure costs. Add them to the generated unit price for every volume; do not treat them as one order-level total add-on.
- Paper, print, and foil rows that are priced per A3/SRA3 sheet must be multiplied by the relevant sheet count before adding to the brochure unit price.
- When several component tables have different quantity breaks, use the union of all breakpoints and calculate the summed unit value for every generated volume. Do not use only the default volume or only the paper/foil tiers.
- If using DYNAMIC for a summed brochure component price curve, set basePrice to the summed unit value at the first volume and add adjacent range rules for every breakpoint where the summed unit value changes. A source with seven print tiers plus paper and foil tiers normally needs many range rules, not just one or two.
- If a selectable option such as matte/gloss foil has the same price for all selected options, keep the attribute selectable with zero option adjustment and encode the shared foil component as an unconditional unit-price contribution. Use option conditions only when the option actually changes the price.
- Do not infer delivery times from numeric price notation, page counts, color notation like "4+4", or table ranges.
- If the prompt does not specify delivery time, use 2 days as the default for normal products. Use 1 day only for very simple products, and more than 2 days only when the product is clearly harder to produce or the prompt says so.
- Never set deliveryTime or dynamicPricing.baseDeliveryTime to 0. If unsure, use 2 days.
- Konfi persisted prices are per-piece/unit prices. The checkout calculation multiplies price.value by quantity/volume. If the source says "50 sztuk = 244,51 zł", that is an already-total price for 50 pieces; do not store 244.51 as a MATRIX/THRESHOLD valueGross. Convert it to a per-piece unit value (244.51 / 50) or choose DYNAMIC and encode a per-unit price curve.
- The input prices may be gross. Keep valueGross as human PLN unit values (e.g. 4.89 means 4.89 PLN per piece); the system converts to minor units later.
- For DYNAMIC pricing, keep every money amount in human PLN unit values too (e.g. basePrice 4.89, priceAdjustment 0.24, fixedValue 0.24). The system converts dynamic pricing money fields to minor units later, then checkout multiplies by quantity/volume.
- For MATRIX prices, every price row must include attributeValues keyed by existing attribute ID whenever that attribute affects the combination.
- For DYNAMIC prices, you MUST fill dynamicPricing. Do not leave it null.
- Pricing pattern recognition happens here from the user's source prompt. Do not rely on product-draft validation to reinterpret your generated pricing rules later; choose the correct priceType and dynamicPricing structure during extraction.
- Konfi dynamic pricing is additive. For each generated product volume, the runtime starts with basePrice, adds the selected option priceAdjustment values, then adds every matching global rule result.
- During dynamic pricing evaluation, both the quantity and volume metrics are set to the currently generated product volume. Dynamic target price rules still output a unit price contribution; checkout multiplies the generated price by the selected volume.
- Dynamic pricing runtime semantics, simplified exactly:
  unitPrice = basePrice;
  for each selected attributeRule adjustment: unitPrice += priceAdjustment;
  for each globalRule where every attribute-option condition matches the current selection:
    metricValue = inputId value, or quantity/volume/current dimensions/page-count sheet metric depending on metric;
    fixed => unitPrice += fixedValue;
    multiplier => unitPrice += metricValue * multiplier;
    range => unitPrice += lerp(minimumOutputValue, maximumOutputValue, clamp((metricValue - minimumMetricValue) / (maximumMetricValue - minimumMetricValue), 0, 1));
    tier => unitPrice += fixedValue only when metricValue is inside [minimumMetricValue, maximumMetricValue]; omit maximumMetricValue for an open-ended final tier;
  if outputMultiplierMetric/outputMultiplierInputId is set, multiply that rule output by the referenced metric/input before adding it.
  generated price.value = unitPrice; checkout total = unitPrice * selected volume.
- Global rule id and label are documentation only. A label like "50 sztuk" does not tie the rule to volume 50. Only metric/inputId, range bounds, calculator fields, and attribute option conditions affect calculation.
- Do not encode volume price tiers as multiple unconditional fixed globalRules; globalRules are not a lookup table and untied fixed rules will all match the same selection and be summed for every volume.
- If the source gives final already-multiplied prices for each volume (e.g. 50 pcs = 244.51 PLN total, 100 pcs = 373.44 PLN total), DYNAMIC is appropriate for configurable products or add-ons: convert each total to a unit value for that volume (244.51 / 50, 373.44 / 100) and represent the tier behavior as a unit-price curve. Never put final totals directly into DYNAMIC basePrice, fixedValue, minimumOutputValue, maximumOutputValue, multiplier, or attribute priceAdjustment.
- To model total volume tiers with DYNAMIC, build a piecewise unit-price curve through the listed points. Example totals: 50=244.51, 100=373.44, 200=562.94. Convert units: u50=4.8902, u100=3.7344, u200=2.8147. Set basePrice=4.8902. Add range rule 50→100 with metric="volume", minimumOutputValue=0, maximumOutputValue=(u100-u50)=-1.1558. Add range rule 100→200 with minimumOutputValue=0, maximumOutputValue=(u200-u100)=-0.9197. Continue per adjacent tier. This sums to the exact listed unit value at each listed volume.
- If the source gives a per-piece rate (e.g. 3.50 PLN/szt.) or a formula (quantity × unit price + selected extras), DYNAMIC is appropriate: use basePrice/globalRules for per-piece or per-metric components.
- Treat "+= 12 zł", "dopłata 12 zł", and accessory add-on prices as order-level total add-ons unless the prompt explicitly says they are per-piece. Do not encode an order-level add-on as attributeRules.priceAdjustment: 12 because that becomes +12 PLN per piece. For DYNAMIC, create a selectable attribute for the add-on and condition unit-price globalRules on the "yes/add" option; at each volume the unit surcharge should be add-on total divided by volume (e.g. +12 PLN total at 50 pcs is +0.24 PLN/unit, at 100 pcs is +0.12 PLN/unit).
- Never model an order-level add-on with multiplier=12 or metric=quantity/volume; that produces quantity * 12 as a unit contribution and is catastrophically wrong. Use conditional fixed/range unit contributions instead.
- For an optional +12 PLN pump over the same volume tiers, add a condition attribute such as pompka=yes. Under that condition, set a fixed rule for the first tier surcharge (12 / 50 = 0.24), then add conditional range delta rules for adjacent tiers: 50→100 adds (12/100 - 12/50)=-0.12, 100→200 adds (12/200 - 12/100)=-0.06, etc. Do not put 12 in priceAdjustment, fixedValue, or multiplier unless the user explicitly says +12 PLN per piece.
- For a prompt like balloons with total volume tiers plus "pompka += 12 zł", prefer DYNAMIC over MATRIX: base tier rules model the balloon total as unit prices per volume, and conditional pump rules model the +12 PLN order-level add-on as per-unit surcharges by volume.
- Use globalRule conditions only for attribute option conditions. They cannot tie a price rule to one specific volume tier.
- If the prompt gives per-option component prices (for example flag + mast + base), prefer DYNAMIC over MATRIX and encode those numbers in dynamicPricing.attributeRules/basePrice instead of claiming the product is impossible.
- When using DYNAMIC with attribute-based pricing, selectedAttributes must include every attribute referenced by dynamicPricing.attributeRules or dynamicPricing.globalRules.conditions so the product form can expose those options.
- Do not ignore numeric prices from the prompt when choosing DYNAMIC; preserve them in dynamicPricing.
- Treat omitted repeated cells in tables as inherited values when the layout implies merged rows/columns.
- If one size has a single price that spans all shapes, duplicate that price for every implied shape for that size instead of marking those combinations as missing.
- If later sizes split by shape but earlier sizes do not, assume the earlier unsplit price applies to every listed shape unless the prompt explicitly says otherwise.
- Prefer reconstructing full price coverage from table structure before concluding that combinations are impossible or missing.
- If the source table contains blank/unknown price cells, do not silently fill them; include blocking price notes.
- Prefer Polish product wording when the user writes in Polish.
- The generated product must be conservative: unpublished, unavailable for purchase, no irreversible side effects.

Catalog:
${JSON.stringify(summarizeCatalog(catalog))}`;
}

export async function getProductCreationCatalogStep({
  channelId,
}: {
  channelId: string;
}): Promise<ProductCreationCatalog> {
  "use step";

  const db = getDb();
  const [attributesSnapshot, productTypesSnapshot, categoriesSnapshot] =
    await Promise.all([
      db.collection("attributes").where("active", "==", true).limit(300).get(),
      db
        .collection("productTypes")
        .where("active", "==", true)
        .limit(200)
        .get(),
      db.collection(`channels/${channelId}/categories`).limit(300).get(),
    ]);

  return {
    attributes: attributesSnapshot.docs.map((doc) => {
      const data = doc.data() as Attribute;
      return {
        calculated: data.calculated,
        format: data.format,
        id: data.id ?? doc.id,
        name: data.name,
        options: data.options ?? [],
        required: data.required,
        type: data.type,
      } satisfies CatalogAttribute;
    }),
    categories: categoriesSnapshot.docs.map((doc) => {
      const data = doc.data() as Category;
      return {
        id: data.id ?? doc.id,
        name: data.name,
      } satisfies CatalogCategory;
    }),
    productTypes: productTypesSnapshot.docs.map((doc) => {
      const data = doc.data() as ProductType;
      return {
        attributes: data.attributes ?? [],
        id: data.id ?? doc.id,
        isShippable: data.isShippable ?? true,
        name: data.name,
      } satisfies CatalogProductType;
    }),
  };
}

export async function prepareProductCreationDraftStep({
  channelId,
  prompt,
}: {
  channelId: string;
  prompt: string;
}): Promise<ProductAgentDraft> {
  "use step";

  const catalog = await getProductCreationCatalogStep({ channelId });
  const { getHighPrecisionVertexModel } =
    await import("./durable-agent-models.server");
  const model = await getHighPrecisionVertexModel();
  const { generateText, Output } = await import("ai");
  const meteredGenerateText = createMeteredAdminGenerateText({
    channelId,
    generateText,
    model: MODELS.GEMINI_3_PRO,
    provider: "google-vertex",
    source: "durable-agent",
  });
  const system = buildProductCreationDraftSystemPrompt(catalog);

  const { output } = await meteredGenerateText({
    model,
    output: Output.object({ schema: productDraftPlanSchema }),
    prompt,
    system,
    temperature: 0,
  });

  return buildProductCreationDraftFromPlan({
    catalog,
    channelId,
    plan: output,
    prompt,
  });
}

export async function verifyProductCreationDraftStep({
  draft,
}: {
  draft: ProductAgentDraft;
}): Promise<{
  readyForCreate: boolean;
  blockedItems: ProductAgentBlockedItem[];
}> {
  "use step";

  const blockedItems = [...draft.blockedItems];
  const product = draft.product;

  if (!product.name?.trim()) {
    blockedItems.push(
      createBlock({
        type: "field",
        label: "Product name",
        reason: "Product name is empty.",
        suggestedAction: "Provide the product name before review.",
      }),
    );
  }

  if (!product.category?.id) {
    blockedItems.push(
      createBlock({
        type: "category",
        label: "Category",
        reason: "Product category is missing.",
        suggestedAction: "Select or create a category.",
      }),
    );
  }

  if (
    product.priceType !== PriceTypeEnum.DYNAMIC &&
    (!product.prices || product.prices.length === 0) &&
    !blockedItems.some((item) => item.type === "price")
  ) {
    blockedItems.push(
      createBlock({
        type: "price",
        label: "Prices",
        reason:
          "No persisted prices are available for the selected price type.",
        suggestedAction: "Provide valid prices before creating the product.",
      }),
    );
  }

  const pricingPreview =
    draft.pricingPreview ?? buildProductDraftPricingPreview(draft);

  for (const diagnostic of pricingPreview.diagnostics) {
    if (diagnostic.severity !== "error") {
      continue;
    }

    pushUniqueBlock(blockedItems, {
      type: "price",
      label: diagnostic.label,
      reason: diagnostic.reason,
      suggestedAction: diagnostic.suggestedAction,
    });
  }

  return {
    blockedItems,
    readyForCreate: blockedItems.length === 0,
  };
}
