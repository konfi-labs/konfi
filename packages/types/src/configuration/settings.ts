export const storeCheckoutStockPolicies = ["allow", "block"] as const;

export type StoreCheckoutStockPolicy =
  (typeof storeCheckoutStockPolicies)[number];

export interface Settings {
  buying: {
    enabled: boolean;
    max: number;
    min: number;
  };
  shippingOptionsPrices: {
    [key: string]: number;
  };
  freeShipping: {
    enabled: boolean;
    min: number;
  };
  underConstruction: {
    enabled: boolean;
    message: string;
  };
  checkout?: {
    invoiceEnabled: boolean;
    stockPolicy?: StoreCheckoutStockPolicy;
  };
  express: {
    enabled: boolean;
    percent: number;
  };
}

export interface StoreSettingsForm extends Settings {}
