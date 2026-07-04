import type { Base } from "./base";
import type {
  PaymentMethodId,
  PaymentMethodProviderKind,
} from "./configuration/payment-methods";
import type { CurrencyCode, PaymentStatus } from "./enums";
import type { TenantOwned } from "./tenant";

export enum PaymentLedgerEntryStatus {
  CANCELED = "CANCELED",
  FAILED = "FAILED",
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
}

export enum PaymentLedgerEntryType {
  ADJUSTMENT = "ADJUSTMENT",
  AUTHORIZATION = "AUTHORIZATION",
  CAPTURE = "CAPTURE",
  CHARGEBACK = "CHARGEBACK",
  PAYMENT = "PAYMENT",
  REFUND = "REFUND",
  REVERSAL = "REVERSAL",
}

export enum PaymentReconciliationStatus {
  DISPUTED = "DISPUTED",
  MATCHED = "MATCHED",
  OVERPAID = "OVERPAID",
  PARTIALLY_MATCHED = "PARTIALLY_MATCHED",
  REFUNDED = "REFUNDED",
  UNRECONCILED = "UNRECONCILED",
  UNDERPAID = "UNDERPAID",
}

export type PaymentLedgerMetadataValue = boolean | null | number | string;

export type PaymentLedgerMetadata = Record<string, PaymentLedgerMetadataValue>;

export interface PaymentLedgerEntry extends Base, TenantOwned {
  amount: number;
  channelId: string;
  currency: CurrencyCode;
  entryType: PaymentLedgerEntryType;
  idempotencyKey?: string;
  metadata?: PaymentLedgerMetadata;
  orderId: string;
  orderNumber?: number;
  paymentMethodId: PaymentMethodId;
  providerEventId?: string;
  providerKind?: PaymentMethodProviderKind;
  providerReference?: string;
  reconciliationId?: string;
  settledAt?: unknown;
  status: PaymentLedgerEntryStatus;
}

export interface PaymentReconciliation extends Base, TenantOwned {
  channelId: string;
  currency: CurrencyCode;
  expectedAmount: number;
  ledgerEntryIds: string[];
  netPaidAmount: number;
  orderId: string;
  orderNumber?: number;
  outstandingAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  reconciledAt?: unknown;
  refundedAmount: number;
  status: PaymentReconciliationStatus;
}

export type PaymentLedgerEntryCreateForm = Omit<
  PaymentLedgerEntry,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export type PaymentReconciliationCreateForm = Omit<
  PaymentReconciliation,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;
