import {
  CurrencyEnum,
  OrderItem,
  Price,
  PriceTypeEnum,
  Product,
} from "@konfi/types";
import { describe, expect, it } from "vitest";
import { applyOrderItemProductPriceOffsets } from "../order-price-offsets";

function createProduct(): Product {
  return {
    attributeOptions: {
      material: ["paper", "vinyl"],
    },
    attributes: ["material"],
    defaultPrice: {
      currency: CurrencyEnum.PLN,
      value: 1000,
    },
    id: "product-1",
    priceOffsets: {
      enabled: true,
      rules: [
        {
          attributeId: "material",
          enabled: true,
          fixedValue: 150,
          id: "vinyl-fee",
          optionValue: "vinyl",
          scope: "attributeOption",
        },
        {
          calculatedCombination: "vinyl",
          enabled: true,
          fixedValue: -50,
          id: "exact-discount",
          scope: "configuration",
          volumeValue: 100,
        },
      ],
    },
    priceType: PriceTypeEnum.MATRIX,
  } as Product;
}

describe("applyOrderItemProductPriceOffsets", () => {
  it("applies effective product prices for checkout validation without mutating source rows", () => {
    const prices: Price[] = [
      {
        combination: {
          active: true,
          customFormat: false,
          id: "vinyl",
        },
        currency: CurrencyEnum.PLN,
        value: 1000,
        volume: {
          deliveryTime: 2,
          value: 100,
        },
      },
    ];
    const item = {
      calculatedCombination: "vinyl",
      pageCount: 12,
      volume: 100,
    } as OrderItem;

    const result = applyOrderItemProductPriceOffsets({
      item,
      prices,
      product: createProduct(),
    });

    expect(result[0]?.value).toBe(1100);
    expect(result[0]).not.toBe(prices[0]);
    expect(result[0]?.volume).not.toBe(prices[0]?.volume);
    expect(prices[0]?.value).toBe(1000);
  });
});
