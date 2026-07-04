import {
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  PaymentStatus,
  PaymentType,
} from "@konfi/types";
import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handlePrzelewy24NotificationWebhook } from "./przelewy24";

function createFirestoreDouble() {
  const update = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue({
    exists: true,
    data: () => ({
      number: 123,
      currency: "PLN",
      paymentType: PaymentType.PRZELEWY24,
      checkoutSession: {},
    }),
  });
  const doc = vi.fn().mockReturnValue({ get, set, update });

  return {
    firestore: { doc } as unknown as Firestore,
    doc,
    set,
    update,
  };
}

describe("handlePrzelewy24NotificationWebhook", () => {
  beforeEach(() => {
    vi.stubEnv("PRZELEWY24_POS_ID", "123456");
    vi.stubEnv("PRZELEWY24_API_KEY", "prod-key");
    vi.stubEnv("PRZELEWY24_CRC", "prod-crc");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies the notification and marks the order as completed", async () => {
    const firestoreDouble = createFirestoreDouble();
    const fetchImpl = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        data: {
          status: "success",
        },
      }),
    });

    const result = await handlePrzelewy24NotificationWebhook({
      firestore: firestoreDouble.firestore,
      fetchImpl: fetchImpl as typeof fetch,
      notificationRequest: {
        merchantId: 123456,
        posId: 123456,
        sessionId: "channels/channel-1/orders/order-1",
        amount: 12300,
        originAmount: 12300,
        currency: "PLN",
        orderId: "p24-order-1",
        methodId: 1,
        statement: "p24_statement",
        sign: "signature",
      },
    });

    expect(result).toEqual({ status: 200, body: "OK" });
    expect(firestoreDouble.update).toHaveBeenNthCalledWith(1, {
      checkoutSession: {
        paymentIntent: "p24_statement",
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
        paymentMethodId: PaymentType.PRZELEWY24,
        providerEventId: "p24-order-1",
        providerKind: "przelewy24",
        providerReference: "p24_statement",
        status: PaymentLedgerEntryStatus.SUCCEEDED,
      }),
      { merge: true },
    );
    expect(firestoreDouble.set.mock.calls[0]?.[0]).not.toHaveProperty(
      "tenantId",
    );
  });

  it("uses only the secure verification endpoint", async () => {
    const firestoreDouble = createFirestoreDouble();
    vi.stubEnv("VERCEL_ENV", "preview");
    const fetchImpl = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        data: {
          status: "success",
        },
      }),
    });

    const result = await handlePrzelewy24NotificationWebhook({
      firestore: firestoreDouble.firestore,
      fetchImpl: fetchImpl as typeof fetch,
      notificationRequest: {
        merchantId: 123456,
        posId: 123456,
        sessionId: "channels/channel-1/orders/order-1",
        amount: 12300,
        originAmount: 12300,
        currency: "PLN",
        orderId: "p24-order-1",
        methodId: 1,
        statement: "p24_statement",
        sign: "signature",
      },
    });

    expect(result).toEqual({ status: 200, body: "OK" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("secure.przelewy24.pl/api/v1/transaction/verify"),
      expect.any(Object),
    );
  });

  it("rejects invalid order paths before touching Firestore", async () => {
    const firestoreDouble = createFirestoreDouble();
    const fetchImpl = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        data: {
          status: "success",
        },
      }),
    });

    const result = await handlePrzelewy24NotificationWebhook({
      firestore: firestoreDouble.firestore,
      fetchImpl: fetchImpl as typeof fetch,
      notificationRequest: {
        merchantId: 123456,
        posId: 123456,
        sessionId: "customers/user-1",
        amount: 12300,
        originAmount: 12300,
        currency: "PLN",
        orderId: "p24-order-1",
        methodId: 1,
        statement: "p24_statement",
        sign: "signature",
      },
    });

    expect(result).toEqual({ status: 400, body: "ERROR" });
    expect(firestoreDouble.update).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
