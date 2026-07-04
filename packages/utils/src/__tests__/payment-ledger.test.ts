import {
  CurrencyEnum,
  type PaymentLedgerEntry,
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  PaymentReconciliationStatus,
  PaymentStatus,
  PaymentType,
} from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  getPaymentLedgerIdempotencyKey,
  getPaymentLedgerSignedAmount,
  isValidPaymentLedgerAmount,
  reconcilePaymentLedgerEntries,
  summarizePaymentLedgerEntries,
} from "../payment-ledger";

function createLedgerEntry(
  overrides: Partial<PaymentLedgerEntry>,
): PaymentLedgerEntry {
  return {
    active: true,
    amount: 1000,
    channelId: "channel-1",
    createdAt: {} as PaymentLedgerEntry["createdAt"],
    createdBy: { id: "admin", name: "Admin" },
    currency: CurrencyEnum.PLN,
    entryType: PaymentLedgerEntryType.PAYMENT,
    id: "entry-1",
    name: "Payment",
    orderId: "order-1",
    paymentMethodId: PaymentType.STRIPE,
    status: PaymentLedgerEntryStatus.SUCCEEDED,
    tenantId: "tenant-1",
    updatedAt: {} as PaymentLedgerEntry["updatedAt"],
    updatedBy: { id: "admin", name: "Admin" },
    ...overrides,
  };
}

describe("payment-ledger", () => {
  it("summarizes settled payments, refunds, pending, and failed entries", () => {
    const entries = [
      createLedgerEntry({ id: "payment", amount: 1200 }),
      createLedgerEntry({
        id: "refund",
        amount: 200,
        entryType: PaymentLedgerEntryType.REFUND,
      }),
      createLedgerEntry({
        id: "pending",
        amount: 300,
        status: PaymentLedgerEntryStatus.PENDING,
      }),
      createLedgerEntry({
        id: "failed",
        amount: 400,
        status: PaymentLedgerEntryStatus.FAILED,
      }),
    ];

    expect(summarizePaymentLedgerEntries(entries)).toMatchObject({
      failedAmount: 400,
      ledgerEntryIds: ["payment", "refund", "pending", "failed"],
      netPaidAmount: 1000,
      paidAmount: 1200,
      pendingAmount: 300,
      refundedAmount: 200,
    });
  });

  it("derives signed ledger amounts by entry type", () => {
    expect(
      getPaymentLedgerSignedAmount(createLedgerEntry({ amount: 1000 })),
    ).toBe(1000);
    expect(
      getPaymentLedgerSignedAmount(
        createLedgerEntry({
          amount: 250,
          entryType: PaymentLedgerEntryType.REFUND,
        }),
      ),
    ).toBe(-250);
    expect(
      getPaymentLedgerSignedAmount(
        createLedgerEntry({
          amount: -125,
          entryType: PaymentLedgerEntryType.ADJUSTMENT,
        }),
      ),
    ).toBe(-125);
  });

  it("marks a fully matched payment as completed", () => {
    expect(
      reconcilePaymentLedgerEntries({
        expectedAmount: 1000,
        entries: [createLedgerEntry({ amount: 1000 })],
      }),
    ).toMatchObject({
      outstandingAmount: 0,
      paymentStatus: PaymentStatus.COMPLETED,
      status: PaymentReconciliationStatus.MATCHED,
    });
  });

  it("detects underpaid, overpaid, refunded, and disputed reconciliations", () => {
    expect(
      reconcilePaymentLedgerEntries({
        expectedAmount: 1000,
        entries: [createLedgerEntry({ amount: 600 })],
      }),
    ).toMatchObject({
      outstandingAmount: 400,
      paymentStatus: PaymentStatus.PARTIALLY_PAID,
      status: PaymentReconciliationStatus.UNDERPAID,
    });
    expect(
      reconcilePaymentLedgerEntries({
        expectedAmount: 1000,
        entries: [createLedgerEntry({ amount: 1200 })],
      }).status,
    ).toBe(PaymentReconciliationStatus.OVERPAID);
    expect(
      reconcilePaymentLedgerEntries({
        expectedAmount: 1000,
        entries: [
          createLedgerEntry({ amount: 1000 }),
          createLedgerEntry({
            amount: 1000,
            entryType: PaymentLedgerEntryType.REFUND,
          }),
        ],
      }).status,
    ).toBe(PaymentReconciliationStatus.REFUNDED);
    expect(
      reconcilePaymentLedgerEntries({
        expectedAmount: 1000,
        entries: [
          createLedgerEntry({ amount: 1000 }),
          createLedgerEntry({
            amount: 1000,
            entryType: PaymentLedgerEntryType.CHARGEBACK,
          }),
        ],
      }).status,
    ).toBe(PaymentReconciliationStatus.DISPUTED);
  });

  it("keeps pending-only payments pending instead of paid", () => {
    expect(
      reconcilePaymentLedgerEntries({
        expectedAmount: 1000,
        entries: [
          createLedgerEntry({
            amount: 1000,
            status: PaymentLedgerEntryStatus.PENDING,
          }),
        ],
      }),
    ).toMatchObject({
      netPaidAmount: 0,
      outstandingAmount: 1000,
      paymentStatus: PaymentStatus.PENDING,
      status: PaymentReconciliationStatus.UNRECONCILED,
    });
  });

  it("validates entry amounts and creates stable idempotency keys", () => {
    expect(
      isValidPaymentLedgerAmount(PaymentLedgerEntryType.PAYMENT, 1000),
    ).toBe(true);
    expect(
      isValidPaymentLedgerAmount(PaymentLedgerEntryType.PAYMENT, -1000),
    ).toBe(false);
    expect(
      isValidPaymentLedgerAmount(PaymentLedgerEntryType.ADJUSTMENT, -1000),
    ).toBe(true);
    expect(
      getPaymentLedgerIdempotencyKey({
        entryType: PaymentLedgerEntryType.PAYMENT,
        orderId: "order-1",
        providerEventId: "evt-1",
        providerReference: "pi-1",
      }),
    ).toBe("order-1:PAYMENT:evt-1");
  });
});
