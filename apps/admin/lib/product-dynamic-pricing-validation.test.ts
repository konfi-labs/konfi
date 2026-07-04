import { describe, expect, it } from "vitest";
import {
  type DynamicPricingConfig,
  type DynamicPricingPreset,
  PriceTypeEnum,
} from "@konfi/types";
import { validateDynamicProductPricing } from "./product-dynamic-pricing-validation";

function createConfig(
  overrides: Partial<DynamicPricingConfig> = {},
): DynamicPricingConfig {
  return {
    attributeRules: [],
    basePrice: 0,
    enabled: true,
    globalRules: [],
    ...overrides,
  };
}

describe("validateDynamicProductPricing", () => {
  it("allows non-dynamic products", () => {
    expect(
      validateDynamicProductPricing({
        priceType: PriceTypeEnum.SINGLE,
      }),
    ).toEqual({ isValid: true });
  });

  it("rejects dynamic products without enabled dynamic pricing", () => {
    expect(
      validateDynamicProductPricing({
        dynamicPricing: createConfig({ enabled: false }),
        priceType: PriceTypeEnum.DYNAMIC,
      }),
    ).toEqual({
      errorKey: "dynamicPricingRequired",
      isValid: false,
    });
  });

  it("rejects dynamic products with no positive price contributor", () => {
    expect(
      validateDynamicProductPricing({
        dynamicPricing: createConfig(),
        priceType: PriceTypeEnum.DYNAMIC,
      }),
    ).toEqual({
      errorKey: "dynamicPricingMustHavePriceRule",
      isValid: false,
    });
  });

  it("accepts dynamic products with a positive global price rule", () => {
    expect(
      validateDynamicProductPricing({
        dynamicPricing: createConfig({
          globalRules: [
            {
              calculator: "fixed",
              fixedValue: 100,
              id: "setup",
              label: "Setup",
              target: "price",
            },
          ],
        }),
        priceType: PriceTypeEnum.DYNAMIC,
      }),
    ).toEqual({ isValid: true });
  });

  it("accepts dynamic products whose linked preset provides a price rule", () => {
    const presets: DynamicPricingPreset[] = [
      {
        globalRule: {
          calculator: "tier",
          fixedValue: 250,
          id: "preset-tier",
          label: "Preset tier",
          minimumMetricValue: 1,
          target: "price",
        },
        id: "preset-tier",
        kind: "global",
        label: "Preset tier",
      },
    ];

    expect(
      validateDynamicProductPricing({
        dynamicPricing: createConfig({
          linkedPresetIds: ["preset-tier"],
        }),
        dynamicPricingPresets: presets,
        priceType: PriceTypeEnum.DYNAMIC,
      }),
    ).toEqual({ isValid: true });
  });
});
