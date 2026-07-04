import type { QuoteAgentData } from "@/lib/ai/durable-agents/types";
import type {
  AiBenchmarkComparisonResult,
  AiBenchmarkDiffEntry,
} from "./types";
import type { Contact, Order, OrderItem, Quote } from "@konfi/types";

const SCORE_SCALE = 100;
const PRICE_TOLERANCE = 0.01;

interface NormalizedQuoteItem {
  productId: string;
  productName: string;
  description: string;
  combination: string;
  quantity: number;
  volume?: number;
  width?: number;
  height?: number;
  totalPrice: number;
  customPrice: number | null;
  unit: string;
}

interface NormalizedQuoteData {
  customerId: string;
  customerName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  shippingOption: string;
  shippingPrice: number;
  totalPrice: number;
  specialNotes: string;
  items: NormalizedQuoteItem[];
}

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

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return String(value);
}

function normalizeText(value: unknown): string {
  return toDisplayValue(value).trim().toLowerCase();
}

function normalizePrice(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function scoreExact(left: unknown, right: unknown): number {
  return normalizeText(left) === normalizeText(right) ? 1 : 0;
}

function scorePrice(left: unknown, right: unknown): number {
  const expected = normalizePrice(left);
  const actual = normalizePrice(right);

  if (Math.abs(expected - actual) <= PRICE_TOLERANCE) {
    return 1;
  }

  if (expected === 0) {
    return actual === 0 ? 1 : 0;
  }

  const relativeDifference = Math.abs(expected - actual) / Math.abs(expected);
  return Math.max(0, 1 - relativeDifference);
}

function scoreOptionalNumber(left: unknown, right: unknown): number {
  if (left === undefined && right === undefined) {
    return 1;
  }

  if (left === undefined || right === undefined) {
    return 0;
  }

  return scorePrice(left, right);
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
    field: input.field,
    label: input.label,
    expected: input.expected,
    actual: input.actual,
    score: normalizedScore * input.weight,
    weight: input.weight,
    severity,
  };
}

function getCustomerId(
  customer: Quote["customer"] | QuoteAgentData["customer"],
) {
  return typeof customer === "object" && customer !== null ? customer.id : "";
}

function getCustomerName(
  customer: Quote["customer"] | QuoteAgentData["customer"],
) {
  return typeof customer === "object" && customer !== null
    ? customer.name
    : toDisplayValue(customer);
}

function normalizeContact(
  contact?: Contact,
): Pick<NormalizedQuoteData, "contactName" | "contactEmail" | "contactPhone"> {
  return {
    contactEmail: contact?.email ?? "",
    contactName: contact?.name ?? "",
    contactPhone: contact?.phone ?? "",
  };
}

function normalizeCombination(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, option]) => `${key}:${String(option)}`)
      .toSorted()
      .join("|");
  }

  return "";
}

function normalizeOrderItem(item: OrderItem): NormalizedQuoteItem {
  return {
    combination: item.calculatedCombination ?? item.combination ?? "",
    customPrice: item.customPrice,
    description: item.description ?? "",
    height: item.height,
    productId: item.product?.id ?? "",
    productName: item.product?.name ?? "",
    quantity: item.quantity,
    totalPrice: normalizePrice(item.totalPrice),
    unit: item.unit,
    volume: item.volume,
    width: item.width,
  };
}

function normalizeAgentItem(
  item: NonNullable<QuoteAgentData["items"]>[number],
): NormalizedQuoteItem {
  return {
    combination:
      item.calculatedCombination ?? normalizeCombination(item.combination),
    customPrice: item.customPrice,
    description: item.description ?? "",
    height: item.height,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    totalPrice: normalizePrice(item.totalPrice),
    unit: item.unit,
    volume: item.volume,
    width: item.width,
  };
}

