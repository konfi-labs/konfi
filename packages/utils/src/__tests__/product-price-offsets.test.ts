import { CurrencyEnum, Price, PriceTypeEnum } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  applyProductPriceOffsets,
  getEffectiveProductListingPrices,
  normalizeProductPriceOffsetsConfig,
  ProductPriceOffsetProduct,
} from "../product-price-offsets";
import { getProductListingPrices } from "../product-listing-prices";

function createProduct(
  priceOffsets: ProductPriceOffsetProduct["priceOffsets"],
): ProductPriceOffsetProduct {
  return {
    attributeOptions: {
      finish: ["matte", "gloss"],
      material: ["paper", "vinyl"],
    },
    attributes: ["material", "finish"],
    priceOffsets,
  };
}

function createPrice(overrides: Partial<Price> = {}): Price {
  return {
    combination: {
      active: true,
      customFormat: false,
      id: "vinyl-gloss",
    },
    currency: CurrencyEnum.PLN,
    value: 1000,
    volume: {
      deliveryTime: 2,
      value: 100,
    },
    ...overrides,
  };
}

describe("product price offsets", () => {
  it("applies product, attribute option, and exact configuration rules in deterministic order", () => {
    const product = createProduct({
      enabled: true,
      rules: [
        {
          enabled: true,
          fixedValue: 50,
          id: "product",
          percent: 10,
          scope: "product",
        },
        {
          attributeId: "material",
          enabled: true,
          id: "attribute",
          optionValue: "vinyl",
          percent: -20,
          scope: "attributeOption",
        },
        {
          calculatedCombination: "vinyl-gloss",
          enabled: true,
          fixedValue: -30,
          id: "exact",
          pageCount: 16,
          scope: "configuration",
          volumeValue: 100,
        },
      ],
    });

    const [price] = applyProductPriceOffsets({
      pageCount: 16,
      prices: [createPrice()],
      product,
    });

    expect(price.value).toBe(890);
  });

  it("rounds after each rule, clamps below zero, and does not mutate source rows", () => {
    const product = createProduct({
      enabled: true,
      rules: [
        {
          enabled: true,
          fixedValue: 25,
          id: "round",
          percent: 10,
          scope: "product",
        },
        {
          enabled: true,
          fixedValue: -500,
          id: "clamp",
          scope: "product",
        },
      ],
    });
    const prices = [createPrice({ value: 101 })];
    const originalPrice = {
      ...prices[0],
      combination: { ...prices[0].combination },
      volume: { ...prices[0].volume },
    };

    const [price] = applyProductPriceOffsets({ prices, product });

    expect(price.value).toBe(0);
    expect(price).not.toBe(prices[0]);
    expect(price.combination).not.toBe(prices[0].combination);
    expect(price.volume).not.toBe(prices[0].volume);
    expect(prices[0]).toEqual(originalPrice);
  });

  it("uses explicit selected attribute options before falling back to row combinations", () => {
    const product = createProduct({
      enabled: true,
      rules: [
        {
          attributeId: "material",
          enabled: true,
          fixedValue: 200,
          id: "selected-material",
          optionValue: "vinyl",
          scope: "attributeOption",
        },
      ],
    });

    const [price] = applyProductPriceOffsets({
      prices: [
        createPrice({
          combination: {
            active: true,
            customFormat: false,
            id: "paper-matte",
          },
        }),
      ],
      product,
      selectedAttributeOptions: {
        material: "vinyl",
      },
    });

    expect(price.value).toBe(1200);
  });

  it("clones prices without changing values when offsets are disabled", () => {
    const prices = [createPrice()];
    const [price] = applyProductPriceOffsets({
      prices,
      product: createProduct({
        enabled: false,
        rules: [
          {
            enabled: true,
            fixedValue: 500,
            id: "disabled-config",
            scope: "product",
          },
        ],
      }),
    });

    expect(price.value).toBe(1000);
    expect(price).not.toBe(prices[0]);
  });

  it("normalizes valid persisted configs and drops incomplete rules", () => {
    expect(
      normalizeProductPriceOffsetsConfig({
        enabled: true,
        rules: [
          {
            enabled: true,
            fixedValue: 100,
            id: "valid",
            scope: "product",
          },
          {
            fixedValue: 50,
            id: "missing-option",
            scope: "attributeOption",
          },
          {
            fixedValue: 50,
            id: "missing-combination",
            scope: "configuration",
          },
        ],
      }),
    ).toEqual({
      enabled: true,
      rules: [
        {
          enabled: true,
          fixedValue: 100,
          id: "valid",
          scope: "product",
        },
      ],
    });
  });

  it("calculates effective listing prices from source rows without mutating them", () => {
    const product = {
      ...createProduct({
        enabled: true,
        rules: [
          {
            enabled: true,
            id: "product",
            percent: 10,
            scope: "product",
          },
          {
            attributeId: "material",
            enabled: true,
            fixedValue: -100,
            id: "vinyl",
            optionValue: "vinyl",
            scope: "attributeOption",
          },
        ],
      }),
      defaultPrice: createPrice({ value: 1000 }),
      highPrice: createPrice({ value: 1000 }),
      lowPrice: createPrice({ value: 800 }),
      prices: [
        createPrice({
          combination: {
            active: true,
            customFormat: false,
            id: "paper-matte",
          },
          value: 1000,
        }),
        createPrice({ value: 800 }),
      ],
      spec: {
        defaultOrder: 100,
        images: [],
        maximumOrder: 1000,
        minimumOrder: 100,
        step: 100,
      },
    };

    const result = getEffectiveProductListingPrices(product);

    expect(result.defaultPrice.value).toBe(1000);
    expect(result.lowPrice.value).toBe(780);
    expect(result.highPrice.value).toBe(1100);
    expect(product.prices[1].value).toBe(800);
  });

  it("calculates dynamic listing prices with attribute option offsets", () => {
    const result = getProductListingPrices({
      attributeDependencies: {},
      attributeOptions: {
        material: ["paper", "vinyl"],
      },
      attributes: ["material"],
      customSize: false,
      defaultPrice: createPrice({ value: 1000 }),
      dynamicPricing: {
        attributeRules: [
          {
            adjustments: [{ optionValue: "vinyl", priceAdjustment: 200 }],
            attributeId: "material",
            mode: "adjust",
          },
        ],
        baseDeliveryTime: 2,
        basePrice: 1000,
        enabled: true,
        globalRules: [],
        linkedPresetIds: [],
      },
      highPrice: createPrice({ value: 1200 }),
      lowPrice: createPrice({ value: 1000 }),
      pageCount: undefined,
      priceOffsets: {
        enabled: true,
        rules: [
          {
            attributeId: "material",
            enabled: true,
            fixedValue: -300,
            id: "vinyl-discount",
            optionValue: "vinyl",
            scope: "attributeOption",
          },
        ],
      },
      priceType: PriceTypeEnum.DYNAMIC,
      prices: [],
      spec: {
        defaultOrder: 10,
        images: [],
        maximumOrder: 100,
        minimumOrder: 10,
        step: 10,
      },
      volumes: [{ value: 10 }],
    });

    expect(result.lowPrice.value).toBe(900);
    expect(result.highPrice.value).toBe(1000);
  });
});
