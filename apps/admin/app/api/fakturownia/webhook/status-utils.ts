import { type Invoice_status } from "@konfi/fakturownia/client/models";
import { PaymentStatus } from "@konfi/types";

export type OrderDocumentField = "paymentDocumentId" | "proformaDocumentId";

export function mapInvoiceStatusToPaymentStatus(
  invoiceStatus?: Invoice_status | null,
): PaymentStatus | null {
  if (!invoiceStatus) {
    return null;
  }

  switch (invoiceStatus) {
    case "paid":
      return PaymentStatus.COMPLETED;
    case "partial":
      return PaymentStatus.PARTIALLY_PAID;
    case "issued":
    case "sent":
      return PaymentStatus.PENDING;
    case "rejected":
      return PaymentStatus.CANCELED;
    default:
      return null;
  }
}

export function getInvoiceMatchFields(
  invoiceKind?: string | null,
): OrderDocumentField[] {
  if (invoiceKind === "proforma") {
    return ["paymentDocumentId", "proformaDocumentId"];
  }

  return ["paymentDocumentId"];
}

export function shouldApplyWebhookPaymentStatus(
  currentStatus: PaymentStatus | null | undefined,
  nextStatus: PaymentStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return false;
  }

  if (
    (currentStatus === PaymentStatus.COMPLETED ||
      currentStatus === PaymentStatus.REFUNDED) &&
    (nextStatus === PaymentStatus.NEW ||
      nextStatus === PaymentStatus.PENDING ||
      nextStatus === PaymentStatus.PARTIALLY_PAID)
  ) {
    return false;
  }

  if (
    currentStatus === PaymentStatus.PARTIALLY_PAID &&
    (nextStatus === PaymentStatus.NEW || nextStatus === PaymentStatus.PENDING)
  ) {
    return false;
  }

  return true;
}
