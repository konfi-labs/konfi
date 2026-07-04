import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: vi.fn() };
});

const { mockRequireAdminAuth, mockGetAllegroAccessToken } = vi.hoisted(() => ({
  mockRequireAdminAuth: vi.fn(),
  mockGetAllegroAccessToken: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  requireAdminAuth: mockRequireAdminAuth,
}));

vi.mock("@/lib/allegro-auth", () => ({
  ALLEGRO_ORDER_FULFILLMENT_SCOPE: "allegro:api:orders:write",
  getAllegroAccessToken: mockGetAllegroAccessToken,
  getAllegroApiBase: vi.fn(() => "https://api.allegro.example.test"),
  getMissingAllegroScopes: vi.fn(
    (grantedScope: string | undefined, requiredScopes: readonly string[]) => {
      const grantedScopes = new Set((grantedScope ?? "").split(/\s+/));
      return requiredScopes.filter((scope) => !grantedScopes.has(scope));
    },
  ),
}));

let POST: (typeof import("./route"))["POST"];

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/allegro/orders/fulfillment", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/allegro/orders/fulfillment POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLEGRO_SANDBOX", "false");
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockGetAllegroAccessToken.mockResolvedValue({
      accessToken: "allegro-token",
      tokenData: {
        accessToken: "allegro-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 60_000,
        scope: "allegro:api:orders:write",
        userId: "allegro-user",
        userLogin: "seller",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sets Allegro fulfillment status with checkout form revision", async () => {
    const response = await POST(
      createRequest({
        updates: [
          {
            id: "checkout-form-1",
            revision: "revision-1",
            status: "PROCESSING",
          },
        ],
      }),
    );
    const payload = (await response.json()) as {
      results: Array<{ id: string; ok: boolean; status?: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.results).toEqual([
      { id: "checkout-form-1", ok: true, status: "PROCESSING" },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.allegro.example.test/order/checkout-forms/checkout-form-1/fulfillment?checkoutForm.revision=revision-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ status: "PROCESSING" }),
      }),
    );
  });

  it("rejects readonly returned status payloads", async () => {
    const response = await POST(
      createRequest({
        updates: [{ id: "checkout-form-1", status: "RETURNED" }],
      }),
    );

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("requires the Allegro order write scope before changing status", async () => {
    mockGetAllegroAccessToken.mockResolvedValue({
      accessToken: "allegro-token",
      tokenData: {
        accessToken: "allegro-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 60_000,
        scope: "allegro:api:orders:read",
        userId: "allegro-user",
        userLogin: "seller",
      },
    });

    const response = await POST(
      createRequest({
        updates: [
          {
            id: "checkout-form-1",
            revision: "revision-1",
            status: "PROCESSING",
          },
        ],
      }),
    );
    const payload = (await response.json()) as {
      missingScopes: string[];
    };

    expect(response.status).toBe(403);
    expect(payload.missingScopes).toEqual(["allegro:api:orders:write"]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
