import { CurrencyEnum } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { buildImportedMatrixRangeFallbackPrices } from "./imported-matrix-fallback";

describe("buildImportedMatrixRangeFallbackPrices", () => {
  it("broadcasts base price ranges when no config-specific prices exist", () => {
    expect(
      buildImportedMatrixRangeFallbackPrices({
        currency: CurrencyEnum.PLN,
        priceConfigurationsCount: 0,
        priceRanges: [
          { deliveryTime: 4, price: 1200, quantity: 100 },
          { price: 2100, quantity: 250 },
        ],
        targetCombinationIds: ["matte", "gloss"],
      }),
    ).toEqual([
      {
        combination: { active: true, customFormat: false, id: "matte" },
        currency: CurrencyEnum.PLN,
        value: 1200,
        volume: { deliveryTime: 4, value: 100 },
      },
      {
        combination: { active: true, customFormat: false, id: "matte" },
        currency: CurrencyEnum.PLN,
        value: 2100,
        volume: { deliveryTime: 2, value: 250 },
      },
      {
        combination: { active: true, customFormat: false, id: "gloss" },
        currency: CurrencyEnum.PLN,
        value: 1200,
        volume: { deliveryTime: 4, value: 100 },
      },
      {
        combination: { active: true, customFormat: false, id: "gloss" },
        currency: CurrencyEnum.PLN,
        value: 2100,
        volume: { deliveryTime: 2, value: 250 },
      },
    ]);
  });

  it("does not smear fallback ranges across combinations when config-specific prices exist", () => {
    expect(
      buildImportedMatrixRangeFallbackPrices({
        currency: CurrencyEnum.PLN,
        priceConfigurationsCount: 3,
        priceRanges: [{ price: 1200, quantity: 100 }],
        targetCombinationIds: ["matte", "gloss"],
      }),
    ).toEqual([]);
  });
});
