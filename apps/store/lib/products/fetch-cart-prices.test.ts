import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderItem, Product } from "@konfi/types";

const mocks = vi.hoisted(() => ({
  mockFetchPricesForProduct: vi.fn(),
}));

vi.mock("@konfi/components", () => ({
  fetchPricesForProduct: mocks.mockFetchPricesForProduct,
}));

import { fetchPricesForCartItems } from "./fetch-cart-prices";

function createProduct(id: string, priceType: Product["priceType"]): Product {
  return {
    channelId: "channel-1",
    id,
    priceType,
  } as Product;
}

function createOrderItem(
  id: string,
  productId: string,
  quantity: number,
): OrderItem {
  return {
    calculatedCombination: "front",
    id,
    product: {
      id: productId,
    },
    quantity,
  } as OrderItem;
}

describe("fetchPricesForCartItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses one dynamic-pricing batch request for multiple dynamic cart lines", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          results: [
            { prices: [{ value: 1000 }] },
            { prices: [{ value: 2000 }] },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const prices = await fetchPricesForCartItems({} as never, [
      {
        item: createOrderItem("item-1", "product-1", 10),
        product: createProduct("product-1", "DYNAMIC"),
      },
      {
        item: createOrderItem("item-2", "product-2", 20),
        product: createProduct("product-2", "DYNAMIC"),
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/products/dynamic-pricing/batch",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      items: [
        {
          productId: "product-1",
          quantity: 10,
        },
        {
          productId: "product-2",
          quantity: 20,
        },
      ],
    });
    expect(prices.get("item-1")).toEqual([{ value: 1000 }]);
    expect(prices.get("item-2")).toEqual([{ value: 2000 }]);
    expect(mocks.mockFetchPricesForProduct).not.toHaveBeenCalled();
  });

  it("keeps existing resolver for non-dynamic cart lines", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.mockFetchPricesForProduct.mockResolvedValue([{ value: 1500 }]);

    const firestore = {};
    const item = createOrderItem("item-1", "product-1", 10);
    const product = createProduct("product-1", "MATRIX");

    const prices = await fetchPricesForCartItems(firestore as never, [
      {
        item,
        product,
      },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.mockFetchPricesForProduct).toHaveBeenCalledWith(
      firestore,
      product,
      "front",
      undefined,
      undefined,
      expect.objectContaining({
        quantity: 10,
      }),
    );
    expect(prices.get("item-1")).toEqual([{ value: 1500 }]);
  });
});
