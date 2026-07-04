import { describe, expect, it } from "vitest";
import { PaymentType } from "@konfi/types";
import {
  getDefaultCustomPaymentType,
  getFakturowniaPaymentTypeForOrder,
  getPaymentDefaultsForOrder,
  normalizeOrderPaymentType,
  resolveFakturowniaPaymentType,
} from "@/lib/fakturownia/payment-type";

describe("Fakturownia payment type mapping", () => {
  describe("normalizeOrderPaymentType", () => {
    it("normalizes enum values directly", () => {
      expect(normalizeOrderPaymentType(PaymentType.STRIPE)).toBe(
        PaymentType.STRIPE,
      );
      expect(normalizeOrderPaymentType(PaymentType.PRZELEWY24)).toBe(
        PaymentType.PRZELEWY24,
      );
    });

    it("normalizes legacy Przelewy24-style strings", () => {
      expect(normalizeOrderPaymentType("przelewy24")).toBe(
        PaymentType.PRZELEWY24,
      );
      expect(normalizeOrderPaymentType("PRZELEWY_24")).toBe(
        PaymentType.PRZELEWY24,
      );
      expect(normalizeOrderPaymentType("P24")).toBe(PaymentType.PRZELEWY24);
    });

    it("returns undefined for unsupported values", () => {
      expect(normalizeOrderPaymentType("unknown_gateway")).toBeUndefined();
      expect(normalizeOrderPaymentType("")).toBeUndefined();
    });
  });

  describe("getPaymentDefaultsForOrder", () => {
    it("maps Stripe orders to the custom Stripe form option", () => {
      expect(
        getPaymentDefaultsForOrder({
          initialKind: "vat",
          orderPaymentType: PaymentType.STRIPE,
        }),
      ).toEqual({
        paymentType: "custom_stripe",
        paymentTerm: "0",
      });
    });

    it("maps Przelewy24 aliases to the custom Przelewy24 form option", () => {
      expect(
        getPaymentDefaultsForOrder({
          initialKind: "vat",
          orderPaymentType: "P24",
        }),
      ).toEqual({
        paymentType: "custom_przelewy24",
        paymentTerm: "0",
      });
    });

    it("preserves Stripe for receipts instead of collapsing to card", () => {
      expect(
        getPaymentDefaultsForOrder({
          initialKind: "receipt",
          orderPaymentType: PaymentType.STRIPE,
        }),
      ).toEqual({
        paymentType: "custom_stripe",
        paymentTerm: "0",
      });
    });

    it("preserves Przelewy24 for receipts instead of collapsing to card", () => {
      expect(
        getPaymentDefaultsForOrder({
          initialKind: "receipt",
          orderPaymentType: PaymentType.PRZELEWY24,
        }),
      ).toEqual({
        paymentType: "custom_przelewy24",
        paymentTerm: "0",
      });
    });

    it("falls back to transfer for unknown order payment types", () => {
      expect(
        getPaymentDefaultsForOrder({
          initialKind: "vat",
          orderPaymentType: "mystery_gateway",
        }),
      ).toEqual({
        paymentType: "transfer",
        paymentTerm: "7",
      });
    });
  });

  describe("resolveFakturowniaPaymentType", () => {
    it("serializes custom Stripe and Przelewy24 options to Fakturownia labels", () => {
      expect(
        resolveFakturowniaPaymentType({
          paymentType: "custom_stripe",
          customPaymentType: undefined,
        }),
      ).toBe("Stripe");

      expect(
        resolveFakturowniaPaymentType({
          paymentType: "custom_przelewy24",
          customPaymentType: "",
        }),
      ).toBe("Przelewy24");
    });

    it("keeps standard payment types unchanged", () => {
      expect(
        resolveFakturowniaPaymentType({
          paymentType: "transfer",
          customPaymentType: undefined,
        }),
      ).toBe("transfer");
    });

    it("preserves literal payment labels when they are already resolved", () => {
      expect(
        resolveFakturowniaPaymentType({
          paymentType: "Przelewy24",
          customPaymentType: undefined,
        }),
      ).toBe("Przelewy24");
    });
  });

  describe("order to Fakturownia serialization", () => {
    it("resolves the final Fakturownia payment type for VAT orders", () => {
      expect(
        getFakturowniaPaymentTypeForOrder({
          invoiceKind: "vat",
          orderPaymentType: PaymentType.STRIPE,
        }),
      ).toBe("Stripe");

      expect(
        getFakturowniaPaymentTypeForOrder({
          invoiceKind: "vat",
          orderPaymentType: PaymentType.PRZELEWY24,
        }),
      ).toBe("Przelewy24");
    });

    it("resolves the final Fakturownia payment type for receipt orders", () => {
      expect(
        getFakturowniaPaymentTypeForOrder({
          invoiceKind: "receipt",
          orderPaymentType: PaymentType.STRIPE,
        }),
      ).toBe("Stripe");

      expect(
        getFakturowniaPaymentTypeForOrder({
          invoiceKind: "receipt",
          orderPaymentType: PaymentType.PRZELEWY24,
        }),
      ).toBe("Przelewy24");
    });

    it("provides the preset custom label for custom form payment types", () => {
      expect(getDefaultCustomPaymentType("custom_stripe")).toBe(
        "Stripe",
      );
      expect(getDefaultCustomPaymentType("custom_przelewy24")).toBe(
        "Przelewy24",
      );
    });
  });
});