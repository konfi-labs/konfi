import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockCookies,
  mockHeaders,
  mockTenantDomainsDoc,
  mockTenantDomainsDocGet,
  mockCollection,
  mockGetAdminFirestore,
} = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockHeaders: vi.fn(),
  mockTenantDomainsDoc: vi.fn(),
  mockTenantDomainsDocGet: vi.fn(),
  mockCollection: vi.fn(),
  mockGetAdminFirestore: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));

vi.mock("@/lib/firebase/config", () => ({
  firebaseConfig: {
    projectId: "demo-konfi",
    storageBucket: "demo-konfi.appspot.com",
  },
}));

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn((credentials) => credentials),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: "firebase-admin-app" })),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({})),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mockGetAdminFirestore,
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => ({})),
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(() => ({})),
}));

vi.mock("firebase/app", () => ({
  initializeServerApp: vi.fn(() => ({})),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({})),
}));

vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({})),
}));

vi.mock("@konfi/firebase", () => {
  function firstNonBlank(...values: Array<string | undefined>) {
    return values
      .map((value) => value?.trim())
      .find((value): value is string => Boolean(value));
  }

  function normalizeTenantId(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  function normalizeTenantHostname(value: string | null | undefined) {
    const rawHost = value
      ?.split(",")
      .map((item) => item.trim())
      .find(Boolean);

    if (!rawHost) {
      return;
    }

    try {
      const parsed = new URL(
        rawHost.includes("://") ? rawHost : `https://${rawHost}`,
      );
      const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

      return hostname || undefined;
    } catch {
      return;
    }
  }

  return {
    connectFirebaseClientEmulators: vi.fn(),
    normalizeTenantHostname,
    resolveRequestTenantHostname: (headers: Headers) =>
      normalizeTenantHostname(
        headers.get("x-forwarded-host") ?? headers.get("host"),
      ),
    resolveServerTenantContext: (
      env: Record<string, string | undefined>,
      explicitTenantId?: string | null,
    ) => {
      const deploymentMode =
        firstNonBlank(env.KONFI_DEPLOYMENT_MODE, env.DEPLOYMENT_MODE) === "saas"
          ? "saas"
          : "dedicated";
      const tenantId =
        normalizeTenantId(explicitTenantId) ??
        normalizeTenantId(firstNonBlank(env.KONFI_TENANT_ID)) ??
        (deploymentMode === "dedicated" ? "default" : undefined);

      return {
        deploymentMode,
        requireTenantId:
          deploymentMode === "saas" ||
          firstNonBlank(env.KONFI_REQUIRE_TENANT_ID) === "true",
        tenantId,
      };
    },
    shouldUseFirebaseEmulators: vi.fn(() => true),
  };
});

describe("admin tenant request context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv("KONFI_DEPLOYMENT_MODE", "saas");
    vi.stubEnv("NEXT_PUBLIC_FIRESTORE_DATABASE_ID", "default");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-konfi");
    vi.stubEnv("NODE_ENV", "development");

    mockHeaders.mockResolvedValue(new Headers({ host: "localhost:3001" }));
    mockCookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    mockTenantDomainsDocGet.mockResolvedValue({
      exists: false,
      data: () => undefined,
    });
    mockTenantDomainsDoc.mockReturnValue({ get: mockTenantDomainsDocGet });
    mockCollection.mockReturnValue({ doc: mockTenantDomainsDoc });
    mockGetAdminFirestore.mockReturnValue({ collection: mockCollection });
  });

  it("uses the configured tenant id for localhost SaaS development", async () => {
    vi.stubEnv("KONFI_TENANT_ID", "tenant-a");
    const { getTenantContextForRequest } = await import("./serverApp");

    await expect(getTenantContextForRequest()).resolves.toEqual({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    expect(mockTenantDomainsDoc).toHaveBeenCalledWith("localhost");
  });

  it("can map localhost to a configured admin tenant domain", async () => {
    vi.stubEnv("KONFI_TENANT_ID", "tenant-a");
    vi.stubEnv("KONFI_DEV_ADMIN_HOSTNAME", "tenant-b.admin.example.com");
    mockTenantDomainsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        hostname: "tenant-b.admin.example.com",
        status: "ACTIVE",
        tenantId: "tenant-b",
      }),
    });
    const { getTenantContextForRequest } = await import("./serverApp");

    await expect(getTenantContextForRequest()).resolves.toEqual({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-b",
    });

    expect(mockTenantDomainsDoc).toHaveBeenCalledWith(
      "tenant-b.admin.example.com",
    );
  });

  it("does not use the configured tenant id outside local development", async () => {
    vi.stubEnv("KONFI_TENANT_ID", "tenant-a");
    vi.stubEnv("NODE_ENV", "production");
    const { getTenantContextForRequest } = await import("./serverApp");

    await expect(getTenantContextForRequest()).resolves.toEqual({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: undefined,
    });

    expect(mockTenantDomainsDoc).toHaveBeenCalledWith("localhost");
  });
});