function normalizeTargetQuote(quote: Quote): NormalizedQuoteData {
  return {
    ...normalizeContact(quote.contact),
    customerId: getCustomerId(quote.customer),
    customerName: getCustomerName(quote.customer),
    items: quote.items.map(normalizeOrderItem),
    shippingOption: quote.shippingOption ?? "",
    shippingPrice: normalizePrice(quote.shippingPrice),
    specialNotes: quote.specialNotes ?? "",
    totalPrice: normalizePrice(quote.totalPrice),
  };
}

function normalizeTargetOrder(order: Order): NormalizedQuoteData {
  return {
    ...normalizeContact(order.contact),
    customerId: getCustomerId(order.customer),
    customerName: getCustomerName(order.customer),
    items: order.items.map(normalizeOrderItem),
    shippingOption: order.shippingOption ?? "",
    shippingPrice: normalizePrice(order.shippingPrice),
    specialNotes: order.specialNotes ?? "",
    totalPrice: normalizePrice(order.totalPrice),
  };
}

function normalizeAgentQuote(data: QuoteAgentData): NormalizedQuoteData {
  return {
    ...normalizeContact(data.contact),
    customerId: getCustomerId(data.customer),
    customerName: getCustomerName(data.customer),
    items: data.items?.map(normalizeAgentItem) ?? [],
    shippingOption: data.shippingOption ?? "",
    shippingPrice: normalizePrice(data.shippingPrice),
    specialNotes: data.specialNotes ?? "",
    totalPrice: normalizePrice(data.totalPrice),
  };
}

function findMatchingActualItem(
  expected: NormalizedQuoteItem,
  candidates: NormalizedQuoteItem[],
): NormalizedQuoteItem | undefined {
  return (
    candidates.find((candidate) =>
      Boolean(expected.productId && candidate.productId === expected.productId),
    ) ??
    candidates.find(
      (candidate) =>
        normalizeText(candidate.productName) ===
        normalizeText(expected.productName),
    )
  );
}

function scoreItem(
  expected: NormalizedQuoteItem,
  actual: NormalizedQuoteItem | undefined,
): number {
  if (!actual) {
    return 0;
  }

  const fieldScores = [
    scoreExact(expected.productId, actual.productId),
    scoreExact(expected.productName, actual.productName),
    scorePrice(expected.quantity, actual.quantity),
    scoreOptionalNumber(expected.volume, actual.volume),
    scoreOptionalNumber(expected.width, actual.width),
    scoreOptionalNumber(expected.height, actual.height),
    scorePrice(expected.totalPrice, actual.totalPrice),
    scoreExact(expected.unit, actual.unit),
    scoreExact(expected.combination, actual.combination),
  ];

  return (
    fieldScores.reduce((sum, score) => sum + score, 0) / fieldScores.length
  );
}

function compareItems(
  expectedItems: NormalizedQuoteItem[],
  actualItems: NormalizedQuoteItem[],
): { score: number; description: string } {
  if (expectedItems.length === 0 && actualItems.length === 0) {
    return { score: 1, description: "No items expected or generated" };
  }

  if (expectedItems.length === 0) {
    return {
      score: 0,
      description: `${actualItems.length} unexpected generated items`,
    };
  }

  const usedActualItems = new Set<NormalizedQuoteItem>();
  const itemScores = expectedItems.map((expected) => {
    const match = findMatchingActualItem(
      expected,
      actualItems.filter((item) => !usedActualItems.has(item)),
    );

    if (match) {
      usedActualItems.add(match);
    }

    return scoreItem(expected, match);
  });

  const averageScore =
    itemScores.reduce((sum, score) => sum + score, 0) / expectedItems.length;
  const extraItemPenalty =
    Math.max(0, actualItems.length - usedActualItems.size) * 0.1;

  return {
    description:
      `${usedActualItems.size}/${expectedItems.length} target items matched` +
      (extraItemPenalty > 0
        ? `, ${actualItems.length - usedActualItems.size} extra`
        : ""),
    score: Math.max(0, averageScore - extraItemPenalty),
  };
}

