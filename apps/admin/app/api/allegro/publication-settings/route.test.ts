import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  getAllegroAccessToken: mockGetAllegroAccessToken,
  getAllegroApiBase: vi.fn(() => "https://api.allegro.example.test"),
}));

let GET: (typeof import("./route"))["GET"];

describe("/api/allegro/publication-settings GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockGetAllegroAccessToken.mockResolvedValue({
      accessToken: "token",
      tokenData: {
        accessToken: "token",
        expiresAt: Date.now() + 1000,
        refreshToken: "refresh",
        userId: "user-1",
        userLogin: "seller",
      },
    });
  });

  it("returns normalized seller publication setting IDs", async () => {
    const responses = new Map<string, unknown>([
      [
        "https://api.allegro.example.test/sale/shipping-rates",
        { shippingRates: [{ id: "shipping-1", name: "Courier" }] },
      ],
      [
        "https://api.allegro.example.test/after-sales-service-conditions/return-policies",
        { returnPolicies: [{ id: "return-1", name: "14 days" }] },
      ],
      [
        "https://api.allegro.example.test/after-sales-service-conditions/implied-warranties",
        { impliedWarranties: [{ id: "implied-1", name: "Default claims" }] },
      ],
      [
        "https://api.allegro.example.test/after-sales-service-conditions/warranties",
        { warranties: [{ id: "warranty-1", name: "Warranty" }] },
      ],
      [
        "https://api.allegro.example.test/sale/responsible-producers",
        {
          responsibleProducers: [{ id: "producer-1", name: "KONFI producer" }],
        },
      ],
    ]);
    const fetchMock = vi.fn((url: string) => {
      const payload = responses.get(url);
      return Promise.resolve(
        new Response(JSON.stringify(payload ?? {}), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    const payload = (await response.json()) as {
      impliedWarranties: Array<{ id: string; name: string }>;
      responsibleProducers: Array<{ id: string; name: string }>;
      returnPolicies: Array<{ id: string; name: string }>;
      shippingRates: Array<{ id: string; name: string }>;
      warranties: Array<{ id: string; name: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.shippingRates).toEqual([
      { id: "shipping-1", name: "Courier" },
    ]);
    expect(payload.returnPolicies).toEqual([
      { id: "return-1", name: "14 days" },
    ]);
    expect(payload.impliedWarranties).toEqual([
      { id: "implied-1", name: "Default claims" },
    ]);
    expect(payload.warranties).toEqual([
      { id: "warranty-1", name: "Warranty" },
    ]);
    expect(payload.responsibleProducers).toEqual([
      { id: "producer-1", name: "KONFI producer" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.allegro.example.test/sale/shipping-rates",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });

  it("requires Allegro authentication", async () => {
    mockGetAllegroAccessToken.mockResolvedValue(null);

    const response = await GET();
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Not authenticated with Allegro");
  });
});
