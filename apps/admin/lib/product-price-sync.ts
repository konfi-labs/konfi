import {
  ProductPageCountSegmentPriceSet,
  Price,
} from "@konfi/types";
import {
  buildPageCountPriceDocumentId,
  comparePrices,
  detectPriceChanges,
  groupPricesByCalculatedCombination,
} from "@konfi/utils";

export type ProductPriceBatchData = {
  calculatedCombination: string;
  prices: Price[];
};

export type ProductPriceSyncPlan = {
  deletes: string[];
  upserts: ProductPriceBatchData[];
};

export type ProductPageCountPriceBatchData = {
  calculatedCombination: string;
  pageCount: number;
  prices: Price[];
};

export type ProductPageCountPriceSyncPlan = {
  deletes: string[];
  upserts: ProductPageCountPriceBatchData[];
};

type PageCountPriceSetLike = {
  pageCount: number;
  prices: Price[];
};

export const buildProductPriceBatchData = (
  prices: Price[],
): ProductPriceBatchData[] => {
  const priceGroups = groupPricesByCalculatedCombination(prices);

  return Array.from(priceGroups.entries()).map(
    ([calculatedCombination, groupedPrices]) => ({
      calculatedCombination,
      prices: groupedPrices,
    }),
  );
};

export const buildProductPriceSyncPlan = (
  originalPrices: Price[],
  nextPrices: Price[],
): ProductPriceSyncPlan => {
  const originalGroups = groupPricesByCalculatedCombination(originalPrices);
  const nextGroups = groupPricesByCalculatedCombination(nextPrices);
  const changes = detectPriceChanges(originalGroups, nextGroups);

  const deletes: string[] = [];
  const upserts: ProductPriceBatchData[] = [];

  changes.forEach((change, calculatedCombination) => {
    if (change === "deleted") {
      deletes.push(calculatedCombination);
      return;
    }

    const prices = nextGroups.get(calculatedCombination);

    if (prices) {
      upserts.push({
        calculatedCombination,
        prices,
      });
    }
  });

  return {
    deletes,
    upserts,
  };
};

export const buildProductPageCountPriceBatchData = (
  exactPrices: PageCountPriceSetLike[] = [],
): ProductPageCountPriceBatchData[] => {
  return exactPrices.flatMap(({ pageCount, prices }) => {
    const priceGroups = groupPricesByCalculatedCombination(prices);

    return Array.from(priceGroups.entries()).map(
      ([calculatedCombination, groupedPrices]) => ({
        calculatedCombination,
        pageCount,
        prices: groupedPrices,
      }),
    );
  });
};

export const buildProductPageCountPriceSyncPlan = (
  originalExactPrices: PageCountPriceSetLike[] = [],
  nextExactPrices: PageCountPriceSetLike[] = [],
): ProductPageCountPriceSyncPlan => {
  const originalGroups = new Map(
    buildProductPageCountPriceBatchData(originalExactPrices).map((entry) => [
      buildPageCountPriceDocumentId(entry.pageCount, entry.calculatedCombination),
      entry,
    ]),
  );
  const nextGroups = new Map(
    buildProductPageCountPriceBatchData(nextExactPrices).map((entry) => [
      buildPageCountPriceDocumentId(entry.pageCount, entry.calculatedCombination),
      entry,
    ]),
  );
  const deletes: string[] = [];
  const upserts: ProductPageCountPriceBatchData[] = [];

  for (const [id, entry] of nextGroups) {
    const originalEntry = originalGroups.get(id);

    if (!originalEntry || !comparePrices(originalEntry.prices, entry.prices)) {
      upserts.push(entry);
    }
  }

  for (const [id] of originalGroups) {
    if (!nextGroups.has(id)) {
      deletes.push(id);
    }
  }

  return {
    deletes,
    upserts,
  };
};

export const buildProductPageCountSegmentBasePriceBatchData = (
  segmentPrices: ProductPageCountSegmentPriceSet[] = [],
  skipMinimum?: number,
): ProductPageCountPriceBatchData[] =>
  buildProductPageCountPriceBatchData(
    segmentPrices
      .filter((segment) => segment.minimum !== skipMinimum)
      .map((segment) => ({
        pageCount: segment.minimum,
        prices: segment.basePrices,
      })),
  );

export const buildProductPageCountSegmentStepPriceBatchData = (
  segmentPrices: ProductPageCountSegmentPriceSet[] = [],
  skipMinimum?: number,
): ProductPageCountPriceBatchData[] =>
  buildProductPageCountPriceBatchData(
    segmentPrices
      .filter((segment) => segment.minimum !== skipMinimum)
      .map((segment) => ({
        pageCount: segment.minimum,
        prices: segment.stepPrices,
      })),
  );

export const buildProductPageCountSegmentBasePriceSyncPlan = (
  originalSegmentPrices: ProductPageCountSegmentPriceSet[] = [],
  nextSegmentPrices: ProductPageCountSegmentPriceSet[] = [],
  skipMinimum?: number,
): ProductPageCountPriceSyncPlan =>
  buildProductPageCountPriceSyncPlan(
    originalSegmentPrices
      .filter((segment) => segment.minimum !== skipMinimum)
      .map((segment) => ({
        pageCount: segment.minimum,
        prices: segment.basePrices,
      })),
    nextSegmentPrices
      .filter((segment) => segment.minimum !== skipMinimum)
      .map((segment) => ({
        pageCount: segment.minimum,
        prices: segment.basePrices,
      })),
  );

export const buildProductPageCountSegmentStepPriceSyncPlan = (
  originalSegmentPrices: ProductPageCountSegmentPriceSet[] = [],
  nextSegmentPrices: ProductPageCountSegmentPriceSet[] = [],
  skipMinimum?: number,
): ProductPageCountPriceSyncPlan =>
  buildProductPageCountPriceSyncPlan(
    originalSegmentPrices
      .filter((segment) => segment.minimum !== skipMinimum)
      .map((segment) => ({
        pageCount: segment.minimum,
        prices: segment.stepPrices,
      })),
    nextSegmentPrices
      .filter((segment) => segment.minimum !== skipMinimum)
      .map((segment) => ({
        pageCount: segment.minimum,
        prices: segment.stepPrices,
      })),
  );
