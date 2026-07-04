import type { ProductAgentData } from "@/lib/ai/durable-agents/product-workflow.types";
import type {
  AiBenchmarkComparisonResult,
  AiBenchmarkDiffEntry,
} from "./types";
import type { Product } from "@konfi/types";

const SCORE_SCALE = 100;

interface FieldDiffInput {
  field: string;
  label: string;
  expected: string;
  actual: string;
  score: number;
  weight: number;
}

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "-";
  }

  return String(value);
}

function normalizeText(value: unknown): string {
  return toDisplayValue(value).trim().toLowerCase();
}

function scoreExact(left: unknown, right: unknown): number {
  return normalizeText(left) === normalizeText(right) ? 1 : 0;
}

function scoreNumber(left: unknown, right: unknown): number {
  const expected = typeof left === "number" && Number.isFinite(left) ? left : 0;
  const actual =
    typeof right === "number" && Number.isFinite(right) ? right : 0;

  if (expected === actual) {
    return 1;
  }

  if (expected === 0) {
    return 0;
  }

  const relativeDifference = Math.abs(expected - actual) / Math.abs(expected);
  return Math.max(0, 1 - relativeDifference);
}

function scoreSet(expected: readonly string[], actual: readonly string[]) {
  const expectedSet = new Set(expected.map(normalizeText).filter(Boolean));
  const actualSet = new Set(actual.map(normalizeText).filter(Boolean));

  if (expectedSet.size === 0 && actualSet.size === 0) {
    return 1;
  }

  if (expectedSet.size === 0 || actualSet.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const value of expectedSet) {
    if (actualSet.has(value)) {
      matches += 1;
    }
  }

  const misses = expectedSet.size - matches;
  const extras = actualSet.size - matches;
  const denominator = expectedSet.size + extras;

  return Math.max(0, (matches - extras * 0.25 - misses * 0.5) / denominator);
}

function createDiff(input: FieldDiffInput): AiBenchmarkDiffEntry {
  const normalizedScore = Math.max(0, Math.min(1, input.score));
  const severity =
    normalizedScore >= 1
      ? "match"
      : normalizedScore >= 0.75
        ? "partial"
        : input.expected === "-" && input.actual !== "-"
          ? "extra"
          : input.expected !== "-" && input.actual === "-"
            ? "missing"
            : "mismatch";

  return {
    actual: input.actual,
    expected: input.expected,
    field: input.field,
    label: input.label,
    score: normalizedScore * input.weight,
    severity,
    weight: input.weight,
  };
}

function getProductTypeName(product: Partial<Product>) {
  return product.productType?.name ?? product.productType?.id ?? "";
}

function getExpectedAttributeIds(product: Product): string[] {
  return product.attributes ?? [];
}

function getActualAttributeIds(data: ProductAgentData): string[] {
  const draft = data.draft;
  const productAttributeIds = draft?.product.attributes;
  if (Array.isArray(productAttributeIds) && productAttributeIds.length > 0) {
    return productAttributeIds;
  }

  return (
    draft?.selectedAttributes.map((attribute) => attribute.attributeId) ?? []
  );
}

function getExpectedOptionValues(product: Product): string[] {
  return Object.entries(product.attributeOptions ?? {}).flatMap(
    ([attributeId, values]) =>
      values.map((value) => `${attributeId}:${String(value)}`),
  );
}

function getActualOptionValues(data: ProductAgentData): string[] {
  const draft = data.draft;
  const productOptions = draft?.product.attributeOptions;
  if (productOptions && Object.keys(productOptions).length > 0) {
    return Object.entries(productOptions).flatMap(([attributeId, values]) =>
      values.map((value) => `${attributeId}:${String(value)}`),
    );
  }

  return (
    draft?.selectedAttributes.flatMap((attribute) =>
      attribute.optionValues.map(
        (value) => `${attribute.attributeId}:${String(value)}`,
      ),
    ) ?? []
  );
}

