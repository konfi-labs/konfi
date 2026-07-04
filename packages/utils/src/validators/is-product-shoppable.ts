import { Product } from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";

export function isPurchasable(product: Product): boolean {
  if (!product) {
    return false;
  }

  if (
    product.active &&
    product.availability.availableForPurchase &&
    product.availability.published
  ) {
    if (
      isUndefined(product.availability.publication) ||
      isNull(product.availability.publication)
    )
      return false;
    if (product.availability.publication.toDate() > new Date()) return false;
    if (
      product.availability.expiration &&
      product.availability.expiration.toDate() < new Date()
    )
      return false;
    return true;
  } else {
    return false;
  }
}
