import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetTenantAdminScopeTenantId: vi.fn(),
  mockGetTenantContextForRequest: vi.fn(),
  mockResolveStorefrontBaseUrls: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/actions/auth-utils", () => ({
  getTenantAdminScopeTenantId: mocks.mockGetTenantAdminScopeTenantId,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getTenantContextForRequest: mocks.mockGetTenantContextForRequest,
}));

vi.mock("@/lib/storefront-domains", () => ({
  resolveStorefrontBaseUrls: mocks.mockResolveStorefrontBaseUrls,
}));

let getRevalidateApiBaseUrlsForRequest: (typeof import("./revalidate-cache.resolver"))["getRevalidateApiBaseUrlsForRequest"];

describe("revalidate cache URL resolver", () => {
  beforeAll(async () => {
    ({ getRevalidateApiBaseUrlsForRequest } =
      await import("./revalidate-cache.resolver"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("FRONTEND_REVALIDATE_URL", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("resolves SaaS revalidation URLs from active tenant storefront domains", async () => {
    const tenantContext = {
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-1",
    };
    mocks.mockGetTenantContextForRequest.mockResolvedValue(tenantContext);
    mocks.mockGetTenantAdminScopeTenantId.mockReturnValue("tenant-1");
    mocks.mockResolveStorefrontBaseUrls.mockResolvedValue([
      "https://tenant-a.store.test",
      "https://tenant-b.store.test",
    ]);

    await expect(getRevalidateApiBaseUrlsForRequest()).resolves.toEqual([
      "https://tenant-a.store.test/api/revalidate",
      "https://tenant-b.store.test/api/revalidate",
    ]);
    expect(mocks.mockResolveStorefrontBaseUrls).toHaveBeenCalledWith({
      tenantContext,
      tenantId: "tenant-1",
    });
  });

  it("keeps explicit revalidation endpoint overrides", async () => {
    vi.stubEnv(
      "FRONTEND_REVALIDATE_URL",
      "https://private-store.test/api/revalidate",
    );
    mocks.mockGetTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-1",
    });

    await expect(getRevalidateApiBaseUrlsForRequest()).resolves.toEqual([
      "https://private-store.test/api/revalidate",
    ]);
    expect(mocks.mockResolveStorefrontBaseUrls).not.toHaveBeenCalled();
  });
});
