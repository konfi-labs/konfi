import {
  PaymentType,
  ShippingOptions,
  type PaymentMethodId,
  type PaymentMethodsSettings,
} from "@konfi/types";
import { paymentOptionsForShippingOptions } from "../constants";
import { getAvailablePaymentMethodIds } from "../payment-methods";

export function getAvailablePaymentTypes(
  shippingOption: string,
  isStore: boolean = false,
  allowedBankPayments?: boolean,
  allowedDefferedPayments?: boolean,
  allowedOnPickupPayments?: boolean,
  totalPrice?: number,
  anonymousPackageShipping?: boolean,
  paymentMethodsSettings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodId[] {
  if (!shippingOption) return [];
  if (paymentMethodsSettings) {
    return getAvailablePaymentMethodIds(shippingOption, {
      allowedBankPayments,
      allowedDeferredPayments: allowedDefferedPayments,
      allowedOnPickupPayments,
      anonymousPackageShipping,
      isStore,
      settings: paymentMethodsSettings,
    });
  }

  const shippingPaymentOptions = paymentOptionsForShippingOptions[
    shippingOption as ShippingOptions
  ] as readonly PaymentType[] | undefined;
  if (!shippingPaymentOptions) return [];

  let paymentTypes: PaymentType[] = [];

  if (isStore) {
    // For store orders, only show specific payment types

    // Always show STRIPE and PRZELEWY24 if supported
    if (shippingPaymentOptions.includes(PaymentType.STRIPE))
      paymentTypes.push(PaymentType.STRIPE);
    if (shippingPaymentOptions.includes(PaymentType.PRZELEWY24))
      paymentTypes.push(PaymentType.PRZELEWY24);

    // Show BANK_TRANSFER only if allowed
    if (
      allowedBankPayments &&
      shippingPaymentOptions.includes(PaymentType.BANK_TRANSFER)
    )
      paymentTypes.push(PaymentType.BANK_TRANSFER);

    // Show ON_PICKUP only if allowed and supported by shipping option
    if (
      allowedOnPickupPayments &&
      shippingPaymentOptions.includes(PaymentType.ON_PICKUP)
    )
      paymentTypes.push(PaymentType.ON_PICKUP);

    // Show DEFERRED only if allowed
    if (allowedDefferedPayments) paymentTypes.push(PaymentType.DEFERRED);
  } else {
    // For non-store orders, use existing logic

    if (shippingPaymentOptions.includes(PaymentType.STRIPE))
      paymentTypes.push(PaymentType.STRIPE);

    // Handle BANK_TRANSFER
    if (shippingPaymentOptions.includes(PaymentType.BANK_TRANSFER))
      paymentTypes.push(PaymentType.BANK_TRANSFER);

    // Handle ON_DELIVERY (always show for non-store orders)
    if (shippingPaymentOptions.includes(PaymentType.ON_DELIVERY))
      paymentTypes.push(PaymentType.ON_DELIVERY);

    // Handle ON_PICKUP (always show for non-store orders if supported)
    if (shippingPaymentOptions.includes(PaymentType.ON_PICKUP))
      paymentTypes.push(PaymentType.ON_PICKUP);

    // Handle PROFORMA
    if (shippingPaymentOptions.includes(PaymentType.PROFORMA))
      paymentTypes.push(PaymentType.PROFORMA);

    // Handle DEFERRED
    if (
      shippingPaymentOptions.includes(PaymentType.DEFERRED) &&
      allowedDefferedPayments
    )
      paymentTypes.push(PaymentType.DEFERRED);

    // Handle ALLEGRO
    if (shippingPaymentOptions.includes(PaymentType.ALLEGRO))
      paymentTypes.push(PaymentType.ALLEGRO);
  }

  if (anonymousPackageShipping) {
    return paymentTypes.filter(
      (paymentType) => paymentType !== PaymentType.ON_DELIVERY,
    );
  }

  return paymentTypes;
}
