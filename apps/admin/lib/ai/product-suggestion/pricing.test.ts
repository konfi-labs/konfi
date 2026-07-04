import { PriceTypeEnum, Product } from "@konfi/types";
import { describe, expect, it, vi } from "vitest";
import {
  ProductSuggestionDynamicPricingReaders,
  resolveDynamicProductSuggestionPrices,
} from "./pricing";

function createTimestamp(date: Date) {
  return {
    toDate: () => date,
  };
}

function createProduct(overrides?: Partial<Product>): Product {
  return {
    active: true,
    attributes: ["material"],
    attributeDependencies: {},
    attributeOptions: {
      material: ["paper", "vinyl"],
    },
    availability: {
      availableForPurchase: true,
      published: true,
      publication: createTimestamp(new Date(Date.now() - 60_000)),
    },
    customSize: false,
    defaultPrice: {
      currency: "PLN",
    },
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
    id: "product-1",
    priceType: PriceTypeEnum.DYNAMIC,
    spec: {
      defaultOrder: 10,
      maximumOrder: 100,
      minimumOrder: 10,
    },
    volumes: [{ value: 10 }],
    ...overrides,
  } as Product;
}

function createReaders(): ProductSuggestionDynamicPricingReaders {
  return {
    getDynamicPricingAttributes: vi.fn(async () => []),
    getDynamicPricingPresetsByIds: vi.fn(async () => []),
    getProductDynamicPricing: vi.fn(async () => undefined),
  };
}

describe("product suggestion pricing", () => {
  it("builds generated prices for dynamic products", async () => {
    const prices = await resolveDynamicProductSuggestionPrices({
      calculatedCombination: "vinyl",
      channelId: "channel-1",
      combination: "vinyl",
      customFormat: false,
      height: 0,
      product: createProduct(),
      quantity: 10,
      readers: createReaders(),
      selectedAttributeOptions: {
        material: "vinyl",
      },
      volume: 10,
      width: 0,
    });

    expect(prices).toMatchObject([
      {
        combination: {
          id: "vinyl",
        },
        value: 1200,
      },
    ]);
  });

  it("falls back to subcollection dynamic pricing config for trimmed products", async () => {
    const readers = createReaders();
    readers.getProductDynamicPricing = vi.fn(async () => ({
      attributeRules: [],
      baseDeliveryTime: 2,
      basePrice: 900,
      enabled: true,
      globalRules: [],
      linkedPresetIds: [],
    }));

    const prices = await resolveDynamicProductSuggestionPrices({
      calculatedCombination: "paper",
      channelId: "channel-1",
      combination: "paper",
      customFormat: false,
      height: 0,
      product: createProduct({
        dynamicPricing: undefined,
      }),
      quantity: 10,
      readers,
      selectedAttributeOptions: {
        material: "paper",
      },
      volume: 10,
      width: 0,
    });

    expect(prices).toMatchObject([
      {
        combination: {
          id: "paper",
        },
        value: 900,
      },
    ]);
    expect(readers.getProductDynamicPricing).toHaveBeenCalledWith(
      "channel-1",
      "product-1",
    );
  });
});