export function compareProductBenchmarkOutput(options: {
  expectedProduct: Product;
  generatedData: ProductAgentData;
}): AiBenchmarkComparisonResult {
  const expected = options.expectedProduct;
  const actual = options.generatedData.draft?.product ?? {};
  const expectedAttributeIds = getExpectedAttributeIds(expected);
  const actualAttributeIds = getActualAttributeIds(options.generatedData);
  const expectedOptionValues = getExpectedOptionValues(expected);
  const actualOptionValues = getActualOptionValues(options.generatedData);

  const diffs: AiBenchmarkDiffEntry[] = [
    createDiff({
      actual: toDisplayValue(actual.name),
      expected: toDisplayValue(expected.name),
      field: "productName",
      label: "Product",
      score: scoreExact(expected.name, actual.name),
      weight: 15,
    }),
    createDiff({
      actual: toDisplayValue(getProductTypeName(actual)),
      expected: toDisplayValue(getProductTypeName(expected)),
      field: "productType",
      label: "Product type",
      score: scoreExact(
        getProductTypeName(expected),
        getProductTypeName(actual),
      ),
      weight: 10,
    }),
    createDiff({
      actual: toDisplayValue(options.generatedData.draft?.priceType),
      expected: toDisplayValue(expected.priceType),
      field: "priceType",
      label: "Price type",
      score: scoreExact(
        expected.priceType,
        options.generatedData.draft?.priceType,
      ),
      weight: 10,
    }),
    createDiff({
      actual: toDisplayValue(actual.prices?.length),
      expected: toDisplayValue(expected.prices.length),
      field: "priceRows",
      label: "Price rows",
      score: scoreNumber(expected.prices.length, actual.prices?.length),
      weight: 10,
    }),
    createDiff({
      actual: toDisplayValue(actualAttributeIds),
      expected: toDisplayValue(expectedAttributeIds),
      field: "attributes",
      label: "Attributes",
      score: scoreSet(expectedAttributeIds, actualAttributeIds),
      weight: 15,
    }),
    createDiff({
      actual: toDisplayValue(actualOptionValues),
      expected: toDisplayValue(expectedOptionValues),
      field: "attributeOptions",
      label: "Attribute options",
      score: scoreSet(expectedOptionValues, actualOptionValues),
      weight: 20,
    }),
    createDiff({
      actual: toDisplayValue(actual.customSize),
      expected: toDisplayValue(expected.customSize),
      field: "customSize",
      label: "Custom size",
      score: scoreExact(expected.customSize, actual.customSize),
      weight: 5,
    }),
    createDiff({
      actual: toDisplayValue(actual.shipping?.types ?? []),
      expected: toDisplayValue(expected.shipping.types),
      field: "shippingTypes",
      label: "Shipping types",
      score: scoreSet(expected.shipping.types, actual.shipping?.types ?? []),
      weight: 5,
    }),
    createDiff({
      actual: toDisplayValue(actual.volumes?.length),
      expected: toDisplayValue(expected.volumes.length),
      field: "volumeCount",
      label: "Volume count",
      score: scoreNumber(expected.volumes.length, actual.volumes?.length),
      weight: 5,
    }),
    createDiff({
      actual: toDisplayValue(options.generatedData.readyForCreate),
      expected: "true",
      field: "readyForCreate",
      label: "Ready for create",
      score: options.generatedData.readyForCreate ? 1 : 0,
      weight: 5,
    }),
  ];

  const score = diffs.reduce((sum, diff) => sum + diff.score, 0);
  const maxScore = diffs.reduce((sum, diff) => sum + diff.weight, 0);
  const percentage =
    maxScore > 0 ? Math.round((score / maxScore) * SCORE_SCALE) : 0;

  return {
    diffs,
    maxScore,
    percentage,
    score,
    summary: {
      matchedFields: diffs.filter((diff) => diff.severity === "match").length,
      mismatchedFields: diffs.filter((diff) =>
        ["mismatch", "missing", "extra"].includes(diff.severity),
      ).length,
      partialFields: diffs.filter((diff) => diff.severity === "partial").length,
    },
  };
}

export function summarizeProductForBenchmark(product: Product): {
  id: string;
  name: string;
  priceType: Product["priceType"];
  priceRows: number;
  attributeCount: number;
} {
  return {
    attributeCount: product.attributes.length,
    id: product.id,
    name: product.name,
    priceRows: product.prices.length,
    priceType: product.priceType,
  };
}
