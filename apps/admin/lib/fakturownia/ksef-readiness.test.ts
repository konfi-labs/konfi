import { describe, expect, it } from "vitest";
import {
  isValidPolishNip,
  ksefInvoiceDataFromCreateParams,
  ksefInvoiceDataFromStoredInvoice,
  validateKsefReadiness,
  type KsefInvoiceData,
  type KsefReadinessIssueCode,
} from "@/lib/fakturownia/ksef-readiness";

const TODAY = "2026-06-10";

const validVatInvoice: KsefInvoiceData = {
  kind: "vat",
  issueDate: TODAY,
  buyerCompany: true,
  buyerName: "BIMAST CONSTRUCTION GROUP SP. Z O.O.",
  buyerTaxNo: "7011304084",
  buyerTaxNoKind: "",
  buyerCountry: "PL",
  positions: [{ name: "Druk ulotek", tax: 23 }],
  recipients: [],
  issuers: [],
};

const codes = (issues: { code: KsefReadinessIssueCode }[]) =>
  issues.map((issue) => issue.code);

describe("isValidPolishNip", () => {
  it("accepts a valid NIP with a correct checksum", () => {
    expect(isValidPolishNip("7011304084")).toBe(true);
    expect(isValidPolishNip("7010224621")).toBe(true);
  });

  it("accepts a NIP with separators and a PL prefix", () => {
    expect(isValidPolishNip("PL 701-130-40-84")).toBe(true);
  });

  it("rejects wrong length and bad checksum", () => {
    expect(isValidPolishNip("123")).toBe(false);
    expect(isValidPolishNip("1234567890")).toBe(false);
    expect(isValidPolishNip("")).toBe(false);
    expect(isValidPolishNip(undefined)).toBe(false);
  });
});

