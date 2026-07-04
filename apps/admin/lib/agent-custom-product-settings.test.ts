import { describe, expect, it } from "vitest";
import { PriceTypeEnum } from "@konfi/types";
import { canUseProductForAgentCustomProduct } from "./agent-custom-product-settings";

describe("agent custom product settings", () => {
  it("accepts single-price products with custom price enabled", () => {
    expect(
      canUseProductForAgentCustomProduct({
        allowCustomPrice: true,
        priceType: PriceTypeEnum.SINGLE,
      }),
    ).toBe(true);
  });

  it("rejects products without custom price enabled", () => {
    expect(
      canUseProductForAgentCustomProduct({
        allowCustomPrice: false,
        priceType: PriceTypeEnum.SINGLE,
      }),
    ).toBe(false);
  });

  it("rejects non-single products", () => {
    expect(
      canUseProductForAgentCustomProduct({
        allowCustomPrice: true,
        priceType: PriceTypeEnum.MATRIX,
      }),
    ).toBe(false);
  });
});
