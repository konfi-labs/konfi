import {
  type CurrencyCode,
  type CurrencyConversionSnapshot,
  type PaymentMethodId,
  type ShippingMethodId,
  type StoreOrderForm,
} from "@konfi/types";

export interface CreateStoreOrderRequest extends StoreOrderForm {
  currency?: CurrencyCode;
  currencySnapshot?: CurrencyConversionSnapshot;
  paymentType: PaymentMethodId;
  shippingOption: ShippingMethodId;
}

export interface CreateStoreOrderResult {
  id: string;
  message: string;
  url: string;
  error?: string;
}

export interface ChangeStoreOrderPaymentMethodRequest {
  paymentType: PaymentMethodId;
}

export interface ChangeStoreOrderPaymentMethodResult {
  success: boolean;
  message: string;
  checkoutSessionUrl?: string;
  error?: string;
}
