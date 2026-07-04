import {
  CurrencyEnum,
  type PriceList,
  PriceListAdjustmentType,
  type Product,
} from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  applyPriceListToProductPrices,
  getApplicablePriceListForProduct,
  isPriceListApplicable,
} from "../price-lists";

const product = {
  id: "product-1",
  category: { id: "category-1" },
  productType: { id: "type-1" },
} as Product;

function createPriceList(overrides: Partial<PriceList>): PriceList {
  return {
    id: "price-list-1",
    active: true,
    createdAt: {} as PriceList["createdAt"],
    createdBy: { id: "admin", name: "Admin" },
    currency: CurrencyEnum.PLN,
    entries: [],
    name: "B2B prices",
    priority: 0,
    updatedAt: {} as PriceList["updatedAt"],
    updatedBy: { id: "admin", name: "Admin" },
    ...overrides,
  };
}

describe("price-lists", () => {
  it("matches channel, customer group, currency, and active dates", () => {
    const priceList = createPriceList({
      channelIds: ["store-pl"],
      customerGroupIds: ["vip"],
      startsAt: "2026-05-01T00:00:00.000Z",
      endsAt: "2026-05-31T23:59:59.999Z",
    });

    expect(
      isPriceListApplicable(priceList, {
        channelId: "store-pl",
        currency: CurrencyEnum.PLN,
        customerGroupIds: ["vip"],
        now: new Date("2026-05-22T12:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isPriceListApplicable(priceList, {
        channelId: "store-pl",
        currency: CurrencyEnum.PLN,
        customerGroupIds: ["retail"],
        now: new Date("2026-05-22T12:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("handles empty, missing, and duplicate customer group overlaps", () => {
    const priceList = createPriceList({
      customerGroupIds: ["vip", "vip", "wholesale"],
    });

    expect(
      isPriceListApplicable(priceList, {
        currency: CurrencyEnum.PLN,
        customerGroupIds: ["retail", "vip", "vip"],
      }),
    ).toBe(true);
    expect(
      isPriceListApplicable(priceList, {
        currency: CurrencyEnum.PLN,
        customerGroupIds: ["retail"],
      }),
    ).toBe(false);
    expect(
      isPriceListApplicable(priceList, {
        currency: CurrencyEnum.PLN,
        customerGroupIds: [],
      }),
    ).toBe(false);
    expect(
      isPriceListApplicable(priceList, {
        currency: CurrencyEnum.PLN,
      }),
    ).toBe(false);
  });

  it("selects the highest-priority applicable list and most specific entry", () => {
    const lowPriority = createPriceList({
      id: "category-list",
      priority: 1,
      entries: [
        {
          id: "category-entry",
          adjustmentType: PriceListAdjustmentType.PERCENTAGE,
          target: { categoryIds: ["category-1"] },
          value: -5,
        },
      ],
    });
    const highPriority = createPriceList({
      id: "product-list",
      priority: 10,
      entries: [
        {
          id: "type-entry",
          adjustmentType: PriceListAdjustmentType.PERCENTAGE,
          target: { productTypeIds: ["type-1"] },
          value: -10,
        },
        {
          id: "product-entry",
          adjustmentType: PriceListAdjustmentType.PERCENTAGE,
          target: { productIds: ["product-1"] },
          value: -15,
        },
      ],
    });

    expect(
      getApplicablePriceListForProduct(
        [lowPriority, highPriority],
        { currency: CurrencyEnum.PLN },
        product,
      ),
    ).toMatchObject({
      entry: { id: "product-entry" },
      priceList: { id: "product-list" },
    });
  });

  it("applies percentage adjustments without mutating source prices", () => {
    const priceList = createPriceList({
      entries: [
        {
          id: "entry-1",
          adjustmentType: PriceListAdjustmentType.PERCENTAGE,
          target: { productIds: ["product-1"] },
          value: -10,
        },
      ],
    });
    const prices = [{ value: 1000, currency: CurrencyEnum.PLN }];

    const result = applyPriceListToProductPrices({
      context: { currency: CurrencyEnum.PLN },
      priceLists: [priceList],
      prices,
      product,
    });

    expect(result.application).toEqual({
      entryId: "entry-1",
      priceListId: "price-list-1",
    });
    expect(result.prices[0]?.value).toBe(900);
    expect(prices[0]?.value).toBe(1000);
  });

  it("supports fixed unit prices and full price overrides", () => {
    const fixedList = createPriceList({
      id: "fixed-list",
      entries: [
        {
          id: "fixed-entry",
          adjustmentType: PriceListAdjustmentType.FIXED_UNIT_PRICE,
          target: { productIds: ["product-1"] },
          value: 777,
        },
      ],
    });
    const overrideList = createPriceList({
      id: "override-list",
      priority: 2,
      entries: [
        {
          id: "override-entry",
          adjustmentType: PriceListAdjustmentType.PRICE_OVERRIDE,
          prices: [{ threshold: 10, value: 500, currency: CurrencyEnum.PLN }],
          target: { productIds: ["product-1"] },
        },
      ],
    });

    expect(
      applyPriceListToProductPrices({
        context: { currency: CurrencyEnum.PLN },
        priceLists: [fixedList],
        prices: [{ value: 1000, currency: CurrencyEnum.PLN }],
        product,
      }).prices[0]?.value,
    ).toBe(777);
    expect(
      applyPriceListToProductPrices({
        context: { currency: CurrencyEnum.PLN },
        priceLists: [fixedList, overrideList],
        prices: [{ value: 1000, currency: CurrencyEnum.PLN }],
        product,
      }).prices,
    ).toEqual([{ threshold: 10, value: 500, currency: CurrencyEnum.PLN }]);
  });
});
