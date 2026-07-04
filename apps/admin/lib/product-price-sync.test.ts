import { describe, expect, it } from "vitest";
import { CurrencyEnum, Price, ProductPageCountSegmentPriceSet } from "@konfi/types";
import {
  buildPageCountPriceDocumentId,
  DEFAULT_COMBINATION,
} from "@konfi/utils";
import {
  buildProductPageCountSegmentBasePriceBatchData,
  buildProductPageCountSegmentStepPriceSyncPlan,
  buildProductPageCountPriceBatchData,
  buildProductPageCountPriceSyncPlan,
  buildProductPriceBatchData,
  buildProductPriceSyncPlan,
} from "./product-price-sync";

const createPrice = (
  combinationId: string,
  threshold: number,
  value: number,
): Price => ({
  combination: {
    id: combinationId,
    active: true,
    customFormat: false,
  },
  currency: CurrencyEnum.PLN,
  threshold,
  value,
});

const createSegmentPriceSet = (
  minimum: number,
  maximum: number,
  prices: {
    base: number;
    step: number;
  },
): ProductPageCountSegmentPriceSet => ({
  minimum,
  maximum,
  basePrices: [createPrice(DEFAULT_COMBINATION, 1, prices.base)],
  stepPrices: [createPrice(DEFAULT_COMBINATION, 1, prices.step)],
});

describe("buildProductPriceBatchData", () => {
  it("groups flat prices by calculated combination", () => {
    const batchData = buildProductPriceBatchData([
      createPrice(DEFAULT_COMBINATION, 1, 10),
      createPrice("paper-mat", 1, 12),
      createPrice(DEFAULT_COMBINATION, 10, 9),
    ]);

    expect(batchData).toEqual([
      {
        calculatedCombination: DEFAULT_COMBINATION,
        prices: [
          createPrice(DEFAULT_COMBINATION, 1, 10),
          createPrice(DEFAULT_COMBINATION, 10, 9),
        ],
      },
      {
        calculatedCombination: "paper-mat",
        prices: [createPrice("paper-mat", 1, 12)],
      },
    ]);
  });
});

describe("buildProductPriceSyncPlan", () => {
  it("returns no writes when prices are unchanged", () => {
    const originalPrices = [
      createPrice(DEFAULT_COMBINATION, 1, 10),
      createPrice("paper-mat", 1, 12),
    ];

    expect(buildProductPriceSyncPlan(originalPrices, originalPrices)).toEqual({
      deletes: [],
      upserts: [],
    });
  });

  it("only upserts the changed combinations", () => {
    const originalPrices = [
      createPrice(DEFAULT_COMBINATION, 1, 10),
      createPrice("paper-mat", 1, 12),
    ];
    const nextPrices = [
      createPrice(DEFAULT_COMBINATION, 1, 11),
      createPrice("paper-mat", 1, 12),
    ];

    expect(buildProductPriceSyncPlan(originalPrices, nextPrices)).toEqual({
      deletes: [],
      upserts: [
        {
          calculatedCombination: DEFAULT_COMBINATION,
          prices: [createPrice(DEFAULT_COMBINATION, 1, 11)],
        },
      ],
    });
  });

  it("deletes removed combinations and upserts the remaining changed groups", () => {
    const originalPrices = [
      createPrice(DEFAULT_COMBINATION, 1, 10),
      createPrice("paper-mat", 1, 12),
      createPrice("paper-gloss", 1, 13),
    ];
    const nextPrices = [createPrice(DEFAULT_COMBINATION, 1, 10)];

    expect(buildProductPriceSyncPlan(originalPrices, nextPrices)).toEqual({
      deletes: ["paper-mat", "paper-gloss"],
      upserts: [],
    });
  });
});

