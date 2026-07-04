import type { Base } from "../base";
import type { CurrencyCode } from "../enums";
import type { TenantOwned } from "../tenant";

export enum RmaRequestStatus {
  NEW = "NEW",
  UNDER_REVIEW = "UNDER_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  COMPLETED = "COMPLETED",
  CANCELED = "CANCELED",
}

export enum RmaRequestType {
  CLAIM = "CLAIM",
  EXCHANGE = "EXCHANGE",
  RETURN = "RETURN",
}

export enum RmaResolutionType {
  CREDIT = "CREDIT",
  REJECT = "REJECT",
  REFUND = "REFUND",
  REMAKE = "REMAKE",
  REPAIR = "REPAIR",
  REPLACE = "REPLACE",
}

export type RmaProviderRefundStatus =
  | "COMPLETED"
  | "FAILED"
  | "PENDING"
  | "PROCESSING";

export type RmaFulfillmentRequestStatus = "COMPLETED" | "FAILED" | "SKIPPED";

export type RmaStockReservationStatus = "COMPLETED" | "FAILED" | "SKIPPED";

export interface RmaRequestItem {
  approvedQuantity?: number;
  description?: string;
  orderItemId: string;
  quantity: number;
  reason?: string;
  refundAmount?: number;
}

export interface RmaResolution {
  amount?: number;
  currency?: CurrencyCode;
  notes?: string;
  type: RmaResolutionType;
}

export interface RmaResolutionEvent extends Omit<Base, "name">, TenantOwned {
  amount?: number;
  channelId: string;
  currency?: CurrencyCode;
  notes?: string;
  orderId: string;
  fulfillmentRequestCreatedCount?: number;
  fulfillmentRequestError?: string;
  fulfillmentRequestSkippedCount?: number;
  fulfillmentRequestStatus?: RmaFulfillmentRequestStatus;
  paymentLedgerEntryId?: string;
  providerRefundError?: string;
  providerRefundStatus?: RmaProviderRefundStatus;
  replacementOrderId?: string;
  rmaRequestId: string;
  stockReservationError?: string;
  stockReservationStatus?: RmaStockReservationStatus;
  storeCreditTransactionId?: string;
  type: RmaResolutionType;
}

export interface RmaRequest extends Omit<Base, "name">, TenantOwned {
  channelId: string;
  complaintId?: string;
  currency: CurrencyCode;
  customerId?: string;
  description?: string;
  items: RmaRequestItem[];
  orderId: string;
  paymentLedgerEventIds?: string[];
  replacementOrderIds?: string[];
  resolution?: RmaResolution;
  resolutionEventIds?: string[];
  returnShipmentId?: string;
  status: RmaRequestStatus;
  storeCreditTransactionIds?: string[];
  type: RmaRequestType;
}
