import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetTenantAdminScopeTenantId: vi.fn(),
  mockGetTenantContextForRequest: vi.fn(),
  mockResolveStorefrontBaseUrl: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  getTenantAdminScopeTenantId: mocks.mockGetTenantAdminScopeTenantId,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getTenantContextForRequest: mocks.mockGetTenantContextForRequest,
}));

vi.mock("@/lib/storefront-domains", () => ({
  resolveStorefrontBaseUrl: mocks.mockResolveStorefrontBaseUrl,
}));

let POST: (typeof import("./route"))["POST"];

function previewRequest() {
  const body = new FormData();
  body.set("channelId", "channel-1");
  body.set("redirect", "/pl/products/demo?channelId=channel-1");
  body.set("token", "id-token");

  return new Request("https://app.getkonfi.com/api/store-preview-bridge", {
    body,
    method: "POST",
  });
}

describe("store preview bridge route", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_URL", "");
    mocks.mockGetTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-1",
    });
    mocks.mockGetTenantAdminScopeTenantId.mockReturnValue("tenant-1");
    mocks.mockResolveStorefrontBaseUrl.mockResolvedValue(
      "https://tenant.store.getkonfi.com",
    );
  });

  it("posts previews to the tenant storefront domain in SaaS mode", async () => {
    const response = await POST(previewRequest());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      'action="https://tenant.store.getkonfi.com/api/product-preview"',
    );
    expect(html).toContain(
      'name="redirect" value="/pl/products/demo?channelId=channel-1"',
    );
    expect(mocks.mockResolveStorefrontBaseUrl).toHaveBeenCalledWith({
      channelId: "channel-1",
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-1",
      },
      tenantId: "tenant-1",
    });
  });
});
