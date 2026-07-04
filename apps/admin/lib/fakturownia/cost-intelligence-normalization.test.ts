import { describe, expect, it } from "vitest";
import type {
  Invoice,
  InvoicePosition,
} from "@konfi/fakturownia/out/client/models";
import {
  buildFakturowniaCostDecisionKey,
  buildFakturowniaCostMappingSuggestion,
  normalizeFakturowniaCostEvidence,
  normalizeFakturowniaCostText,
} from "./cost-intelligence-normalization";

const member = {
  id: "admin-1",
  name: "Admin",
};

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    currency: "pln",
    id: 123,
    issueDate: "2026-01-15",
    number: "KOSZT/1/2026",
    sellerName: "Papier Łódź Sp. z o.o.",
    sellerTaxNo: "PL 123-456-78-90",
    ...overrides,
  } as Invoice;
}

function position(overrides: Partial<InvoicePosition> = {}): InvoicePosition {
  return {
    code: "PAP-350",
    description: "Karton kredowy z rabatem",
    name: "  Papier kredowy 350g / SRA3  ",
    priceGross: "615",
    priceNet: "500",
    productId: 987,
    quantity: "2,5",
    quantityUnit: "ryza",
    totalPriceGross: "1537,50",
    totalPriceNet: "1250",
    ...overrides,
  } as InvoicePosition;
}

