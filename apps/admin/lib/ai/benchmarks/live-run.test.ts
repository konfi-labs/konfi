import { describe, expect, it } from "vitest";

import { PriceTypeEnum, ShippingOptions, Unit } from "@konfi/types";
import { summarizeLiveRunBenchmarkOutput } from "./live-run";

describe("summarizeLiveRunBenchmarkOutput", () => {
  it("summarizes order benchmark output", () => {
    const summary = summarizeLiveRunBenchmarkOutput({
      taskType: "order",
      output: {
        customer: { id: "customer-1", name: "Acme" },
        items: [
          {
            customFormat: false,
            customPrice: null,
            description: "Business cards",
            discount: { amount: 0, type: "PERCENTAGE" },
            id: "item-1",
            productId: "product-1",
            productName: "Business cards",
            quantity: 250,
            totalPrice: 120,
            unit: Unit.PIECES,
          },
        ],
        shippingOption: ShippingOptions.COURIER,
        shippingPrice: 20,
        totalPrice: 140,
      },
    });

    expect(summary.taskType).toBe("order");
    expect(summary.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "customer", value: "Acme" }),
        expect.objectContaining({ field: "itemCount", value: "1" }),
        expect.objectContaining({
          field: "items",
          value: "250x Business cards",
        }),
      ]),
    );
  });

  it("summarizes product benchmark output", () => {
    const summary = summarizeLiveRunBenchmarkOutput({
      taskType: "product",
      output: {
        blockedItems: [],
        draft: {
          blockedItems: [],
          grossPrices: true,
          missingAttributes: [],
          missingOptions: [],
          priceType: PriceTypeEnum.MATRIX,
          priceTypeReason: "Source table contains quantity tiers.",
          product: {
            name: "Flyers",
            prices: [{ price: 100 }],
          },
          readyForCreate: true,
          reviewSummary: "Ready",
          selectedAttributes: [
            {
              attributeId: "paper",
              attributeName: "Paper",
              optionValues: ["mat"],
            },
          ],
          sourcePrompt: "Create flyers",
        },
        readyForCreate: true,
      },
    });

    expect(summary.taskType).toBe("product");
    expect(summary.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "productName", value: "Flyers" }),
        expect.objectContaining({ field: "readyForCreate", value: "true" }),
        expect.objectContaining({ field: "priceRows", value: "1" }),
      ]),
    );
  });
});
