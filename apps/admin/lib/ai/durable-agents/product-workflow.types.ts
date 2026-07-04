import type {
  AttributeInputTypeEnum,
  PriceTypeEnum,
  Product,
} from "@konfi/types";

export interface ProductAgentPricingDiagnostic {
  label: string;
  reason: string;
  severity: "error" | "warning";
  suggestedAction: string;
}

export interface ProductAgentPricingPreviewRow {
  combination?: string;
  deliveryTime?: number | null;
  label: string;
  quantity: number;
  totalPrice?: number;
  unitPrice?: number;
  volume?: number;
}

export interface ProductAgentPricingPreview {
  diagnostics: ProductAgentPricingDiagnostic[];
  rows: ProductAgentPricingPreviewRow[];
}

export type ProductAgentBlockedItemType =
  | "attribute"
  | "category"
  | "field"
  | "option"
  | "price"
  | "productType";

export interface ProductAgentBlockedItem {
  type: ProductAgentBlockedItemType;
  label: string;
  reason: string;
  suggestedAction: string;
  attributeId?: string;
  optionValue?: string;
}

export interface ProductAgentMissingAttribute {
  name: string;
  reason: string;
  suggestedType: AttributeInputTypeEnum;
  options: Array<{
    label: string;
    value: string;
  }>;
}

export interface ProductAgentMissingOption {
  attributeId: string;
  attributeName: string;
  options: Array<{
    label: string;
    value: string;
  }>;
}

export interface ProductAgentSelectedAttribute {
  attributeId: string;
  attributeName: string;
  optionValues: string[];
  role?: string;
}

export interface ProductAgentCatalogSetupOption {
  label: string;
  value: string;
}

export interface ProductAgentCatalogSetupAttribute {
  calculated: boolean;
  name: string;
  reason: string;
  suggestedId: string;
  suggestedType: AttributeInputTypeEnum;
  options: ProductAgentCatalogSetupOption[];
}

export interface ProductAgentCatalogSetupOptionUpdate {
  attributeId: string;
  attributeName: string;
  options: ProductAgentCatalogSetupOption[];
}

export interface ProductAgentCatalogSetupProductTypeAttributeRef {
  attributeId?: string;
  attributeName: string;
}

export interface ProductAgentCatalogSetupProductType {
  name: string;
  suggestedId: string;
  attributeRefs: ProductAgentCatalogSetupProductTypeAttributeRef[];
  isShippable: boolean;
}

export interface ProductAgentCatalogSetupPlan {
  attributes: ProductAgentCatalogSetupAttribute[];
  options: ProductAgentCatalogSetupOptionUpdate[];
  productType?: ProductAgentCatalogSetupProductType;
}

export type ProductAgentCatalogChangeStatus =
  | "proposed"
  | "approved"
  | "applied"
  | "blocked";

export interface ProductAgentAttributeCreateCatalogChange {
  blockedItems?: ProductAgentBlockedItem[];
  id: string;
  kind: "attribute.create";
  payload: {
    calculated: boolean;
    inputType: AttributeInputTypeEnum;
    name: string;
    options?: ProductAgentCatalogSetupOption[];
    reason?: string;
    suggestedId: string;
  };
  ref: string;
  status: ProductAgentCatalogChangeStatus;
}

export interface ProductAgentAttributeOptionAddCatalogChange {
  blockedItems?: ProductAgentBlockedItem[];
  id: string;
  kind: "attribute.option.add";
  payload: {
    label: string;
    reason?: string;
    value: string;
  };
  status: ProductAgentCatalogChangeStatus;
  target: {
    attributeId?: string;
    attributeName?: string;
    attributeRef?: string;
  };
}

export interface ProductAgentProductTypeCreateCatalogChange {
  blockedItems?: ProductAgentBlockedItem[];
  id: string;
  kind: "productType.create";
  payload: {
    isShippable: boolean;
    name: string;
    suggestedId: string;
  };
  ref: string;
  status: ProductAgentCatalogChangeStatus;
}

export interface ProductAgentProductTypeAttributeAttachCatalogChange {
  blockedItems?: ProductAgentBlockedItem[];
  id: string;
  kind: "productType.attribute.attach";
  payload: {
    attributeId?: string;
    attributeName: string;
    attributeRef?: string;
  };
  status: ProductAgentCatalogChangeStatus;
  target: {
    productTypeId?: string;
    productTypeRef?: string;
  };
}

export type ProductAgentCatalogChange =
  | ProductAgentAttributeCreateCatalogChange
  | ProductAgentAttributeOptionAddCatalogChange
  | ProductAgentProductTypeCreateCatalogChange
  | ProductAgentProductTypeAttributeAttachCatalogChange;

export interface ProductAgentDraft {
  blockedItems: ProductAgentBlockedItem[];
  catalogChanges?: ProductAgentCatalogChange[];
  catalogChangesVersion?: 1;
  grossPrices: boolean;
  missingAttributes: ProductAgentMissingAttribute[];
  missingOptions: ProductAgentMissingOption[];
  priceType: PriceTypeEnum;
  priceTypeReason: string;
  pricingPreview?: ProductAgentPricingPreview;
  product: Partial<Product>;
  readyForCreate: boolean;
  reviewSummary: string;
  selectedAttributes: ProductAgentSelectedAttribute[];
  sourcePrompt: string;
}

export interface ProductAgentData {
  blockedItems: ProductAgentBlockedItem[];
  catalogChanges?: ProductAgentCatalogChange[];
  catalogChangesVersion?: 1;
  catalogSetupPlan?: ProductAgentCatalogSetupPlan | null;
  draft?: ProductAgentDraft;
  pricePreview?: string;
  readyForCreate: boolean;
}
