import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStripePaymentIntentById, refundStripePayment } from "./stripe-provider";

const createRefundMock = vi.fn();
const retrievePaymentIntentMock = vi.fn();

vi.mock("stripe", () => ({
  default: class Stripe {
    refunds = {
      create: createRefundMock,
    };

    paymentIntents = {
      retrieve: retrievePaymentIntentMock,
    };
  },
}));

describe("refundStripePayment", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_test");
    createRefundMock.mockResolvedValue({
      id: "re_123",
      status: "succeeded",
    });
    retrievePaymentIntentMock.mockResolvedValue({
      id: "pi_123",
      amount: 1234,
      amount_received: 1234,
      created: 1_717_171_717,
      status: "succeeded",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    createRefundMock.mockReset();
    retrievePaymentIntentMock.mockReset();
  });

  it("retrieves a payment intent by id", async () => {
    const result = await getStripePaymentIntentById({
      isTest: false,
      paymentIntentId: "pi_123",
    });

    expect(retrievePaymentIntentMock).toHaveBeenCalledWith("pi_123");
    expect(result).toEqual({
      id: "pi_123",
      amount: 1234,
      amount_received: 1234,
      created: 1_717_171_717,
      status: "succeeded",
    });
  });

  it("creates a partial refund for a payment intent using the provided idempotency key", async () => {
    const result = await refundStripePayment({
      isTest: false,
      paymentIntentId: "pi_123",
      amount: 1234,
      idempotencyKey: "refund-key",
      reason: "requested_by_customer",
      metadata: {
        orderPath: "channels/channel-1/orders/order-1",
      },
    });

    expect(createRefundMock).toHaveBeenCalledWith(
      {
        payment_intent: "pi_123",
        amount: 1234,
        reason: "requested_by_customer",
        metadata: {
          orderPath: "channels/channel-1/orders/order-1",
        },
      },
      {
        idempotencyKey: "refund-key",
      },
    );
    expect(result).toEqual({
      id: "re_123",
      status: "succeeded",
    });
  });
});
