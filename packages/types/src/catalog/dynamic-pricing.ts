export type DynamicPricingMetric =
  | "quantity"
  | "volume"
  | "pageCount"
  | "width"
  | "height"
  | "area"
  | "perimeter"
  | "itemsPerSheet"
  | "sheetsNeeded"
  | "innerSheetsPerUnit"
  | "coverSheetsPerUnit"
  | "totalSheetsPerUnit"
  | "innerSheetVolume"
  | "coverSheetVolume"
  | "totalSheetVolume";

export type DynamicPricingTarget = "price" | "deliveryTime";

export type DynamicPricingCalculator =
  | "fixed"
  | "multiplier"
  | "range"
  | "tier";

export interface DynamicPricingInput {
  id: string;
  label: string;
  value: number;
  unit?: string;
}

export interface DynamicPricingCondition {
  attributeId: string;
  optionValues: string[];
}

export interface DynamicPricingAttributeAdjustment {
  optionValue: string;
  priceAdjustment?: number;
  deliveryTimeAdjustment?: number;
}

export interface DynamicPricingAttributeRule {
  attributeId: string;
  mode: "ignore" | "adjust";
  adjustments: DynamicPricingAttributeAdjustment[];
}

export interface DynamicPricingGlobalRule {
  id: string;
  label: string;
  target: DynamicPricingTarget;
  calculator: DynamicPricingCalculator;
  fixedValue?: number;
  multiplier?: number;
  metric?: DynamicPricingMetric;
  inputId?: string;
  outputMultiplierMetric?: DynamicPricingMetric;
  outputMultiplierInputId?: string;
  minimumMetricValue?: number;
  maximumMetricValue?: number;
  minimumOutputValue?: number;
  maximumOutputValue?: number;
  inverse?: boolean;
  conditions?: DynamicPricingCondition[];
}

export type DynamicPricingPresetKind = "attribute" | "global";

export interface DynamicPricingPreset {
  id: string;
  label: string;
  description?: string;
  kind: DynamicPricingPresetKind;
  attributeRule?: DynamicPricingAttributeRule;
  globalRule?: DynamicPricingGlobalRule;
}

export interface DynamicPricingConfig {
  enabled: boolean;
  basePrice: number;
  baseDeliveryTime?: number;
  inputs?: DynamicPricingInput[];
  linkedPresetIds?: string[];
  globalRules: DynamicPricingGlobalRule[];
  attributeRules: DynamicPricingAttributeRule[];
}
