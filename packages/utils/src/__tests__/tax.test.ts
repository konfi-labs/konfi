import {
  buildOrderTaxSummary,
  buildTaxSummary,
  createDefaultTaxSettings,
  normalizeTaxSettings,
  resolveTaxCountryCode,
} from "../tax";
import type { OrderItem } from "@konfi/types";

describe("tax", () => {
  it("keeps dedicated-runtime behavior disabled by default", () => {
    expect(buildTaxSummary({ items: [{ grossAmount: 12300 }] })).toBe(
      undefined,
    );

    expect(createDefaultTaxSettings()).toMatchObject({
      defaultCountryCode: "PL",
      enabled: false,
    });
  });

  it("resolves Polish country aliases without changing stored addresses", () => {
    expect(resolveTaxCountryCode("Polska")).toBe("PL");
    expect(resolveTaxCountryCode("Poland")).toBe("PL");
    expect(resolveTaxCountryCode("de")).toBe("DE");
  });

  it("calculates gross-price tax snapshots without changing gross totals", () => {
    const settings = normalizeTaxSettings({
      enabled: true,
      regions: [
        {
          countryCodes: ["PL"],
          defaultRateId: "standard",
          id: "pl",
          name: "Poland",
          pricesIncludeTax: true,
          rates: [{ id: "standard", name: "VAT 23%", percent: 23 }],
        },
      ],
    });

    const summary = buildTaxSummary({
      country: "PL",
      currency: "PLN",
      items: [{ grossAmount: 12300, id: "item-1" }],
      settings,
      shippingGrossAmount: 1230,
    });

    expect(summary).toMatchObject({
      countryCode: "PL",
      enabled: true,
      pricesIncludeTax: true,
      shippingGross: 1230,
      subtotalGross: 12300,
      totalGross: 13530,
      totalTax: 2530,
    });
    expect(summary?.lines).toHaveLength(2);
    expect(summary?.lines[0]).toMatchObject({
      grossAmount: 12300,
      netAmount: 10000,
      taxAmount: 2300,
    });
  });

  it("prefers targeted higher-priority rates", () => {
    const summary = buildTaxSummary({
      country: "PL",
      items: [
        {
          grossAmount: 10800,
          id: "book",
          taxCategoryId: "books",
        },
      ],
      settings: {
        enabled: true,
        regions: [
          {
            countryCodes: ["PL"],
            defaultRateId: "standard",
            id: "pl",
            name: "Poland",
            rates: [
              { id: "standard", name: "VAT 23%", percent: 23 },
              {
                id: "books",
                name: "Books 8%",
                percent: 8,
                priority: 10,
                target: { taxCategoryIds: ["books"] },
              },
            ],
          },
        ],
      },
    });

    expect(summary?.lines[0]).toMatchObject({
      rateId: "books",
      taxAmount: 800,
    });
  });

  it("builds order tax snapshots from item and product tax categories", () => {
    const item = {
      id: "item-1",
      name: "Poster",
      description: "Poster",
      customFormat: false,
      totalPrice: 10800,
      customPrice: null,
      quantity: 1,
      discount: {
        code: null,
        discountedAmount: 0,
        discountValue: 0,
        type: "PERCENTAGE",
      },
      unit: "pcs" as OrderItem["unit"],
    } satisfies OrderItem;
    const productsById = new Map([
      [
        "product-1",
        {
          category: { id: "cat-1", name: "Catalog" },
          defaultPrice: {
            currency: "PLN",
            taxCategoryId: "books",
            value: 10800,
          },
          productType: null,
          taxCategoryId: undefined,
        },
      ],
    ]);

    const summary = buildOrderTaxSummary({
      country: "PL",
      items: [
        {
          ...item,
          product: {
            id: "product-1",
            name: "Booklet",
          } as NonNullable<OrderItem["product"]>,
        },
      ],
      productsById,
      settings: {
        enabled: true,
        regions: [
          {
            countryCodes: ["PL"],
            defaultRateId: "standard",
            id: "pl",
            name: "Poland",
            rates: [
              { id: "standard", name: "VAT 23%", percent: 23 },
              {
                id: "books",
                name: "Books 8%",
                percent: 8,
                priority: 10,
                target: { taxCategoryIds: ["books"] },
              },
            ],
          },
        ],
      },
      shippingGrossAmount: 1230,
    });

    expect(summary?.lines).toHaveLength(2);
    expect(summary?.lines[0]).toMatchObject({
      rateId: "books",
      taxAmount: 800,
    });
    expect(summary?.shippingGross).toBe(1230);
  });
});
