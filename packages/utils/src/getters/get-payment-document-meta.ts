import { PaymentType } from "@konfi/types";

export type PaymentDocumentKind = "INVOICE" | "RECEIPT" | "WZCI";
export type PaymentDocumentInvoiceCreateKind = "proforma" | "receipt";

export interface PaymentDocumentMeta {
  kind: PaymentDocumentKind;
  translationKey: string;
  defaultLabel: string;
  icon: string;
}

export function getPaymentDocumentMeta(
  paymentType: string | undefined,
  hasBilling: boolean,
): PaymentDocumentMeta {
  let kind: PaymentDocumentKind;
  const isProforma = paymentType === PaymentType.PROFORMA;

  if (paymentType === PaymentType.ALLEGRO) {
    kind = "RECEIPT";
  } else if (hasBilling && paymentType !== PaymentType.DEFERRED) {
    kind = "INVOICE";
  } else if (paymentType === PaymentType.DEFERRED) {
    kind = "WZCI";
  } else {
    kind = "RECEIPT";
  }

  if (kind === "INVOICE") {
    if (isProforma) {
      return {
        kind,
        translationKey: "order.createProformaInvoice",
        defaultLabel: "Create pro forma invoice",
        icon: "receipt_long",
      };
    }

    return {
      kind,
      translationKey: "order.createInvoice",
      defaultLabel: "Create invoice",
      icon: "receipt_long",
    };
  }

  if (kind === "WZCI") {
    return {
      kind,
      translationKey: "order.createWzCi",
      defaultLabel: "Create WZ/CI",
      icon: "inventory_2",
    };
  }

  return {
    kind,
    translationKey: "order.createReceipt",
    defaultLabel: "Create receipt",
    icon: "receipt",
  };
}

export function getPaymentDocumentInvoiceCreateKind(
  meta: PaymentDocumentMeta,
): PaymentDocumentInvoiceCreateKind | undefined {
  if (meta.kind === "RECEIPT") {
    return "receipt";
  }

  if (meta.translationKey === "order.createProformaInvoice") {
    return "proforma";
  }

  return undefined;
}
