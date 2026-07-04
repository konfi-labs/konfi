import {
  Customer,
  type CurrencyCode,
  OrderItem,
  type PaymentMethodId,
  type PaymentMethodsSettings,
  PaymentType,
  type ShippingMethodId,
  type ShippingMethodsSettings,
  ShippingOptions,
  ShippingTypes,
} from "@konfi/types";
import {
  getAvailablePaymentTypes,
  getAvailableShippingOptions,
  normalizeCurrencyCode,
  type ShippingRuleContext,
} from "@konfi/utils";
import { isNull } from "es-toolkit";

type CustomerPaymentPreferences = Pick<
  Customer,
  "allowedBankPayments" | "allowedDefferedPayments" | "allowedOnPickupPayments"
>;

export interface CartPaymentProviderStatus {
  przelewy24Configured?: boolean;
  stripeConfigured?: boolean;
}

export const INITIAL_CART_SHIPPING_OPTION = ShippingOptions.INPOST;

export function getCartShippingTypes(
  items: OrderItem[] | null,
): ShippingTypes[][] {
  if (isNull(items) || items.length === 0) {
    return [];
  }

  return items.map((item) => item.product?.shipping?.types ?? []);
}

export function getCartAvailableShippingOptions(
  items: OrderItem[] | null,
  shippingMethodsSettings?: Partial<ShippingMethodsSettings> | null,
  ruleContext?: ShippingRuleContext,
): ShippingMethodId[] {
  return (
    getAvailableShippingOptions(
      getCartShippingTypes(items),
      true,
      shippingMethodsSettings,
      ruleContext,
    ) ?? []
  );
}

export function getCartShippingRuleContext(
  items: OrderItem[] | null,
  options: {
    channelId?: string | null;
    country?: string | null;
    postalCode?: string | null;
    subtotal?: number | null;
  } = {},
): ShippingRuleContext {
  const productTypeIds = new Set<string>();
  const categoryIds = new Set<string>();

  for (const item of items ?? []) {
    const productTypeId = item.product?.productType?.id;
    const categoryId = item.product?.category?.id;

    if (productTypeId) {
      productTypeIds.add(productTypeId);
    }

    if (categoryId) {
      categoryIds.add(categoryId);
    }
  }

  return {
    categoryIds: Array.from(categoryIds),
    channelId: options.channelId,
    country: options.country,
    postalCode: options.postalCode,
    productTypeIds: Array.from(productTypeIds),
    subtotal: options.subtotal,
  };
}

export function getCartAvailablePaymentTypes(
  shippingOption: ShippingMethodId,
  customer?: CustomerPaymentPreferences | null,
  anonymousPackageShipping?: boolean,
  currency?: CurrencyCode | null,
  paymentMethodsSettings?: Partial<PaymentMethodsSettings> | null,
  paymentProviderStatus?: CartPaymentProviderStatus,
): PaymentMethodId[] {
  let paymentTypes =
    getAvailablePaymentTypes(
      shippingOption,
      true,
      customer?.allowedBankPayments ?? false,
      customer?.allowedDefferedPayments ?? false,
      customer?.allowedOnPickupPayments ?? false,
      undefined,
      anonymousPackageShipping,
      paymentMethodsSettings,
    ) ?? [];

  if (paymentProviderStatus?.stripeConfigured === false) {
    paymentTypes = paymentTypes.filter(
      (paymentType) => paymentType !== PaymentType.STRIPE,
    );
  }

  if (paymentProviderStatus?.przelewy24Configured === false) {
    paymentTypes = paymentTypes.filter(
      (paymentType) => paymentType !== PaymentType.PRZELEWY24,
    );
  }

  const normalizedCurrency = normalizeCurrencyCode(currency);

  if (normalizedCurrency && normalizedCurrency !== "PLN") {
    return paymentTypes.filter(
      (paymentType) => paymentType !== PaymentType.PRZELEWY24,
    );
  }

  return paymentTypes;
}

export function resolveCartSelection<T>(current: T, available: T[]): T {
  return available.includes(current) ? current : available[0];
}
