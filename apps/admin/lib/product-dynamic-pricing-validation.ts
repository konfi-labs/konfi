import {
  type DynamicPricingConfig,
  type DynamicPricingGlobalRule,
  type DynamicPricingPreset,
  PriceTypeEnum,
} from "@konfi/types";
import { resolveDynamicPricingConfig } from "@konfi/utils";

export interface DynamicProductPricingValidationResult {
  errorKey?: "dynamicPricingRequired" | "dynamicPricingMustHavePriceRule";
  isValid: boolean;
}

function hasPositiveNumber(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasPositivePriceGlobalRule(rule: DynamicPricingGlobalRule): boolean {
  if (rule.target !== "price") {
    return false;
  }

  if (rule.calculator === "fixed" || rule.calculator === "tier") {
    return hasPositiveNumber(rule.fixedValue) ||
      hasPositiveNumber(rule.minimumOutputValue) ||
      hasPositiveNumber(rule.maximumOutputValue);
  }

  if (rule.calculator === "multiplier") {
    return hasPositiveNumber(rule.multiplier);
  }

  return hasPositiveNumber(rule.minimumOutputValue) ||
    hasPositiveNumber(rule.maximumOutputValue);
}

function hasPositivePriceAttributeRule(
  config: DynamicPricingConfig,
): boolean {
  return config.attributeRules.some((rule) =>
    rule.mode === "adjust" &&
    rule.adjustments.some((adjustment) =>
      hasPositiveNumber(adjustment.priceAdjustment)
    )
  );
}

export function validateDynamicProductPricing(input: {
  dynamicPricing?: DynamicPricingConfig;
  dynamicPricingPresets?: DynamicPricingPreset[];
  priceType: PriceTypeEnum;
}): DynamicProductPricingValidationResult {
  if (input.priceType !== PriceTypeEnum.DYNAMIC) {
    return { isValid: true };
  }

  if (!input.dynamicPricing?.enabled) {
    return {
      errorKey: "dynamicPricingRequired",
      isValid: false,
    };
  }

  const config = resolveDynamicPricingConfig(
    input.dynamicPricing,
    input.dynamicPricingPresets ?? [],
  );

  if (
    hasPositiveNumber(config.basePrice) ||
    hasPositivePriceAttributeRule(config) ||
    config.globalRules.some(hasPositivePriceGlobalRule)
  ) {
    return { isValid: true };
  }

  return {
    errorKey: "dynamicPricingMustHavePriceRule",
    isValid: false,
  };
}
