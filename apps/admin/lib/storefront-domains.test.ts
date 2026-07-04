import { TenantDomainKind, TenantDomainStatus } from "@sblyvwx/cloud-contracts";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockDomainGet: vi.fn(),
  mockDomainWhere: vi.fn(),
  mockGetAdminDb: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
}));

let resolveSaasStorefrontBaseUrl: (typeof import("./storefront-domains"))["resolveSaasStorefrontBaseUrl"];
let resolveSaasStorefrontBaseUrls: (typeof import("./storefront-domains"))["resolveSaasStorefrontBaseUrls"];
let resolveStorefrontBaseUrl: (typeof import("./storefront-domains"))["resolveStorefrontBaseUrl"];

function configureFirestore() {
  mocks.mockGetAdminDb.mockReturnValue({
    collection: (collectionName: string) => {
      if (collectionName !== "tenantDomains") {
        throw new Error(`Unexpected collection: ${collectionName}`);
      }

      return {
        where: mocks.mockDomainWhere,
      };
    },
  });
  mocks.mockDomainWhere.mockReturnValue({
    get: mocks.mockDomainGet,
  });
}

describe("storefront domain URL helpers", () => {
  beforeAll(async () => {
    ({
      resolveSaasStorefrontBaseUrl,
      resolveSaasStorefrontBaseUrls,
      resolveStorefrontBaseUrl,
    } = await import("./storefront-domains"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    configureFirestore();
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
        {
          data: () => ({
            channelId: "channel-1",
            hostname: "custom.tenant.test",
            kind: TenantDomainKind.CUSTOM,
            status: TenantDomainStatus.ACTIVE,
            storeUrl: "https://shop.tenant.test/path",
            tenantId: "tenant-1",
          }),
        },
        {
          data: () => ({
            channelId: "channel-2",
            hostname: "second.tenant.test",
            kind: TenantDomainKind.STOREFRONT,
            status: TenantDomainStatus.ACTIVE,
            tenantId: "tenant-1",
          }),
        },
        {
          data: () => ({
            channelId: "channel-1",
            hostname: "disabled.tenant.test",
            kind: TenantDomainKind.STOREFRONT,
            status: TenantDomainStatus.DISABLED,
            tenantId: "tenant-1",
          }),
        },
      ],
    });
  });

  it("prefers the active SaaS domain storeUrl for a channel", async () => {
    await expect(
      resolveSaasStorefrontBaseUrl({
        channelId: "channel-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toBe("https://shop.tenant.test");
    expect(mocks.mockDomainWhere).toHaveBeenCalledWith(
      "tenantId",
      "==",
      "tenant-1",
    );
  });

  it("lists all active SaaS storefront domains for tenant-wide revalidation", async () => {
    await expect(
      resolveSaasStorefrontBaseUrls({
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual([
      "https://shop.tenant.test",
      "https://second.tenant.test",
      "https://store.tenant.test",
    ]);
  });

  it("uses dedicated env URLs outside SaaS mode", async () => {
    await expect(
      resolveStorefrontBaseUrl({
        env: {
          NODE_ENV: "production",
          STORE_URL: "dedicated-store.test",
        } as NodeJS.ProcessEnv,
        tenantContext: {
          deploymentMode: "dedicated",
          requireTenantId: false,
          tenantId: "default",
        },
        tenantId: "default",
      }),
    ).resolves.toBe("https://dedicated-store.test");
    expect(mocks.mockDomainGet).not.toHaveBeenCalled();
  });
});
