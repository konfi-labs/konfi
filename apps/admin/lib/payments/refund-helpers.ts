import type { AdminPaymentRefundStatus } from "./admin-types";

export type PaymentRefundRequestAudit = {
  requestId: string;
  amount: number;
  status: Exclude<AdminPaymentRefundStatus, "NONE">;
  reason: string;
  requestedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
  providerRefundId?: string;
  providerReference?: string;
  failureReason?: string;
};

export type PaymentRefundAggregateLike = {
  amount?: number;
  refundAmount?: number;
  refundedAmount?: number;
  status?: Exclude<AdminPaymentRefundStatus, "NONE">;
  reason?: string;
  requestedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
  providerRefundId?: string;
  providerReference?: string;
  failureReason?: string;
  refundHistory?: PaymentRefundRequestAudit[];
};

function isRefundStatus(
  value: unknown,
): value is Exclude<AdminPaymentRefundStatus, "NONE"> {
  return (
    value === "PROCESSING" ||
    value === "PENDING" ||
    value === "COMPLETED" ||
    value === "FAILED"
  );
}

function toMinorAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : 0;
}

function toLegacyRefundAmount(refund?: PaymentRefundAggregateLike): number {
  if (!refund) {
    return 0;
  }

  if (
    typeof refund.refundAmount === "number" &&
    Number.isFinite(refund.refundAmount)
  ) {
    return Math.floor(refund.refundAmount);
  }

  return toMinorAmount(refund.amount);
}

export function getRefundHistory(
  refund?: PaymentRefundAggregateLike,
): PaymentRefundRequestAudit[] {
  if (refund?.refundHistory?.length) {
    return refund.refundHistory;
  }

  if (!refund?.status || !isRefundStatus(refund.status)) {
    return [];
  }

  return [
    {
      requestId: "legacy",
      amount: toLegacyRefundAmount(refund),
      status: refund.status,
      reason: refund.reason ?? "",
      requestedBy: refund.requestedBy ?? "",
      createdAt: refund.createdAt,
      updatedAt: refund.updatedAt,
      completedAt: refund.completedAt,
      failedAt: refund.failedAt,
      providerRefundId: refund.providerRefundId,
      providerReference: refund.providerReference,
      failureReason: refund.failureReason,
    },
  ];
}

export function getLatestRefundRequest(
  refund?: PaymentRefundAggregateLike,
): PaymentRefundRequestAudit | undefined {
  const history = getRefundHistory(refund);
  return history.at(-1);
}

export function getRefundedAmount(refund?: PaymentRefundAggregateLike): number {
  if (!refund) {
    return 0;
  }

  if (
    typeof refund.refundedAmount === "number" &&
    Number.isFinite(refund.refundedAmount)
  ) {
    return Math.max(Math.floor(refund.refundedAmount), 0);
  }

  const completedAmount = getRefundHistory(refund).reduce((total, request) => {
    return request.status === "COMPLETED"
      ? total + toMinorAmount(request.amount)
      : total;
  }, 0);

  if (completedAmount > 0) {
    return completedAmount;
  }

  return refund.status === "COMPLETED" ? toLegacyRefundAmount(refund) : 0;
}

export function getRemainingRefundableAmount(
  totalAmount: number,
  refund?: PaymentRefundAggregateLike,
): number {
  return Math.max(Math.floor(totalAmount) - getRefundedAmount(refund), 0);
}

export function hasActiveRefundRequest(
  refund?: PaymentRefundAggregateLike,
): boolean {
  const latestRequest = getLatestRefundRequest(refund);
  return (
    latestRequest?.status === "PROCESSING" ||
    latestRequest?.status === "PENDING"
  );
}

export function formatMinorAmountInput(amount: number): string {
  return (Math.max(Math.floor(amount), 0) / 100).toFixed(2);
}

export function parseRefundAmountInput(value: string): number | undefined {
  const normalizedValue = value.trim().replace(",", ".");

  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalizedValue)) {
    return undefined;
  }

  const [wholePart, fractionalPart = ""] = normalizedValue.split(".");
  const whole = Number.parseInt(wholePart, 10);

  if (!Number.isFinite(whole)) {
    return undefined;
  }

  const normalizedFractional = fractionalPart.padEnd(2, "0");
  const fractional = Number.parseInt(normalizedFractional, 10);

  if (!Number.isFinite(fractional)) {
    return undefined;
  }

  return whole * 100 + fractional;
}
