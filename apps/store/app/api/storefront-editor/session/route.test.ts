import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStorefrontEditorToken } from "@/lib/storefront-editor/session";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mockGetStoreRuntimeConfigForRequest: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getStoreRuntimeConfigForRequest: mocks.mockGetStoreRuntimeConfigForRequest,
}));

let GET: (typeof import("./route"))["GET"];
let POST: (typeof import("./route"))["POST"];

const runtimeConfig = {
  channelId: "channel-1",
  storeBaseUrl: "https://tenant.example.com",
  tenantContext: {
    deploymentMode: "saas",
    requireTenantId: true,
    tenantId: "tenant-1",
  },
};

const request = (body: unknown) =>
  new NextRequest("https://tenant.example.com/api/storefront-editor/session", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

describe("/api/storefront-editor/session", () => {
  beforeAll(async () => {
    ({ GET, POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("KONFI_STOREFRONT_EDITOR_SECRET", "test-editor-secret");
    mocks.mockGetStoreRuntimeConfigForRequest.mockResolvedValue(runtimeConfig);
  });

  it("does not accept storefront editor tokens from the query string", async () => {
    const token = createStorefrontEditorToken({
      channelId: "channel-1",
      tenantId: "tenant-1",
      uid: "admin-1",
    });

    const response = await GET(
      new NextRequest(
        `https://tenant.example.com/api/storefront-editor/session?lng=en&token=${encodeURIComponent(token)}`,
      ),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.mockGetStoreRuntimeConfigForRequest).not.toHaveBeenCalled();
  });

  it("sets the editor cookie from a POST body token", async () => {
    const token = createStorefrontEditorToken({
      channelId: "channel-1",
      tenantId: "tenant-1",
      uid: "admin-1",
    });

    const response = await POST(request({ lng: "en", token }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: "/en?preview=1",
    });
    expect(response.headers.get("set-cookie")).toContain(
      "__konfi_storefront_editor=",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("rejects valid tokens scoped to a different tenant", async () => {
    const token = createStorefrontEditorToken({
      channelId: "channel-1",
      tenantId: "tenant-2",
      uid: "admin-1",
    });

    const response = await POST(request({ lng: "en", token }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Preview tenant mismatch.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects malformed POST body tokens", async () => {
    const response = await POST(request({ lng: "en", token: "not-a-token" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid preview token.",
    });
    expect(mocks.mockGetStoreRuntimeConfigForRequest).not.toHaveBeenCalled();
  });
});
