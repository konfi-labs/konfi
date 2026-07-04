import "server-only";

import { buildAgentHarnessSystemPrompt } from "@/lib/ai/agent-harness";
import { getAdminVertexLanguageModel } from "@/lib/ai/vertex-language-model.server";
import {
  findExternalAttributeByKey,
  getExternalAttributeKey,
} from "@/lib/external-products/external-attribute-key";
import { MODELS } from "@konfi/firebase";
import type {
  Attribute,
  AttributeMapping,
  DynamicPricingCalculator,
  DynamicPricingConfig,
  DynamicPricingGlobalRule,
  DynamicPricingMetric,
  DynamicPricingTarget,
  ExternalAttribute,
  Product,
  ProductPageCountConstraint,
  CurrencyCode,
} from "@konfi/types";
import { CurrencyEnum } from "@konfi/types";
import { buildDynamicPricesForSelection } from "@konfi/utils";
import { Output, ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

export interface ExternalDynamicPricingSourcePriceRange {
  deliveryTime?: number;
  price: number;
  quantity: number;
}

export interface ExternalDynamicPricingSourcePriceConfiguration {
  configuration: Record<string, string>;
  priceRanges: ExternalDynamicPricingSourcePriceRange[];
}

export interface ExternalDynamicPricingSourceRow {
  deliveryTime?: number;
  pageCount?: number;
  price: number;
  quantity: number;
  selection: Record<string, string>;
}

type AttributeForDynamicPricing = Pick<Attribute, "id" | "name" | "options">;

const MAX_PROMPT_ROWS = 750;
const MONEY_MINOR_UNITS_MULTIPLIER = 100;
const UNDERPRICE_TOLERANCE_MINOR_UNITS = 1;

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

const dynamicPricingTargetSchema = z.enum(["price", "deliveryTime"]);
const dynamicPricingCalculatorSchema = z.enum([
  "fixed",
  "multiplier",
  "range",
  "tier",
]);

const generatedConditionSchema = z.object({
  attributeId: z.string(),
  optionValues: z.array(z.string()),
});

const generatedDynamicPricingPlanSchema = z.object({
  supported: z.boolean(),
  reason: z.string().optional(),
  basePrice: z.number().nullable().optional(),
  baseDeliveryTime: z.number().nullable().optional(),
  inputs: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        value: z.number(),
        unit: z.string().nullable().optional(),
      }),
    )
    .optional(),
  attributeRules: z
    .array(
      z.object({
        attributeId: z.string(),
        mode: z.enum(["ignore", "adjust"]),
        adjustments: z.array(
          z.object({
            optionValue: z.string(),
            priceAdjustment: z.number().nullable().optional(),
            deliveryTimeAdjustment: z.number().nullable().optional(),
          }),
        ),
      }),
    )
    .optional(),
  globalRules: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        target: dynamicPricingTargetSchema,
        calculator: dynamicPricingCalculatorSchema,
        fixedValue: z.number().nullable().optional(),
        multiplier: z.number().nullable().optional(),
        metric: dynamicPricingMetricSchema.nullable().optional(),
        inputId: z.string().nullable().optional(),
        outputMultiplierMetric: dynamicPricingMetricSchema
          .nullable()
          .optional(),
        outputMultiplierInputId: z.string().nullable().optional(),
        minimumMetricValue: z.number().nullable().optional(),
        maximumMetricValue: z.number().nullable().optional(),
        minimumOutputValue: z.number().nullable().optional(),
        maximumOutputValue: z.number().nullable().optional(),
        inverse: z.boolean().nullable().optional(),
        conditions: z.array(generatedConditionSchema).optional(),
      }),
    )
    .optional(),
});

export type GeneratedDynamicPricingPlan = z.infer<
  typeof generatedDynamicPricingPlanSchema
>;

function toMinorUnits(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_MINOR_UNITS_MULTIPLIER);
}

function toHumanMoney(value: number): number {
  return Math.round((value / MONEY_MINOR_UNITS_MULTIPLIER) * 10000) / 10000;
}

