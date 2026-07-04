import { describe, expect, it } from "vitest";
import {
  FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE,
  FAKTUROWNIA_EMPLOYEE_RECIPIENT_ROLE,
  FAKTUROWNIA_DEFAULT_ISSUER_ROLE,
  FAKTUROWNIA_DEFAULT_RECIPIENT_ROLE,
  FAKTUROWNIA_JST_RECIPIENT_ROLE,
  FAKTUROWNIA_OTHER_ROLE,
  FAKTUROWNIA_PAYER_RECIPIENT_ROLE,
  FAKTUROWNIA_POSITION_DESCRIPTION_MAX_LENGTH,
  FAKTUROWNIA_VAT_GROUP_RECIPIENT_ROLE,
  buildFakturowniaInvoiceAdditionalData,
  buildFakturowniaVatCopyParties,
  getFakturowniaInvoiceRecipientFromAddress,
  getFakturowniaJstRecipientFromAddress,
  getFakturowniaRoleDescription,
  isFakturowniaJstRecipientRole,
  normalizeFakturowniaBuyerCountry,
  normalizeFakturowniaIssuerRole,
  normalizeFakturowniaRecipientCountry,
  normalizeFakturowniaRecipientRole,
  truncateFakturowniaInvoicePositionDescription,
} from "@/lib/fakturownia/invoice-payload";

