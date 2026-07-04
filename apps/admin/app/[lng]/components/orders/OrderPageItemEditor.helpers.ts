import { cloneDeep, isEqual } from "es-toolkit";
import { Order, OrderItem, type PrintingMethodId } from "@konfi/types";

export type OrderPageItemEditorValues = {
  customer: Order["customer"];
  printingMethods: PrintingMethodId[];
  items: OrderItem[];
};

export function createOrderPageItemEditorValues(
  order: Pick<Order, "customer" | "items" | "printingMethods">,
): OrderPageItemEditorValues {
  return cloneDeep({
    customer: order.customer,
    printingMethods: order.printingMethods ?? [],
    items: order.items ?? [],
  });
}

export function cloneOrderPageItemEditorValues(
  values: OrderPageItemEditorValues,
): OrderPageItemEditorValues {
  return cloneDeep(values);
}

export function hasOrderPageItemEditorChanges(
  values: Pick<OrderPageItemEditorValues, "items" | "printingMethods">,
  initialValues: OrderPageItemEditorValues,
) {
  return !(
    isEqual(values.items, initialValues.items) &&
    isEqual(values.printingMethods, initialValues.printingMethods)
  );
}