export function compareQuoteBenchmarkOutput(options: {
  expectedQuote: Quote;
  generatedData: QuoteAgentData;
}): AiBenchmarkComparisonResult {
  return compareBenchmarkData({
    expected: normalizeTargetQuote(options.expectedQuote),
    generatedData: options.generatedData,
  });
}

export function compareOrderBenchmarkOutput(options: {
  expectedOrder: Order;
  generatedData: QuoteAgentData;
}): AiBenchmarkComparisonResult {
  return compareBenchmarkData({
    expected: normalizeTargetOrder(options.expectedOrder),
    generatedData: options.generatedData,
  });
}

function compareBenchmarkData(options: {
  expected: NormalizedQuoteData;
  generatedData: QuoteAgentData;
}): AiBenchmarkComparisonResult {
  const expected = options.expected;
  const actual = normalizeAgentQuote(options.generatedData);
  const itemComparison = compareItems(expected.items, actual.items);

  const diffs: AiBenchmarkDiffEntry[] = [
    createDiff({
      actual: actual.customerId || actual.customerName,
      expected: expected.customerId || expected.customerName,
      field: "customer",
      label: "Customer",
      score: expected.customerId
        ? scoreExact(expected.customerId, actual.customerId)
        : scoreExact(expected.customerName, actual.customerName),
      weight: 15,
    }),
    createDiff({
      actual: [actual.contactName, actual.contactEmail, actual.contactPhone]
        .filter(Boolean)
        .join(" / "),
      expected: [
        expected.contactName,
        expected.contactEmail,
        expected.contactPhone,
      ]
        .filter(Boolean)
        .join(" / "),
      field: "contact",
      label: "Contact",
      score:
        (scoreExact(expected.contactName, actual.contactName) +
          scoreExact(expected.contactEmail, actual.contactEmail) +
          scoreExact(expected.contactPhone, actual.contactPhone)) /
        3,
      weight: 10,
    }),
    createDiff({
      actual: actual.shippingOption,
      expected: expected.shippingOption,
      field: "shippingOption",
      label: "Shipping option",
      score: scoreExact(expected.shippingOption, actual.shippingOption),
      weight: 8,
    }),
    createDiff({
      actual: toDisplayValue(actual.shippingPrice),
      expected: toDisplayValue(expected.shippingPrice),
      field: "shippingPrice",
      label: "Shipping price",
      score: scorePrice(expected.shippingPrice, actual.shippingPrice),
      weight: 7,
    }),
    createDiff({
      actual: toDisplayValue(actual.totalPrice),
      expected: toDisplayValue(expected.totalPrice),
      field: "totalPrice",
      label: "Total price",
      score: scorePrice(expected.totalPrice, actual.totalPrice),
      weight: 15,
    }),
    createDiff({
      actual: toDisplayValue(actual.items.length),
      expected: toDisplayValue(expected.items.length),
      field: "itemCount",
      label: "Item count",
      score: scorePrice(expected.items.length, actual.items.length),
      weight: 10,
    }),
    createDiff({
      actual: itemComparison.description,
      expected: `${expected.items.length} target items`,
      field: "items",
      label: "Items",
      score: itemComparison.score,
      weight: 35,
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

export function summarizeQuoteForBenchmark(quote: Quote): {
  id: string;
  number: number;
  customerName: string;
  totalPrice: number;
  itemsCount: number;
} {
  return {
    customerName: getCustomerName(quote.customer),
    id: quote.id,
    itemsCount: quote.items.length,
    number: quote.number,
    totalPrice: quote.totalPrice,
  };
}

export function summarizeOrderForBenchmark(order: Order): {
  id: string;
  number: number;
  customerName: string;
  totalPrice: number;
  itemsCount: number;
} {
  return {
    customerName: getCustomerName(order.customer),
    id: order.id,
    itemsCount: order.items.length,
    number: order.number,
    totalPrice: order.totalPrice,
  };
}
