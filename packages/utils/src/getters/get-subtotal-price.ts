import { OrderItem } from "@konfi/types";

export function getSubtotalPrice(orderItems: OrderItem[]) {
  let tmpSubtotal = 0;
  for (let i = 0; i < orderItems.length; i++) {
    const orderItem = orderItems[i];
    tmpSubtotal += orderItem.totalPrice;
  }
  tmpSubtotal;
  return Math.floor(tmpSubtotal);
}
