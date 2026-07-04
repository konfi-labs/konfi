import { describe, expect, it } from "vitest";
import { normalizeInvoiceRecipientAddress } from "../invoice-recipient";

describe("invoice recipient helpers", () => {
  it("normalizes legacy JST recipient fields into the generic recipient model", () => {
    expect(
      normalizeInvoiceRecipientAddress({
        name: "Buyer",
        type: "BILLING",
        jstRecipientEnabled: true,
        jstRecipientName: "Gmina Testowa",
        jstRecipientNip: "2222222222",
        jstRecipientStreet: "Rynek 1",
        jstRecipientZip: "00-001",
        jstRecipientCity: "Warszawa",
      }),
    ).toMatchObject({
      invoiceRecipientEnabled: true,
      invoiceRecipientRole: "jst",
      invoiceRecipientName: "Gmina Testowa",
      invoiceRecipientNip: "2222222222",
      invoiceRecipientStreet: "Rynek 1",
      invoiceRecipientZip: "00-001",
      invoiceRecipientCity: "Warszawa",
      jstRecipientEnabled: true,
      jstRecipientName: "Gmina Testowa",
    });
  });

  it("clears legacy JST mirror fields when the generic recipient role is not JST", () => {
    expect(
      normalizeInvoiceRecipientAddress({
        name: "Buyer",
        type: "BILLING",
        invoiceRecipientEnabled: true,
        invoiceRecipientRole: "payer",
        invoiceRecipientName: "Payer Company",
        invoiceRecipientNip: "3333333333",
        invoiceRecipientStreet: "Payment 2",
        invoiceRecipientZip: "00-002",
        invoiceRecipientCity: "Krakow",
        jstRecipientEnabled: true,
        jstRecipientName: "Old JST",
      }),
    ).toMatchObject({
      invoiceRecipientEnabled: true,
      invoiceRecipientRole: "payer",
      invoiceRecipientName: "Payer Company",
      jstRecipientEnabled: false,
      jstRecipientName: "",
      jstRecipientNip: "",
      jstRecipientStreet: "",
      jstRecipientZip: "",
      jstRecipientCity: "",
    });
  });
});