describe("buildProductPageCountPriceBatchData", () => {
  it("groups exact page-count prices by page count and calculated combination", () => {
    const batchData = buildProductPageCountPriceBatchData([
      {
        pageCount: 8,
        prices: [
          createPrice(DEFAULT_COMBINATION, 1, 10),
          createPrice(DEFAULT_COMBINATION, 10, 9),
        ],
      },
      {
        pageCount: 12,
        prices: [createPrice("paper-mat", 1, 12)],
      },
    ]);

    expect(batchData).toEqual([
      {
        calculatedCombination: DEFAULT_COMBINATION,
        pageCount: 8,
        prices: [
          createPrice(DEFAULT_COMBINATION, 1, 10),
          createPrice(DEFAULT_COMBINATION, 10, 9),
        ],
      },
      {
        calculatedCombination: "paper-mat",
        pageCount: 12,
        prices: [createPrice("paper-mat", 1, 12)],
      },
    ]);
  });
});

describe("buildProductPageCountPriceSyncPlan", () => {
  it("tracks created, updated, and deleted exact page-count groups", () => {
    const originalExactPrices = [
      {
        pageCount: 8,
        prices: [createPrice(DEFAULT_COMBINATION, 1, 10)],
      },
      {
        pageCount: 12,
        prices: [createPrice("paper-mat", 1, 12)],
      },
    ];
    const nextExactPrices = [
      {
        pageCount: 8,
        prices: [createPrice(DEFAULT_COMBINATION, 1, 11)],
      },
      {
        pageCount: 16,
        prices: [createPrice("paper-mat", 1, 15)],
      },
    ];

    expect(
      buildProductPageCountPriceSyncPlan(originalExactPrices, nextExactPrices),
    ).toEqual({
      deletes: [buildPageCountPriceDocumentId(12, "paper-mat")],
      upserts: [
        {
          calculatedCombination: DEFAULT_COMBINATION,
          pageCount: 8,
          prices: [createPrice(DEFAULT_COMBINATION, 1, 11)],
        },
        {
          calculatedCombination: "paper-mat",
          pageCount: 16,
          prices: [createPrice("paper-mat", 1, 15)],
        },
      ],
    });
  });
});

describe("buildProductPageCountSegmentBasePriceBatchData", () => {
  it("skips the first segment and groups later segment base prices by page count", () => {
    expect(
      buildProductPageCountSegmentBasePriceBatchData(
        [
          createSegmentPriceSet(8, 24, { base: 10, step: 2 }),
          createSegmentPriceSet(28, 48, { base: 22, step: 3 }),
          createSegmentPriceSet(52, 72, { base: 35, step: 4 }),
        ],
        8,
      ),
    ).toEqual([
      {
        calculatedCombination: DEFAULT_COMBINATION,
        pageCount: 28,
        prices: [createPrice(DEFAULT_COMBINATION, 1, 22)],
      },
      {
        calculatedCombination: DEFAULT_COMBINATION,
        pageCount: 52,
        prices: [createPrice(DEFAULT_COMBINATION, 1, 35)],
      },
    ]);
  });
});

describe("buildProductPageCountSegmentStepPriceSyncPlan", () => {
  it("tracks later segment step-price changes while skipping the first segment", () => {
    expect(
      buildProductPageCountSegmentStepPriceSyncPlan(
        [
          createSegmentPriceSet(8, 24, { base: 10, step: 2 }),
          createSegmentPriceSet(28, 48, { base: 22, step: 3 }),
          createSegmentPriceSet(52, 72, { base: 35, step: 4 }),
        ],
        [
          createSegmentPriceSet(8, 24, { base: 10, step: 2 }),
          createSegmentPriceSet(28, 48, { base: 22, step: 5 }),
          createSegmentPriceSet(76, 96, { base: 48, step: 6 }),
        ],
        8,
      ),
    ).toEqual({
      deletes: [buildPageCountPriceDocumentId(52, DEFAULT_COMBINATION)],
      upserts: [
        {
          calculatedCombination: DEFAULT_COMBINATION,
          pageCount: 28,
          prices: [createPrice(DEFAULT_COMBINATION, 1, 5)],
        },
        {
          calculatedCombination: DEFAULT_COMBINATION,
          pageCount: 76,
          prices: [createPrice(DEFAULT_COMBINATION, 1, 6)],
        },
      ],
    });
  });
});
