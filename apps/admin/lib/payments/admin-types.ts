export type PaymentProviderKey = "stripe" | "przelewy24";

export type AdminPaymentRefundStatus =
  | "NONE"
  | "PROCESSING"
  | "PENDING"
  | "COMPLETED"
  | "FAILED";

export type AdminPaymentListItem = {
  orderId: string;
  orderNumber: number;
  orderPath: string;
  channelId: string;
  customerLabel: string;
  contactEmail?: string;
  currency: string;
  totalAmount: number;
  paymentStatus: string;
  providerReference?: string;
  checkoutSessionId?: string;
  checkoutUrl?: string;
  createdAt?: string;
  createdAtMs: number;
  refundEligible: boolean;
  refundedAmount: number;
  remainingRefundableAmount: number;
  refundStatus: AdminPaymentRefundStatus;
  refundAmount?: number;
  refundReason?: string;
  refundRequestedAt?: string;
  refundCompletedAt?: string;
  refundFailureReason?: string;
};

export type AdminPaymentSummary = {
  totalCount: number;
  refundableCount: number;
  refundedCount: number;
  pendingRefundCount: number;
  totalAmount: number;
};

export type AdminPaymentListResponse = {
  items: AdminPaymentListItem[];
  page: number;
  perPage: number;
  totalCount: number;
  summary: AdminPaymentSummary;
};

export type AdminRefundMutationResponse = {
  message: string;
  refundStatus: Exclude<AdminPaymentRefundStatus, "NONE">;
};
