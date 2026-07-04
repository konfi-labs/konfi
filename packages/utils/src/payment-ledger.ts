import {
  type CurrencyCode,
  type PaymentLedgerEntry,
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  PaymentReconciliationStatus,
  PaymentStatus,
} from "@konfi/types";

export interface PaymentLedgerSummary {
  currency?: CurrencyCode;
  disputedAmount: number;
  failedAmount: number;
  ledgerEntryIds: string[];
  netPaidAmount: number;
  paidAmount: number;
  pendingAmount: number;
  refundedAmount: number;
}

export interface PaymentReconciliationResult extends PaymentLedgerSummary {
  expectedAmount: number;
  outstandingAmount: number;
  paymentStatus: PaymentStatus;
  status: PaymentReconciliationStatus;
}

const PAYMENT_ENTRY_TYPES = new Set<PaymentLedgerEntryType>([
  PaymentLedgerEntryType.CAPTURE,
  PaymentLedgerEntryType.PAYMENT,
]);

const REFUND_ENTRY_TYPES = new Set<PaymentLedgerEntryType>([
  PaymentLedgerEntryType.CHARGEBACK,
  PaymentLedgerEntryType.REFUND,
  PaymentLedgerEntryType.REVERSAL,
]);

export function isSettledPaymentLedgerEntry(
  entry: Pick<PaymentLedgerEntry, "status">,
): boolean {
  return entry.status === PaymentLedgerEntryStatus.SUCCEEDED;
}

export function isPendingPaymentLedgerEntry(
  entry: Pick<PaymentLedgerEntry, "status">,
): boolean {
  return entry.status === PaymentLedgerEntryStatus.PENDING;
}

export function getPaymentLedgerSignedAmount(
  entry: Pick<PaymentLedgerEntry, "amount" | "entryType" | "status">,
): number {
  if (!isSettledPaymentLedgerEntry(entry)) {
    return 0;
  }

  const amount = Math.abs(entry.amount);

  if (PAYMENT_ENTRY_TYPES.has(entry.entryType)) {
    return amount;
  }

  if (REFUND_ENTRY_TYPES.has(entry.entryType)) {
    return -amount;
  }

  if (entry.entryType === PaymentLedgerEntryType.ADJUSTMENT) {
    return entry.amount;
  }

  return 0;
}

export function summarizePaymentLedgerEntries(
  entries: readonly PaymentLedgerEntry[],
  currency?: CurrencyCode,
): PaymentLedgerSummary {
  const summary: PaymentLedgerSummary = {
    currency,
    disputedAmount: 0,
    failedAmount: 0,
    ledgerEntryIds: [],
    netPaidAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    refundedAmount: 0,
  };

  for (const entry of entries) {
    if (currency && entry.currency !== currency) {
      continue;
    }

    summary.currency ??= entry.currency;
    summary.ledgerEntryIds.push(entry.id);

    if (isPendingPaymentLedgerEntry(entry)) {
      summary.pendingAmount += Math.abs(entry.amount);
      continue;
    }

    if (entry.status === PaymentLedgerEntryStatus.FAILED) {
      summary.failedAmount += Math.abs(entry.amount);
      continue;
    }

    const signedAmount = getPaymentLedgerSignedAmount(entry);
    summary.netPaidAmount += signedAmount;

    if (
      isSettledPaymentLedgerEntry(entry) &&
      PAYMENT_ENTRY_TYPES.has(entry.entryType)
    ) {
      summary.paidAmount += Math.abs(entry.amount);
    }

    if (
      isSettledPaymentLedgerEntry(entry) &&
      REFUND_ENTRY_TYPES.has(entry.entryType)
    ) {
      const amount = Math.abs(entry.amount);
      summary.refundedAmount += amount;

      if (entry.entryType === PaymentLedgerEntryType.CHARGEBACK) {
        summary.disputedAmount += amount;
      }
    }
  }

  return summary;
}

