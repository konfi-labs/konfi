import { describe, expect, it } from "vitest";
import { PriceTypeEnum } from "@konfi/types";
import { canUseProductForAllegroImport } from "../allegro-import-settings";

describe("allegro import settings helpers", () => {
  it("accepts single-price products with custom price enabled", () => {
    expect(
      canUseProductForAllegroImport({
        allowCustomPrice: true,
        priceType: PriceTypeEnum.SINGLE,
      }),
    ).toBe(true);
  });

  it("rejects products without custom price enabled", () => {
    expect(
      canUseProductForAllegroImport({
        allowCustomPrice: false,
        priceType: PriceTypeEnum.SINGLE,
      }),
    ).toBe(false);
  });

  it("rejects matrix-priced products", () => {
    expect(
      canUseProductForAllegroImport({
        allowCustomPrice: true,
        priceType: PriceTypeEnum.MATRIX,
      }),
    ).toBe(false);
  });
});