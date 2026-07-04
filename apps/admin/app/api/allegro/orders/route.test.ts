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
  getAllegroAccessToken: mockGetAllegroAccessToken,
  getAllegroApiBase: vi.fn(() => "https://api.allegro.example.test"),
}));

let GET: (typeof import("./route"))["GET"];

describe("/api/allegro/orders GET", () => {
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

  it("returns mock checkout forms in development without Allegro auth", async () => {
    const request = new NextRequest(
      "http://localhost/api/allegro/orders?limit=2&offset=0",
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      checkoutForms: Array<{ id: string }>;
      count: number;
      totalCount: number;
    };

    expect(response.status).toBe(200);
    expect(mockRequireAdminAuth).toHaveBeenCalledTimes(1);
    expect(mockGetAllegroAccessToken).not.toHaveBeenCalled();
    expect(payload.checkoutForms).toHaveLength(2);
    expect(payload.count).toBe(2);
    expect(payload.totalCount).toBeGreaterThanOrEqual(3);
  });
});
