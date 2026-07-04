import { PaymentStatus } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  getInvoiceMatchFields,
  mapInvoiceStatusToPaymentStatus,
  shouldApplyWebhookPaymentStatus,
} from "./status-utils";

describe("mapInvoiceStatusToPaymentStatus", () => {
  it("maps paid invoices to completed payments", () => {
    expect(mapInvoiceStatusToPaymentStatus("paid")).toBe(
      PaymentStatus.COMPLETED,
    );
  });

  it("maps sent invoices to pending payments", () => {
    expect(mapInvoiceStatusToPaymentStatus("sent")).toBe(PaymentStatus.PENDING);
  });
});

describe("getInvoiceMatchFields", () => {
  it("matches both document fields for proforma invoices", () => {
    expect(getInvoiceMatchFields("proforma")).toEqual([
      "paymentDocumentId",
      "proformaDocumentId",
    ]);
  });

  it("matches only payment documents for regular invoices", () => {
    expect(getInvoiceMatchFields("vat")).toEqual(["paymentDocumentId"]);
  });
});

describe("shouldApplyWebhookPaymentStatus", () => {
  it("prevents downgrading a completed order back to pending", () => {
    expect(
      shouldApplyWebhookPaymentStatus(
        PaymentStatus.COMPLETED,
        PaymentStatus.PENDING,
      ),
    ).toBe(false);
  });

  it("prevents downgrading a partially paid order back to pending", () => {
    expect(
      shouldApplyWebhookPaymentStatus(
        PaymentStatus.PARTIALLY_PAID,
        PaymentStatus.PENDING,
      ),
    ).toBe(false);
  });

  it("allows forward progress from pending to completed", () => {
    expect(
      shouldApplyWebhookPaymentStatus(
        PaymentStatus.PENDING,
        PaymentStatus.COMPLETED,
      ),
    ).toBe(true);
  });
});
