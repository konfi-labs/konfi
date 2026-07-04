import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockVerifyAnyIdToken } = vi.hoisted(() => ({
  mockVerifyAnyIdToken: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  verifyAnyIdToken: mockVerifyAnyIdToken,
}));

let GET: typeof import("./route")["GET"];
let POST: typeof import("./route")["POST"];

describe("/api/product-preview", () => {
  beforeAll(async () => {
    ({ GET, POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STORE_ADMIN_PREVIEW_SECRET = "test-preview-secret";
    mockVerifyAnyIdToken.mockResolvedValue({
      admin: true,
      uid: "admin-user",
    });
  });

  it("returns 401 when no Firebase ID token is provided", async () => {
    const response = await GET(
      new Request("http://localhost/api/product-preview"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
    expect(mockVerifyAnyIdToken).not.toHaveBeenCalled();
  });

  it("returns 403 when the verified user is not an admin", async () => {
    mockVerifyAnyIdToken.mockResolvedValue({
      admin: false,
      uid: "user-1",
    });

    const response = await POST(
      new Request("http://localhost/api/product-preview", {
        body: JSON.stringify({ redirect: "/pl/products/draft-product" }),
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(mockVerifyAnyIdToken).toHaveBeenCalledWith("valid-token");
  });

  it("does not accept Firebase ID tokens from the query string", async () => {
    const response = await GET(new Request(
      "http://localhost/api/product-preview?token=valid-token&redirect=%2Fpl%2Fproducts%2Fdraft-product%3FchannelId%3Dchannel-1",
    ));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
    expect(mockVerifyAnyIdToken).not.toHaveBeenCalled();
  });

  it("sets a preview cookie and redirects after a form POST handoff", async () => {
    const formData = new FormData();
    formData.append("token", "valid-token");
    formData.append("redirect", "/pl/products/draft-product?channelId=channel-1");

    const response = await POST(
      new Request("http://localhost/api/product-preview", {
        body: formData,
        method: "POST",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/pl/products/draft-product?channelId=channel-1&adminPreview=1",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "__konfi_admin_product_preview=",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(mockVerifyAnyIdToken).toHaveBeenCalledWith("valid-token");
  });

  it("does not redirect to a different origin", async () => {
    const response = await POST(
      new Request("http://localhost/api/product-preview", {
        body: JSON.stringify({
          redirect: "https://evil.test/pl/products/draft-product",
        }),
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?adminPreview=1",
    );
  });

  it("supports POST with a bearer token so callers do not need to put the token in the query string", async () => {
    const response = await POST(
      new Request("http://localhost/api/product-preview", {
        body: JSON.stringify({ redirect: "/pl/products/draft-product" }),
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/pl/products/draft-product?adminPreview=1",
    );
    expect(mockVerifyAnyIdToken).toHaveBeenCalledWith("valid-token");
  });

  it("returns 400 for malformed JSON bodies", async () => {
    const response = await POST(
      new Request("http://localhost/api/product-preview", {
        body: "{",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
  });

  it("can clear the preview cookie", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/product-preview?disable=1&redirect=%2Fpl%2Fproducts%2Fdraft-product",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/pl/products/draft-product?adminPreview=1",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
