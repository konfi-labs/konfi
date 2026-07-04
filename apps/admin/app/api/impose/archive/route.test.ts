import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

const routeMocks = vi.hoisted(() => {
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
    downloadImpositionArchiveFromStorage: vi.fn(),
    getAuthenticatedAdminUid: vi.fn(),
    getImpositionArchiveDownloadMetadata: vi.fn(),
  };
});

vi.mock("@/actions/auth-utils", () => ({
  AdminAuthError: routeMocks.MockAdminAuthError,
  getAuthenticatedAdminUid: routeMocks.getAuthenticatedAdminUid,
}));

vi.mock("@/lib/imposition/storage.server", () => ({
  downloadImpositionArchiveFromStorage:
    routeMocks.downloadImpositionArchiveFromStorage,
  getImpositionArchiveDownloadMetadata:
    routeMocks.getImpositionArchiveDownloadMetadata,
}));

let GET: (typeof import("./route"))["GET"];
let HEAD: (typeof import("./route"))["HEAD"];

function createArchiveRequest(storagePath?: string): Request {
  const url = new URL("http://localhost/api/impose/archive");

  if (storagePath) {
    url.searchParams.set("path", storagePath);
  }

  return new Request(url);
}

describe("/api/impose/archive", () => {
  beforeAll(async () => {
    ({ GET, HEAD } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.getAuthenticatedAdminUid.mockResolvedValue("admin-1");
    routeMocks.downloadImpositionArchiveFromStorage.mockResolvedValue({
      bytes: Uint8Array.from([1, 2, 3]),
      contentDisposition: 'attachment; filename="archive.tar.gz"',
      contentLength: "3",
      contentType: "application/gzip",
    });
    routeMocks.getImpositionArchiveDownloadMetadata.mockResolvedValue({
      contentDisposition: 'attachment; filename="archive.tar.gz"',
      contentLength: "3",
      contentType: "application/gzip",
    });
  });

  it("serves an authenticated archive download through the storage helper", async () => {
    const storagePath =
      "imposition/results/accounts/admin-1/2026-05-10/archive.tar.gz";
    const response = await GET(createArchiveRequest(storagePath));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/gzip");
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(
      routeMocks.downloadImpositionArchiveFromStorage,
    ).toHaveBeenCalledWith({
      accountId: "admin-1",
      storagePath,
    });
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1, 2, 3,
    ]);
  });

  it("serves authenticated HEAD metadata without downloading bytes", async () => {
    const storagePath =
      "imposition/results/accounts/admin-1/2026-05-10/archive.tar.gz";
    const response = await HEAD(createArchiveRequest(storagePath));

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(
      routeMocks.getImpositionArchiveDownloadMetadata,
    ).toHaveBeenCalledWith({
      accountId: "admin-1",
      storagePath,
    });
    expect(
      routeMocks.downloadImpositionArchiveFromStorage,
    ).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated archive downloads", async () => {
    routeMocks.getAuthenticatedAdminUid.mockRejectedValue(
      new routeMocks.MockAdminAuthError(
        "Unauthorized: Admin access required",
        401,
      ),
    );

    const response = await GET(
      createArchiveRequest(
        "imposition/results/accounts/admin-1/2026-05-10/archive.tar.gz",
      ),
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Unauthorized: Admin access required");
    expect(
      routeMocks.downloadImpositionArchiveFromStorage,
    ).not.toHaveBeenCalled();
  });

  it("rejects requests without a storage path", async () => {
    const response = await GET(createArchiveRequest());
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Imposition archive path is required.");
    expect(
      routeMocks.downloadImpositionArchiveFromStorage,
    ).not.toHaveBeenCalled();
  });
});
