import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  requireSuperAdminAuth: vi.fn(),
  requireTenantAdminChannelAccess: vi.fn(),
  requireTenantPermission: vi.fn(),
  syncProductSemanticSearchIndexForProductWrite: vi.fn(),
  backfillProductSemanticSearchIndex: vi.fn(),
  searchSemanticProductIndex: vi.fn(),
  syncProductWriteSideEffects: vi.fn(),
  getAdminDb: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
  requireSuperAdminAuth: mocks.requireSuperAdminAuth,
  requireTenantAdminChannelAccess: mocks.requireTenantAdminChannelAccess,
  requireTenantPermission: mocks.requireTenantPermission,
}));

vi.mock("@/lib/product-search/semantic-product-index", () => ({
  backfillProductSemanticSearchIndex: mocks.backfillProductSemanticSearchIndex,
  searchSemanticProductIndex: mocks.searchSemanticProductIndex,
  syncProductSemanticSearchIndexForProductWrite:
    mocks.syncProductSemanticSearchIndexForProductWrite,
}));

vi.mock("@/lib/catalog/product-write-side-effects", () => ({
  syncProductWriteSideEffects: mocks.syncProductWriteSideEffects,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
}));

describe("syncProductSearchIndexAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantAdminChannelAccess.mockImplementation(
      (channelId: string) => Promise.resolve(channelId.trim()),
    );
    mocks.getAdminDb.mockReturnValue({
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({ exists: false })),
        })),
      })),
    });
  });

  it("returns sync results for product writes", async () => {
    mocks.syncProductSemanticSearchIndexForProductWrite.mockResolvedValue({
      indexed: 1,
      deleted: 0,
      skipped: 0,
      embeddingModel: "gemini-embedding-2",
      embeddingDimension: 768,
    });
    const { syncProductSearchIndexAction } =
      await import("./product-search-index");

    const result = await syncProductSearchIndexAction({
      channelId: " source-channel ",
      productId: " product-a ",
      previousLinkedChannelIds: ["linked-channel"],
    });

    expect(mocks.requireTenantPermission).toHaveBeenCalledWith(
      "catalog.products.update",
    );
    expect(
      mocks.syncProductSemanticSearchIndexForProductWrite,
    ).toHaveBeenCalledWith({
      channelId: "source-channel",
      productId: "product-a",
      previousLinkedChannelIds: ["linked-channel"],
    });
    expect(result).toEqual({
      ok: true,
      indexed: 1,
      deleted: 0,
      skipped: 0,
      embeddingModel: "gemini-embedding-2",
      embeddingDimension: 768,
    });
  });

  it("logs context when product search index sync fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failure = new Error("embedding failed");
    mocks.syncProductSemanticSearchIndexForProductWrite.mockRejectedValue(
      failure,
    );
    const { syncProductSearchIndexAction } =
      await import("./product-search-index");

    const result = await syncProductSearchIndexAction({
      channelId: "source-channel",
      productId: "product-a",
      previousLinkedChannelIds: ["linked-channel"],
    });

    expect(result).toEqual({
      ok: false,
      error: "embedding failed",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[syncProductSearchIndexAction] Failed",
      {
        error: failure,
        channelId: "source-channel",
        productId: "product-a",
        previousLinkedChannelIds: ["linked-channel"],
      },
    );

    consoleError.mockRestore();
  });
});
