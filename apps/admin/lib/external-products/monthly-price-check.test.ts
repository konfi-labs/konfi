import { PriceTypeEnum } from "@konfi/types";
import type { ExternalPriceConfiguration, Product } from "@konfi/types";
import { describe, expect, it, vi } from "vitest";
import {
  applyConfiguredPriceAdjustments,
  compareCurrentProductPricesToMinimumProfitablePrice,
  compareFetchedPriceInfoToCurrentProductPrices,
  pickComparableSampledPriceConfigurations,
  pickSampledPriceConfigurations,
  sampledPriceInfoDiffers,
} from "./monthly-price-check";
import { SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE } from "./option-mapping-utils";

vi.mock("server-only", () => ({}));

function createPriceConfiguration(
  value: string,
  sourceUrl?: string,
  price: number = 1,
): ExternalPriceConfiguration {
  return {
    configuration: { variant: value },
    priceInfo: {
      currency: "PLN",
      priceRanges: [{ quantity: 10, price }],
    },
    sourceUrl,
  };
}

describe("pickSampledPriceConfigurations", () => {
  it("selects the first, middle, and last stored supplier samples", () => {
    const sampledConfigurations = pickSampledPriceConfigurations([
      createPriceConfiguration("a", "https://supplier.test/a", 1),
      createPriceConfiguration("b", "https://supplier.test/b", 2),
      createPriceConfiguration("c", "https://supplier.test/c", 3),
      createPriceConfiguration("d", "https://supplier.test/d", 4),
      createPriceConfiguration("e", "https://supplier.test/e", 5),
    ]);

    expect(
      sampledConfigurations.map((configuration) => configuration.sourceUrl),
    ).toEqual([
      "https://supplier.test/a",
      "https://supplier.test/c",
      "https://supplier.test/e",
    ]);
  });

  it("filters out unusable samples and keeps only unique request URLs", () => {
    const sampledConfigurations = pickSampledPriceConfigurations([
      createPriceConfiguration("a", "https://supplier.test/a", 1),
      createPriceConfiguration("b", "https://supplier.test/shared", 2),
      createPriceConfiguration("c", "https://supplier.test/shared", 3),
      {
        configuration: { variant: "d" },
        priceInfo: { currency: "PLN", priceRanges: [] },
        sourceUrl: "https://supplier.test/d",
      },
      createPriceConfiguration("e"),
    ]);

    expect(
      sampledConfigurations.map((configuration) => configuration.sourceUrl),
    ).toEqual(["https://supplier.test/a", "https://supplier.test/shared"]);
  });
});

