import { Discount, DiscountTypeEnum, PaymentType, Unit } from "@konfi/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildStripeLineItems,
  createCheckoutSession,
} from "./create-checkout-session";

const mockStripeProvider = vi.fn();
const mockPrzelewy24Provider = vi.fn();

function createOrderData() {
  return {
    id: "order-1",
    path: "channels/channel-1/orders/order-1",
    isTest: true,
    paymentType: PaymentType.STRIPE,
    totalPrice: 2700,
    shippingPrice: 300,
    totalPriceDiscount: new Discount(
      undefined,
      DiscountTypeEnum.FIXED,
      100,
      100,
      "ORDER100",
    ).object,
    contact: {
      name: "Example Customer",
      email: "jan@example.com",
      phone: "123456789",
      active: true,
    },
    items: [
      {
        quantity: 2,
        volume: 2,
        totalPrice: 2500,
        description: "Matt finish",
        unit: Unit.PCS,
        product: {
          id: "product-1",
          name: "Business cards",
          channelId: "channel-1",
          spec: {
            images: [],
          },
        },
      },
    ],
  };
}

describe("store createCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStripeProvider.mockResolvedValue({
      id: "sess_123",
      url: "https://stripe.test/session",
      payment_intent: "pi_123",
    });
    mockPrzelewy24Provider.mockResolvedValue({
      id: "p24_123",
      url: "https://p24.test/session",
      payment_intent: "",
    });
  });

  it("builds Stripe line items that match the discounted order total", () => {
    const lineItems = buildStripeLineItems(createOrderData() as never);
    const [firstLineItem, secondLineItem] = lineItems;

    if (!firstLineItem || !secondLineItem) {
      throw new Error("Expected checkout line items to be present");
    }

    expect(lineItems).toHaveLength(2);
    expect(firstLineItem.quantity).toBe(1);
    expect(firstLineItem.price_data.unit_amount).toBe(2410);
    expect(secondLineItem.price_data.product_data.name).toBe("Dostawa");
    expect(
      lineItems.reduce(
        (sum, lineItem) => sum + lineItem.price_data.unit_amount,
        0,
      ),
    ).toBe(2700);
  });

  it("passes discounted Stripe line items to the payment provider", async () => {
    const orderData = createOrderData();

    await createCheckoutSession(orderData as never, {
      adminBaseUrl: "https://tenant-admin.example.com",
      createStripeCheckoutSession: mockStripeProvider,
      createPrzelewy24CheckoutSession: mockPrzelewy24Provider,
      storeBaseUrl: "https://tenant-store.example.com",
    });

    expect(mockStripeProvider).toHaveBeenCalledTimes(1);

    const [isTest, lineItems, orderId, orderPath, options] =
      mockStripeProvider.mock.calls[0];

    expect(isTest).toBe(true);
    expect(orderId).toBe("order-1");
    expect(orderPath).toBe("channels/channel-1/orders/order-1");
    expect(
      lineItems.reduce(
        (sum: number, lineItem: { price_data: { unit_amount: number } }) =>
          sum + lineItem.price_data.unit_amount,
        0,
      ),
    ).toBe(2700);
    expect(options).toEqual({
      adminBaseUrl: "https://tenant-admin.example.com",
      storeBaseUrl: "https://tenant-store.example.com",
    });
  });

  it("derives a shipping line item from shippingPrice when one is not provided", () => {
    const lineItems = buildStripeLineItems(createOrderData() as never);
    const shippingLineItem = lineItems[1];

    if (!shippingLineItem) {
      throw new Error("Expected shipping line item to be present");
    }

    expect(shippingLineItem).toMatchObject({
      price_data: {
        product_data: {
          name: "Dostawa",
        },
        unit_amount: 290,
      },
      quantity: 1,
    });
  });
});
