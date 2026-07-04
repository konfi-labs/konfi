import type { BusinessTaxonomyDefinition } from "./business-taxonomy";
import type { ShippingMethodId } from "./shipping-methods";

export type PaymentMethodId = string;

export type PaymentMethodProviderKind =
  | "manual"
  | "stripe"
  | "przelewy24"
  | "allegro"
  | "bank_transfer"
  | "deferred"
  | "pickup"
  | "delivery";

export interface PaymentMethodDefinition extends BusinessTaxonomyDefinition {
  id: PaymentMethodId;
  providerKind: PaymentMethodProviderKind;
  allowedShippingMethodIds: ShippingMethodId[];
  label?: string;
  storefrontEnabled?: boolean;
}

export interface PaymentMethodsSettings {
  methods: PaymentMethodDefinition[];
  updatedAt?: unknown;
  tenantId?: string;
}