describe("pickComparableSampledPriceConfigurations", () => {
  it("filters to live product combinations before sampling representative configs", () => {
    const configurations: ExternalPriceConfiguration[] = [
      {
        configuration: { Format: "a" },
        priceInfo: { currency: "PLN", priceRanges: [{ quantity: 10, price: 1 }] },
        sourceUrl: "https://example.com/a",
      },
      {
        configuration: { Format: "b" },
        priceInfo: { currency: "PLN", priceRanges: [{ quantity: 10, price: 1 }] },
        sourceUrl: "https://example.com/b",
      },
      {
        configuration: { Format: "c" },
        priceInfo: { currency: "PLN", priceRanges: [{ quantity: 10, price: 1 }] },
        sourceUrl: "https://example.com/c",
      },
      {
        configuration: { Format: "d" },
        priceInfo: { currency: "PLN", priceRanges: [{ quantity: 10, price: 1 }] },
        sourceUrl: "https://example.com/d",
      },
      {
        configuration: { Format: "e" },
        priceInfo: { currency: "PLN", priceRanges: [{ quantity: 10, price: 1 }] },
        sourceUrl: "https://example.com/e",
      },
    ];
    const context: Parameters<
      typeof pickComparableSampledPriceConfigurations
    >[0]["context"] = {
      priceMap: new Map([
        ["format-b", new Map([[10, 100]])],
        ["format-d", new Map([[10, 100]])],
      ]),
      priceType: PriceTypeEnum.MATRIX,
      product: {
        attributeOptions: {},
        attributes: [],
        priceType: PriceTypeEnum.MATRIX,
      } as Product,
      resolveCombinationId: (configuration) => {
        const format = configuration.Format;

        if (format === "b") {
          return "format-b";
        }

        if (format === "d") {
          return "format-d";
        }

        return null;
      },
    };

    const result = pickComparableSampledPriceConfigurations({
      configurations,
      context,
    });

    expect(result).toHaveLength(2);
    expect(result.map((configuration) => configuration.sourceUrl)).toEqual([
      "https://example.com/b",
      "https://example.com/d",
    ]);
    expect(
      result.map((configuration) => configuration.resolvedCombinationId),
    ).toEqual(["format-b", "format-d"]);
  });

  it("treats generic synthetic empty selections as omitted when resolving combinations", () => {
    const result = pickComparableSampledPriceConfigurations({
      configurations: [
        {
          configuration: {
            Delivery: "standard",
            Foil: SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
          },
          priceInfo: {
            currency: "PLN",
            priceRanges: [{ quantity: 10, price: 1 }],
          },
          sourceUrl: "https://example.com/standard",
        },
      ],
      context: {
        priceMap: new Map([["delivery-standard-none", new Map([[10, 100]])]]),
        priceType: PriceTypeEnum.MATRIX,
        product: {
          attributeOptions: {},
          attributes: [],
          priceType: PriceTypeEnum.MATRIX,
        } as Product,
        resolveCombinationId: (configuration) =>
          configuration.Delivery === "standard" && !("Foil" in configuration)
            ? "delivery-standard-none"
            : null,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.resolvedCombinationId).toBe("delivery-standard-none");
  });
});

describe("sampledPriceInfoDiffers", () => {
  it("treats reordered price tiers with normalized casing as unchanged", () => {
    expect(
      sampledPriceInfoDiffers(
        {
          currency: "pln",
          priceRanges: [
            { quantity: 100, price: 1.2345, unit: "PCS" },
            { quantity: 10, price: 2.5 },
          ],
        },
        {
          currency: " PLN ",
          priceRanges: [
            { quantity: 10, price: 2.5 },
            { quantity: 100, price: 1.2345, unit: "pcs" },
          ],
        },
      ),
    ).toBe(false);
  });

  it("detects an actual sampled supplier price drift", () => {
    expect(
      sampledPriceInfoDiffers(
        {
          currency: "PLN",
          priceRanges: [{ quantity: 10, price: 2.5 }],
        },
        {
          currency: "PLN",
          priceRanges: [{ quantity: 10, price: 2.75 }],
        },
      ),
    ).toBe(true);
  });

  it("detects sampled supplier delivery-time drift", () => {
    expect(
      sampledPriceInfoDiffers(
        {
          currency: "PLN",
          priceRanges: [{ quantity: 10, price: 2.5, deliveryTime: 2 }],
        },
        {
          currency: "PLN",
          priceRanges: [{ quantity: 10, price: 2.5, deliveryTime: 4 }],
        },
      ),
    ).toBe(true);
  });

  it("matches unchanged supplier prices after applying stored adjustments", () => {
    const adjustedFetchedPriceInfo = applyConfiguredPriceAdjustments(
      {
        currency: "PLN",
        priceRanges: [{ quantity: 10, price: 2.5 }],
      },
      {
        discountPercent: 5,
        marginPercent: 10,
        taxPercent: 23,
      },
    );

    expect(
      sampledPriceInfoDiffers(
        {
          currency: "PLN",
          priceRanges: [{ quantity: 10, price: 3.2133 }],
        },
        adjustedFetchedPriceInfo,
      ),
    ).toBe(false);
  });
});

describe("compareFetchedPriceInfoToCurrentProductPrices", () => {
  it("matches fetched supplier samples to current product minor-unit prices", () => {
    const result = compareFetchedPriceInfoToCurrentProductPrices({
      currentPrices: new Map([
        [50, 221],
        [100, 118],
        [250, 54],
        [500, 32],
      ]),
      fetchedPriceInfo: {
        currency: "PLN",
        priceRanges: [
          { quantity: 50, price: 2.2072 },
          { quantity: 100, price: 1.1779 },
          { quantity: 250, price: 0.5423 },
          { quantity: 500, price: 0.3248 },
        ],
      },
      priceType: PriceTypeEnum.MATRIX,
    });

    expect(result?.matches).toBe(true);
    expect(result?.comparablePrices).toEqual([
      {
        quantity: 50,
        currentPriceMinorUnits: 221,
        currentPrice: 2.21,
        fetchedPriceMinorUnits: 221,
        fetchedPrice: 2.2072,
      },
      {
        quantity: 100,
        currentPriceMinorUnits: 118,
        currentPrice: 1.18,
        fetchedPriceMinorUnits: 118,
        fetchedPrice: 1.1779,
      },
      {
        quantity: 250,
        currentPriceMinorUnits: 54,
        currentPrice: 0.54,
        fetchedPriceMinorUnits: 54,
        fetchedPrice: 0.5423,
      },
      {
        quantity: 500,
        currentPriceMinorUnits: 32,
        currentPrice: 0.32,
        fetchedPriceMinorUnits: 32,
        fetchedPrice: 0.3248,
      },
    ]);
  });

  it("detects a real product price mismatch after minor-unit normalization", () => {
    const result = compareFetchedPriceInfoToCurrentProductPrices({
      currentPrices: new Map([
        [10, 849],
        [50, 295],
        [100, 183],
      ]),
      fetchedPriceInfo: {
        currency: "PLN",
        priceRanges: [
          { quantity: 10, price: 7.512 },
          { quantity: 50, price: 3.0387 },
          { quantity: 100, price: 1.823 },
        ],
      },
      priceType: PriceTypeEnum.MATRIX,
    });

    expect(result?.matches).toBe(false);
    expect(result?.comparablePrices).toEqual([
      {
        quantity: 10,
        currentPriceMinorUnits: 849,
        currentPrice: 8.49,
        fetchedPriceMinorUnits: 751,
        fetchedPrice: 7.512,
      },
      {
        quantity: 50,
        currentPriceMinorUnits: 295,
        currentPrice: 2.95,
        fetchedPriceMinorUnits: 304,
        fetchedPrice: 3.0387,
      },
      {
        quantity: 100,
        currentPriceMinorUnits: 183,
        currentPrice: 1.83,
        fetchedPriceMinorUnits: 182,
        fetchedPrice: 1.823,
      },
    ]);
  });
});

describe("compareCurrentProductPricesToMinimumProfitablePrice", () => {
  it("treats target-margin drift as acceptable when the current price is still profitable", () => {
    const result = compareCurrentProductPricesToMinimumProfitablePrice({
      currentPrices: new Map([
        [50, 266],
        [100, 143],
        [250, 74],
      ]),
      minimumProfitablePriceInfo: {
        currency: "PLN",
        priceRanges: [
          { quantity: 50, price: 1.6449 },
          { quantity: 100, price: 0.9339 },
          { quantity: 250, price: 0.4713 },
        ],
      },
      priceType: PriceTypeEnum.MATRIX,
    });

    expect(result?.profitable).toBe(true);
    expect(result?.comparablePrices).toEqual([
      {
        quantity: 50,
        currentPriceMinorUnits: 266,
        currentPrice: 2.66,
        minimumProfitablePriceMinorUnits: 164,
        minimumProfitablePrice: 1.6449,
      },
      {
        quantity: 100,
        currentPriceMinorUnits: 143,
        currentPrice: 1.43,
        minimumProfitablePriceMinorUnits: 93,
        minimumProfitablePrice: 0.9339,
      },
      {
        quantity: 250,
        currentPriceMinorUnits: 74,
        currentPrice: 0.74,
        minimumProfitablePriceMinorUnits: 47,
        minimumProfitablePrice: 0.4713,
      },
    ]);
  });

  it("flags the product when the current price drops below the profitable floor", () => {
    const result = compareCurrentProductPricesToMinimumProfitablePrice({
      currentPrices: new Map([
        [50, 160],
        [100, 90],
      ]),
      minimumProfitablePriceInfo: {
        currency: "PLN",
        priceRanges: [
          { quantity: 50, price: 1.6449 },
          { quantity: 100, price: 0.9339 },
        ],
      },
      priceType: PriceTypeEnum.MATRIX,
    });

    expect(result?.profitable).toBe(false);
    expect(result?.comparablePrices).toEqual([
      {
        quantity: 50,
        currentPriceMinorUnits: 160,
        currentPrice: 1.6,
        minimumProfitablePriceMinorUnits: 164,
        minimumProfitablePrice: 1.6449,
      },
      {
        quantity: 100,
        currentPriceMinorUnits: 90,
        currentPrice: 0.9,
        minimumProfitablePriceMinorUnits: 93,
        minimumProfitablePrice: 0.9339,
      },
    ]);
  });
});
