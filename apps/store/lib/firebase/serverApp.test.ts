import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const tenantDomainsDoc = vi.fn(() => ({
    get: tenantDomainsDocGet,
  }));
  const tenantsDoc = vi.fn(() => ({
    get: tenantsDocGet,
  }));
  const tenantDomainsDocGet = vi.fn();
  const tenantsDocGet = vi.fn();
  const collection = vi.fn((collectionName: string) => ({
    doc: collectionName === "tenantDomains" ? tenantDomainsDoc : tenantsDoc,
  }));
  const adminDb = { collection };
  const getAdminFirestore = vi.fn(() => adminDb);

  return {
    adminDb,
    collection,
    getAdminFirestore,
    headers: vi.fn(),
    tenantDomainsDoc,
    tenantDomainsDocGet,
    tenantsDoc,
    tenantsDocGet,
  };
});

vi.mock("@konfi/firebase", () => ({
  connectFirebaseClientEmulators: vi.fn(),
  getPageContent: vi.fn(),
  getPageMetadata: vi.fn(),
  resolveRequestTenantHostname: (headers: Headers) =>
    headers.get("x-forwarded-host") ?? headers.get("host") ?? undefined,
  resolveServerTenantContext: (
    _env?: Record<string, string | undefined>,
    tenantId?: string | null,
  ) => {
    const deploymentMode =
      process.env.KONFI_DEPLOYMENT_MODE === "saas" ? "saas" : "dedicated";

    return {
      deploymentMode,
      requireTenantId: deploymentMode === "saas",
      tenantId: tenantId ?? (deploymentMode === "saas" ? undefined : "default"),
    };
  },
  shouldUseFirebaseEmulators: vi.fn(() => false),
}));

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn((credentials: unknown) => credentials),
  getApps: vi.fn(() => [{ name: "store-firebase-admin" }]),
  initializeApp: vi.fn(() => ({ name: "store-firebase-admin" })),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({})),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mocks.getAdminFirestore,
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => ({})),
}));

