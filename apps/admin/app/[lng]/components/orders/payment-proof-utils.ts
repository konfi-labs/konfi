import { Order, PaymentStatus } from "@konfi/types";

export function getPaymentProofOptimisticOrderUpdate(
  paymentDocumentId: string,
): Partial<Order> {
  return {
    paymentDocumentId,
    paymentStatus: PaymentStatus.COMPLETED,
  };
}
