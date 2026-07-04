import type { ShippingTypes } from "../enums";
import type { BusinessTaxonomyDefinition } from "./business-taxonomy";

export type ShippingMethodId = string;
export type ShippingMethodKind = ShippingTypes;
export type ShippingMethodProvider = string;

export interface ShippingMethodRuleConditions {
  categoryIds?: string[];
  channelIds?: string[];
  countries?: string[];
  maxSubtotal?: number;
  minSubtotal?: number;
  postalCodePrefixes?: string[];
  productTypeIds?: string[];
}

export interface ShippingMethodRules {
  conditions?: ShippingMethodRuleConditions;
  enabled?: boolean;
  freeShippingThreshold?: number;
}

export interface ShippingMethodDefinition extends BusinessTaxonomyDefinition {
  kind: ShippingMethodKind;
  provider: ShippingMethodProvider;
  rules?: ShippingMethodRules;
  supportsPickupPoint: boolean;
  label?: string;
}

export interface ShippingMethodsSettings {
  methods: ShippingMethodDefinition[];
  updatedAt?: unknown;
  tenantId?: string;
}