describe("Fakturownia cost intelligence normalization", () => {
  it("normalizes messy cost invoice positions into tenant-owned evidence", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice(),
      position: position(),
      positionIndex: 0,
      tenantId: "tenant-1",
    });

    expect(evidence).toMatchObject({
      currency: "PLN",
      id: "123-0",
      normalizedText:
        "papier kredowy 350g sra3 pap 350 karton kredowy z rabatem 987",
      position: {
        code: "PAP-350",
        fakturowniaProductId: "987",
        index: 0,
        name: "Papier kredowy 350g / SRA3",
      },
      quantity: 2.5,
      quantityUnit: "ryza",
      supplier: {
        name: "Papier Łódź Sp. z o.o.",
        nip: "PL 123-456-78-90",
      },
      tenantId: "tenant-1",
      totalPriceGross: 1537.5,
      totalPriceNet: 1250,
      unitCostGross: 615,
      unitCostNet: 500,
    });
  });

  it("falls back to unit price totals when Fakturownia totals are missing", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice({ id: "expense-2" }),
      position: position({
        priceNet: 12.345,
        quantity: 4,
        totalPriceGross: undefined,
        totalPriceNet: undefined,
      }),
      positionIndex: 3,
    });

    expect(evidence?.id).toBe("expense-2-3");
    expect(evidence?.priceNet).toBe(12.35);
    expect(evidence?.totalPriceNet).toBe(49.4);
    expect(evidence?.unitCostNet).toBe(12.35);
  });

  it("builds bounded pending mapping suggestions from source signals", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice(),
      position: position(),
      positionIndex: 0,
    });

    expect(evidence).not.toBeNull();
    if (!evidence) {
      throw new Error("Expected normalized evidence.");
    }
    const mapping = buildFakturowniaCostMappingSuggestion({
      aliases: ["Papier kredowy 350g", "Papier kredowy 350g"],
      confidence: 1.5,
      createdBy: member,
      evidence,
      productId: "product-1",
      productName: "Business cards",
      sourceSignals: ["supplier_linked_product", "supplier_linked_product"],
      supplierId: "supplier-1",
      supplierName: "Paper Supplier",
    });

    expect(mapping).toMatchObject({
      confidence: 1,
      evidenceId: "123-0",
      id: "123-0-suggestion",
      productId: "product-1",
      sourceSignals: ["supplier_linked_product"],
      status: "pending",
      supplierId: "supplier-1",
    });
    expect(mapping.aliases).toEqual(
      expect.arrayContaining([
        "Papier kredowy 350g",
        "Papier kredowy 350g / SRA3",
        "PAP-350",
        "987",
      ]),
    );
    expect(mapping.aliases).toHaveLength(new Set(mapping.aliases).size);
  });

  it("captures the source position id and detects correction invoices", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice({ kind: "correction" } as Partial<Invoice>),
      position: position({ id: 555 } as Partial<InvoicePosition>),
      positionIndex: 0,
    });

    expect(evidence?.id).toBe("123-0");
    expect(evidence?.sourcePositionId).toBe("555");
    expect(evidence?.invoiceKind).toBe("correction");
  });

  it("detects corrections via the legacy correction boolean flag", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice({ correction: true }),
      position: position(),
      positionIndex: 0,
    });

    expect(evidence?.invoiceKind).toBe("correction");
  });

  it("defaults non-correction invoices to a regular kind", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice(),
      position: position(),
      positionIndex: 0,
    });

    expect(evidence?.invoiceKind).toBe("regular");
    expect(evidence?.sourcePositionId).toBeUndefined();
  });

  it("denormalizes issue date, text, supplier nip and reasoning onto the suggestion", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice(),
      position: position(),
      positionIndex: 0,
    });

    expect(evidence).not.toBeNull();
    if (!evidence) {
      throw new Error("Expected normalized evidence.");
    }
    const mapping = buildFakturowniaCostMappingSuggestion({
      confidence: 0.95,
      createdBy: member,
      evidence,
      productId: "product-1",
      reasoning: "Strong supplier and provider id match.",
      sourceSignals: ["ai_high_confidence_match"],
    });

    expect(mapping).toMatchObject({
      issueDate: "2026-01-15",
      normalizedText:
        "papier kredowy 350g sra3 pap 350 karton kredowy z rabatem 987",
      reasoning: "Strong supplier and provider id match.",
      supplierNip: "1234567890",
    });
  });

  it("normalizes diacritics and separators for future matching", () => {
    expect(normalizeFakturowniaCostText("Łódź / Papier-350g, SRA3")).toBe(
      "lodz papier 350g sra3",
    );
  });

  it("stores an identity PLN conversion mirroring the original amounts", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice(),
      position: position(),
      positionIndex: 0,
    });

    expect(evidence?.conversion).toEqual({
      baseCurrency: "PLN",
      exchangeRate: 1,
      source: "identity",
      totalPriceGrossBase: 1537.5,
      totalPriceNetBase: 1250,
      unitCostGrossBase: 615,
      unitCostNetBase: 500,
    });
  });

  it("converts a foreign-currency invoice into PLN base amounts at the invoice rate", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice({
        currency: "EUR",
        exchangeDate: new Date("2026-01-14T00:00:00.000Z"),
        exchangeRate: "4.30",
        exchangeRateDen: "1",
      }),
      position: position({
        priceGross: "123",
        priceNet: "100",
        quantity: "2",
        totalPriceGross: "246",
        totalPriceNet: "200",
      }),
      positionIndex: 0,
    });

    expect(evidence?.currency).toBe("EUR");
    expect(evidence?.totalPriceNet).toBe(200);
    expect(evidence?.unitCostNet).toBe(100);
    expect(evidence?.conversion).toEqual({
      baseCurrency: "PLN",
      exchangeRate: 4.3,
      rateDate: "2026-01-14",
      source: "fakturownia_invoice",
      totalPriceGrossBase: 1057.8,
      totalPriceNetBase: 860,
      unitCostGrossBase: 528.9,
      unitCostNetBase: 430,
    });
  });

  it("applies the exchange rate denominator for per-100 quotes", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice({
        currency: "HUF",
        exchangeRate: "120",
        exchangeRateDen: "100",
      }),
      position: position({
        priceNet: "100",
        quantity: "1",
        totalPriceGross: undefined,
        totalPriceNet: "100",
      }),
      positionIndex: 0,
    });

    // rate-per-unit = 120 / 100 = 1.2; 100 HUF -> 120 PLN.
    expect(evidence?.conversion?.exchangeRate).toBe(1.2);
    expect(evidence?.conversion?.totalPriceNetBase).toBe(120);
    expect(evidence?.conversion?.unitCostNetBase).toBe(120);
  });

  it("records source 'unavailable' and omits base amounts when no rate is on the invoice", () => {
    const evidence = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice({ currency: "USD" }),
      position: position(),
      positionIndex: 0,
    });

    expect(evidence?.conversion).toEqual({
      baseCurrency: "PLN",
      exchangeRate: 0,
      source: "unavailable",
    });
    expect(evidence?.conversion?.totalPriceNetBase).toBeUndefined();
    expect(evidence?.conversion?.unitCostNetBase).toBeUndefined();
  });

  it("keeps correction amounts negative so base totals net out when summed", () => {
    const regular = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice(),
      position: position({
        priceNet: "500",
        quantity: "2.5",
        totalPriceGross: "1537.50",
        totalPriceNet: "1250",
      }),
      positionIndex: 0,
    });
    const correction = normalizeFakturowniaCostEvidence({
      createdBy: member,
      invoice: invoice({ kind: "correction" } as Partial<Invoice>),
      position: position({
        priceNet: "-500",
        quantity: "-2.5",
        totalPriceGross: "-1537.50",
        totalPriceNet: "-1250",
      }),
      positionIndex: 1,
    });

    // Negative quantity divides by its magnitude, so the per-unit cost keeps the
    // correct size and the (negative) sign from the total.
    expect(correction?.invoiceKind).toBe("correction");
    expect(correction?.quantity).toBe(2.5);
    expect(correction?.totalPriceNet).toBe(-1250);
    expect(correction?.unitCostNet).toBe(-500);
    expect(correction?.conversion?.totalPriceNetBase).toBe(-1250);
    expect(correction?.conversion?.unitCostNetBase).toBe(-500);

    // Invariant: regular + correction base totals net to zero spend.
    const netNetTotal =
      (regular?.conversion?.totalPriceNetBase ?? 0) +
      (correction?.conversion?.totalPriceNetBase ?? 0);
    expect(netNetTotal).toBe(0);
  });
});

