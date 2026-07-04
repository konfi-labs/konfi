import { PaymentType } from "@konfi/types";
import {
  getPaymentDocumentInvoiceCreateKind,
  getPaymentDocumentMeta,
} from "../../getters/get-payment-document-meta";

describe("getPaymentDocumentMeta", () => {
  it("returns invoice meta when billing exists and payment type is not DEFERRED", () => {
    const meta = getPaymentDocumentMeta(PaymentType.BANK_TRANSFER, true);

    expect(meta.kind).toBe("INVOICE");
    expect(meta.translationKey).toBe("order.createInvoice");
    expect(meta.defaultLabel).toBe("Create invoice");
    expect(meta.icon).toBe("receipt_long");
  });

  it("returns pro forma invoice meta when payment type is PROFORMA and billing exists", () => {
    const meta = getPaymentDocumentMeta(PaymentType.PROFORMA, true);

    expect(meta.kind).toBe("INVOICE");
    expect(meta.translationKey).toBe("order.createProformaInvoice");
    expect(meta.defaultLabel).toBe("Create pro forma invoice");
    expect(meta.icon).toBe("receipt_long");
  });

  it("returns WZ/CI meta when payment type is DEFERRED and billing exists", () => {
    const meta = getPaymentDocumentMeta(PaymentType.DEFERRED, true);

    expect(meta.kind).toBe("WZCI");
    expect(meta.translationKey).toBe("order.createWzCi");
    expect(meta.defaultLabel).toBe("Create WZ/CI");
    expect(meta.icon).toBe("inventory_2");
  });

  it("returns WZ/CI meta when payment type is DEFERRED and no billing exists", () => {
    const meta = getPaymentDocumentMeta(PaymentType.DEFERRED, false);

    expect(meta.kind).toBe("WZCI");
  });

  it("returns receipt meta when no billing and payment type is not DEFERRED", () => {
    const meta = getPaymentDocumentMeta(PaymentType.ON_PICKUP, false);

    expect(meta.kind).toBe("RECEIPT");
    expect(meta.translationKey).toBe("order.createReceipt");
    expect(meta.defaultLabel).toBe("Create receipt");
    expect(meta.icon).toBe("receipt");
  });

  it("returns receipt meta when payment type is undefined and no billing exists", () => {
    const meta = getPaymentDocumentMeta(undefined, false);

    expect(meta.kind).toBe("RECEIPT");
  });

  it("returns receipt meta for Allegro even when billing exists", () => {
    const meta = getPaymentDocumentMeta(PaymentType.ALLEGRO, true);

    expect(meta.kind).toBe("RECEIPT");
    expect(meta.translationKey).toBe("order.createReceipt");
  });

  it("returns receipt invoice create kind for receipt meta", () => {
    const meta = getPaymentDocumentMeta(PaymentType.ON_PICKUP, false);

    expect(getPaymentDocumentInvoiceCreateKind(meta)).toBe("receipt");
  });

  it("returns proforma invoice create kind for pro forma meta", () => {
    const meta = getPaymentDocumentMeta(PaymentType.PROFORMA, true);

    expect(getPaymentDocumentInvoiceCreateKind(meta)).toBe("proforma");
  });

  it("does not return invoice create kind for standard invoice meta", () => {
    const meta = getPaymentDocumentMeta(PaymentType.BANK_TRANSFER, true);

    expect(getPaymentDocumentInvoiceCreateKind(meta)).toBeUndefined();
  });
});
