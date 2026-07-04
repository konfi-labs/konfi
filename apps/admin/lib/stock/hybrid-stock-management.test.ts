import type { OrderItem } from "@konfi/types";
import { PriceTypeEnum } from "@konfi/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const fakeDb = {};

  return {
    deductAttributeStock: vi.fn(),
    deductStock: vi.fn(),
    fakeDb,
    getAdminDb: vi.fn(() => fakeDb),
    getAttributes: vi.fn(),
    getProduct: vi.fn(),
    releaseAttributeStock: vi.fn(),
    releaseStock: vi.fn(),
    reserveAttributeStock: vi.fn(),
    reserveStock: vi.fn(),
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("./stock-management-admin", () => ({
  deductAttributeStock: mocks.deductAttributeStock,
  deductStock: mocks.deductStock,
  getAttributes: mocks.getAttributes,
  getProduct: mocks.getProduct,
  releaseAttributeStock: mocks.releaseAttributeStock,
  releaseStock: mocks.releaseStock,
  reserveAttributeStock: mocks.reserveAttributeStock,
  reserveStock: mocks.reserveStock,
}));

const { processStockReservation } = await import("./hybrid-stock-management");
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

function createOrderItemWithProduct(
  productId: string,
  itemId = "item-1",
): OrderItem {
  return {
    customFormat: false,
    customPrice: null,
    description: "Business cards",
    discount: {
      type: "PERCENTAGE",
      value: 0,
    },
    id: itemId,
    product: {
      id: productId,
      name: "Business cards",
      priceType: PriceTypeEnum.SINGLE,
    } as unknown as NonNullable<OrderItem["product"]>,
    quantity: 2,
    totalPrice: 1000,
    unit: "PCS",
  };
}

describe("processStockReservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getAttributes.mockResolvedValue([]);
    mocks.getProduct.mockResolvedValue(null);
    mocks.reserveStock.mockResolvedValue(undefined);
    mocks.reserveAttributeStock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("uses the order item product snapshot when the product document is missing", async () => {
    await processStockReservation(
      "channel-1",
      "warehouse-1",
      [createOrderItemWithProduct("missing-product")],
      "order-1",
    );

    expect(mocks.reserveStock).toHaveBeenCalledWith(mocks.fakeDb, [
      {
        channelId: "channel-1",
        itemId: "item-1",
        orderId: "order-1",
        productId: "missing-product",
        quantity: 2,
        warehouseId: "warehouse-1",
      },
    ]);
    expect(mocks.reserveAttributeStock).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Product missing-product not found during stock reservation; using order item snapshot",
      {
        itemId: "item-1",
        orderId: "order-1",
        productId: "missing-product",
      },
    );
  });

  it("fetches unique products concurrently before building stock operations", async () => {
    const productIds = Array.from({ length: 6 }, (_, index) => {
      return `product-${index + 1}`;
    }).reverse();
    const orderItems = productIds.map((productId, index) =>
      createOrderItemWithProduct(productId, `item-${index + 1}`),
    );
    const pendingProductFetches: Array<{
      productId: string;
      resolve: () => void;
    }> = [];
    let activeProductFetches = 0;
    let maxActiveProductFetches = 0;

    mocks.getProduct.mockImplementation(
      (_db: unknown, _channelId: string, productId: string) => {
        activeProductFetches += 1;
        maxActiveProductFetches = Math.max(
          maxActiveProductFetches,
          activeProductFetches,
        );

        return new Promise((resolve) => {
          pendingProductFetches.push({
            productId,
            resolve: () => {
              activeProductFetches -= 1;
              resolve({
                id: productId,
                name: `Product ${productId}`,
                priceType: PriceTypeEnum.SINGLE,
              });
            },
          });
        });
      },
    );

    const reservationPromise = processStockReservation(
      "channel-1",
      "warehouse-1",
      orderItems,
      "order-1",
    );

    await vi.waitFor(() => {
      expect(mocks.getProduct).toHaveBeenCalledTimes(productIds.length);
    });

    expect(mocks.getProduct).toHaveBeenCalledTimes(productIds.length);
    expect(mocks.getProduct.mock.calls.map((call) => call[2])).toEqual(
      [...productIds].sort(),
    );
    expect(mocks.getAdminDb).toHaveBeenCalledTimes(1);
    expect(maxActiveProductFetches).toBe(productIds.length);

    for (const pendingFetch of pendingProductFetches) {
      pendingFetch.resolve();
    }

    await reservationPromise;
  });
});
