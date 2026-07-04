import {
  type CurrencyCode,
  type Price,
  type PriceList,
  type PriceListApplication,
  type PriceListEntry,
  PriceListAdjustmentType,
  type Product,
} from "@konfi/types";
import { toMillis } from "./timestamp-values";

export interface PriceListContext {
  channelId?: string | null;
  currency?: CurrencyCode | null;
  customerGroupIds?: readonly string[] | null;
  customerId?: string | null;
  now?: Date;
}

function hasIntersection(
  left: readonly string[] | undefined | null,
  right: readonly string[] | undefined | null,
): boolean {
  if (!left?.length || !right?.length) {
    return false;
  }

  return !new Set(left).isDisjointFrom(new Set(right));
}

export function isPriceListActive(
  priceList: Pick<PriceList, "active" | "endsAt" | "startsAt">,
  now = new Date(),
): boolean {
  if (!priceList.active) {
    return false;
  }

  const currentTime = now.getTime();
  const startsAt = toMillis(priceList.startsAt);
  const endsAt = toMillis(priceList.endsAt);

  if (startsAt !== undefined && startsAt > currentTime) {
    return false;
  }

  if (endsAt !== undefined && endsAt < currentTime) {
    return false;
  }

  return true;
}

export function isPriceListApplicable(
  priceList: PriceList,
  context: PriceListContext,
): boolean {
  if (!isPriceListActive(priceList, context.now ?? new Date())) {
    return false;
  }

  if (context.currency && priceList.currency !== context.currency) {
    return false;
  }

  if (
    priceList.channelIds?.length &&
    (!context.channelId || !priceList.channelIds.includes(context.channelId))
  ) {
    return false;
  }

  if (
    priceList.customerIds?.length &&
    (!context.customerId || !priceList.customerIds.includes(context.customerId))
  ) {
    return false;
  }

  if (
    priceList.customerGroupIds?.length &&
    !hasIntersection(priceList.customerGroupIds, context.customerGroupIds)
  ) {
    return false;
  }

  return true;
}

function getEntrySpecificity(entry: PriceListEntry): number {
  if (entry.target.productIds?.length) {
    return 30;
  }

  if (entry.target.productTypeIds?.length) {
    return 20;
  }

  if (entry.target.categoryIds?.length) {
    return 10;
  }

  return 0;
}

export function getMatchingPriceListEntry(
  priceList: PriceList,
  product: Pick<Product, "category" | "id" | "productType">,
): PriceListEntry | undefined {
  let bestEntry: PriceListEntry | undefined;
  let bestSpecificity = -1;

  for (const entry of priceList.entries) {
    const target = entry.target;
    const productMatches = target.productIds?.includes(product.id) ?? false;
    const productTypeMatches =
      product.productType?.id &&
      target.productTypeIds?.includes(product.productType.id);
    const categoryMatches =
      product.category?.id && target.categoryIds?.includes(product.category.id);

    if (!productMatches && !productTypeMatches && !categoryMatches) {
      continue;
    }

    const specificity = getEntrySpecificity(entry);
    if (specificity > bestSpecificity) {
      bestEntry = entry;
      bestSpecificity = specificity;
    }
  }

  return bestEntry;
}

export function getApplicablePriceListForProduct(
  priceLists: readonly PriceList[],
  context: PriceListContext,
  product: Pick<Product, "category" | "id" | "productType">,
): { entry: PriceListEntry; priceList: PriceList } | undefined {
  let bestMatch:
    | {
        entry: PriceListEntry;
        priceList: PriceList;
      }
    | undefined;

  for (const priceList of priceLists) {
    if (!isPriceListApplicable(priceList, context)) {
      continue;
    }

    const entry = getMatchingPriceListEntry(priceList, product);
    if (!entry) {
      continue;
    }

    if (!bestMatch || priceList.priority > bestMatch.priceList.priority) {
      bestMatch = { entry, priceList };
    }
  }

  return bestMatch;
}

function applyPercentage(value: number, percentage: number): number {
  const multiplier = 1 + percentage / 100;
  return Math.max(0, Math.round(value * multiplier));
}

export function applyPriceListEntryToPrices(
  prices: readonly Price[],
  entry: PriceListEntry,
  fallbackCurrency?: CurrencyCode | null,
): Price[] {
  if (
    entry.adjustmentType === PriceListAdjustmentType.PRICE_OVERRIDE &&
    entry.prices?.length
  ) {
    return entry.prices.map((price) => ({
      ...price,
      currency: price.currency ?? entry.currency ?? fallbackCurrency ?? "PLN",
    }));
  }

  if (
    entry.adjustmentType === PriceListAdjustmentType.FIXED_UNIT_PRICE &&
    typeof entry.value === "number" &&
    Number.isFinite(entry.value) &&
    entry.value >= 0
  ) {
    return prices.map((price) => ({
      ...price,
      value: Math.round(entry.value ?? 0),
      currency: entry.currency ?? price.currency ?? fallbackCurrency ?? "PLN",
    }));
  }

  if (
    entry.adjustmentType === PriceListAdjustmentType.PERCENTAGE &&
    typeof entry.value === "number" &&
    Number.isFinite(entry.value)
  ) {
    return prices.map((price) => ({
      ...price,
      value:
        typeof price.value === "number"
          ? applyPercentage(price.value, entry.value ?? 0)
          : price.value,
      currency: entry.currency ?? price.currency ?? fallbackCurrency ?? "PLN",
    }));
  }

  return prices.map((price) => ({ ...price }));
}

export function applyPriceListToProductPrices({
  context,
  fallbackCurrency,
  priceLists,
  prices,
  product,
}: {
  context: PriceListContext;
  fallbackCurrency?: CurrencyCode | null;
  priceLists: readonly PriceList[];
  prices: readonly Price[];
  product: Pick<Product, "category" | "id" | "productType">;
}): { application?: PriceListApplication; prices: Price[] } {
  const match = getApplicablePriceListForProduct(priceLists, context, product);

  if (!match) {
    return { prices: prices.map((price) => ({ ...price })) };
  }

  return {
    application: {
      entryId: match.entry.id,
      priceListId: match.priceList.id,
    },
    prices: applyPriceListEntryToPrices(
      prices,
      match.entry,
      fallbackCurrency ?? match.priceList.currency,
    ),
  };
}
