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

import { attachGeneratedOrderItemImage } from "./attach-generated-order-item-image";

function seedOrder(data: Record<string, unknown>, exists = true) {
  actionMocks.getAdminDb.mockReturnValue({
    doc: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({
        data: () => data,
        exists,
      }),
    })),
  });
}

describe("attachGeneratedOrderItemImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "bucket.appspot.com";
    actionMocks.getAuthenticatedAdminUid.mockResolvedValue("admin-1");
    actionMocks.requireTenantAdminChannelAccess.mockResolvedValue("channel-1");
    actionMocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
    });
    actionMocks.bucketFile.mockReturnValue({
      copy: actionMocks.copy,
      getMetadata: actionMocks.getMetadata,
    });
    actionMocks.getMetadata.mockResolvedValue([{ size: "4" }]);
    actionMocks.copy.mockResolvedValue(undefined);
    actionMocks.assertSaasRuntimeQuota.mockResolvedValue(undefined);
    actionMocks.recordSaasRuntimeQuotaUsage.mockResolvedValue(undefined);
    actionMocks.randomUUID.mockReturnValue("image-id");
    seedOrder({
      customer: { id: "customer-1" },
      id: "order-1",
      items: [{ id: "item-1" }],
    });
  });

  it("derives order item attachment paths from the authorized order", async () => {
    const result = await attachGeneratedOrderItemImage({
      channelId: "channel-1",
      orderId: "order-1",
      orderItemId: "item-1",
      sourceStoragePath:
        "ai/generated/accounts/admin-1/2026-05-10/model/source.png",
    });

    expect(result).toEqual({
      fileName: "ai-image-id.png",
      fullPath: "orders/customer-1/order-1/items/item-1/ai-image-id.png",
      thumbnailPath:
        "thumb_orders/customer-1/order-1/items/item-1/thumb_ai-image-id.png",
    });
    expect(actionMocks.copy).toHaveBeenCalledTimes(2);
  });

  it("prefixes generated order item paths with tenant and channel in SaaS", async () => {
    actionMocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    const result = await attachGeneratedOrderItemImage({
      channelId: "channel-1",
      orderId: "order-1",
      orderItemId: "item-1",
      sourceStoragePath:
        "ai/generated/accounts/admin-1/2026-05-10/model/source.png",
    });

    expect(result).toEqual({
      fileName: "ai-image-id.png",
      fullPath:
        "tenants/tenant-a/channels/channel-1/orders/customer-1/order-1/items/item-1/ai-image-id.png",
      thumbnailPath:
        "tenants/tenant-a/channels/channel-1/thumb_orders/customer-1/order-1/items/item-1/thumb_ai-image-id.png",
    });
  });

  it("rejects a destination channel the admin cannot access before reading storage", async () => {
    actionMocks.requireTenantAdminChannelAccess.mockRejectedValue(
      new Error("Tenant channel access is required"),
    );

    await expect(
      attachGeneratedOrderItemImage({
        channelId: "channel-2",
        orderId: "order-1",
        orderItemId: "item-1",
        sourceStoragePath:
          "ai/generated/accounts/admin-1/2026-05-10/model/source.png",
      }),
    ).rejects.toThrow("Tenant channel access is required");

    expect(actionMocks.bucketFile).not.toHaveBeenCalled();
  });

  it("rejects a foreign order item before copying storage objects", async () => {
    await expect(
      attachGeneratedOrderItemImage({
        channelId: "channel-1",
        orderId: "order-1",
        orderItemId: "item-2",
        sourceStoragePath:
          "ai/generated/accounts/admin-1/2026-05-10/model/source.png",
      }),
    ).rejects.toThrow("Order item was not found.");

    expect(actionMocks.bucketFile).not.toHaveBeenCalled();
  });
});
