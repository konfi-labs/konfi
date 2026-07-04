import { TenantDomainKind, TenantDomainStatus } from "@sblyvwx/cloud-contracts";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyStorefrontEditorToken } from "@konfi/utils/server/storefront-editor-session";

const mocks = vi.hoisted(() => ({
  mockDomainGet: vi.fn(),
  mockDomainWhere: vi.fn(),
  mockGetAdminDb: vi.fn(),
  mockGetTenantAdminScopeTenantId: vi.fn(),
  mockRequireTenantAdminAuthContext: vi.fn(),
  mockRequireTenantAdminChannelAccess: vi.fn(),
  mockTenantGet: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/actions/auth-utils", () => ({
  getTenantAdminScopeTenantId: mocks.mockGetTenantAdminScopeTenantId,
  requireTenantAdminAuthContext: mocks.mockRequireTenantAdminAuthContext,
  requireTenantAdminChannelAccess: mocks.mockRequireTenantAdminChannelAccess,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
}));

let createStorefrontEditorLaunchUrlAction: (typeof import("./storefront-editor"))["createStorefrontEditorLaunchUrlAction"];

function configureFirestore() {
  mocks.mockGetAdminDb.mockReturnValue({
    collection: (collectionName: string) => {
      if (collectionName === "tenants") {
        return {
          doc: () => ({
            get: mocks.mockTenantGet,
          }),
        };
      }

      if (collectionName === "tenantDomains") {
        return {
          where: mocks.mockDomainWhere,
        };
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    },
  });
  mocks.mockDomainWhere.mockReturnValue({
    get: mocks.mockDomainGet,
  });
}

describe("storefront editor actions", () => {
  beforeAll(async () => {
    ({ createStorefrontEditorLaunchUrlAction } =
      await import("./storefront-editor"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("KONFI_STOREFRONT_EDITOR_SECRET", "test-editor-secret");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_STORE_DEV_URL", "");
    vi.stubEnv("NEXT_PUBLIC_STORE_LOCAL_URL", "");
    vi.stubEnv("NEXT_PUBLIC_STORE_URL", "");
    vi.stubEnv("STORE_URL", "");
    vi.useRealTimers();

    configureFirestore();
    mocks.mockRequireTenantAdminChannelAccess.mockResolvedValue("channel-1");
    mocks.mockRequireTenantAdminAuthContext.mockResolvedValue({
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-1",
      },
      uid: "admin-1",
    });
    mocks.mockGetTenantAdminScopeTenantId.mockReturnValue("tenant-1");
    mocks.mockTenantGet.mockResolvedValue({
      data: () => ({
        moduleFlags: {
          storefront: true,
        },
      }),
    });
    mocks.mockDomainGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            channelId: "channel-1",
            hostname: "store.tenant.test",
            kind: TenantDomainKind.STOREFRONT,
            status: TenantDomainStatus.ACTIVE,
            tenantId: "tenant-1",
          }),
        },
      ],
    });
  });

  it("creates a tenant and channel scoped storefront editor launch URL", async () => {
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    vi.useFakeTimers();

    const result = await createStorefrontEditorLaunchUrlAction({
      channelId: " channel-1 ",
      locale: "en",
    });
    const launchUrl = new URL(result.url);
    const token = new URLSearchParams(launchUrl.hash.slice(1)).get("token");

    expect(launchUrl.origin).toBe("https://store.tenant.test");
    expect(launchUrl.pathname).toBe("/en/storefront-editor/session");
    expect(launchUrl.searchParams.has("token")).toBe(false);
    expect(token).toBeTruthy();
    expect(verifyStorefrontEditorToken(token)).toMatchObject({
      channelId: "channel-1",
      tenantId: "tenant-1",
      uid: "admin-1",
    });
    expect(mocks.mockRequireTenantAdminChannelAccess).toHaveBeenCalledWith(
      " channel-1 ",
    );
    expect(mocks.mockDomainWhere).toHaveBeenCalledWith(
      "tenantId",
      "==",
      "tenant-1",
    );
  });

  it("rejects tenants with the storefront module disabled", async () => {
    mocks.mockTenantGet.mockResolvedValue({
      data: () => ({
        moduleFlags: {
          storefront: false,
        },
      }),
    });

    await expect(
      createStorefrontEditorLaunchUrlAction({ channelId: "channel-1" }),
    ).rejects.toThrow("Storefront module is not enabled for this tenant.");
    expect(mocks.mockDomainGet).not.toHaveBeenCalled();
  });

  it("requires an active storefront domain in SaaS mode", async () => {
    mocks.mockDomainGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            channelId: "channel-1",
            hostname: "store.tenant.test",
            kind: TenantDomainKind.STOREFRONT,
            status: TenantDomainStatus.DISABLED,
            tenantId: "tenant-1",
          }),
        },
      ],
    });

    await expect(
      createStorefrontEditorLaunchUrlAction({ channelId: "channel-1" }),
    ).rejects.toThrow("Active storefront domain is required.");
  });

  it("uses the configured dedicated store URL outside SaaS mode", async () => {
    vi.stubEnv("STORE_URL", "dedicated-store.example.com");
    mocks.mockRequireTenantAdminAuthContext.mockResolvedValue({
      tenantContext: {
        deploymentMode: "dedicated",
        requireTenantId: false,
        tenantId: "dedicated",
      },
      uid: "admin-1",
    });
    mocks.mockGetTenantAdminScopeTenantId.mockReturnValue(undefined);

    const result = await createStorefrontEditorLaunchUrlAction({
      channelId: "channel-1",
      locale: "pl",
    });

    expect(new URL(result.url).origin).toBe(
      "https://dedicated-store.example.com",
    );
    expect(mocks.mockDomainGet).not.toHaveBeenCalled();
  });
});
