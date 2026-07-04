import type { TenantContext, TenantMembership } from "@sblyvwx/cloud-contracts";
import {
  TenantMembershipStatus,
  type TenantPermission,
  TenantRole,
} from "@sblyvwx/cloud-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminAuthError,
  clearInvalidAdminAuthCookies,
  listActiveAdminTenantMembershipsForUid,
  membershipHasPermission,
  pickDefaultTenantMembershipForLogin,
  requireAdminAuth,
  requireTenantAdminChannelAccess,
  requireTenantAdminAuth,
  requireTenantPermission,
  requireTenantWidePermission,
  tenantMembershipHasFullTenantScope,
} from "./auth-utils";

vi.mock("server-only", () => ({}));

vi.mock("@sblyvwx/cloud-contracts", () => ({
  buildTenantMembershipId: (tenantId: string, uid: string) =>
    `${tenantId}_${uid}`,
  TenantMembershipStatus: {
    ACTIVE: "active",
  },
  TenantRole: {
    ADMIN: "admin",
    MEMBER: "member",
    OWNER: "owner",
  },
}));

const {
  mockVerifySessionCookie,
  mockGetTenantContextForRequest,
  mockGetAdminDb,
  mockCollection,
  mockDoc,
  mockGet,
  mockQueryGet,
  mockWhere,
} = vi.hoisted(() => ({
  mockVerifySessionCookie: vi.fn(),
  mockGetTenantContextForRequest: vi.fn(),
  mockGetAdminDb: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockGet: vi.fn(),
  mockQueryGet: vi.fn(),
  mockWhere: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  verifySessionCookie: mockVerifySessionCookie,
  getTenantContextForRequest: mockGetTenantContextForRequest,
  getAdminDb: mockGetAdminDb,
}));

type AuthCookieStore = Parameters<typeof requireTenantAdminAuth>[1];

function createCookieStore(): AuthCookieStore {
  return {
    get: vi.fn(() => ({ value: "session-cookie" })),
    set: vi.fn(),
  } as unknown as AuthCookieStore;
}

function setTenantContext(context: TenantContext) {
  mockGetTenantContextForRequest.mockResolvedValue(context);
}

function setMembership(membership: TenantMembership | null) {
  mockGet.mockResolvedValue({
    exists: membership !== null,
    data: () => membership,
  });
}

function setMembershipAndChannel(
  membership: TenantMembership,
  channel: { tenantId?: string | null } | null,
) {
  mockGet
    .mockResolvedValueOnce({
      exists: true,
      data: () => membership,
    })
    .mockResolvedValueOnce({
      exists: channel !== null,
      data: () => channel,
    });
}

function createTenantMembership(
  overrides: Partial<TenantMembership> & Pick<TenantMembership, "tenantId">,
): TenantMembership {
  return {
    id: `${overrides.tenantId}_admin-uid`,
    tenantId: overrides.tenantId,
    uid: "admin-uid",
    role: TenantRole.MEMBER,
    accessLevel: 1000,
    status: TenantMembershipStatus.ACTIVE,
    ...overrides,
  };
}

