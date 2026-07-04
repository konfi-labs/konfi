import {
  OrderStatus,
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  PaymentStatus,
  PaymentType,
} from "@konfi/types";
import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleStripePaymentIntentWebhook } from "./stripe";

function createFirestoreDouble() {
  const update = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue({
    exists: true,
    data: () => ({
      status: OrderStatus.UNDER_REVIEW,
      number: 123,
      currency: "PLN",
      paymentType: PaymentType.STRIPE,
      paymentStatus: PaymentStatus.COMPLETED,
      checkoutSession: {},
    }),
  });
  const doc = vi.fn().mockReturnValue({ get, set, update });

  return {
    firestore: { doc } as unknown as Firestore,
    doc,
    get,
    set,
    update,
  };
}

describe("handleStripePaymentIntentWebhook", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("updates the matching order payment status and payment intent", async () => {
    const firestoreDouble = createFirestoreDouble();
    const stripeClient = {
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({
          id: "evt_123",
          type: "payment_intent.succeeded",
          data: {
            object: {
              id: "pi_123",
              amount: 12300,
              amount_received: 12300,
              metadata: {
                orderPath: "channels/channel-1/orders/order-1",
              },
            },
          },
        }),
      },
    };

    const result = await handleStripePaymentIntentWebhook({
      firestore: firestoreDouble.firestore,
      rawBody: Buffer.from("{}"),
      signature: "signature",
      isTest: false,
      stripeClient,
    });

    expect(result).toEqual({ status: 200, body: "OK" });
    expect(firestoreDouble.update).toHaveBeenNthCalledWith(1, {
      checkoutSession: {
        paymentIntent: "pi_123",
      },
    });
    expect(firestoreDouble.update).toHaveBeenNthCalledWith(2, {
      paymentStatus: PaymentStatus.COMPLETED,
    });
    expect(firestoreDouble.doc).toHaveBeenCalledWith(
      expect.stringMatching(
        /^channels\/channel-1\/orders\/order-1\/paymentLedgerEntries\//u,
      ),
    );
    expect(firestoreDouble.set).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12300,
        entryType: PaymentLedgerEntryType.PAYMENT,
        orderId: "order-1",
        orderNumber: 123,
        paymentMethodId: PaymentType.STRIPE,
        providerEventId: expect.any(String),
        providerKind: "stripe",
        providerReference: "pi_123",
        status: PaymentLedgerEntryStatus.SUCCEEDED,
      }),
      { merge: true },
    );
    expect(firestoreDouble.set.mock.calls[0]?.[0]).not.toHaveProperty(
      "tenantId",
    );
  });

  it("uses only the unified webhook secret", async () => {
    const firestoreDouble = createFirestoreDouble();
    vi.stubEnv("VERCEL_ENV", "preview");
    const constructEvent = vi.fn().mockReturnValue({
      id: "evt_live_123",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_live_123",
          amount: 12300,
          amount_received: 12300,
          metadata: {
            orderPath: "channels/channel-1/orders/order-1",
          },
        },
      },
    });

    const result = await handleStripePaymentIntentWebhook({
      firestore: firestoreDouble.firestore,
      rawBody: Buffer.from("{}"),
      signature: "signature",
      stripeClient: {
        webhooks: {
          constructEvent,
        },
      },
    });

    expect(result).toEqual({ status: 200, body: "OK" });
    expect(constructEvent).toHaveBeenCalledTimes(1);
    expect(constructEvent).toHaveBeenCalledWith(
      Buffer.from("{}"),
      "signature",
      "whsec_test",
    );
  });

  it("rejects invalid order paths before touching Firestore", async () => {
    const firestoreDouble = createFirestoreDouble();
    const stripeClient = {
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({
          type: "payment_intent.succeeded",
          data: {
            object: {
              id: "pi_123",
              amount: 12300,
              amount_received: 12300,
              metadata: {
                orderPath: "customers/user-1",
              },
            },
          },
        }),
      },
    };

    const result = await handleStripePaymentIntentWebhook({
      firestore: firestoreDouble.firestore,
      rawBody: Buffer.from("{}"),
      signature: "signature",
      isTest: false,
      stripeClient,
    });

    expect(result).toEqual({ status: 400, body: "Webhook Error" });
    expect(firestoreDouble.get).not.toHaveBeenCalled();
  });

  it("returns a generic error when signature verification fails", async () => {
    const firestoreDouble = createFirestoreDouble();
    const stripeClient = {
      webhooks: {
        constructEvent: vi.fn().mockImplementation(() => {
          throw new Error("sensitive signature mismatch details");
        }),
      },
    };

    const result = await handleStripePaymentIntentWebhook({
      firestore: firestoreDouble.firestore,
      rawBody: Buffer.from("{}"),
      signature: "signature",
      isTest: false,
      stripeClient,
    });

    expect(result).toEqual({ status: 400, body: "Webhook Error" });
  });

  it.each([
    ["payment_intent.created", PaymentStatus.NEW],
    ["payment_intent.processing", PaymentStatus.PENDING],
    ["payment_intent.canceled", PaymentStatus.CANCELED],
  ])(
    "does not downgrade completed orders on late %s events",
    async (eventType, blockedStatus) => {
      const firestoreDouble = createFirestoreDouble();
      firestoreDouble.get.mockResolvedValue({
        exists: true,
        data: () => ({
          status: OrderStatus.UNDER_REVIEW,
          number: 123,
          currency: "PLN",
          paymentType: PaymentType.STRIPE,
          paymentStatus: PaymentStatus.COMPLETED,
          checkoutSession: {
            paymentIntent: "pi_123",
          },
        }),
      });
      const stripeClient = {
        webhooks: {
          constructEvent: vi.fn().mockReturnValue({
            id: "evt_late",
            type: eventType,
            data: {
              object: {
                id: "pi_123",
                amount: 12300,
                metadata: {
                  orderPath: "channels/channel-1/orders/order-1",
                },
              },
            },
          }),
        },
      };

      const result = await handleStripePaymentIntentWebhook({
        firestore: firestoreDouble.firestore,
        rawBody: Buffer.from("{}"),
        signature: "signature",
        isTest: false,
        stripeClient,
      });

      expect(result).toEqual({ status: 200, body: "OK" });
      expect(firestoreDouble.update).not.toHaveBeenCalledWith({
        paymentStatus: blockedStatus,
      });
    },
  );

  it("does not mark partially refunded charges as fully refunded", async () => {
    const firestoreDouble = createFirestoreDouble();
    firestoreDouble.get.mockResolvedValue({
      exists: true,
      data: () => ({
        status: OrderStatus.UNDER_REVIEW,
        number: 123,
        currency: "PLN",
        paymentType: PaymentType.STRIPE,
        paymentStatus: PaymentStatus.COMPLETED,
        checkoutSession: {
          paymentIntent: "pi_123",
        },
      }),
    });
    const stripeClient = {
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({
          type: "charge.refunded",
          data: {
            object: {
              id: "ch_123",
              amount_refunded: 0,
              refunded: false,
              metadata: {
                orderPath: "channels/channel-1/orders/order-1",
              },
            },
          },
        }),
      },
    };

    const result = await handleStripePaymentIntentWebhook({
      firestore: firestoreDouble.firestore,
      rawBody: Buffer.from("{}"),
      signature: "signature",
      isTest: false,
      stripeClient,
    });

    expect(result).toEqual({ status: 200, body: "OK" });
    expect(firestoreDouble.update).not.toHaveBeenCalledWith({
      paymentStatus: PaymentStatus.REFUNDED,
    });
  });

  it("marks fully refunded charges as refunded", async () => {
    const firestoreDouble = createFirestoreDouble();
    firestoreDouble.get.mockResolvedValue({
      exists: true,
      data: () => ({
        status: OrderStatus.UNDER_REVIEW,
        number: 123,
        currency: "PLN",
        paymentType: PaymentType.STRIPE,
        paymentStatus: PaymentStatus.COMPLETED,
        checkoutSession: {
          paymentIntent: "pi_123",
        },
      }),
    });
    const stripeClient = {
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({
          type: "charge.refunded",
          data: {
            object: {
              id: "ch_123",
              amount_refunded: 12300,
              payment_intent: "pi_123",
              refunded: true,
              refunds: {
                data: [
                  {
                    id: "re_123",
                  },
                ],
              },
              metadata: {
                orderPath: "channels/channel-1/orders/order-1",
              },
            },
          },
        }),
      },
    };

    const result = await handleStripePaymentIntentWebhook({
      firestore: firestoreDouble.firestore,
      rawBody: Buffer.from("{}"),
      signature: "signature",
      isTest: false,
      stripeClient,
    });

    expect(result).toEqual({ status: 200, body: "OK" });
    expect(firestoreDouble.update).toHaveBeenCalledWith({
      paymentStatus: PaymentStatus.REFUNDED,
    });
    expect(firestoreDouble.set).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12300,
        entryType: PaymentLedgerEntryType.REFUND,
        providerEventId: "re_123",
        providerReference: "pi_123",
        status: PaymentLedgerEntryStatus.SUCCEEDED,
      }),
      { merge: true },
    );
  });
});
