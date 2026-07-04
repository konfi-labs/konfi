import { describe, expect, it } from "vitest";
import { Unit, type Order } from "@konfi/types";
import {
  cloneOrderPageItemEditorValues,
  createOrderPageItemEditorValues,
  hasOrderPageItemEditorChanges,
} from "./OrderPageItemEditor.helpers";

function createOrder(): Pick<Order, "customer" | "items" | "printingMethods"> {
  return {
    customer: "Acme",
    printingMethods: ["digital"],
    items: [
      {
        id: "item-1",
        name: "Business cards",
        product: {
          id: "product-1",
          name: "Business cards",
          channelId: "channel-1",
          spec: {
            images: [],
          },
        },
        description: "Initial description",
        customFormat: false,
        customPrice: null,
        totalPrice: 12_300,
        width: 90,
        height: 50,
        quantity: 1,
        discount: {
          code: null,
          discountedAmount: 0,
          discountValue: 0,
          type: "PERCENTAGE",
        },
        unit: Unit.PCS,
      },
    ],
  };
}

describe("OrderPageItemEditor helpers", () => {
  it("keeps the initial comparison snapshot isolated from form value mutations", () => {
    const order = createOrder();
    const initialValues = createOrderPageItemEditorValues(order);
    const formValues = cloneOrderPageItemEditorValues(initialValues);

    formValues.items[0].description = "Updated description";

    expect(order.items[0].description).toBe("Initial description");
    expect(initialValues.items[0].description).toBe("Initial description");
    expect(
      hasOrderPageItemEditorChanges(
        {
          items: formValues.items,
          printingMethods: formValues.printingMethods,
        },
        initialValues,
      ),
    ).toBe(true);
  });

  it("treats unchanged cloned form values as unchanged", () => {
    const initialValues = createOrderPageItemEditorValues(createOrder());
    const formValues = cloneOrderPageItemEditorValues(initialValues);

    expect(
      hasOrderPageItemEditorChanges(
        {
          items: formValues.items,
          printingMethods: formValues.printingMethods,
        },
        initialValues,
      ),
    ).toBe(false);
  });
});
