import { describe, expect, it } from "vitest";
import {
  getCustomerDataTarget,
  getCustomerDataCompanyName,
  normalizeNip,
  parsePolishAddress,
  type CustomerDataSubject,
} from "../GetCustomerDataDialog.helpers";

describe("getCustomerDataCompanyName", () => {
  it("prefers the representative company name when it is available", () => {
    const subject: CustomerDataSubject = {
      name: "Example Customer",
      representatives: [{ companyName: "Example Print Shop" }],
    };

    expect(getCustomerDataCompanyName(subject)).toBe("Example Print Shop");
  });

  it("falls back to the subject name when no representative company exists", () => {
    const subject: CustomerDataSubject = {
      name: "Example Company Sp. z o.o.",
      representatives: [{ companyName: "   " }],
    };

    expect(getCustomerDataCompanyName(subject)).toBe(
      "Example Company Sp. z o.o.",
    );
  });

  it("returns an empty string when the response does not include any company name", () => {
    const subject: CustomerDataSubject = {};

    expect(getCustomerDataCompanyName(subject)).toBe("");
  });
});

describe("normalizeNip", () => {
  it("removes spaces and dashes from the provided value", () => {
    expect(normalizeNip("000-000 00 00")).toBe("0000000000");
  });
});

describe("parsePolishAddress", () => {
  it("parses a standard Polish address with a postal code", () => {
    expect(parsePolishAddress("Example Street 1, 00-000 Example City")).toEqual(
      {
        street: "Example Street 1",
        zip: "00-000",
        city: "Example City",
      },
    );
  });

  it("falls back to comma-separated parsing when the address has no postal code", () => {
    expect(parsePolishAddress("Example Street 1, Example City Center")).toEqual(
      {
        street: "Example Street 1",
        zip: "Example",
        city: "City Center",
      },
    );
  });
});

describe("getCustomerDataTarget", () => {
  it("returns the top-level customer target paths", () => {
    expect(
      getCustomerDataTarget("nip", {
        name: "",
        companyName: "",
        regon: "",
        krs: "",
        addresses: [],
      }),
    ).toEqual({
      addressPath: "addresses[0]",
      entityNamePath: "name",
      companyNamePath: "companyName",
      regonPath: "regon",
      krsPath: "krs",
    });
  });

  it("targets the order billing object for billing NIP lookups", () => {
    expect(getCustomerDataTarget("billing.nip", {})).toEqual({
      addressPath: "billing",
    });
  });

  it("targets the order billing object for billing invoice recipient NIP lookups", () => {
    expect(getCustomerDataTarget("billing.invoiceRecipientNip", {})).toEqual({
      invoiceRecipientAddressPath: "billing",
    });
  });

  it("targets the matching address row for nested address lookups", () => {
    expect(getCustomerDataTarget("addresses[2].nip", {})).toEqual({
      addressPath: "addresses[2]",
    });
  });

  it("targets the matching address row for nested invoice recipient NIP lookups", () => {
    expect(
      getCustomerDataTarget("addresses[2].invoiceRecipientNip", {}),
    ).toEqual({
      invoiceRecipientAddressPath: "addresses[2]",
    });
  });
});
