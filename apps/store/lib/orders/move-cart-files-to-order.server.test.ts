import { OrderItem } from "@konfi/types";
import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  CartFileMoveBucket,
  moveCartFilesToOrderInBucket,
} from "./move-cart-files-to-order.server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/serverApp", () => ({
  getFirebaseAdminApp: vi.fn(() => ({ name: "store-firebase-admin" })),
}));
vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(() => ({
    bucket: vi.fn(),
  })),
}));

const dedicatedTenantContext = {
  deploymentMode: "dedicated" as const,
  requireTenantId: false,
  tenantId: "default",
};

interface MockStorageFile {
  name: string;
  move: (destination: string) => Promise<void>;
}

const mockGetFiles = vi.fn();

function createBucket(): CartFileMoveBucket {
  return {
    getFiles: mockGetFiles,
  } as unknown as CartFileMoveBucket;
}

function createItem(id: string): OrderItem {
  return {
    id,
  } as unknown as OrderItem;
}

function getRequestedPrefixes() {
  return mockGetFiles.mock.calls.map((call) => {
    const request = call[0] as { prefix: string };
    return request.prefix;
  });
}

describe("moveCartFilesToOrderInBucket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves files and thumbnails from cart item id paths to order item id paths", async () => {
    const itemId = "5c29ebfd-3093-40c7-bc71-d4acdbe6272c";
    const cartFile: MockStorageFile = {
      name: `carts/cart-user-1/items/${itemId}/print.pdf`,
      move: vi.fn(async (_destination: string) => undefined),
    };
    const thumbFile: MockStorageFile = {
      name: `thumb_carts/cart-user-1/items/${itemId}/thumb_print.png`,
      move: vi.fn(async (_destination: string) => undefined),
    };

    mockGetFiles.mockImplementation(async ({ prefix }: { prefix: string }) => {
      if (prefix === `carts/cart-user-1/items/${itemId}/`) {
        return [[cartFile]];
      }

      if (prefix === `thumb_carts/cart-user-1/items/${itemId}/`) {
        return [[thumbFile]];
      }

      return [[]];
    });

    await moveCartFilesToOrderInBucket(createBucket(), {
      cartCustomerId: "cart-user-1",
      channelId: "channel-1",
      orderCustomerId: "customer-1",
      orderId: "order-1",
      items: [createItem(itemId)],
      tenantContext: dedicatedTenantContext,
    });

    expect(cartFile.move).toHaveBeenCalledWith(
      `orders/customer-1/order-1/items/${itemId}/print.pdf`,
    );
    expect(thumbFile.move).toHaveBeenCalledWith(
      `thumb_orders/customer-1/order-1/items/${itemId}/thumb_print.png`,
    );
    expect(getRequestedPrefixes()).not.toContain("carts/cart-user-1/items/0/");
  });

  it("falls back to legacy index paths and still writes to the order item id path", async () => {
    const legacyFile: MockStorageFile = {
      name: "carts/cart-user-1/items/0/legacy.pdf",
      move: vi.fn(async (_destination: string) => undefined),
    };

    mockGetFiles.mockImplementation(async ({ prefix }: { prefix: string }) => {
      if (prefix === "carts/cart-user-1/items/0/") {
        return [[legacyFile]];
      }

      return [[]];
    });

    await moveCartFilesToOrderInBucket(createBucket(), {
      cartCustomerId: "cart-user-1",
      channelId: "channel-1",
      orderCustomerId: "customer-1",
      orderId: "order-1",
      items: [createItem("item-1")],
      tenantContext: dedicatedTenantContext,
    });

    expect(getRequestedPrefixes()).toEqual([
      "carts/cart-user-1/items/item-1/",
      "thumb_carts/cart-user-1/items/item-1/",
      "carts/cart-user-1/items/0/",
      "thumb_carts/cart-user-1/items/0/",
    ]);
    expect(legacyFile.move).toHaveBeenCalledWith(
      "orders/customer-1/order-1/items/item-1/legacy.pdf",
    );
  });

  it("moves SaaS tenant-prefixed cart files into tenant-prefixed order paths", async () => {
    const itemId = "item-1";
    const tenantFile: MockStorageFile = {
      name: `tenants/tenant-a/carts/cart-user-1/items/${itemId}/print.pdf`,
      move: vi.fn(async (_destination: string) => undefined),
    };

    mockGetFiles.mockImplementation(async ({ prefix }: { prefix: string }) => {
      if (prefix === `tenants/tenant-a/carts/cart-user-1/items/${itemId}/`) {
        return [[tenantFile]];
      }

      return [[]];
    });

    await moveCartFilesToOrderInBucket(createBucket(), {
      cartCustomerId: "cart-user-1",
      channelId: "channel-1",
      orderCustomerId: "customer-1",
      orderId: "order-1",
      items: [createItem(itemId)],
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      },
    });

    expect(tenantFile.move).toHaveBeenCalledWith(
      `tenants/tenant-a/channels/channel-1/orders/customer-1/order-1/items/${itemId}/print.pdf`,
    );
  });
});