function getPaymentReconciliationStatus({
  disputedAmount,
  expectedAmount,
  netPaidAmount,
  paidAmount,
  pendingAmount,
  refundedAmount,
}: {
  disputedAmount: number;
  expectedAmount: number;
  netPaidAmount: number;
  paidAmount: number;
  pendingAmount: number;
  refundedAmount: number;
}): PaymentReconciliationStatus {
  if (disputedAmount > 0) {
    return PaymentReconciliationStatus.DISPUTED;
  }

  if (expectedAmount <= 0 && netPaidAmount === 0) {
    return PaymentReconciliationStatus.MATCHED;
  }

  if (paidAmount > 0 && netPaidAmount <= 0 && refundedAmount > 0) {
    return PaymentReconciliationStatus.REFUNDED;
  }

  if (netPaidAmount === expectedAmount) {
    return PaymentReconciliationStatus.MATCHED;
  }

  if (netPaidAmount > expectedAmount) {
    return PaymentReconciliationStatus.OVERPAID;
  }

  if (netPaidAmount > 0 && pendingAmount > 0) {
    return PaymentReconciliationStatus.PARTIALLY_MATCHED;
  }

  if (netPaidAmount > 0 && netPaidAmount < expectedAmount) {
    return PaymentReconciliationStatus.UNDERPAID;
  }

  return PaymentReconciliationStatus.UNRECONCILED;
}

export function getPaymentStatusFromReconciliation(
  status: PaymentReconciliationStatus,
  pendingAmount = 0,
): PaymentStatus {
  switch (status) {
    case PaymentReconciliationStatus.DISPUTED:
      return PaymentStatus.PENDING;
    case PaymentReconciliationStatus.MATCHED:
    case PaymentReconciliationStatus.OVERPAID:
      return PaymentStatus.COMPLETED;
    case PaymentReconciliationStatus.PARTIALLY_MATCHED:
    case PaymentReconciliationStatus.UNDERPAID:
      return PaymentStatus.PARTIALLY_PAID;
    case PaymentReconciliationStatus.REFUNDED:
      return PaymentStatus.REFUNDED;
    case PaymentReconciliationStatus.UNRECONCILED:
      return pendingAmount > 0 ? PaymentStatus.PENDING : PaymentStatus.NEW;
  }

  throw new Error(`Unsupported payment reconciliation status: ${status}`);
}

export function reconcilePaymentLedgerEntries({
  currency,
  entries,
  expectedAmount,
}: {
  currency?: CurrencyCode;
  entries: readonly PaymentLedgerEntry[];
  expectedAmount: number;
}): PaymentReconciliationResult {
  const summary = summarizePaymentLedgerEntries(entries, currency);
  const outstandingAmount = Math.max(0, expectedAmount - summary.netPaidAmount);
  const status = getPaymentReconciliationStatus({
    disputedAmount: summary.disputedAmount,
    expectedAmount,
    netPaidAmount: summary.netPaidAmount,
    paidAmount: summary.paidAmount,
    pendingAmount: summary.pendingAmount,
    refundedAmount: summary.refundedAmount,
  });

  return {
    ...summary,
    expectedAmount,
    outstandingAmount,
    paymentStatus: getPaymentStatusFromReconciliation(
      status,
      summary.pendingAmount,
    ),
    status,
  };
}

export function isValidPaymentLedgerAmount(
  entryType: PaymentLedgerEntryType,
  amount: number,
): boolean {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    return false;
  }

  return entryType === PaymentLedgerEntryType.ADJUSTMENT
    ? amount !== 0
    : amount > 0;
}

export function getPaymentLedgerIdempotencyKey({
  entryType,
  orderId,
  providerEventId,
  providerReference,
}: {
  entryType: PaymentLedgerEntryType;
  orderId: string;
  providerEventId?: string | null;
  providerReference?: string | null;
}): string {
  return [
    orderId,
    entryType,
    providerEventId?.trim() || providerReference?.trim() || "manual",
  ].join(":");
}
