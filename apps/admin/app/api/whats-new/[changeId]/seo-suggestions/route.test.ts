import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockAdminAuthError,
  mockRequireAdminAuth,
  mockListMonthlySeoSuggestions,
} = vi.hoisted(() => {
  class MockAdminAuthError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AdminAuthError";
      this.statusCode = statusCode;
    }
  }

  return {
    MockAdminAuthError,
    mockRequireAdminAuth: vi.fn(),
    mockListMonthlySeoSuggestions: vi.fn(),
  };
});

const { mockCookies, mockConnection } = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockConnection: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  AdminAuthError: MockAdminAuthError,
  requireAdminAuth: mockRequireAdminAuth,
}));

vi.mock("@/lib/whats-new/seo-suggestions", () => ({
  listMonthlySeoSuggestions: mockListMonthlySeoSuggestions,
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>(
    "next/server",
  );

  return {
    ...actual,
    connection: mockConnection,
  };
});

let GET: typeof import("./route")["GET"];

describe("/api/whats-new/[changeId]/seo-suggestions GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection.mockResolvedValue(undefined);
    mockCookies.mockResolvedValue({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      has: vi.fn(() => false),
      set: vi.fn(),
      delete: vi.fn(),
      toString: vi.fn(() => ""),
    });
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockListMonthlySeoSuggestions.mockResolvedValue([
      {
        productId: "product-1",
        productName: "Calendars",
        currentSeo: {
          title: "Current title",
          description: "Current description",
        },
        suggestedSeo: {
          title: "Suggested title",
          description: "Suggested description",
        },
        research: {
          en: "Research",
          pl: "Research",
        },
      },
    ]);
  });

  it("awaits changeId from params before loading suggestions", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/whats-new/monthly-growth:2026-04/seo-suggestions",
      ) as never,
      {
        params: Promise.resolve({ changeId: "monthly-growth:2026-04" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockRequireAdminAuth).toHaveBeenCalledTimes(1);
    expect(mockListMonthlySeoSuggestions).toHaveBeenCalledWith(
      "monthly-growth:2026-04",
    );
    await expect(response.json()).resolves.toEqual([
      {
        productId: "product-1",
        productName: "Calendars",
        currentSeo: {
          title: "Current title",
          description: "Current description",
        },
        suggestedSeo: {
          title: "Suggested title",
          description: "Suggested description",
        },
        research: {
          en: "Research",
          pl: "Research",
        },
      },
    ]);
  });

  it("returns the auth status code when admin auth fails", async () => {
    mockRequireAdminAuth.mockRejectedValue(
      new MockAdminAuthError("Unauthorized: Admin access required", 401),
    );

    const response = await GET(new Request("http://localhost/api/test") as never, {
      params: Promise.resolve({ changeId: "monthly-growth:2026-04" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to load SEO suggestions",
    });
    expect(mockListMonthlySeoSuggestions).not.toHaveBeenCalled();
  });

  it("returns 403 for forbidden admin auth failures", async () => {
    mockRequireAdminAuth.mockRejectedValue(
      new MockAdminAuthError("Unauthorized: Super admin access required", 403),
    );

    const response = await GET(new Request("http://localhost/api/test") as never, {
      params: Promise.resolve({ changeId: "monthly-growth:2026-04" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to load SEO suggestions",
    });
    expect(mockListMonthlySeoSuggestions).not.toHaveBeenCalled();
  });
});
