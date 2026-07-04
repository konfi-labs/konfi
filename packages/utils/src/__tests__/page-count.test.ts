import {
  CurrencyEnum,
  Price,
  PriceTypeEnum,
  ProductPageCountConfig,
} from "@konfi/types";
import {
  buildPageCountPriceDocumentId,
  calculateConfiguredProductPrice,
  formatPageCountBreakdown,
  getExactPageCountPriceSet,
  getPageCountSegment,
  getPageCountPricingMode,
  getPageCountValues,
  isPageCountAllowed,
  getSegmentedPageCountPriceSet,
  normalizePageCount,
  resolvePageCountConfigForSelection,
} from "../page-count";

describe("page-count helpers", () => {
  const pageCountConfig: ProductPageCountConfig = {
    enabled: true,
    minimum: 8,
    maximum: 24,
    step: 4,
    coverPages: 4,
  };

  it("normalizes page counts to the configured range and step", () => {
    expect(normalizePageCount(undefined, pageCountConfig)).toBe(8);
    expect(normalizePageCount(10, pageCountConfig)).toBe(12);
    expect(normalizePageCount(26, pageCountConfig)).toBe(24);
  });

  it("formats the static cover-page breakdown", () => {
    expect(formatPageCountBreakdown(12, pageCountConfig)).toBe("12 + 4");
  });

  it("returns the allowed configured page-count values", () => {
    expect(getPageCountValues(pageCountConfig)).toEqual([8, 12, 16, 20, 24]);
  });

  it("narrows page-count ranges from selected attribute constraints", () => {
    const constrainedConfig: ProductPageCountConfig = {
      ...pageCountConfig,
      maximum: 64,
      constraints: [
        {
          conditions: [
            {
              attributeId: "paper",
              optionValues: ["premium"],
            },
          ],
          maximum: 32,
        },
      ],
    };

    expect(
      resolvePageCountConfigForSelection(constrainedConfig, {
        paper: "premium",
      })?.maximum,
    ).toBe(32);
    expect(getPageCountValues(constrainedConfig, { paper: "premium" })).toEqual(
      [8, 12, 16, 20, 24, 28, 32],
    );
    expect(
      normalizePageCount(60, constrainedConfig, { paper: "premium" }),
    ).toBe(32);
    expect(
      isPageCountAllowed(60, constrainedConfig, { paper: "premium" }),
    ).toBe(false);
  });

  it("detects exact pricing mode and resolves the exact page-count slice", () => {
    const exactConfig: ProductPageCountConfig = {
      ...pageCountConfig,
      pricing: {
        mode: "exact",
        exactPrices: [
          {
            pageCount: 8,
            prices: [{ value: 1000, currency: CurrencyEnum.PLN }],
          },
          {
            pageCount: 12,
            prices: [{ value: 1200, currency: CurrencyEnum.PLN }],
          },
        ],
      },
    };

    expect(getPageCountPricingMode(exactConfig.pricing)).toBe("exact");
    expect(getExactPageCountPriceSet(10, exactConfig)?.pageCount).toBe(12);
  });

  it("detects segmented pricing mode and resolves the active segment", () => {
    const segmentedConfig: ProductPageCountConfig = {
      ...pageCountConfig,
      pricing: {
        mode: "segmented",
        segments: [
          { minimum: 8, maximum: 16 },
          { minimum: 20, maximum: 24 },
        ],
        segmentPrices: [
          {
            minimum: 8,
            maximum: 16,
            basePrices: [{ value: 1000, currency: CurrencyEnum.PLN }],
            stepPrices: [{ value: 200, currency: CurrencyEnum.PLN }],
          },
          {
            minimum: 20,
            maximum: 24,
            basePrices: [{ value: 1700, currency: CurrencyEnum.PLN }],
            stepPrices: [{ value: 100, currency: CurrencyEnum.PLN }],
          },
        ],
      },
    };

    expect(getPageCountPricingMode(segmentedConfig.pricing)).toBe("segmented");
    expect(getPageCountSegment(22, segmentedConfig)).toEqual({
      maximum: 24,
      minimum: 20,
    });
    expect(getSegmentedPageCountPriceSet(22, segmentedConfig)?.minimum).toBe(
      20,
    );
  });

  it("builds stable document ids for exact page-count prices", () => {
    expect(buildPageCountPriceDocumentId(12, "paper-mat")).toBe(
      "12__pageCount__paper-mat",
    );
  });

  it("adds the configured step surcharge to the base price", () => {
    const basePrices: Price[] = [
      {
        value: 1000,
        currency: CurrencyEnum.PLN,
        combination: { id: "default", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 3 },
      },
    ];
    const stepPrices: Price[] = [
      {
        value: 250,
        currency: CurrencyEnum.PLN,
        combination: { id: "default", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 3 },
      },
    ];

    const result = calculateConfiguredProductPrice({
      quantity: 1,
      prices: basePrices,
      priceType: PriceTypeEnum.SINGLE,
      customFormat: false,
      minimumOrder: 1,
      pageCount: 16,
      pageCountConfig: {
        ...pageCountConfig,
        pricing: { stepPrices },
      },
    });

    expect(result.result).toBe(1500);
  });

  it("counts segmented step surcharges from the active segment minimum", () => {
    const basePrices: Price[] = [
      {
        value: 1700,
        currency: CurrencyEnum.PLN,
        combination: { id: "default", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 3 },
      },
    ];
    const segmentStepPrices: Price[] = [
      {
        value: 100,
        currency: CurrencyEnum.PLN,
        combination: { id: "default", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 3 },
      },
    ];

    const result = calculateConfiguredProductPrice({
      quantity: 1,
      prices: basePrices,
      priceType: PriceTypeEnum.SINGLE,
      customFormat: false,
      minimumOrder: 1,
      pageCount: 24,
      pageCountConfig: {
        ...pageCountConfig,
        pricing: {
          mode: "segmented",
          segments: [
            { minimum: 8, maximum: 16 },
            { minimum: 20, maximum: 24 },
          ],
          stepPrices: segmentStepPrices,
        },
      },
    });

    expect(result.result).toBe(1800);
  });
});
