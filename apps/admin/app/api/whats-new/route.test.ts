import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCookies,
  mockConnection,
  mockListGeneratedWhatsNewChanges,
  mockReadFile,
  mockRequireAdminAuth,
} = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockConnection: vi.fn(),
  mockListGeneratedWhatsNewChanges: vi.fn(),
  mockReadFile: vi.fn(),
  mockRequireAdminAuth: vi.fn(),
}));

vi.mock("fs", () => ({
  promises: {
    readFile: mockReadFile,
  },
}));

vi.mock("@/actions/auth-utils", () => ({
  requireAdminAuth: mockRequireAdminAuth,
}));

vi.mock("@/lib/whats-new/feed", () => ({
  listGeneratedWhatsNewChanges: mockListGeneratedWhatsNewChanges,
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");

  return {
    ...actual,
    connection: mockConnection,
  };
});

let GET: (typeof import("./route"))["GET"];

describe("/api/whats-new GET", () => {
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
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        {
          id: "manual-older",
          timestamp: "2026-04-01T00:00:00.000Z",
          title: { en: "Manual older", pl: "Manual older" },
          description: { en: "Manual older", pl: "Manual older" },
        },
      ]),
    );
    mockListGeneratedWhatsNewChanges.mockResolvedValue([
      {
        id: "generated-newer",
        timestamp: "2026-04-08T00:00:00.000Z",
        title: { en: "Generated newer", pl: "Generated newer" },
        description: { en: "Generated newer", pl: "Generated newer" },
        kind: "weekly-update",
        source: "ai",
      },
    ]);
  });

  it("returns only latest metadata in summary mode", async () => {
    const response = await GET(
      new Request("http://localhost/api/whats-new?summary=1"),
    );

    expect(response.status).toBe(200);
    expect(mockRequireAdminAuth).toHaveBeenCalledTimes(1);
    expect(mockListGeneratedWhatsNewChanges).toHaveBeenCalledWith(1);
    await expect(response.json()).resolves.toEqual({
      hasChanges: true,
      latestId: "generated-newer",
    });
  });

  it("keeps the full changelog response by default", async () => {
    const response = await GET(new Request("http://localhost/api/whats-new"));

    expect(response.status).toBe(200);
    expect(mockListGeneratedWhatsNewChanges).toHaveBeenCalledWith(undefined);
    await expect(response.json()).resolves.toMatchObject([
      { id: "generated-newer" },
      { id: "manual-older" },
    ]);
  });
});
