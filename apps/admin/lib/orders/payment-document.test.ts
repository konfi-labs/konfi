import { PaymentStatus, type Order } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  getPaymentDocumentOrderUpdate,
  getPaymentDocumentValue,
  hasPaymentDocumentValue,
  updateOrderCollection,
} from "./payment-document";

function createOrder(overrides: Partial<Order>): Order {
  return {
    id: overrides.id ?? "order-1",
    paymentDocumentId: overrides.paymentDocumentId ?? "",
    proformaDocumentId: overrides.proformaDocumentId ?? "",
    paymentStatus: overrides.paymentStatus ?? PaymentStatus.NEW,
    ...overrides,
  } as Order;
}

describe("getPaymentDocumentOrderUpdate", () => {
  it("marks the order as completed when a payment document is present", () => {
    expect(getPaymentDocumentOrderUpdate("Bez")).toEqual({
      paymentDocumentId: "Bez",
      paymentStatus: PaymentStatus.COMPLETED,
    });
  });

  it("marks the order as pending when only a proforma document is present", () => {
    expect(getPaymentDocumentOrderUpdate("", "PRO/1/2026")).toEqual({
      paymentDocumentId: "",
      proformaDocumentId: "PRO/1/2026",
      paymentStatus: PaymentStatus.PENDING,
    });
  });
});

describe("getPaymentDocumentValue", () => {
  it("prefers the payment document id", () => {
    expect(
      getPaymentDocumentValue({
        paymentDocumentId: " FV/1/2026 ",
        proformaDocumentId: "PRO/1/2026",
      }),
    ).toBe("FV/1/2026");
  });

  it("falls back to the proforma document id", () => {
    expect(
      getPaymentDocumentValue({
        paymentDocumentId: "",
        proformaDocumentId: " PRO/1/2026 ",
      }),
    ).toBe("PRO/1/2026");
  });

  it("detects whether any payment document value is present", () => {
    expect(
      hasPaymentDocumentValue({
        paymentDocumentId: "",
        proformaDocumentId: "PRO/1/2026",
      }),
    ).toBe(true);
    expect(
      hasPaymentDocumentValue({
        paymentDocumentId: " ",
        proformaDocumentId: "",
      }),
    ).toBe(false);
  });
});

describe("updateOrderCollection", () => {
  it("updates only the matching order", () => {
    const originalOrders = [
      createOrder({ channelId: "channel-1", id: "order-1" }),
      createOrder({
        channelId: "channel-1",
        id: "order-2",
        paymentStatus: PaymentStatus.PENDING,
      }),
    ];

    const updatedOrders = updateOrderCollection(
      originalOrders,
      "order-2",
      {
        paymentDocumentId: "Bez",
        paymentStatus: PaymentStatus.COMPLETED,
      },
      "channel-1",
    );

    expect(updatedOrders).toEqual([
      originalOrders[0],
      expect.objectContaining({
        channelId: "channel-1",
        id: "order-2",
        paymentDocumentId: "Bez",
        paymentStatus: PaymentStatus.COMPLETED,
      }),
    ]);
  });

  it("updates a matching order when the local row is missing channel id", () => {
    const originalOrders = [
      createOrder({ channelId: undefined, id: "order-1" }),
    ];

    const updatedOrders = updateOrderCollection(
      originalOrders,
      "order-1",
      {
        paymentDocumentId: "Bez",
        paymentStatus: PaymentStatus.COMPLETED,
      },
      "channel-1",
    );

    expect(updatedOrders).toEqual([
      expect.objectContaining({
        id: "order-1",
        paymentDocumentId: "Bez",
        paymentStatus: PaymentStatus.COMPLETED,
      }),
    ]);
  });

  it("does not update the same order id from a different channel", () => {
    const originalOrders = [
      createOrder({ channelId: "channel-2", id: "order-1" }),
    ];

    expect(
      updateOrderCollection(
        originalOrders,
        "order-1",
        { paymentDocumentId: "Bez" },
        "channel-1",
      ),
    ).toBe(originalOrders);
  });

  it("returns the existing collection when the order is not present", () => {
    const originalOrders = [createOrder({ id: "order-1" })];

    expect(updateOrderCollection(originalOrders, "missing", {})).toBe(
      originalOrders,
    );
  });
});
