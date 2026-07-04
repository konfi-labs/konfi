import {
  ShippingOptions,
  type ShippingMethodId,
  type ShippingMethodsSettings,
} from "@konfi/types";
import { isShippingMethodCourier } from "../shipping-methods";

export function isShippingWithCourier(
  shippingOption: ShippingMethodId | null | undefined,
  noCompanyCourier = false,
  settings?: Partial<ShippingMethodsSettings> | null,
): boolean {
  if (settings) {
    return isShippingMethodCourier(shippingOption, settings, {
      noCompanyCourier,
    });
  }

  if (
    (shippingOption === ShippingOptions.COMPANY_COURIER && !noCompanyCourier) ||
    shippingOption === ShippingOptions.DHL ||
    shippingOption === ShippingOptions.DPD ||
    shippingOption === ShippingOptions.FEDEX ||
    shippingOption === ShippingOptions.INPOST ||
    shippingOption === ShippingOptions.PACZKOMATY_INPOST
  ) {
    return true;
  } else {
    return false;
  }
}
