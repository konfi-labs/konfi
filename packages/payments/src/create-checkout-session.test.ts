import { PaymentType, Unit } from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  buildStripeLineItems,
  createCheckoutSession,
} from "./create-checkout-session";
import type { CheckoutSessionData } from "./types";

describe("buildStripeLineItems", () => {
  it("uses the order currency and reconciles line items to the stored order total", () => {
    const lineItems = buildStripeLineItems({
      id: "order-1",
      path: "channels/channel-1/orders/order-1",
      isTest: true,
      paymentType: PaymentType.STRIPE,
      currency: "EUR",
      totalPrice: 700,
      shippingPrice: 250,
      items: [
        {
          product: {
            name: "Flyers",
          },
          description: "A5",
          quantity: 1,
          unit: Unit.PCS,
          totalPrice: 1000,
        },
        {
          product: {
            name: "Poster",
          },
          description: "B2",
          quantity: 1,
          unit: Unit.PCS,
          totalPrice: 500,
        },
      ],
    } as CheckoutSessionData);

    expect(
      lineItems.every((lineItem) => lineItem.price_data.currency === "eur"),
    ).toBe(true);
    expect(
      lineItems.reduce(
        (sum, lineItem) =>
          sum + lineItem.price_data.unit_amount * lineItem.quantity,
        0,
      ),
    ).toBe(700);
  });
});

describe("createCheckoutSession", () => {
  it("rejects Przelewy24 checkout for non-PLN order currency", async () => {
    await expect(
      createCheckoutSession({
        id: "order-1",
        path: "channels/channel-1/orders/order-1",
        isTest: true,
        paymentType: PaymentType.PRZELEWY24,
        currency: "EUR",
        totalPrice: 700,
        items: [
          {
            product: {
              name: "Flyers",
            },
            description: "A5",
            quantity: 1,
            unit: Unit.PCS,
            totalPrice: 700,
          },
        ],
        contact: {
          email: "customer@example.com",
        },
      } as CheckoutSessionData),
    ).rejects.toThrow("Przelewy24 checkout requires PLN order currency");
  });
});