describe("buildFakturowniaCostDecisionKey", () => {
  it("builds a stable, deterministic key from supplier nip and text", () => {
    const key = buildFakturowniaCostDecisionKey({
      normalizedText: "papier kredowy 350g sra3",
      supplierNip: "PL 123-456-78-90",
    });

    expect(key).toBe(
      buildFakturowniaCostDecisionKey({
        normalizedText: "papier kredowy 350g sra3",
        supplierNip: "PL 123-456-78-90",
      }),
    );
    expect(key).toBe("1234567890::papier kredowy 350g sra3");
  });

  it("prefers the supplier nip over the supplier name", () => {
    const withNip = buildFakturowniaCostDecisionKey({
      normalizedText: "karton",
      supplierName: "Papier Łódź",
      supplierNip: "1234567890",
    });
    const nameOnly = buildFakturowniaCostDecisionKey({
      normalizedText: "karton",
      supplierName: "Papier Łódź",
    });

    expect(withNip.startsWith("1234567890")).toBe(true);
    expect(nameOnly.startsWith("papier lodz")).toBe(true);
    expect(withNip).not.toBe(nameOnly);
  });

  it("falls back to nosupplier when neither nip nor name is present", () => {
    expect(
      buildFakturowniaCostDecisionKey({ normalizedText: "shipping" }),
    ).toBe("nosupplier::shipping");
  });

  it("scopes decision keys by tenant when provided", () => {
    const baseInput = {
      normalizedText: "papier kredowy 350g sra3",
      supplierNip: "PL 123-456-78-90",
    };

    expect(
      buildFakturowniaCostDecisionKey({
        ...baseInput,
        tenantId: "tenant-a",
      }),
    ).toBe("tenant-a::1234567890::papier kredowy 350g sra3");
    expect(
      buildFakturowniaCostDecisionKey({
        ...baseInput,
        tenantId: "tenant-a",
      }),
    ).not.toBe(
      buildFakturowniaCostDecisionKey({
        ...baseInput,
        tenantId: "tenant-b",
      }),
    );
  });

  it("hashes the tail so very long keys stay within the Firestore id limit", () => {
    const longText = "x".repeat(4000);
    const key = buildFakturowniaCostDecisionKey({
      normalizedText: longText,
      supplierNip: "1234567890",
    });

    expect(Buffer.byteLength(key, "utf8")).toBeLessThanOrEqual(1500);
    expect(key).toBe(
      buildFakturowniaCostDecisionKey({
        normalizedText: longText,
        supplierNip: "1234567890",
      }),
    );
    expect(key).toMatch(/-[0-9a-f]{40}$/);
  });
});
