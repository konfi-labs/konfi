import type { Order } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { summarizeOrder } from "./summaries";

describe("tool-layer summaries", () => {
  it("falls back to item name or description when product is missing", () => {
    const summary = summarizeOrder({
      channelId: "channel-1",
      currency: "PLN",
      customer: {
        id: "customer-1",
        name: "Customer",
      },
      filesStatus: "WAITING_FOR_FILES",
      id: "order-1",
      items: [
        {
          customPrice: null,
          description: "Fallback description",
          id: "item-1",
          name: "Fallback item",
          product: null,
          quantity: 2,
          totalPrice: 100,
        },
        {
          customPrice: null,
          description: "Description only",
          id: "item-2",
          name: "",
          product: null,
          quantity: 1,
          totalPrice: 50,
        },
      ],
      number: 42,
      paymentStatus: "NEW",
      paymentType: "STRIPE",
      shippingOption: null,
      status: "NEW",
      totalPrice: 150,
    } as unknown as Order);

    expect(summary.items).toEqual([
      {
        id: "item-1",
        name: "Fallback item",
        price: 100,
        quantity: 2,
      },
      {
        id: "item-2",
        name: "Description only",
        price: 50,
        quantity: 1,
      },
    ]);
  });
});
