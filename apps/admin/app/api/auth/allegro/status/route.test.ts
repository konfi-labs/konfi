import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: vi.fn() };
});

const {
  mockRequireAdminAuth,
  mockGetAllegroAccessToken,
  mockClearAllegroTokenCookies,
} = vi.hoisted(() => ({
  mockRequireAdminAuth: vi.fn(),
  mockGetAllegroAccessToken: vi.fn(),
  mockClearAllegroTokenCookies: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  requireAdminAuth: mockRequireAdminAuth,
}));

vi.mock("@/lib/allegro-auth", () => ({
  clearAllegroTokenCookies: mockClearAllegroTokenCookies,
  getAllegroAccessToken: mockGetAllegroAccessToken,
  getMissingAllegroScopes: vi.fn((grantedScope: string | undefined) => {
    const grantedScopes = new Set((grantedScope ?? "").split(/\s+/));
    return ["allegro:api:orders:write"].filter(
      (scope) => !grantedScopes.has(scope),
    );
  }),
}));

let GET: (typeof import("./route"))["GET"];

describe("/api/auth/allegro/status GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLEGRO_SANDBOX", "false");
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockGetAllegroAccessToken.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports mock connected status in development without Allegro auth", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      connected: boolean;
      user: { login: string; email: string } | null;
    };

    expect(response.status).toBe(200);
    expect(mockRequireAdminAuth).toHaveBeenCalledTimes(1);
    expect(mockGetAllegroAccessToken).toHaveBeenCalledTimes(1);
    expect(payload.connected).toBe(true);
    expect(payload.user?.login).toBe("allegro-dev-mock");
  });

  it("reports disconnected status in sandbox without Allegro auth", async () => {
    vi.stubEnv("ALLEGRO_SANDBOX", "true");

    const response = await GET();
    const payload = (await response.json()) as {
      connected: boolean;
      user: { login: string; email: string } | null;
    };

    expect(response.status).toBe(200);
    expect(mockRequireAdminAuth).toHaveBeenCalledTimes(1);
    expect(mockGetAllegroAccessToken).toHaveBeenCalledTimes(1);
    expect(payload.connected).toBe(false);
    expect(payload.user).toBeNull();
  });

  it("reports missing scopes for an older Allegro connection", async () => {
    mockGetAllegroAccessToken.mockResolvedValue({
      accessToken: "allegro-token",
      tokenData: {
        accessToken: "allegro-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 60_000,
        scope: "allegro:api:profile:read allegro:api:orders:read",
        userId: "allegro-user",
        userLogin: "seller",
        userEmail: "seller@example.com",
      },
    });

    const response = await GET();
    const payload = (await response.json()) as {
      connected: boolean;
      missingScopes: string[];
    };

    expect(response.status).toBe(200);
    expect(payload.connected).toBe(true);
    expect(payload.missingScopes).toContain("allegro:api:orders:write");
  });
});
