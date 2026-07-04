import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  mockBuildGoogleReviewsMonthKey: vi.fn(),
  mockEnsureFirebaseAdminInitialized: vi.fn(),
  mockGetAdminDb: vi.fn(),
  mockGetGooglePlaceReviews: vi.fn(),
  mockGetGoogleReviewsSyncDocument: vi.fn(),
  mockGetTenantContext: vi.fn(),
  mockListConnectedTenantGoogleStorefrontIntegrations: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockSaveGoogleReviewSyncFailure: vi.fn(),
  mockSaveGoogleReviewSnapshots: vi.fn(),
}));

const mockChannelDocuments = new Map<string, { tenantId: string }>();

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
  getTenantContext: mocks.mockGetTenantContext,
}));

vi.mock("@/lib/google/integration-config", () => ({
  listConnectedTenantGoogleStorefrontIntegrations:
    mocks.mockListConnectedTenantGoogleStorefrontIntegrations,
}));

vi.mock("@/lib/google/review-snapshots", () => ({
  buildGoogleReviewsMonthKey: mocks.mockBuildGoogleReviewsMonthKey,
  ensureFirebaseAdminInitialized: mocks.mockEnsureFirebaseAdminInitialized,
  getGoogleReviewsSyncDocument: mocks.mockGetGoogleReviewsSyncDocument,
  saveGoogleReviewSyncFailure: mocks.mockSaveGoogleReviewSyncFailure,
  saveGoogleReviewSnapshots: mocks.mockSaveGoogleReviewSnapshots,
}));

vi.mock("@konfi/google", () => ({
  getGooglePlaceReviews: mocks.mockGetGooglePlaceReviews,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.mockRevalidateTag,
}));

let GET: (typeof import("./route"))["GET"];

function createRequest(authorization = "Bearer cron-secret") {
  return new NextRequest("https://store.example.com/api/cron/google-reviews", {
    headers: {
      authorization,
    },
  });
}

describe("/api/cron/google-reviews GET", () => {
  const cronSecret = process.env.CRON_SECRET;
  const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockChannelDocuments.clear();
    process.env.CRON_SECRET = "cron-secret";
    process.env.GOOGLE_PLACES_API_KEY = "central-key";
    process.env.GOOGLE_PLACE_ID = "env-place";
    mockChannelDocuments.set("channel-1", { tenantId: "tenant-1" });
    mocks.mockBuildGoogleReviewsMonthKey.mockReturnValue("2026-05");
    mocks.mockGetAdminDb.mockReturnValue({
      collection: () => ({
        doc: (channelId: string) => ({
          get: async () => ({
            exists: mockChannelDocuments.has(channelId),
            data: () => mockChannelDocuments.get(channelId),
          }),
        }),
      }),
    });
    mocks.mockGetGooglePlaceReviews.mockResolvedValue([
      {
        authorAttribution: {
          displayName: "Jane",
          uri: "https://example.com",
        },
        publishTime: "2026-05-01T00:00:00Z",
        rating: 5,
        text: "Great",
      },
    ]);
    mocks.mockGetGoogleReviewsSyncDocument.mockResolvedValue(undefined);
    mocks.mockGetTenantContext.mockReturnValue({
      deploymentMode: "saas",
      requireTenantId: true,
    });
    mocks.mockListConnectedTenantGoogleStorefrontIntegrations.mockResolvedValue(
      [
        {
          tenantId: "tenant-1",
          channels: {
            "channel-1": {
              placeId: "tenant-place",
              reviewsEnabled: true,
              tagManagerEnabled: false,
            },
            "channel-2": {
              placeId: "disabled-place",
              reviewsEnabled: false,
              tagManagerEnabled: false,
            },
            "channel-3": {
              reviewsEnabled: true,
              tagManagerEnabled: false,
            },
            "channel-4": {
              placeId: "wrong-tenant-place",
              reviewsEnabled: true,
              tagManagerEnabled: false,
            },
          },
        },
      ],
    );
    mockChannelDocuments.set("channel-4", { tenantId: "tenant-2" });
  });

  afterAll(() => {
    process.env.CRON_SECRET = cronSecret;
    process.env.GOOGLE_PLACES_API_KEY = placesApiKey;
    process.env.GOOGLE_PLACE_ID = placeId;
  });

  it("syncs enabled SaaS tenant integrations without using env GOOGLE_PLACE_ID", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: "saas",
      results: [
        {
          channelId: "channel-1",
          placeId: "tenant-place",
          skipped: false,
          tenantId: "tenant-1",
        },
        {
          channelId: "channel-2",
          reason: "Google reviews are disabled or Place ID is missing.",
          skipped: true,
          tenantId: "tenant-1",
        },
        {
          channelId: "channel-3",
          reason: "Google reviews are disabled or Place ID is missing.",
          skipped: true,
          tenantId: "tenant-1",
        },
        {
          channelId: "channel-4",
          reason: "Channel does not belong to tenant.",
          skipped: true,
          tenantId: "tenant-1",
        },
      ],
      success: true,
      syncedMonth: "2026-05",
    });
    expect(mocks.mockSaveGoogleReviewSnapshots).toHaveBeenCalledTimes(1);
    expect(mocks.mockSaveGoogleReviewSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "channel-1",
        placeId: "tenant-place",
        syncedMonth: "2026-05",
      }),
    );
    expect(mocks.mockGetGooglePlaceReviews).not.toHaveBeenCalledWith(
      "env-place",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps cron authorization before key configuration", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "";

    const response = await GET(createRequest("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.mockEnsureFirebaseAdminInitialized).not.toHaveBeenCalled();
    expect(
      mocks.mockListConnectedTenantGoogleStorefrontIntegrations,
    ).not.toHaveBeenCalled();
    expect(mocks.mockGetGooglePlaceReviews).not.toHaveBeenCalled();
  });

  it("syncs dedicated reviews from the env Google Place ID", async () => {
    mocks.mockGetTenantContext.mockReturnValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
    });

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: "dedicated",
      placeId: "env-place",
      skipped: false,
      success: true,
      syncedMonth: "2026-05",
    });
    expect(mocks.mockSaveGoogleReviewSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: undefined,
        placeId: "env-place",
        syncedMonth: "2026-05",
      }),
    );
    expect(mocks.mockRevalidateTag).toHaveBeenCalledWith(
      "googleReviews",
      "max",
    );
  });

  it("records Places failures without overwriting stored review snapshots", async () => {
    mocks.mockGetTenantContext.mockReturnValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
    });
    mocks.mockGetGooglePlaceReviews.mockRejectedValue(
      new Error("403 Forbidden: API key expired."),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "403 Forbidden: API key expired.",
      failed: true,
      mode: "dedicated",
      placeId: "env-place",
      success: false,
      syncedMonth: "2026-05",
    });
    expect(mocks.mockSaveGoogleReviewSnapshots).not.toHaveBeenCalled();
    expect(mocks.mockSaveGoogleReviewSyncFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: undefined,
        attemptedMonth: "2026-05",
        error: "403 Forbidden: API key expired.",
        placeId: "env-place",
      }),
    );
  });
});
