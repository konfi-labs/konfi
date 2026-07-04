import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TenantMembershipStatus, TenantRole } from "@sblyvwx/cloud-contracts";

const mocks = vi.hoisted(() => {
  const docs = new Map<string, unknown>();
  const setDoc = vi.fn();

  return {
    docs,
    getTenantContextForRequest: vi.fn(),
    setDoc,
    verifyAnyIdToken: vi.fn(),
  };
});

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => "server-timestamp"),
  },
  GeoPoint: class GeoPoint {
    latitude: number;
    longitude: number;

    constructor(latitude: number, longitude: number) {
      this.latitude = latitude;
      this.longitude = longitude;
    }
  },
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(() => ({
    collection: (collectionPath: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = mocks.docs.get(`${collectionPath}/${id}`);

          return {
            data: () => data,
            exists: data !== undefined,
          };
        },
      }),
    }),
    doc: (path: string) => ({
      set: mocks.setDoc,
      path,
    }),
  })),
  getTenantContextForRequest: mocks.getTenantContextForRequest,
  verifyAnyIdToken: mocks.verifyAnyIdToken,
}));

let POST: (typeof import("./route"))["POST"];

function seedDoc(path: string, data: unknown) {
  mocks.docs.set(path, data);
}

function createRequest(channelId: string, userId = "courier-uid") {
  return new NextRequest("http://localhost/api/courier/presence", {
    body: JSON.stringify({
      channelId,
      location: { latitude: 52.23, longitude: 21.01 },
      userId,
    }),
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("/api/courier/presence", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.docs.clear();
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    mocks.verifyAnyIdToken.mockResolvedValue({
      customClaims: { courier: true },
      uid: "courier-uid",
    });
    seedDoc("channels/channel-a", { tenantId: "tenant-a" });
    seedDoc("channels/channel-b", { tenantId: "tenant-b" });
    seedDoc("tenantMemberships/tenant-a_courier-uid", {
      id: "tenant-a_courier-uid",
      role: TenantRole.COURIER,
      status: TenantMembershipStatus.ACTIVE,
      tenantId: "tenant-a",
      uid: "courier-uid",
    });
  });

  it("writes courier presence for a channel in the caller tenant membership", async () => {
    const response = await POST(createRequest("channel-a"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        activePage: "delivery",
        uid: "courier-uid",
      }),
      { merge: true },
    );
  });

  it("rejects courier presence writes to a foreign tenant channel", async () => {
    const response = await POST(createRequest("channel-b"));

    expect(response.status).toBe(403);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("rejects courier presence writes outside assigned channel ids", async () => {
    seedDoc("tenantMemberships/tenant-a_courier-uid", {
      channelIds: ["channel-c"],
      id: "tenant-a_courier-uid",
      role: TenantRole.COURIER,
      status: TenantMembershipStatus.ACTIVE,
      tenantId: "tenant-a",
      uid: "courier-uid",
    });

    const response = await POST(createRequest("channel-a"));

    expect(response.status).toBe(403);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("allows tenant admins with channel access to write their own presence", async () => {
    mocks.verifyAnyIdToken.mockResolvedValue({
      customClaims: { admin: true },
      uid: "admin-uid",
    });
    seedDoc("tenantMemberships/tenant-a_admin-uid", {
      channelIds: ["channel-a"],
      id: "tenant-a_admin-uid",
      role: TenantRole.ADMIN,
      status: TenantMembershipStatus.ACTIVE,
      tenantId: "tenant-a",
      uid: "admin-uid",
    });

    const response = await POST(createRequest("channel-a", "admin-uid"));

    expect(response.status).toBe(200);
    expect(mocks.setDoc).toHaveBeenCalledOnce();
  });
});