vi.mock("firebase-admin/app-check", () => ({
  getAppCheck: vi.fn(() => ({})),
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

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("../google/integration-config", () => ({
  withTenantGoogleStorefrontConfig: vi.fn((runtimeConfig: unknown) =>
    Promise.resolve(runtimeConfig),
  ),
}));

vi.mock("../inpost/integration-config", () => ({
  withTenantInpostGeowidgetConfig: vi.fn((runtimeConfig: unknown) =>
    Promise.resolve(runtimeConfig),
  ),
}));

vi.mock("../payments/tenant-payment-status", () => ({
  withTenantPaymentProviderStatus: vi.fn((runtimeConfig: unknown) =>
    Promise.resolve(runtimeConfig),
  ),
}));

let getTenantContextForRequest: (tenantId?: string | null) => Promise<unknown>;
let getStoreRuntimeConfigForRequest: (
  tenantId?: string | null,
) => Promise<unknown>;
let getTenantDomainForHostname: (hostname: string) => Promise<unknown>;
let resolveDevStorefrontDomainLookupHostname: (input: {
  env?: Record<string, string | undefined>;
  requestHost?: string | null;
}) => string | undefined;
let shouldSilentlyFallbackFromOptionalStaticDataError: (
  error: unknown,
) => boolean;
let shouldDeferStorefrontDataDuringProductionBuild: () => boolean;
let shouldSkipStaticDataDuringCiBuild: () => boolean;

describe("store Firebase server runtime", () => {
  beforeAll(async () => {
    ({
      getTenantContextForRequest,
      getStoreRuntimeConfigForRequest,
      getTenantDomainForHostname,
      resolveDevStorefrontDomainLookupHostname,
      shouldDeferStorefrontDataDuringProductionBuild,
      shouldSilentlyFallbackFromOptionalStaticDataError,
      shouldSkipStaticDataDuringCiBuild,
    } = await import("./serverApp"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("KONFI_DEPLOYMENT_MODE", "saas");
    vi.stubEnv("NEXT_PUBLIC_FIRESTORE_DATABASE_ID", "default");
    mocks.headers.mockResolvedValue(
      new Headers({ host: "preview-store.vercel.app" }),
    );
  });

  it("uses a configured storefront hostname for localhost SaaS development requests", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ host: "drukdo-pl.store.localhost:3000" }),
    );
    mocks.tenantDomainsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        channelId: "drukdo-pl_default",
        hostname: "drukdo-pl.store.getkonfi.com",
        kind: "STOREFRONT",
        status: "ACTIVE",
        tenantId: "drukdo-pl",
      }),
    });
    mocks.tenantsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        planId: "pro",
        status: "ACTIVE",
      }),
    });

    const runtimeConfig = await getStoreRuntimeConfigForRequest();

    expect(mocks.tenantDomainsDoc).toHaveBeenCalledWith(
      "drukdo-pl.store.getkonfi.com",
    );
    expect(mocks.getAdminFirestore).toHaveBeenCalledWith(
      expect.anything(),
      "default",
    );
    expect(runtimeConfig).toMatchObject({
      channelId: "drukdo-pl_default",
      requestHostname: "drukdo-pl.store.localhost:3000",
      storeBaseUrl: "http://drukdo-pl.store.localhost:3000",
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "drukdo-pl",
      },
    });
  });

  it("resolves dedicated runtime config statically without request headers", async () => {
    vi.stubEnv("KONFI_DEPLOYMENT_MODE", "dedicated");
    vi.stubEnv("NEXT_PUBLIC_STORE_CHANNEL_ID", "channel-1");
    vi.stubEnv("STORE_URL", "store.example.com");

    const runtimeConfig = await getStoreRuntimeConfigForRequest();

    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.tenantDomainsDoc).not.toHaveBeenCalled();
    expect(runtimeConfig).toMatchObject({
      channelId: "channel-1",
      storeBaseUrl: "https://store.example.com",
      tenantContext: {
        deploymentMode: "dedicated",
        requireTenantId: false,
        tenantId: "default",
      },
    });
  });

  it("can infer the production storefront hostname from a local storefront subdomain", () => {
    expect(
      resolveDevStorefrontDomainLookupHostname({
        env: {
          NODE_ENV: "development",
        },
        requestHost: "drukdo-pl.store.localhost:3000",
      }),
    ).toBe("drukdo-pl.store.getkonfi.com");

    expect(
      resolveDevStorefrontDomainLookupHostname({
        env: {
          KONFI_DEV_STOREFRONT_PRODUCTION_SUFFIX: "store.example.com",
          NODE_ENV: "development",
        },
        requestHost: "drukdo-pl.store.lvh.me:3000",
      }),
    ).toBe("drukdo-pl.store.example.com");
  });

  it("uses the dev storefront hostname override for request tenant context", async () => {
    vi.stubEnv("KONFI_DEV_STOREFRONT_HOSTNAME", "drukdo-pl.store.getkonfi.com");
    mocks.headers.mockResolvedValue(new Headers({ host: "127.0.0.1:3000" }));
    mocks.tenantDomainsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        hostname: "drukdo-pl.store.getkonfi.com",
        status: "ACTIVE",
        tenantId: "drukdo-pl",
      }),
    });

    await expect(getTenantContextForRequest()).resolves.toMatchObject({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "drukdo-pl",
    });
    expect(mocks.tenantDomainsDoc).toHaveBeenCalledWith(
      "drukdo-pl.store.getkonfi.com",
    );
  });

  it("ignores the storefront hostname override outside localhost development requests", () => {
    expect(
      resolveDevStorefrontDomainLookupHostname({
        env: {
          KONFI_DEV_STOREFRONT_HOSTNAME: "drukdo-pl.store.getkonfi.com",
          NODE_ENV: "development",
        },
        requestHost: "tenant.example.com",
      }),
    ).toBeUndefined();

    expect(
      resolveDevStorefrontDomainLookupHostname({
        env: {
          KONFI_DEV_STOREFRONT_HOSTNAME: "drukdo-pl.store.getkonfi.com",
          NODE_ENV: "production",
        },
        requestHost: "localhost:3000",
      }),
    ).toBeUndefined();
  });

  it("treats Firestore NOT_FOUND while resolving an unconnected host as no tenant domain", async () => {
    mocks.tenantDomainsDocGet.mockRejectedValue({ code: 5 });

    await expect(getStoreRuntimeConfigForRequest()).resolves.toBeNull();
  });

  it("still surfaces non-NOT_FOUND tenant-domain lookup failures", async () => {
    const error = new Error("permission denied");
    mocks.tenantDomainsDocGet.mockRejectedValue(error);

    await expect(
      getTenantDomainForHostname("preview-store.vercel.app"),
    ).rejects.toThrow("permission denied");
  });

  it("silences optional permission-denied production build and transient static data fallbacks", () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    expect(
      shouldSilentlyFallbackFromOptionalStaticDataError({
        code: "permission-denied",
      }),
    ).toBe(true);
    expect(
      shouldSilentlyFallbackFromOptionalStaticDataError({
        code: "unavailable",
      }),
    ).toBe(true);

    vi.stubEnv("NEXT_PHASE", "phase-production-server");

    expect(
      shouldSilentlyFallbackFromOptionalStaticDataError({
        code: "permission-denied",
      }),
    ).toBe(false);
  });

  it("skips static data reads when the CI skip flag is set", () => {
    expect(shouldSkipStaticDataDuringCiBuild()).toBe(false);

    vi.stubEnv("SKIP_STATIC_PARAMS_DURING_CI_BUILD", "true");

    expect(shouldSkipStaticDataDuringCiBuild()).toBe(true);
  });

  it("skips static data reads during Next production builds without Firebase Admin credentials", () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("ADMIN_FIREBASE_CLIENT_EMAIL", "");
    vi.stubEnv("ADMIN_FIREBASE_SERVICE_ACCOUNT", "");

    expect(shouldSkipStaticDataDuringCiBuild()).toBe(true);
  });

  it("keeps static data reads enabled during Next production builds with Firebase Admin credentials", () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "konfi-test");
    vi.stubEnv("ADMIN_FIREBASE_CLIENT_EMAIL", "firebase-admin@example.com");
    vi.stubEnv("ADMIN_FIREBASE_SERVICE_ACCOUNT", "private-key");

    expect(shouldSkipStaticDataDuringCiBuild()).toBe(false);

    vi.stubEnv("NEXT_PHASE", "phase-production-server");

    expect(shouldSkipStaticDataDuringCiBuild()).toBe(false);
  });

  it("defers storefront data during production builds unless explicitly opted into prerendering", () => {
    expect(shouldDeferStorefrontDataDuringProductionBuild()).toBe(false);

    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    expect(shouldDeferStorefrontDataDuringProductionBuild()).toBe(true);

    vi.stubEnv("KONFI_PRERENDER_STOREFRONT_DATA", "true");

    expect(shouldDeferStorefrontDataDuringProductionBuild()).toBe(false);

    vi.stubEnv("KONFI_PRERENDER_STOREFRONT_DATA", "false");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");

    expect(shouldDeferStorefrontDataDuringProductionBuild()).toBe(false);
  });
});
