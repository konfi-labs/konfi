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

describe("/api/allegro/category-parameters GET", () => {
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

  it("returns mock category parameters in development without Allegro auth", async () => {
    const request = new NextRequest(
      "http://localhost/api/allegro/category-parameters?categoryId=257931",
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      categoryId: string;
      parameters: Array<{ id: string; name: string }>;
    };

    expect(response.status).toBe(200);
    expect(mockRequireAdminAuth).toHaveBeenCalledTimes(1);
    expect(mockGetAllegroAccessToken).not.toHaveBeenCalled();
    expect(payload.categoryId).toBe("257931");
    expect(
      payload.parameters.some((parameter) => parameter.name === "Paper"),
    ).toBe(true);
  });

  it("requires a category ID", async () => {
    const request = new NextRequest(
      "http://localhost/api/allegro/category-parameters",
    );

    const response = await GET(request);
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("categoryId query parameter is required");
  });
});