function normalizeText(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeFiniteNumber(value?: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeMoney(value?: number | null): number | undefined {
  const normalized = normalizeFiniteNumber(value);
  return normalized === undefined ? undefined : toMinorUnits(normalized);
}

function getConfigurationValue(options: {
  configuration: Record<string, string>;
  externalAttributeName: string;
  externalAttributes: ExternalAttribute[];
}): string | undefined {
  const { configuration, externalAttributeName, externalAttributes } = options;
  const externalAttribute = findExternalAttributeByKey(
    externalAttributes,
    externalAttributeName,
  );
  const candidateKeys = [
    externalAttributeName,
    externalAttribute ? getExternalAttributeKey(externalAttribute) : undefined,
    externalAttribute?.id,
    externalAttribute?.name,
  ].filter((key): key is string => Boolean(key));

  for (const key of [...new Set(candidateKeys)]) {
    if (Object.hasOwn(configuration, key)) {
      return configuration[key];
    }
  }

  return undefined;
}

function resolveInternalSelection(options: {
  configuration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
  productAttributeOptions: Record<string, string[]>;
  selectedMappings: AttributeMapping[];
}): Record<string, string> | null {
  const {
    configuration,
    externalAttributes,
    productAttributeOptions,
    selectedMappings,
  } = options;
  const selection: Record<string, string> = {};

  for (const mapping of selectedMappings) {
    const attributeId = mapping.internalAttributeId;

    if (!attributeId) {
      continue;
    }

    const externalValue = getConfigurationValue({
      configuration,
      externalAttributeName: mapping.externalAttributeName,
      externalAttributes,
    })?.trim();

    if (!externalValue) {
      continue;
    }

    const allowedOptions = productAttributeOptions[attributeId] ?? [];
    const mappedValue =
      mapping.optionMappings?.[externalValue] ??
      (allowedOptions.includes(externalValue) ? externalValue : undefined);

    if (
      allowedOptions.length > 0 &&
      (!mappedValue || !allowedOptions.includes(mappedValue))
    ) {
      return null;
    }

    if (mappedValue) {
      selection[attributeId] = mappedValue;
    }
  }

  return selection;
}

function buildSourceRowKey(row: ExternalDynamicPricingSourceRow): string {
  const selectionKey = Object.entries(row.selection)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([attributeId, optionValue]) => `${attributeId}:${optionValue}`)
    .join("|");

  return [
    selectionKey,
    `q=${row.quantity}`,
    row.pageCount === undefined ? "" : `pc=${row.pageCount}`,
  ].join(";");
}

export function buildExternalDynamicPricingSourceRows(options: {
  configurations: ExternalDynamicPricingSourcePriceConfiguration[];
  externalAttributes: ExternalAttribute[];
  fallbackPriceRanges?: ExternalDynamicPricingSourcePriceRange[];
  pageCountAttributeName?: string;
  productAttributeOptions: Record<string, string[]>;
  resolvePageCountValue?: (value?: string) => number | null | undefined;
  selectedMappings: AttributeMapping[];
}): ExternalDynamicPricingSourceRow[] {
  const {
    configurations,
    externalAttributes,
    fallbackPriceRanges = [],
    pageCountAttributeName,
    productAttributeOptions,
    resolvePageCountValue,
    selectedMappings,
  } = options;
  const rowsByKey = new Map<string, ExternalDynamicPricingSourceRow>();
  const addRow = (row: ExternalDynamicPricingSourceRow) => {
    if (
      !Number.isFinite(row.price) ||
      !Number.isFinite(row.quantity) ||
      row.quantity <= 0 ||
      row.price < 0
    ) {
      return;
    }

    const rowKey = buildSourceRowKey(row);
    const existingRow = rowsByKey.get(rowKey);

    if (!existingRow) {
      rowsByKey.set(rowKey, row);
      return;
    }

    const deliveryTimes = [existingRow.deliveryTime, row.deliveryTime].filter(
      (deliveryTime): deliveryTime is number =>
        typeof deliveryTime === "number" && Number.isFinite(deliveryTime),
    );

    rowsByKey.set(rowKey, {
      ...existingRow,
      ...(deliveryTimes.length > 0
        ? { deliveryTime: Math.max(...deliveryTimes) }
        : {}),
      price: Math.max(existingRow.price, row.price),
    });
  };

  for (const configuration of configurations) {
    const selection = resolveInternalSelection({
      configuration: configuration.configuration,
      externalAttributes,
      productAttributeOptions,
      selectedMappings,
    });

    if (!selection) {
      continue;
    }

    const pageCount =
      pageCountAttributeName && resolvePageCountValue
        ? (resolvePageCountValue(
            getConfigurationValue({
              configuration: configuration.configuration,
              externalAttributeName: pageCountAttributeName,
              externalAttributes,
            }),
          ) ?? undefined)
        : undefined;

    for (const range of configuration.priceRanges) {
      addRow({
        ...(range.deliveryTime !== undefined
          ? { deliveryTime: range.deliveryTime }
          : {}),
        ...(pageCount !== undefined ? { pageCount } : {}),
        price: range.price,
        quantity: range.quantity,
        selection,
      });
    }
  }

  if (rowsByKey.size === 0 && configurations.length === 0) {
    for (const range of fallbackPriceRanges) {
      addRow({
        ...(range.deliveryTime !== undefined
          ? { deliveryTime: range.deliveryTime }
          : {}),
        price: range.price,
        quantity: range.quantity,
        selection: {},
      });
    }
  }

  return [...rowsByKey.values()].toSorted((left, right) => {
    const selectionDiff = buildSourceRowKey(left).localeCompare(
      buildSourceRowKey(right),
    );
    return selectionDiff || left.quantity - right.quantity;
  });
}

export function buildExternalPageCountConstraintsFromSourceRows(options: {
  pageCount?: Product["pageCount"];
  productAttributeOptions: Record<string, string[]>;
  rows: ExternalDynamicPricingSourceRow[];
}): ProductPageCountConstraint[] {
  const { pageCount, productAttributeOptions, rows } = options;

  if (!pageCount?.enabled) {
    return [];
  }

  const pageCountRows = rows.filter(
    (row) =>
      typeof row.pageCount === "number" && Number.isFinite(row.pageCount),
  );

  if (pageCountRows.length === 0) {
    return [];
  }

  const constraints: ProductPageCountConstraint[] = [];

  for (const [attributeId, optionValues] of Object.entries(
    productAttributeOptions,
  ).toSorted(([left], [right]) => left.localeCompare(right))) {
    const groupedOptions = new Map<
      string,
      {
        maximum?: number;
        minimum?: number;
        optionValues: string[];
      }
    >();

    for (const optionValue of optionValues.toSorted()) {
      const optionPageCounts = pageCountRows
        .filter((row) => row.selection[attributeId] === optionValue)
        .map((row) => row.pageCount)
        .filter((value): value is number => typeof value === "number");

      if (optionPageCounts.length === 0) {
        continue;
      }

      const minimum = Math.min(...optionPageCounts);
      const maximum = Math.max(...optionPageCounts);
      const constrainedMinimum =
        minimum > pageCount.minimum ? minimum : undefined;
      const constrainedMaximum =
        maximum < pageCount.maximum ? maximum : undefined;

      if (
        constrainedMinimum === undefined &&
        constrainedMaximum === undefined
      ) {
        continue;
      }

      const key = `${constrainedMinimum ?? ""}:${constrainedMaximum ?? ""}`;
      const group = groupedOptions.get(key) ?? {
        ...(constrainedMaximum !== undefined
          ? { maximum: constrainedMaximum }
          : {}),
        ...(constrainedMinimum !== undefined
          ? { minimum: constrainedMinimum }
          : {}),
        optionValues: [],
      };

      group.optionValues.push(optionValue);
      groupedOptions.set(key, group);
    }

    for (const group of groupedOptions.values()) {
      constraints.push({
        conditions: [
          {
            attributeId,
            optionValues: group.optionValues,
          },
        ],
        ...(group.maximum !== undefined ? { maximum: group.maximum } : {}),
        ...(group.minimum !== undefined ? { minimum: group.minimum } : {}),
      });
    }
  }

  return constraints;
}

function sampleRows(
  rows: ExternalDynamicPricingSourceRow[],
  limit: number,
): ExternalDynamicPricingSourceRow[] {
  if (rows.length <= limit) {
    return rows;
  }

  const sampled: ExternalDynamicPricingSourceRow[] = [];
  const step = (rows.length - 1) / (limit - 1);

  for (let index = 0; index < limit; index++) {
    const sourceIndex = Math.round(index * step);
    const row = rows[sourceIndex];

    if (row) {
      sampled.push(row);
    }
  }

  return sampled;
}

function formatAttributeLine(options: {
  attribute: AttributeForDynamicPricing;
  productAttributeOptions: Record<string, string[]>;
}): string {
  const { attribute, productAttributeOptions } = options;
  const allowedValues = productAttributeOptions[attribute.id] ?? [];
  const optionLabels = new Map(
    attribute.options.map((option) => [option.value, option.label]),
  );
  const formattedOptions = allowedValues
    .map((value) => {
      const label = optionLabels.get(value);
      return label && label !== value ? `${value}=${label}` : value;
    })
    .join(",");

  return `A ${attribute.id}|${attribute.name}|${formattedOptions || "-"}`;
}

function formatSourceRow(
  row: ExternalDynamicPricingSourceRow,
  index: number,
): string {
  const selection = Object.entries(row.selection)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([attributeId, optionValue]) => `${attributeId}:${optionValue}`)
    .join(",");
  const parts = [
    `R${index + 1}`,
    `q=${row.quantity}`,
    `p=${toHumanMoney(row.price)}`,
    row.deliveryTime === undefined ? undefined : `d=${row.deliveryTime}`,
    row.pageCount === undefined ? undefined : `pg=${row.pageCount}`,
    `s=${selection || "-"}`,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" ");
}

