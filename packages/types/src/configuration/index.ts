export * from "./attribute";
export * from "./business-taxonomy";
export * from "./cms";
export * from "./currencies";
export * from "./designated-pickup-area";
export * from "./internal-transit";
export * from "./member";
export * from "./metadata";
export * from "./option";
export * from "./pages";
export * from "./advanced-attribute";
export * from "./ai-instructions";
export * from "./printing-methods";
export * from "./production-grouping";
export * from "./shipping-methods";
export * from "./payment-methods";
export * from "./order-workflow-statuses";
export * from "./order-rule-presets";
export * from "./support-taxonomy";
export * from "./units-proofing";
export * from "./product-type";
export * from "./quantity-options";
export * from "./settings";
export * from "./warehouse";

import { AdvancedAttributeSelection } from "./advanced-attribute";

export interface CustomSizeWithQuantity {
  width: number;
  height: number;
  quantity: number;
}

/**
 * Allows overriding product spec values for admin-only use cases.
 * Each property, when set, will override the corresponding product.spec property.
 */
export interface SpecOverrides {
  minimumOrder?: number;
  maximumOrder?: number;
  step?: number;
  minimumWidth?: number;
  maximumWidth?: number;
  widthStep?: number;
  minimumHeight?: number;
  maximumHeight?: number;
  heightStep?: number;
  minimumRatio?: number;
  maximumRatio?: number;
}

export interface Configuration {
  productId: string;
  combination: string | null;
  calculatedCombination: string | null;
  descriptionCombination: string | null;
  selectedAttributeOptions:
    | { [key: string]: string | number }
    | undefined
    | null;
  quantity: number;
  volume: number | undefined;
  pageCount?: number | null;
  customFormat: boolean;
  width: number;
  height: number;
  customSizes?: CustomSizeWithQuantity[];
  preview?: {
    width: number;
    height: number;
    pages: number;
  };
  advancedAttributeSelections?: Record<string, AdvancedAttributeSelection>;
}
