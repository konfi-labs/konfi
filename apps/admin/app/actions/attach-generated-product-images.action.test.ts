import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  assertSaasRuntimeQuota: vi.fn(),
  bucketFile: vi.fn(),
  copy: vi.fn(),
  getAdminDb: vi.fn(),
  getAuthenticatedAdminUid: vi.fn(),
  getMetadata: vi.fn(),
  getTenantContextForRequest: vi.fn(),
  randomUUID: vi.fn(),
  recordSaasRuntimeQuotaUsage: vi.fn(),
  requireTenantAdminChannelAccess: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  getAuthenticatedAdminUid: actionMocks.getAuthenticatedAdminUid,
  requireTenantAdminChannelAccess: actionMocks.requireTenantAdminChannelAccess,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: actionMocks.getAdminDb,
  getFirebaseAdminApp: vi.fn(() => ({})),
  getTenantContextForRequest: actionMocks.getTenantContextForRequest,
}));

vi.mock("@/lib/saas-runtime-quotas", () => ({
  assertSaasRuntimeQuota: actionMocks.assertSaasRuntimeQuota,
  recordSaasRuntimeQuotaUsage: actionMocks.recordSaasRuntimeQuotaUsage,
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      file: actionMocks.bucketFile,
    })),
  })),
}));

vi.mock("node:crypto", () => ({
  randomUUID: actionMocks.randomUUID,
}));

import { attachGeneratedProductImages } from "./attach-generated-product-images";

describe("attachGeneratedProductImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "bucket.appspot.com";
    actionMocks.getAuthenticatedAdminUid.mockResolvedValue("admin-1");
    actionMocks.requireTenantAdminChannelAccess.mockResolvedValue("channel-1");
    actionMocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
    });
    actionMocks.getAdminDb.mockReturnValue({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          exists: true,
        }),
      })),
    });
    actionMocks.bucketFile.mockReturnValue({
      copy: actionMocks.copy,
      getMetadata: actionMocks.getMetadata,
    });
    actionMocks.getMetadata.mockResolvedValue([{ size: "3" }]);
    actionMocks.copy.mockResolvedValue(undefined);
    actionMocks.assertSaasRuntimeQuota.mockResolvedValue(undefined);
    actionMocks.recordSaasRuntimeQuotaUsage.mockResolvedValue(undefined);
    actionMocks.randomUUID.mockReturnValue("image-id");
  });

  it("copies generated product images after authorizing the destination product", async () => {
    const result = await attachGeneratedProductImages({
      destinationPrefix: "images/channels/channel-1/products/product-1/",
      sourceStoragePaths: [
        "ai/generated/accounts/admin-1/2026-05-10/model/source.png",
      ],
    });

    expect(result).toEqual({
      fileNames: ["ai-image-id.png"],
      fullPaths: [
        "images/channels/channel-1/products/product-1/ai-image-id.png",
      ],
    });
    expect(actionMocks.requireTenantAdminChannelAccess).toHaveBeenCalledWith(
      "channel-1",
    );
    expect(actionMocks.copy).toHaveBeenCalledTimes(1);
  });

  it("rejects a destination channel the admin cannot access before reading storage", async () => {
    actionMocks.requireTenantAdminChannelAccess.mockRejectedValue(
      new Error("Tenant channel access is required"),
    );

    await expect(
      attachGeneratedProductImages({
        destinationPrefix: "channels/channel-2/products/product-1",
        sourceStoragePaths: [
          "ai/generated/accounts/admin-1/2026-05-10/model/source.png",
        ],
      }),
    ).rejects.toThrow("Tenant channel access is required");

    expect(actionMocks.bucketFile).not.toHaveBeenCalled();
  });

  it("rejects a missing destination product before reading storage", async () => {
    actionMocks.getAdminDb.mockReturnValue({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          exists: false,
        }),
      })),
    });

    await expect(
      attachGeneratedProductImages({
        destinationPrefix: "channels/channel-1/products/foreign-product",
        sourceStoragePaths: [
          "ai/generated/accounts/admin-1/2026-05-10/model/source.png",
        ],
      }),
    ).rejects.toThrow("Product image destination was not found.");

    expect(actionMocks.bucketFile).not.toHaveBeenCalled();
  });
});