describe("Fakturownia invoice payload helpers", () => {
  describe("normalizeFakturowniaRecipientRole", () => {
    it("normalizes JST aliases to the API role value", () => {
      expect(normalizeFakturowniaRecipientRole("JST")).toBe(
        FAKTUROWNIA_JST_RECIPIENT_ROLE,
      );
      expect(normalizeFakturowniaRecipientRole("JST - odbiorca")).toBe(
        FAKTUROWNIA_JST_RECIPIENT_ROLE,
      );
      expect(normalizeFakturowniaRecipientRole("JST – odbiorca")).toBe(
        FAKTUROWNIA_JST_RECIPIENT_ROLE,
      );
      expect(
        normalizeFakturowniaRecipientRole("Jednostka samorządu terytorialnego"),
      ).toBe(FAKTUROWNIA_JST_RECIPIENT_ROLE);
    });

    it("normalizes documented role values to API casing and punctuation", () => {
      expect(normalizeFakturowniaRecipientRole("odbiorca")).toBe(
        FAKTUROWNIA_DEFAULT_RECIPIENT_ROLE,
      );
      expect(normalizeFakturowniaRecipientRole("Dodatkowy Nabywca")).toBe(
        FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE,
      );
      expect(normalizeFakturowniaRecipientRole("Dodatkowy nabywca")).toBe(
        FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE,
      );
      expect(normalizeFakturowniaRecipientRole("Członek GV - odbiorca")).toBe(
        FAKTUROWNIA_VAT_GROUP_RECIPIENT_ROLE,
      );
      expect(normalizeFakturowniaRecipientRole("Członek GV – odbiorca")).toBe(
        FAKTUROWNIA_VAT_GROUP_RECIPIENT_ROLE,
      );
    });
  });

  describe("isFakturowniaJstRecipientRole", () => {
    it("detects JST recipient roles from aliases", () => {
      expect(isFakturowniaJstRecipientRole("JST - odbiorca")).toBe(true);
      expect(isFakturowniaJstRecipientRole("Odbiorca")).toBe(false);
    });
  });

  describe("normalizeFakturowniaIssuerRole", () => {
    it("normalizes documented role values to API casing and punctuation", () => {
      expect(normalizeFakturowniaIssuerRole("Wystawca")).toBe(
        FAKTUROWNIA_DEFAULT_ISSUER_ROLE,
      );
      expect(normalizeFakturowniaIssuerRole("wystawca faktury")).toBe(
        FAKTUROWNIA_DEFAULT_ISSUER_ROLE,
      );
      expect(normalizeFakturowniaIssuerRole("JST - wystawca")).toBe(
        "JST – wystawca",
      );
      expect(normalizeFakturowniaIssuerRole("członek gv - wystawca")).toBe(
        "Członek GV – wystawca",
      );
    });
  });

  describe("country normalization", () => {
    it("falls buyer country back to PL when Fakturownia data is invalid", () => {
      expect(normalizeFakturowniaBuyerCountry("XX")).toBe("PL");
    });

    it("only falls recipient country back when explicitly requested", () => {
      expect(normalizeFakturowniaRecipientCountry("XX")).toBeUndefined();
      expect(
        normalizeFakturowniaRecipientCountry("XX", { fallback: "PL" }),
      ).toBe("PL");
    });
  });

  describe("buildFakturowniaInvoiceAdditionalData", () => {
    it("marks buyer as JST when recipient role represents JST recipient", () => {
      expect(
        buildFakturowniaInvoiceAdditionalData({
          recipientRole: "JST - odbiorca",
        }),
      ).toEqual({ buyer_jst: "1" });
    });

    it("overrides selected client data so normalized buyer fields are used", () => {
      expect(
        buildFakturowniaInvoiceAdditionalData({
          clientId: "123",
          recipientRole: FAKTUROWNIA_JST_RECIPIENT_ROLE,
        }),
      ).toEqual({ buyer_override: true, buyer_jst: "1" });
    });
  });

  describe("buildFakturowniaVatCopyParties", () => {
    it("does not override copied parties when roles are already canonical", () => {
      expect(
        buildFakturowniaVatCopyParties({
          issuers: [{ id: 7, name: "Seller", role: "Wystawca faktury" }],
          recipients: [
            {
              name: "Delivery Office",
              role: "Odbiorca",
              tax_no: "7010224621",
              city: "Warszawa",
            },
          ],
        }),
      ).toEqual({});
    });

    it("defaults and normalizes party roles copied from stored proformas", () => {
      expect(
        buildFakturowniaVatCopyParties({
          issuers: [{ id: 7, name: "Seller", role: "Wystawca" }],
          recipients: [
            {
              name: "Delivery Office",
              role: null,
              tax_no: "7010224621",
              city: "Warszawa",
            },
            {
              name: "Additional Buyer",
              role: "Dodatkowy Nabywca",
              tax_no: "5252445767",
              city: "Kraków",
            },
          ],
        }),
      ).toEqual({
        issuers: [
          {
            id: 7,
            name: "Seller",
            role: FAKTUROWNIA_DEFAULT_ISSUER_ROLE,
          },
        ],
        recipients: [
          {
            name: "Delivery Office",
            taxNo: "7010224621",
            city: "Warszawa",
            role: FAKTUROWNIA_DEFAULT_RECIPIENT_ROLE,
          },
          {
            name: "Additional Buyer",
            taxNo: "5252445767",
            city: "Kraków",
            role: FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE,
          },
        ],
      });
    });
  });

  describe("position description normalization", () => {
    it("truncates invoice position descriptions without changing other fields", () => {
      const description = "Synthetic print options ".repeat(20);

      expect(
        truncateFakturowniaInvoicePositionDescription({
          name: "Synthetic print item",
          quantity: 2,
          tax: 23,
          description,
        }),
      ).toEqual({
        name: "Synthetic print item",
        quantity: 2,
        tax: 23,
        description: description.slice(
          0,
          FAKTUROWNIA_POSITION_DESCRIPTION_MAX_LENGTH,
        ),
      });
    });

    it("leaves positions without overlong descriptions unchanged", () => {
      const position = {
        name: "Synthetic poster",
        quantity: "2.0",
        tax: "23",
        description: "A3, matte",
      };

      expect(truncateFakturowniaInvoicePositionDescription(position)).toBe(
        position,
      );
    });
  });

  describe("getFakturowniaJstRecipientFromAddress", () => {
    it("extracts enabled Polish JST recipient data from a billing address", () => {
      expect(
        getFakturowniaJstRecipientFromAddress({
          name: "Buyer",
          type: "BILLING",
          companyName: "Buyer Company",
          nip: "1111111111",
          jstRecipientEnabled: true,
          jstRecipientName: "Gmina Testowa",
          jstRecipientNip: "2222222222",
          jstRecipientStreet: "Rynek 1",
          jstRecipientZip: "00-001",
          jstRecipientCity: "Warszawa",
          country: "Polska",
          active: true,
        }),
      ).toEqual({
        name: "Gmina Testowa",
        street: "Rynek 1",
        postCode: "00-001",
        city: "Warszawa",
        country: "PL",
        taxNo: "2222222222",
      });
    });

    it("ignores JST recipient data outside Poland", () => {
      expect(
        getFakturowniaJstRecipientFromAddress({
          name: "Buyer",
          type: "BILLING",
          jstRecipientEnabled: true,
          jstRecipientName: "Berlin Office",
          country: "DE",
          active: true,
        }),
      ).toBeUndefined();
    });
  });

  describe("getFakturowniaInvoiceRecipientFromAddress", () => {
    it("extracts a normal recipient without a structured Fakturownia role", () => {
      expect(
        getFakturowniaInvoiceRecipientFromAddress({
          name: "Buyer",
          type: "BILLING",
          invoiceRecipientEnabled: true,
          invoiceRecipientRole: "recipient",
          invoiceRecipientName: "Delivery Office",
          invoiceRecipientNip: "3333333333",
          invoiceRecipientStreet: "Recipient 3",
          invoiceRecipientZip: "00-003",
          invoiceRecipientCity: "Gdansk",
          country: "Polska",
        }),
      ).toEqual({
        formRole: "recipient",
        role: undefined,
        roleDescription: undefined,
        name: "Delivery Office",
        street: "Recipient 3",
        postCode: "00-003",
        city: "Gdansk",
        country: "PL",
        taxNo: "3333333333",
      });
    });

    it.each([
      ["additionalBuyer", FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE],
      ["payer", FAKTUROWNIA_PAYER_RECIPIENT_ROLE],
      ["vatGroupMember", FAKTUROWNIA_VAT_GROUP_RECIPIENT_ROLE],
      ["employee", FAKTUROWNIA_EMPLOYEE_RECIPIENT_ROLE],
    ] as const)("maps %s to its Fakturownia API role", (role, apiRole) => {
      expect(
        getFakturowniaInvoiceRecipientFromAddress({
          name: "Buyer",
          type: "BILLING",
          invoiceRecipientEnabled: true,
          invoiceRecipientRole: role,
          invoiceRecipientName: "Recipient",
          country: "PL",
        })?.role,
      ).toBe(apiRole);
    });

    it("maps other recipients to the Rola inna role with a description", () => {
      // Fakturownia rejects arbitrary role strings; custom roles must use the
      // whitelisted "Rola inna" value with the text moved to role_description.
      expect(
        getFakturowniaInvoiceRecipientFromAddress({
          name: "Buyer",
          type: "BILLING",
          invoiceRecipientEnabled: true,
          invoiceRecipientRole: "other",
          invoiceRecipientRoleDescription: "Grant coordinator",
          invoiceRecipientName: "Recipient",
          country: "PL",
        }),
      ).toMatchObject({
        formRole: "other",
        role: FAKTUROWNIA_OTHER_ROLE,
        roleDescription: "Grant coordinator",
      });
    });

    it("omits the role for other recipients without a description", () => {
      expect(
        getFakturowniaInvoiceRecipientFromAddress({
          name: "Buyer",
          type: "BILLING",
          invoiceRecipientEnabled: true,
          invoiceRecipientRole: "other",
          invoiceRecipientName: "Recipient",
          country: "PL",
        })?.role,
      ).toBeUndefined();
    });

    it("maps legacy JST recipient data through the generic extractor", () => {
      expect(
        getFakturowniaInvoiceRecipientFromAddress({
          name: "Buyer",
          type: "BILLING",
          jstRecipientEnabled: true,
          jstRecipientName: "Gmina Testowa",
          jstRecipientNip: "2222222222",
          jstRecipientStreet: "Rynek 1",
          jstRecipientZip: "00-001",
          jstRecipientCity: "Warszawa",
          country: "Polska",
        }),
      ).toMatchObject({
        formRole: "jst",
        role: FAKTUROWNIA_JST_RECIPIENT_ROLE,
        name: "Gmina Testowa",
        taxNo: "2222222222",
        country: "PL",
      });
    });
  });

  describe("getFakturowniaRoleDescription", () => {
    it("returns the trimmed description only for the Rola inna role", () => {
      expect(
        getFakturowniaRoleDescription({
          role: FAKTUROWNIA_OTHER_ROLE,
          roleDescription: "  Grant coordinator  ",
        }),
      ).toBe("Grant coordinator");
    });

    it("returns undefined for whitelisted roles", () => {
      expect(
        getFakturowniaRoleDescription({
          role: FAKTUROWNIA_JST_RECIPIENT_ROLE,
          roleDescription: "ignored",
        }),
      ).toBeUndefined();
    });

    it("truncates the description to the KSeF 25-character limit", () => {
      const description =
        "A very long custom role description well over the limit";
      const result = getFakturowniaRoleDescription({
        role: FAKTUROWNIA_OTHER_ROLE,
        roleDescription: description,
      });
      expect(result).toHaveLength(25);
      expect(description.startsWith(result ?? "")).toBe(true);
    });
  });
});
