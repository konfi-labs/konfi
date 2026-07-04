import { describe, expect, it } from "vitest";
import { PriceTypeEnum } from "@konfi/types";
import { resolveQuotePricingQuantities } from "./quote-pricing";

describe("resolveQuotePricingQuantities", () => {
  it("uses requested volume as quantity for non-matrix products", () => {
    expect(
      resolveQuotePricingQuantities({
        defaultOrder: 1,
        itemVolume: 30,
        priceType: PriceTypeEnum.THRESHOLD,
      }),
    ).toEqual({
      isMatrixLike: false,
      quantity: 30,
      volume: 30,
    });
  });

  it("keeps matrix quantity separate from selected volume", () => {
    expect(
      resolveQuotePricingQuantities({
        defaultOrder: 1,
        itemVolume: 30,
        priceType: PriceTypeEnum.MATRIX,
      }),
    ).toEqual({
      isMatrixLike: true,
      quantity: 1,
      volume: 30,
    });
  });

  it("falls back to quantity before product default order", () => {
    expect(
      resolveQuotePricingQuantities({
        defaultOrder: 100,
        itemQuantity: 50,
        priceType: PriceTypeEnum.SINGLE,
      }),
    ).toEqual({
      isMatrixLike: false,
      quantity: 50,
      volume: 50,
    });
  });
});