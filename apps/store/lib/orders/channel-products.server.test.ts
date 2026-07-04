import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveChannelProductsByIdForOrder } from "./channel-products.server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const docs = new Map<string, unknown>();
  const readPaths: string[] = [];

  return {
    docs,
    readPaths,
    mockGetAdminDb: vi.fn(() => ({
      doc: (path: string) => {
        readPaths.push(path);

        return {
          get: async () => {
            const data = docs.get(path);

            return {
              data: () => data,
              exists: data !== undefined,
            };
          },
        };
      },
    })),
  };
});

vi.mock("../firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
}));

const tenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "tenant-1",
} as const;

describe("resolveChannelProductsByIdForOrder", () => {
  beforeEach(() => {
    mocks.docs.clear();
    mocks.readPaths.length = 0;
    vi.clearAllMocks();
  });

  it("reads cart products only from the current runtime channel", async () => {
    mocks.docs.set("channels/channel-2/products/product-foreign", {
      id: "product-foreign",
      channelId: "channel-2",
    });

    await expect(
      resolveChannelProductsByIdForOrder({
        channelId: "channel-1",
        productIds: ["product-foreign"],
        tenantContext,
      }),
    ).resolves.toEqual([]);

    expect(mocks.readPaths).toEqual([
      "channels/channel-1/products/product-foreign",
    ]);
  });

  it("drops current-path documents that declare a different channel", async () => {
    mocks.docs.set("channels/channel-1/products/product-1", {
      id: "product-1",
      channelId: "channel-2",
    });

    await expect(
      resolveChannelProductsByIdForOrder({
        channelId: "channel-1",
        productIds: ["product-1"],
        tenantContext,
      }),
    ).resolves.toEqual([]);
  });

  it("returns current-channel products and fills missing channel metadata", async () => {
    mocks.docs.set("channels/channel-1/products/product-1", {
      id: "product-1",
      name: "Cards",
    });

    await expect(
      resolveChannelProductsByIdForOrder({
        channelId: "channel-1",
        productIds: ["product-1"],
        tenantContext,
      }),
    ).resolves.toEqual([
      {
        id: "product-1",
        name: "Cards",
        channelId: "channel-1",
      },
    ]);
  });
});