describe("requireTenantAdminAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifySessionCookie.mockResolvedValue({
      uid: "admin-uid",
      admin: true,
    });
    mockGetAdminDb.mockReturnValue({ collection: mockCollection });
    const query = {
      get: mockQueryGet,
      where: mockWhere,
    };
    mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere });
    mockDoc.mockReturnValue({ get: mockGet });
    mockWhere.mockReturnValue(query);
  });

  it("allows dedicated mode without a SaaS tenant membership", async () => {
    setTenantContext({
      deploymentMode: "dedicated",
      requireTenantId: false,
    });
    setMembership(null);

    const membership = await requireTenantAdminAuth(
      undefined,
      createCookieStore(),
    );

    expect(membership).toBeNull();
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("applies tenant membership checks through the default admin guard in SaaS mode", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership(null);

    await expect(requireAdminAuth(createCookieStore())).rejects.toMatchObject<
      Partial<AdminAuthError>
    >({
      statusCode: 403,
      message: "Tenant membership is required",
    });

    expect(mockDoc).toHaveBeenCalledWith("tenant-a_admin-uid");
  });

  it("does not clear cookies from read-only validation when the session cookie is missing", async () => {
    const cookieStore = createCookieStore();
    vi.mocked(cookieStore.get).mockReturnValue(undefined);

    await expect(requireAdminAuth(cookieStore)).rejects.toMatchObject<
      Partial<AdminAuthError>
    >({
      statusCode: 401,
      message: "Unauthorized: Staff access required",
    });

    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("does not clear cookies from read-only validation when the session cookie is invalid", async () => {
    mockVerifySessionCookie.mockResolvedValue(null);
    const cookieStore = createCookieStore();

    await expect(requireAdminAuth(cookieStore)).rejects.toMatchObject<
      Partial<AdminAuthError>
    >({
      statusCode: 401,
      message: "Unauthorized: Staff access required",
    });

    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("clears admin auth cookies only through the explicit cleanup helper", async () => {
    const cookieStore = createCookieStore();

    await clearInvalidAdminAuthCookies(cookieStore);

    expect(cookieStore.set).toHaveBeenCalledWith("__session", "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    expect(cookieStore.set).toHaveBeenCalledWith("__isAdmin", "false", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    expect(cookieStore.set).toHaveBeenCalledWith("__isCourier", "false", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("rejects a global admin without membership for the requested tenant", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-b",
    });
    setMembership(null);

    await expect(
      requireTenantAdminAuth("tenant-b", createCookieStore()),
    ).rejects.toMatchObject<Partial<AdminAuthError>>({
      statusCode: 403,
      message: "Tenant membership is required",
    });

    expect(mockCollection).toHaveBeenCalledWith("tenantMemberships");
    expect(mockDoc).toHaveBeenCalledWith("tenant-b_admin-uid");
  });

  it("allows an active tenant admin membership", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership({
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.ADMIN,
      accessLevel: 9999,
      status: TenantMembershipStatus.ACTIVE,
    });

    const membership = await requireTenantAdminAuth(
      "tenant-a",
      createCookieStore(),
    );

    expect(membership?.tenantId).toBe("tenant-a");
  });

  it("allows an active tenant member membership to enter the SaaS runtime", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership({
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.MEMBER,
      accessLevel: 1000,
      status: TenantMembershipStatus.ACTIVE,
      channelIds: ["channel-1"],
    });

    const membership = await requireTenantAdminAuth(
      "tenant-a",
      createCookieStore(),
    );

    expect(membership?.role).toBe(TenantRole.MEMBER);
  });

  it("lists active admin memberships for login tenant resolution", async () => {
    const ownerMembership: TenantMembership = {
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.OWNER,
      accessLevel: 5000,
      status: TenantMembershipStatus.ACTIVE,
    };
    const memberMembership: TenantMembership = {
      id: "tenant-b_admin-uid",
      tenantId: "tenant-b",
      uid: "admin-uid",
      role: TenantRole.MEMBER,
      accessLevel: 1000,
      status: TenantMembershipStatus.ACTIVE,
    };
    mockQueryGet.mockResolvedValue({
      docs: [{ data: () => ownerMembership }, { data: () => memberMembership }],
    });

    const memberships =
      await listActiveAdminTenantMembershipsForUid("admin-uid");

    expect(mockCollection).toHaveBeenCalledWith("tenantMemberships");
    expect(mockWhere).toHaveBeenNthCalledWith(1, "uid", "==", "admin-uid");
    expect(mockWhere).toHaveBeenNthCalledWith(
      2,
      "status",
      "==",
      TenantMembershipStatus.ACTIVE,
    );
    expect(memberships).toEqual([ownerMembership, memberMembership]);
  });

  it("prefers an owner membership for the shared SaaS admin login fallback", () => {
    const invitedMembership = createTenantMembership({
      tenantId: "tenant-a",
      role: TenantRole.MEMBER,
      accessLevel: 1000,
    });
    const ownerMembership = createTenantMembership({
      tenantId: "tenant-z",
      role: TenantRole.OWNER,
      accessLevel: 5000,
    });

    expect(
      pickDefaultTenantMembershipForLogin([invitedMembership, ownerMembership])
        ?.tenantId,
    ).toBe("tenant-z");
  });

  it("prefers an admin membership over member-level invited spaces", () => {
    const invitedMembership = createTenantMembership({
      tenantId: "tenant-a",
      role: TenantRole.MEMBER,
      accessLevel: 1000,
    });
    const adminMembership = createTenantMembership({
      tenantId: "tenant-z",
      role: TenantRole.ADMIN,
      accessLevel: 5000,
    });

    expect(
      pickDefaultTenantMembershipForLogin([invitedMembership, adminMembership])
        ?.tenantId,
    ).toBe("tenant-z");
  });

  it("keeps shared SaaS admin login fallback deterministic for equal roles", () => {
    expect(
      pickDefaultTenantMembershipForLogin([
        createTenantMembership({
          id: "tenant-b_admin-uid",
          tenantId: "tenant-b",
          role: TenantRole.ADMIN,
          accessLevel: 5000,
        }),
        createTenantMembership({
          id: "tenant-a_admin-uid",
          tenantId: "tenant-a",
          role: TenantRole.ADMIN,
          accessLevel: 5000,
        }),
      ])?.tenantId,
    ).toBe("tenant-a");
  });

  it("allows a server action channel parameter included in membership channelIds", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership({
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.ADMIN,
      accessLevel: 9999,
      status: TenantMembershipStatus.ACTIVE,
      channelIds: ["channel-1"],
    });

    await expect(
      requireTenantAdminChannelAccess(
        " channel-1 ",
        "tenant-a",
        createCookieStore(),
      ),
    ).resolves.toBe("channel-1");
  });

  it("allows tenant members to load channels included in membership channelIds", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembershipAndChannel(
      {
        id: "tenant-a_admin-uid",
        tenantId: "tenant-a",
        uid: "admin-uid",
        role: TenantRole.MEMBER,
        accessLevel: 1000,
        status: TenantMembershipStatus.ACTIVE,
        channelIds: ["channel-1"],
      },
      {
        tenantId: "tenant-a",
      },
    );

    await expect(
      requireTenantAdminChannelAccess(
        " channel-1 ",
        "tenant-a",
        createCookieStore(),
      ),
    ).resolves.toBe("channel-1");
  });

  it("denies a server action channel parameter outside membership channelIds", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership({
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.ADMIN,
      accessLevel: 9999,
      status: TenantMembershipStatus.ACTIVE,
      channelIds: ["channel-1"],
    });

    await expect(
      requireTenantAdminChannelAccess(
        "channel-2",
        "tenant-a",
        createCookieStore(),
      ),
    ).rejects.toMatchObject<Partial<AdminAuthError>>({
      statusCode: 403,
      message: "Tenant channel access is required",
    });
  });

  it("allows all channels for an active tenant admin with empty channelIds", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership({
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.ADMIN,
      accessLevel: 9999,
      status: TenantMembershipStatus.ACTIVE,
      channelIds: [],
    });

    await expect(
      requireTenantAdminChannelAccess(
        "channel-2",
        "tenant-a",
        createCookieStore(),
      ),
    ).resolves.toBe("channel-2");
  });

  it("treats owners as full tenant scope even with saved channelIds", () => {
    expect(
      tenantMembershipHasFullTenantScope({
        id: "tenant-a_owner-uid",
        tenantId: "tenant-a",
        uid: "owner-uid",
        role: TenantRole.OWNER,
        accessLevel: 5000,
        status: TenantMembershipStatus.ACTIVE,
        channelIds: ["channel-1"],
      }),
    ).toBe(true);
  });

  it("requires full tenant scope for tenant-wide permissions", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership({
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.ADMIN,
      accessLevel: 1,
      status: TenantMembershipStatus.ACTIVE,
      permissionVersion: 1,
      permissions: ["configuration.members.manage"],
      channelIds: ["channel-1"],
    });

    await expect(
      requireTenantWidePermission(
        "configuration.members.manage",
        "tenant-a",
        createCookieStore(),
      ),
    ).rejects.toMatchObject<Partial<AdminAuthError>>({
      statusCode: 403,
      message: "Full tenant access is required",
    });
  });

  it("allows full-scope admins to use tenant-wide permissions", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership({
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.ADMIN,
      accessLevel: 1,
      status: TenantMembershipStatus.ACTIVE,
      permissionVersion: 1,
      permissions: ["configuration.members.manage"],
      channelIds: [],
    });

    await expect(
      requireTenantWidePermission(
        "configuration.members.manage",
        "tenant-a",
        createCookieStore(),
      ),
    ).resolves.toMatchObject({
      membership: expect.objectContaining({ tenantId: "tenant-a" }),
    });
  });

  it("denies an all-channel SaaS membership when the channel belongs to another tenant", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembershipAndChannel(
      {
        id: "tenant-a_admin-uid",
        tenantId: "tenant-a",
        uid: "admin-uid",
        role: TenantRole.ADMIN,
        accessLevel: 9999,
        status: TenantMembershipStatus.ACTIVE,
        channelIds: [],
      },
      {
        tenantId: "tenant-b",
      },
    );

    await expect(
      requireTenantAdminChannelAccess(
        "channel-b",
        "tenant-a",
        createCookieStore(),
      ),
    ).rejects.toMatchObject<Partial<AdminAuthError>>({
      statusCode: 403,
      message: "Tenant channel access is required",
    });
  });

  it("allows owners to use every tenant permission", () => {
    expect(
      membershipHasPermission(
        {
          id: "tenant-a_admin-uid",
          tenantId: "tenant-a",
          uid: "admin-uid",
          role: TenantRole.OWNER,
          accessLevel: 5000,
          permissions: [],
          status: TenantMembershipStatus.ACTIVE,
        },
        "catalog.attributes.create",
      ),
    ).toBe(true);
  });

  it("keeps legacy full access for admins without a permissions field", () => {
    expect(
      membershipHasPermission(
        {
          id: "tenant-a_admin-uid",
          tenantId: "tenant-a",
          uid: "admin-uid",
          role: TenantRole.ADMIN,
          accessLevel: 1,
          status: TenantMembershipStatus.ACTIVE,
        },
        "catalog.attributes.create",
      ),
    ).toBe(true);
  });

  it("allows only listed permissions for admins with explicit permissions", () => {
    const membership: TenantMembership = {
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.ADMIN,
      accessLevel: 1,
      permissions: ["catalog.products.create"],
      status: TenantMembershipStatus.ACTIVE,
    };

    expect(membershipHasPermission(membership, "catalog.products.create")).toBe(
      true,
    );
    expect(
      membershipHasPermission(membership, "catalog.attributes.create"),
    ).toBe(false);
  });

  it("denies scoped writes for admins with an empty permission allowlist", async () => {
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership({
      id: "tenant-a_admin-uid",
      tenantId: "tenant-a",
      uid: "admin-uid",
      role: TenantRole.ADMIN,
      accessLevel: 1,
      permissions: [],
      status: TenantMembershipStatus.ACTIVE,
    });

    await expect(
      requireTenantPermission(
        "catalog.products.create" satisfies TenantPermission,
        "tenant-a",
        createCookieStore(),
      ),
    ).rejects.toMatchObject<Partial<AdminAuthError>>({
      statusCode: 403,
      message: "Tenant permission is required",
    });
  });

  it("allows super admins to use tenant permissions without tenant membership", async () => {
    mockVerifySessionCookie.mockResolvedValue({
      uid: "super-admin",
      admin: true,
      accessLevel: 9999,
    });
    setTenantContext({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });
    setMembership(null);

    await expect(
      requireTenantPermission(
        "catalog.products.create",
        "tenant-a",
        createCookieStore(),
      ),
    ).resolves.toMatchObject({
      membership: null,
      uid: "super-admin",
    });
  });
});
