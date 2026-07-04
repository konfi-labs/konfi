import { OrderItem } from "@konfi/types";
import { getSubtotalPrice } from "./get-subtotal-price";

export function getTotalPrice(
  orderItems: OrderItem[],
  shippingPrice: number,
  discountedAmount?: number,
) {
  if (discountedAmount) {
    return Math.floor(
      getSubtotalPrice(orderItems) + shippingPrice - discountedAmount,
    );
  } else {
    return Math.floor(getSubtotalPrice(orderItems) + shippingPrice);
  }
}