describe("validateKsefReadiness", () => {
  it("passes a complete VAT invoice", () => {
    const result = validateKsefReadiness(validVatInvoice, { today: TODAY });
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("skips non-KSeF kinds like receipts", () => {
    const result = validateKsefReadiness(
      { ...validVatInvoice, kind: "receipt", buyerName: "", buyerTaxNo: "" },
      { today: TODAY },
    );
    expect(result.blockers).toEqual([]);
  });

  it("reports proforma issues as warnings, not blockers, on creation", () => {
    const result = validateKsefReadiness(
      { ...validVatInvoice, kind: "proforma", buyerTaxNo: "" },
      { today: TODAY },
    );
    expect(result.blockers).toEqual([]);
    expect(codes(result.warnings)).toContain("buyerNipMissing");
  });

  it("hard-blocks proforma issues when treated as KSeF-bound (conversion)", () => {
    const result = validateKsefReadiness(
      { ...validVatInvoice, kind: "proforma", buyerTaxNo: "" },
      { today: TODAY, treatAsKsefBound: true },
    );
    expect(codes(result.blockers)).toContain("buyerNipMissing");
  });

  it("blocks a company buyer without a NIP", () => {
    const result = validateKsefReadiness(
      { ...validVatInvoice, buyerTaxNo: "" },
      { today: TODAY },
    );
    expect(codes(result.blockers)).toEqual(["buyerNipMissing"]);
  });

  it("blocks an invalid company NIP for a Polish buyer", () => {
    const result = validateKsefReadiness(
      { ...validVatInvoice, buyerTaxNo: "1234567890" },
      { today: TODAY },
    );
    expect(codes(result.blockers)).toContain("buyerNipInvalid");
  });

  it("does not require a NIP for a consumer buyer (empty tax_no_kind)", () => {
    const result = validateKsefReadiness(
      { ...validVatInvoice, buyerTaxNo: "", buyerTaxNoKind: "empty" },
      { today: TODAY },
    );
    expect(result.blockers).toEqual([]);
  });

  it("does not checksum-validate a foreign EU NIP", () => {
    const result = validateKsefReadiness(
      {
        ...validVatInvoice,
        buyerCountry: "DE",
        buyerTaxNo: "DE123456789",
        buyerTaxNoKind: "nip_ue",
      },
      { today: TODAY },
    );
    expect(result.blockers).toEqual([]);
  });

  it("blocks a missing issuer role (stored null) and an invalid one", () => {
    const nullRole = validateKsefReadiness(
      { ...validVatInvoice, issuers: [{ role: null, name: "Seller" }] },
      { today: TODAY },
    );
    expect(codes(nullRole.blockers)).toContain("issuerRoleMissing");

    const badRole = validateKsefReadiness(
      { ...validVatInvoice, issuers: [{ role: "Wystawca", name: "Seller" }] },
      { today: TODAY },
    );
    expect(codes(badRole.blockers)).toContain("issuerRoleInvalid");
  });

  it("accepts the whitelisted issuer role", () => {
    const result = validateKsefReadiness(
      {
        ...validVatInvoice,
        issuers: [{ role: "Wystawca faktury", name: "Seller" }],
      },
      { today: TODAY },
    );
    expect(result.blockers).toEqual([]);
  });

  it("blocks an invalid recipient role and accepts the en-dash JST role", () => {
    const badRole = validateKsefReadiness(
      {
        ...validVatInvoice,
        recipients: [
          { role: "recipient", name: "X", taxNo: "7010224621", city: "Wwa" },
        ],
      },
      { today: TODAY },
    );
    expect(codes(badRole.blockers)).toContain("recipientRoleInvalid");

    const jst = validateKsefReadiness(
      {
        ...validVatInvoice,
        recipients: [
          {
            role: "JST – odbiorca",
            name: "Gmina",
            taxNo: "7010224621",
            city: "Wwa",
          },
        ],
      },
      { today: TODAY },
    );
    expect(jst.blockers).toEqual([]);
  });

  it("requires a description for a Rola inna recipient", () => {
    const result = validateKsefReadiness(
      {
        ...validVatInvoice,
        recipients: [
          {
            role: "Rola inna",
            roleDescription: "",
            name: "X",
            taxNo: "7010224621",
            city: "Wwa",
          },
        ],
      },
      { today: TODAY },
    );
    expect(codes(result.blockers)).toContain("recipientRoleDescriptionMissing");
  });

  it("warns when a roled recipient is not identifiable", () => {
    const result = validateKsefReadiness(
      {
        ...validVatInvoice,
        recipients: [{ role: "Pracownik", name: "John" }],
      },
      { today: TODAY },
    );
    expect(codes(result.warnings)).toContain("recipientNotIdentifiable");
  });

  it("enforces length limits", () => {
    const result = validateKsefReadiness(
      {
        ...validVatInvoice,
        buyerPhone: "1".repeat(17),
        description: "x".repeat(3501),
        positions: [{ name: "y".repeat(257), tax: 23 }],
      },
      { today: TODAY },
    );
    expect(codes(result.blockers)).toEqual(
      expect.arrayContaining([
        "buyerPhoneTooLong",
        "descriptionTooLong",
        "positionNameTooLong",
      ]),
    );
  });

  it("warns about a zw position without an exemption reason", () => {
    const result = validateKsefReadiness(
      { ...validVatInvoice, positions: [{ name: "Usługa", tax: "zw" }] },
      { today: TODAY },
    );
    expect(codes(result.warnings)).toContain("vatExemptionReasonMissing");
  });

  it("warns about an np position without a reason", () => {
    const result = validateKsefReadiness(
      { ...validVatInvoice, positions: [{ name: "Usługa", tax: "np" }] },
      { today: TODAY },
    );
    expect(codes(result.warnings)).toContain("npReasonMissing");
  });

  it("blocks a future issue date but can skip the check", () => {
    const blocked = validateKsefReadiness(
      { ...validVatInvoice, issueDate: "2026-06-11" },
      { today: TODAY },
    );
    expect(codes(blocked.blockers)).toContain("issueDateInFuture");

    const skipped = validateKsefReadiness(
      { ...validVatInvoice, issueDate: "2026-06-11" },
      { today: TODAY, checkIssueDate: false },
    );
    expect(skipped.blockers).toEqual([]);
  });
});

describe("ksefInvoiceDataFromStoredInvoice", () => {
  it("reads raw snake_case JSON including a null-role issuer", () => {
    const data = ksefInvoiceDataFromStoredInvoice({
      kind: "proforma",
      buyer_company: true,
      buyer_name: "BIMAST",
      buyer_tax_no: "7011304084",
      buyer_country: "PL",
      positions: [{ name: "Druk", tax: "23" }],
      recipients: [],
      issuers: [{ id: 1, name: "JAPA", role: null }],
    });
    expect(data.buyerCompany).toBe(true);
    // A stored null role is normalized to undefined; both are treated as empty.
    expect(data.issuers).toEqual([
      expect.objectContaining({ name: "JAPA", role: undefined }),
    ]);

    const result = validateKsefReadiness(data, {
      today: TODAY,
      treatAsKsefBound: true,
      checkIssueDate: false,
    });
    expect(codes(result.blockers)).toContain("issuerRoleMissing");
  });

  it("reads role_description from Kiota additionalData", () => {
    const data = ksefInvoiceDataFromStoredInvoice({
      kind: "vat",
      recipients: [
        {
          role: "Rola inna",
          additionalData: { role_description: "Coordinator" },
          taxNo: "7010224621",
          city: "Wwa",
        },
      ],
      issuers: [],
      positions: [],
    });
    expect(data.recipients[0].roleDescription).toBe("Coordinator");
  });
});

describe("ksefInvoiceDataFromCreateParams", () => {
  it("maps buyerCompany flag and a single recipient", () => {
    const data = ksefInvoiceDataFromCreateParams({
      kind: "vat",
      buyerCompany: "1",
      buyerName: "BIMAST",
      buyerTaxNo: "7011304084",
      positions: [{ name: "Druk", tax: 23 }],
      recipientRole: "Rola inna",
      recipientRoleDescription: "Coordinator",
      recipient_name: "Office",
      recipient_tax_no: "7010224621",
      recipient_city: "Wwa",
    });
    expect(data.buyerCompany).toBe(true);
    expect(data.recipients).toHaveLength(1);
    expect(data.recipients[0]).toMatchObject({
      role: "Rola inna",
      roleDescription: "Coordinator",
    });
  });

  it("produces no recipients when no role is set", () => {
    const data = ksefInvoiceDataFromCreateParams({
      kind: "vat",
      buyerCompany: "0",
      buyerName: "Jan Kowalski",
      positions: [],
    });
    expect(data.recipients).toEqual([]);
  });
});
