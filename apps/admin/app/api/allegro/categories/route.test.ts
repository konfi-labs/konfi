import {
  afterEach,
  beforeAll,
  beforeEach,
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
  getAllegroAccessToken: mockGetAllegroAccessToken,
  getAllegroApiBase: vi.fn(() => "https://api.allegro.example.test"),
}));

let GET: (typeof import("./route"))["GET"];

describe("/api/allegro/categories GET", () => {
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

  it("returns matching development category suggestions", async () => {
    const request = new NextRequest(
      "http://localhost/api/allegro/categories?query=ulotki",
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      categories: Array<{ id: string; name: string; path: string[] }>;
    };

    expect(response.status).toBe(200);
    expect(mockRequireAdminAuth).toHaveBeenCalledTimes(1);
    expect(mockGetAllegroAccessToken).not.toHaveBeenCalled();
    expect(payload.categories).toContainEqual({
      id: "257931",
      name: "Ulotki",
      path: ["Firma i uslugi", "Druk", "Ulotki"],
    });
  });

  it("requires a searchable query", async () => {
    const request = new NextRequest(
      "http://localhost/api/allegro/categories?query=u",
    );

    const response = await GET(request);
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("query must contain at least 2 characters");
  });
});
