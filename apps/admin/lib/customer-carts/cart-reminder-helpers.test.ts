import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCustomerReminderEmail,
  getCartReminderItemImageUrl,
  getCartReminderItemQuantity,
  shouldSendAutomatedCartReminder,
} from "./cart-reminder-helpers";
import { PriceTypeEnum } from "@konfi/types";

describe("getCustomerReminderEmail", () => {
  it("returns trimmed lowercase customer email first", () => {
    const result = getCustomerReminderEmail({
      email: " Customer@Example.com ",
    });

    expect(result).toBe("customer@example.com");
  });

  it("falls back to an active contact email", () => {
    const result = getCustomerReminderEmail({
      contacts: [
        { active: false, email: "ignore@example.com", name: "Ignore" },
        { active: true, email: " Contact@Example.com ", name: "Primary" },
      ],
    });

    expect(result).toBe("contact@example.com");
  });
});

describe("shouldSendAutomatedCartReminder", () => {
  const now = new Date("2026-04-10T10:00:00.000Z");
  const staleCartDate = new Date("2026-04-08T10:00:00.000Z");

  it("allows sending for stale carts owned by authenticated active customers", () => {
    const result = shouldSendAutomatedCartReminder({
      cartId: "auth-uid-1",
      customer: {
        active: true,
        id: "auth-uid-1",
      },
      itemCount: 2,
      lastUpdatedAt: staleCartDate,
      now,
      recipientEmail: "customer@example.com",
    });

    expect(result).toEqual({ shouldSend: true });
  });

  it("blocks carts without a resolved customer", () => {
    const result = shouldSendAutomatedCartReminder({
      cartId: "auth-uid-1",
      itemCount: 1,
      lastUpdatedAt: staleCartDate,
      now,
      recipientEmail: "customer@example.com",
    });

    expect(result).toEqual({
      shouldSend: false,
      reason: "missing-customer",
    });
  });

  it("blocks carts that are not tied to an authenticated customer owner", () => {
    const result = shouldSendAutomatedCartReminder({
      cartId: "auth-uid-1",
      customer: {
        active: true,
        id: "customer-doc-id",
      },
      itemCount: 1,
      lastUpdatedAt: staleCartDate,
      now,
      recipientEmail: "customer@example.com",
    });

    expect(result).toEqual({
      shouldSend: false,
      reason: "not-authenticated-customer",
    });
  });

  it("blocks carts that were already reminded after the latest cart activity", () => {
    const result = shouldSendAutomatedCartReminder({
      cartId: "auth-uid-1",
      customer: {
        active: true,
        linkedAuthId: "auth-uid-1",
      },
      itemCount: 1,
      lastReminderSentAt: new Date("2026-04-09T10:00:00.000Z"),
      lastUpdatedAt: new Date("2026-04-08T10:00:00.000Z"),
      now,
      recipientEmail: "customer@example.com",
    });

    expect(result).toEqual({
      shouldSend: false,
      reason: "already-reminded",
    });
  });

  it("blocks carts when the resend cooldown is still active", () => {
    const result = shouldSendAutomatedCartReminder({
      cartId: "auth-uid-1",
      customer: {
        active: true,
        linkedAuthId: "auth-uid-1",
      },
      itemCount: 1,
      lastReminderSentAt: new Date("2026-04-05T10:00:00.000Z"),
      lastUpdatedAt: new Date("2026-04-01T10:00:00.000Z"),
      now,
      recipientEmail: "customer@example.com",
    });

    expect(result).toEqual({
      shouldSend: false,
      reason: "already-reminded",
    });
  });

  it("blocks carts that are too fresh", () => {
    const result = shouldSendAutomatedCartReminder({
      cartId: "auth-uid-1",
      customer: {
        active: true,
        linkedAuthId: "auth-uid-1",
      },
      itemCount: 1,
      lastUpdatedAt: new Date("2026-04-10T02:00:00.000Z"),
      now,
      recipientEmail: "customer@example.com",
    });

    expect(result).toEqual({
      shouldSend: false,
      reason: "cart-too-fresh",
    });
  });
});

describe("getCartReminderItemQuantity", () => {
  it("prefers volume for matrix products", () => {
    expect(
      getCartReminderItemQuantity({
        product: { priceType: PriceTypeEnum.MATRIX },
        quantity: 1,
        volume: 500,
      }),
    ).toBe(500);
  });

  it("uses quantity for non-matrix products", () => {
    expect(
      getCartReminderItemQuantity({
        product: { priceType: PriceTypeEnum.SINGLE },
        quantity: 3,
        volume: 500,
      }),
    ).toBe(3);
  });

  it("falls back to volume when price type is missing", () => {
    expect(
      getCartReminderItemQuantity({
        quantity: 1,
        volume: 250,
      }),
    ).toBe(250);
  });
});

describe("getCartReminderItemImageUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a product CDN image URL for cart reminder items", () => {
    vi.stubEnv("NEXT_PUBLIC_CDN_URL", "cdn.test");
    vi.stubEnv("STORE_CHANNEL_ID", "store-channel");

    expect(
      getCartReminderItemImageUrl({
        product: {
          id: "product-1",
          spec: {
            images: ["folder/front image.png"],
          },
        },
      }),
    ).toBe(
      "https://cdn.test/channels/store-channel/products/product-1/folder/front%20image.png?fit=crop&auto=format,compress",
    );
  });

  it("returns undefined when the cart item has no product image", () => {
    vi.stubEnv("NEXT_PUBLIC_CDN_URL", "cdn.test");
    vi.stubEnv("STORE_CHANNEL_ID", "store-channel");

    expect(
      getCartReminderItemImageUrl({
        product: {
          id: "product-1",
          spec: {
            images: [],
          },
        },
      }),
    ).toBeUndefined();
  });
});
