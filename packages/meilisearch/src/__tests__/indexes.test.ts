import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIndexCache, searchApp, searchCustomersIndex } from "../indexes";

const searchMock = vi.fn();
const multiSearchMock = vi.fn();
const getIndexMock = vi.fn();

vi.mock("../client", () => ({
  getClient: vi.fn(async () => ({
    getIndex: getIndexMock,
    multiSearch: multiSearchMock,
  })),
}));

describe("Meilisearch tenant filters", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getIndexMock.mockResolvedValue({ search: searchMock });
    searchMock.mockResolvedValue({ hits: [{ _firestore_id: "customer-1" }] });
    multiSearchMock.mockResolvedValue({
      results: [{ hits: [] }, { hits: [] }, { hits: [] }],
    });
    await resetIndexCache();
  });

  it("scopes customer index search to the tenant when provided", async () => {
    const result = await searchCustomersIndex(
      "acme",
      0,
      10,
      undefined,
      "tenant-a",
    );

    expect(result).toEqual(["customer-1"]);
    expect(searchMock).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({
        filter: ['(tenantId = "tenant-a")'],
      }),
    );
  });

  it("scopes app multi-search by tenant and authorized channels", async () => {
    await searchApp("cards", undefined, {
      channelIds: ["channel-a", "channel-b"],
      tenantId: "tenant-a",
    });

    expect(multiSearchMock).toHaveBeenCalledWith({
      queries: expect.arrayContaining([
        expect.objectContaining({
          indexUid: "customers",
          filter: ['(tenantId = "tenant-a")'],
        }),
        expect.objectContaining({
          indexUid: "orders",
          filter: [
            '(tenantId = "tenant-a") AND (channelId = "channel-a" OR channelId = "channel-b")',
          ],
        }),
        expect.objectContaining({
          indexUid: "products",
          filter: [
            '(tenantId = "tenant-a") AND (channelId = "channel-a" OR channelId = "channel-b")',
          ],
        }),
      ]),
    });
  });
});