function formatPageCountConstraints(
  constraints: ProductPageCountConstraint[] = [],
): string {
  if (constraints.length === 0) {
    return "";
  }

  return constraints
    .map((constraint) => {
      const condition = constraint.conditions
        .map(
          ({ attributeId, optionValues }) =>
            `${attributeId}:${optionValues.join(",")}`,
        )
        .join("&");
      const range = [
        constraint.minimum === undefined
          ? undefined
          : `>=${constraint.minimum}`,
        constraint.maximum === undefined
          ? undefined
          : `<=${constraint.maximum}`,
      ]
        .filter((value): value is string => Boolean(value))
        .join(",");

      return `${condition}${range ? ` ${range}` : ""}`;
    })
    .join(";");
}

export function buildExternalDynamicPricingPrompt(options: {
  attributes: AttributeForDynamicPricing[];
  pageCount?: Product["pageCount"];
  productAttributeOptions: Record<string, string[]>;
  productName: string;
  rows: ExternalDynamicPricingSourceRow[];
  volumes: number[];
}): string {
  const {
    attributes,
    pageCount,
    productAttributeOptions,
    productName,
    rows,
    volumes,
  } = options;
  const shownRows = sampleRows(rows, MAX_PROMPT_ROWS);
  const pageCountLine = pageCount?.enabled
    ? [
        `PAGE_COUNT min=${pageCount.minimum}`,
        `max=${pageCount.maximum}`,
        `step=${pageCount.step}`,
        pageCount.constraints?.length
          ? `c=${formatPageCountConstraints(pageCount.constraints)}`
          : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ")
    : "PAGE_COUNT -";

  return [
    `PRODUCT ${productName}`,
    "DATA FORMAT q=volume p=unit_price_pln d=delivery_days pg=page_count s=attributeId:optionValue",
    `VOLUMES ${volumes.join(",") || "-"}`,
    pageCountLine,
    "ATTRIBUTES",
    ...attributes.map((attribute) =>
      formatAttributeLine({ attribute, productAttributeOptions }),
    ),
    `ROWS total=${rows.length} shown=${shownRows.length}`,
    ...shownRows.map(formatSourceRow),
  ].join("\n");
}

function normalizeConditions(options: {
  conditions?: z.infer<typeof generatedConditionSchema>[];
  productAttributeOptions: Record<string, string[]>;
  validAttributeIds: ReadonlySet<string>;
}): DynamicPricingGlobalRule["conditions"] {
  const {
    conditions = [],
    productAttributeOptions,
    validAttributeIds,
  } = options;
  const normalized = conditions.flatMap((condition) => {
    const attributeId = normalizeText(condition.attributeId);

    if (!attributeId || !validAttributeIds.has(attributeId)) {
      return [];
    }

    const allowedOptions = new Set(productAttributeOptions[attributeId] ?? []);
    const optionValues = [
      ...new Set(
        condition.optionValues
          .map(normalizeText)
          .filter((value): value is string => Boolean(value))
          .filter(
            (value) => allowedOptions.size === 0 || allowedOptions.has(value),
          ),
      ),
    ];

    if (optionValues.length === 0) {
      return [];
    }

    return [{ attributeId, optionValues }];
  });

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeGeneratedGlobalRule(options: {
  rule: NonNullable<GeneratedDynamicPricingPlan["globalRules"]>[number];
  productAttributeOptions: Record<string, string[]>;
  validAttributeIds: ReadonlySet<string>;
}): DynamicPricingGlobalRule | null {
  const { rule, productAttributeOptions, validAttributeIds } = options;
  const id = normalizeText(rule.id);
  const label = normalizeText(rule.label);

  if (!id || !label) {
    return null;
  }

  const target: DynamicPricingTarget = rule.target;
  const calculator: DynamicPricingCalculator = rule.calculator;
  const metric: DynamicPricingMetric | undefined = rule.metric ?? undefined;
  const inputId = normalizeText(rule.inputId);
  const outputMultiplierMetric: DynamicPricingMetric | undefined =
    rule.outputMultiplierMetric ?? undefined;
  const outputMultiplierInputId = normalizeText(rule.outputMultiplierInputId);
  const conditions = normalizeConditions({
    conditions: rule.conditions,
    productAttributeOptions,
    validAttributeIds,
  });

  if ((rule.conditions?.length ?? 0) > 0 && !conditions?.length) {
    return null;
  }

  const shouldConvertMoney = target === "price";
  const fixedValue = shouldConvertMoney
    ? normalizeMoney(rule.fixedValue)
    : normalizeFiniteNumber(rule.fixedValue);
  const multiplier = shouldConvertMoney
    ? normalizeMoney(rule.multiplier)
    : normalizeFiniteNumber(rule.multiplier);
  const minimumOutputValue = shouldConvertMoney
    ? normalizeMoney(rule.minimumOutputValue)
    : normalizeFiniteNumber(rule.minimumOutputValue);
  const maximumOutputValue = shouldConvertMoney
    ? normalizeMoney(rule.maximumOutputValue)
    : normalizeFiniteNumber(rule.maximumOutputValue);
  const minimumMetricValue = normalizeFiniteNumber(rule.minimumMetricValue);
  const maximumMetricValue = normalizeFiniteNumber(rule.maximumMetricValue);

  if (calculator === "fixed" && fixedValue === undefined) {
    return null;
  }

  if (calculator === "multiplier" && multiplier === undefined) {
    return null;
  }

  if (
    calculator === "range" &&
    (minimumMetricValue === undefined ||
      maximumMetricValue === undefined ||
      minimumOutputValue === undefined ||
      maximumOutputValue === undefined ||
      maximumMetricValue < minimumMetricValue)
  ) {
    return null;
  }

  if (
    calculator === "tier" &&
    (minimumMetricValue === undefined ||
      (maximumMetricValue !== undefined &&
        maximumMetricValue < minimumMetricValue) ||
      (fixedValue === undefined && minimumOutputValue === undefined))
  ) {
    return null;
  }

  return {
    calculator,
    ...(conditions?.length ? { conditions } : {}),
    ...(fixedValue !== undefined ? { fixedValue } : {}),
    id,
    ...(inputId ? { inputId } : {}),
    ...(typeof rule.inverse === "boolean" ? { inverse: rule.inverse } : {}),
    label,
    ...(maximumMetricValue !== undefined ? { maximumMetricValue } : {}),
    ...(maximumOutputValue !== undefined ? { maximumOutputValue } : {}),
    ...(metric ? { metric } : {}),
    ...(minimumMetricValue !== undefined ? { minimumMetricValue } : {}),
    ...(minimumOutputValue !== undefined ? { minimumOutputValue } : {}),
    ...(multiplier !== undefined ? { multiplier } : {}),
    ...(outputMultiplierInputId ? { outputMultiplierInputId } : {}),
    ...(outputMultiplierMetric ? { outputMultiplierMetric } : {}),
    target,
  };
}

export function normalizeGeneratedExternalDynamicPricingConfig(options: {
  attributeDependencies?: Product["attributeDependencies"];
  attributes: AttributeForDynamicPricing[];
  pageCount?: Product["pageCount"];
  plan: GeneratedDynamicPricingPlan;
  productAttributeOptions: Record<string, string[]>;
  rows: ExternalDynamicPricingSourceRow[];
  currency?: CurrencyCode;
}): DynamicPricingConfig | null {
  const {
    attributeDependencies,
    attributes,
    pageCount,
    plan,
    productAttributeOptions,
    rows,
    currency = CurrencyEnum.PLN,
  } = options;

  if (!plan.supported) {
    return null;
  }

  const basePrice = normalizeMoney(plan.basePrice);

  if (basePrice === undefined || basePrice < 0) {
    return null;
  }

  const validAttributeIds = new Set(
    attributes.map((attribute) => attribute.id),
  );
  const attributeRules = (plan.attributeRules ?? [])
    .flatMap((rule) => {
      const attributeId = normalizeText(rule.attributeId);

      if (!attributeId || !validAttributeIds.has(attributeId)) {
        return [];
      }

      const allowedOptions = new Set(
        productAttributeOptions[attributeId] ?? [],
      );
      const adjustments = rule.adjustments.flatMap((adjustment) => {
        const optionValue = normalizeText(adjustment.optionValue);

        if (
          !optionValue ||
          (allowedOptions.size > 0 && !allowedOptions.has(optionValue))
        ) {
          return [];
        }

        const priceAdjustment = normalizeMoney(adjustment.priceAdjustment);
        const deliveryTimeAdjustment = normalizeFiniteNumber(
          adjustment.deliveryTimeAdjustment,
        );

        return [
          {
            ...(deliveryTimeAdjustment !== undefined
              ? { deliveryTimeAdjustment }
              : {}),
            optionValue,
            ...(priceAdjustment !== undefined ? { priceAdjustment } : {}),
          },
        ];
      });

      if (rule.mode === "adjust" && adjustments.length === 0) {
        return [];
      }

      return [
        {
          adjustments,
          attributeId,
          mode: rule.mode,
        },
      ];
    })
    .slice(0, 100);

  const globalRules = (plan.globalRules ?? [])
    .flatMap((rule) => {
      const normalizedRule = normalizeGeneratedGlobalRule({
        productAttributeOptions,
        rule,
        validAttributeIds,
      });

      return normalizedRule ? [normalizedRule] : [];
    })
    .slice(0, 100);

  const inputs = (plan.inputs ?? [])
    .flatMap((input) => {
      const id = normalizeText(input.id);
      const label = normalizeText(input.label);
      const value = normalizeFiniteNumber(input.value);

      if (!id || !label || value === undefined) {
        return [];
      }

      const unit = normalizeText(input.unit);

      return [
        {
          id,
          label,
          ...(unit ? { unit } : {}),
          value,
        },
      ];
    })
    .slice(0, 50);

  const config: DynamicPricingConfig = {
    attributeRules,
    ...(normalizeFiniteNumber(plan.baseDeliveryTime) !== undefined
      ? { baseDeliveryTime: normalizeFiniteNumber(plan.baseDeliveryTime) }
      : {}),
    basePrice,
    enabled: true,
    globalRules,
    ...(inputs.length > 0 ? { inputs } : {}),
  };

  if (
    config.basePrice === 0 &&
    config.attributeRules.length === 0 &&
    config.globalRules.length === 0
  ) {
    return null;
  }

  return isGeneratedConfigPriceCompatible({
    attributeDependencies,
    attributes,
    config,
    pageCount,
    productAttributeOptions,
    rows,
    currency,
  })
    ? config
    : null;
}

function isGeneratedConfigPriceCompatible(options: {
  attributeDependencies?: Product["attributeDependencies"];
  attributes: AttributeForDynamicPricing[];
  config: DynamicPricingConfig;
  pageCount?: Product["pageCount"];
  productAttributeOptions: Record<string, string[]>;
  rows: ExternalDynamicPricingSourceRow[];
  currency: CurrencyCode;
}): boolean {
  const {
    attributeDependencies,
    attributes,
    config,
    pageCount,
    productAttributeOptions,
    rows,
    currency,
  } = options;
  if (rows.length === 0) {
    return true;
  }

  for (const row of rows) {
    const predictedPrice = buildDynamicPricesForSelection({
      calculatedCombination: "__external_dynamic_validation__",
      config,
      context: { pageCount: row.pageCount },
      currency,
      product: {
        attributeDependencies,
        attributeOptions: productAttributeOptions,
        attributes: attributes.map((attribute) => attribute.id),
        customSize: false,
        pageCount,
        spec: {
          defaultOrder: row.quantity,
          images: [],
          maximumOrder: row.quantity,
          minimumOrder: row.quantity,
          step: 1,
        },
        volumes: [{ value: row.quantity }],
      },
      selectedAttributeOptions: row.selection,
    })[0]?.value;

    if (predictedPrice === undefined || predictedPrice === null) {
      return false;
    }

    if (predictedPrice < row.price - UNDERPRICE_TOLERANCE_MINOR_UNITS) {
      return false;
    }
  }

  return true;
}

async function createExternalProductDynamicPricingAgent() {
  const model = await getAdminVertexLanguageModel(MODELS.GEMINI_3_PRO);
  const instructions = buildAgentHarnessSystemPrompt({
    role: "an expert Konfi dynamic pricing rule designer",
    workflow: [
      "Read compressed supplier unit-price rows.",
      "Infer the smallest additive dynamic pricing config that keeps all shown rows profitable.",
      "Return supported=false when the rows require an unreasonably large lookup table or cannot be represented by Konfi dynamic pricing rules.",
    ],
    rules: [
      "Return structured data only through the schema.",
      "Use only attribute IDs and option values from the prompt.",
      "Money values in your output are human unit values in the supplier currency, not minor units and not order totals.",
      "Rows use p as unit price; do not divide p by q.",
      "PAGE_COUNT c entries are deterministic availability constraints, not pricing rules.",
      "Prefer fewer broad rules over exact row matching.",
      "The generated price for every shown supplier row must be at least p so Konfi keeps profit.",
      "Overpricing supplier rows is acceptable when it substantially reduces rule count.",
      "Konfi dynamic pricing starts with basePrice, adds selected attribute adjustments, then adds matching global rules.",
      "Use attributeRules only for option deltas that are stable across all volumes.",
      "Use globalRules with metric=volume for volume curves and conditions for option-specific curves.",
      "Use tier rules for exact bracket rates: the rule applies only inside minimumMetricValue..maximumMetricValue, and missing maximumMetricValue means open-ended.",
      "Use range rules as additive deltas between adjacent volume points when modeling piecewise unit prices.",
      "Use deliveryTime values only as day counts.",
      "Prefer compact rules over one rule per row. If more than 100 rules would be needed, return supported=false.",
      "Do not invent attributes, option values, volumes, or page counts.",
    ],
    contextSections: [
      {
        title: "Dynamic pricing runtime",
        body: [
          "unitPrice = basePrice",
          "attributeRule adjustment adds priceAdjustment for the selected option",
          "global fixed adds fixedValue",
          "global multiplier adds metricValue * multiplier",
          "global range adds a linear interpolation between minimumOutputValue and maximumOutputValue over the metric range",
          "global tier adds fixedValue only when metricValue is inside [minimumMetricValue, maximumMetricValue]",
          "outputMultiplierMetric/outputMultiplierInputId multiplies that one global rule output before it is added",
          "checkout total later multiplies unitPrice by selected volume",
        ],
      },
      {
        title: "Deterministic validation",
        body: [
          "Generated IDs, option values, schema fields, and prices are validated after your response.",
          "Configs that can underprice supplier rows are discarded and the import falls back to matrix pricing.",
        ],
      },
    ],
  });

  return new ToolLoopAgent({
    id: "external-product-dynamic-pricing-agent",
    instructions,
    model,
    output: Output.object({ schema: generatedDynamicPricingPlanSchema }),
    stopWhen: isStepCount(1),
    temperature: 0.1,
  });
}

export async function generateExternalProductDynamicPricingConfig(options: {
  attributeDependencies?: Product["attributeDependencies"];
  attributes: AttributeForDynamicPricing[];
  pageCount?: Product["pageCount"];
  productAttributeOptions: Record<string, string[]>;
  productName: string;
  rows: ExternalDynamicPricingSourceRow[];
  volumes: number[];
  currency?: CurrencyCode;
}): Promise<DynamicPricingConfig | undefined> {
  const {
    attributeDependencies,
    attributes,
    pageCount,
    productAttributeOptions,
    productName,
    rows,
    volumes,
    currency,
  } = options;

  if (rows.length === 0) {
    return undefined;
  }

  try {
    const agent = await createExternalProductDynamicPricingAgent();
    const { output } =
      await agent.generate({
        prompt: buildExternalDynamicPricingPrompt({
          attributes,
          pageCount,
          productAttributeOptions,
          productName,
          rows,
          volumes,
        }),
      });

    return (
      normalizeGeneratedExternalDynamicPricingConfig({
        attributeDependencies,
        attributes,
        pageCount,
        plan: output,
        productAttributeOptions,
        rows,
        currency,
      }) ?? undefined
    );
  } catch (error) {
    console.error(
      "Error generating dynamic pricing rules for external product:",
      error,
    );
    return undefined;
  }
}
