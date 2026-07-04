import type { OrderItem, TaxSummarySnapshot } from "@konfi/types";
import { CurrencyEnum } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { mapOrderItemToInvoicePosition } from "./helpers";

function createOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    calculatedCombination: null,
    combination: null,
    customFormat: false,
    customPrice: 12300,
    description: "Business cards",
    discount: {
      active: false,
      discountedAmount: 0,
      newAmount: 0,
      oldAmount: 0,
    },
    id: "item-1",
    name: "Business cards",
    quantity: 2,
    totalPrice: 24600,
    unit: "pcs",
    ...overrides,
  } as unknown as OrderItem;
}

function createTaxSummary(percent: number): TaxSummarySnapshot {
  return {
    calculationMode: "gross",
    countryCode: "PL",
    currency: CurrencyEnum.PLN,
    enabled: true,
    lines: [
      {
        countryCode: "PL",
        currency: CurrencyEnum.PLN,
        grossAmount: 24600,
        id: "item:item-1",
        netAmount: 22778,
        rateId: "books-vat",
        rateName: "Reduced VAT",
        regionId: "pl",
        sourceId: "item-1",
        sourceType: "item",
        taxAmount: 1822,
        taxRatePercent: percent,
      },
    ],
    pricesIncludeTax: true,
    regionId: "pl",
    shippingGross: 0,
    subtotalGross: 24600,
    totalGross: 24600,
    totalNet: 22778,
    totalTax: 1822,
  };
}

describe("mapOrderItemToInvoicePosition", () => {
  it("keeps the legacy Fakturownia tax rate without a tax snapshot", () => {
    expect(mapOrderItemToInvoicePosition(createOrderItem()).tax).toBe(23);
  });

  it("uses the stored tax snapshot rate when the order has one", () => {
    expect(
      mapOrderItemToInvoicePosition(createOrderItem(), createTaxSummary(8)).tax,
    ).toBe(8);
  });
});
