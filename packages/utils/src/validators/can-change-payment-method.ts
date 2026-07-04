import { ActivityStatus, IActivity, PaymentStatus } from "@konfi/types";

/**
 * Determines if a payment method can be changed based on the current payment status.
 * Payment method changes are NOT allowed for:
 * - COMPLETED: Payment is already completed
 * - PENDING: Payment is in progress
 * - PARTIALLY_PAID: Payment is partially completed
 * - REFUNDED: Payment was already processed and refunded
 * - DRAFT: Order is in draft state
 */
export function canChangePaymentMethod(
  paymentStatus: PaymentStatus,
  activities: IActivity[],
): boolean {
  const disallowedStatuses: PaymentStatus[] = [
    PaymentStatus.COMPLETED,
    PaymentStatus.PENDING,
    PaymentStatus.PARTIALLY_PAID,
    PaymentStatus.REFUNDED,
    PaymentStatus.DRAFT,
  ];

  if (process.env.NODE_ENV === "development") {
    console.log("canChangePaymentMethod", {
      paymentStatus,
      disallowedStatuses,
      result: !disallowedStatuses.includes(paymentStatus),
    });
    return true;
  }

  if (
    activities.some(
      (activity) => activity.type === ActivityStatus.PAYMENT_METHOD_CHANGED,
    )
  ) {
    return false;
  }

  return !disallowedStatuses.includes(paymentStatus);
}

/**
 * Gets the list of payment statuses that disallow payment method changes
 */
export function getDisallowedPaymentStatuses(): PaymentStatus[] {
  return [
    PaymentStatus.COMPLETED,
    PaymentStatus.PENDING,
    PaymentStatus.PARTIALLY_PAID,
    PaymentStatus.REFUNDED,
    PaymentStatus.DRAFT,
  ];
}
