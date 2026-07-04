import { describe, expect, it } from "vitest";

import {
  compareProductBenchmarkOutput,
  summarizeProductForBenchmark,
} from "./product-comparison";
import {
  CurrencyEnum,
  PriceTypeEnum,
  ShippingTypes,
  Unit,
  type Product,
} from "@konfi/types";

const baseProduct: Product = {
  active: true,
  allowCustomPrice: false,
  attributeDependencies: {},
  attributeOptions: {
    paper: ["mat"],
    size: ["a4"],
  },
  attributes: ["paper", "size"],
  availability: {
    availableForPurchase: true,
    published: true,
  },
  averageRating: 0,
  category: { id: "category-1", name: "Print" },
  createdAt: new Date(),
  createdBy: { id: "admin", name: "Admin" },
  customSize: false,
  defaultPrice: {
    currency: CurrencyEnum.PLN,
    value: 100,
    volume: { deliveryTime: 2, value: 100 },
  },
  description: "Matte flyers",
  difficulty: 1,
  highPrice: {
    currency: CurrencyEnum.PLN,
    value: 100,
    volume: { deliveryTime: 2, value: 100 },
  },
  id: "product-1",
  keywords: [],
  linkedChannels: [],
  lowPrice: {
    currency: CurrencyEnum.PLN,
    value: 100,
    volume: { deliveryTime: 2, value: 100 },
  },
  name: "Flyers",
  prefferedUnit: Unit.PCS,
  priceType: PriceTypeEnum.MATRIX,
  prices: [
    {
      currency: CurrencyEnum.PLN,
      value: 100,
      volume: { deliveryTime: 2, value: 100 },
    },
  ],
  productType: { id: "leaflets", name: "Leaflets" },
  recommended: false,
  seo: {
    description: "Flyers",
    slug: "flyers",
    title: "Flyers",
  },
  shipping: {
    types: [ShippingTypes.COURIER],
  },
  spec: {
    defaultOrder: 100,
    images: [],
    maximumOrder: 10000,
    minimumOrder: 100,
    step: 100,
  },
  updatedAt: new Date(),
  updatedBy: { id: "admin", name: "Admin" },
  volumes: [{ value: 100 }],
};

describe("compareProductBenchmarkOutput", () => {
  it("scores a matching generated product", () => {
    const comparison = compareProductBenchmarkOutput({
      expectedProduct: baseProduct,
      generatedData: {
        blockedItems: [],
        draft: {
          blockedItems: [],
          grossPrices: true,
          missingAttributes: [],
          missingOptions: [],
          priceType: PriceTypeEnum.MATRIX,
          priceTypeReason: "Matrix prices from the target product.",
          product: {
            ...baseProduct,
          },
          readyForCreate: true,
          reviewSummary: "Ready",
          selectedAttributes: [
            {
              attributeId: "paper",
              attributeName: "Paper",
              optionValues: ["mat"],
            },
            {
              attributeId: "size",
              attributeName: "Size",
              optionValues: ["a4"],
            },
          ],
          sourcePrompt: "Create flyers",
        },
        readyForCreate: true,
      },
    });

    expect(comparison.percentage).toBe(100);
    expect(comparison.summary.mismatchedFields).toBe(0);
  });

  it("summarizes product targets", () => {
    expect(summarizeProductForBenchmark(baseProduct)).toEqual({
      attributeCount: 2,
      id: "product-1",
      name: "Flyers",
      priceRows: 1,
      priceType: PriceTypeEnum.MATRIX,
    });
  });
});
