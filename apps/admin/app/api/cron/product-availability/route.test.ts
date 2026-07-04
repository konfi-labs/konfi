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
  mockIsAuthorizedCronRequest: vi.fn(),
  mockAuditAllChannels: vi.fn(),
  mockCreateAvailabilityNotifications: vi.fn(),
  mockGetAdminDb: vi.fn(),
  mockRunForCronTenants: vi.fn(),
  mockPublishCreatedAppNotification: vi.fn(),
  mockTimestampNow: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cron/auth", () => ({
  isAuthorizedCronRequest: mocks.mockIsAuthorizedCronRequest,
}));

vi.mock("@/lib/cron/tenant-runner", () => ({
  runForCronTenants: mocks.mockRunForCronTenants,
}));

vi.mock("@/lib/catalog/product-availability-audit", () => ({
  auditAllChannels: mocks.mockAuditAllChannels,
}));

vi.mock("@/lib/catalog/product-availability-notifications", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/catalog/product-availability-notifications")>();
  return {
    ...real,
    createAvailabilityNotifications: mocks.mockCreateAvailabilityNotifications,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
}));

vi.mock("@/lib/notifications/app-notifications", () => ({
  publishCreatedAppNotification: mocks.mockPublishCreatedAppNotification,
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: mocks.mockTimestampNow,
  },
}));

let GET: (typeof import("./route"))["GET"];

const originalCronSecret = process.env.CRON_SECRET;

function createRequest() {
  return new NextRequest("http://localhost/api/cron/product-availability", {
    method: "GET",
  });
}

describe("/api/cron/product-availability GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "super-secret";
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(true);
    mocks.mockGetAdminDb.mockReturnValue({});
    mocks.mockRunForCronTenants.mockImplementation(
      async (runner: (context: { tenantContext: unknown; tenantId?: string }) => Promise<unknown>) => {
        const result = await runner({ tenantContext: {}, tenantId: undefined });
        return [{ status: "processed", result }];
      },
    );
    mocks.mockAuditAllChannels.mockResolvedValue([
      { channelId: "ch1", channelName: "Channel 1", entries: [] },
    ]);
    mocks.mockCreateAvailabilityNotifications.mockResolvedValue(2);
    mocks.mockPublishCreatedAppNotification.mockResolvedValue(undefined);
    mocks.mockTimestampNow.mockReturnValue({ seconds: 0, nanoseconds: 0 });
  });

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
      return;
    }

    process.env.CRON_SECRET = originalCronSecret;
  });

  it("returns 500 when the cron secret is missing", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    expect(mocks.mockIsAuthorizedCronRequest).not.toHaveBeenCalled();
    expect(mocks.mockRunForCronTenants).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "CRON_SECRET is not configured.",
    });
  });

  it("returns 401 when the cron request is unauthorized", async () => {
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(false);

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mocks.mockRunForCronTenants).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("calls createAvailabilityNotifications and returns 200 with counts", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mockCreateAvailabilityNotifications).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      channelsScanned: 1,
      notificationsCreated: 2,
    });
  });

  it("returns 500 when an error is thrown", async () => {
    mocks.mockRunForCronTenants.mockRejectedValue(
      new Error("firestore unavailable"),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "firestore unavailable",
    });
  });
});

import {
  thresholdKeyForDays,
  AVAILABILITY_THRESHOLD_DAYS,
} from "@/lib/catalog/product-availability-notifications";

describe("thresholdKeyForDays", () => {
  it("maps 0 to '7'", () => {
    expect(thresholdKeyForDays(0)).toBe("7");
  });

  it("maps 5 to '7'", () => {
    expect(thresholdKeyForDays(5)).toBe("7");
  });

  it("maps 7 to '7'", () => {
    expect(thresholdKeyForDays(7)).toBe("7");
  });

  it("maps 20 to '30'", () => {
    expect(thresholdKeyForDays(20)).toBe("30");
  });

  it("maps 30 to '30'", () => {
    expect(thresholdKeyForDays(30)).toBe("30");
  });

  it("maps 60 to '90'", () => {
    expect(thresholdKeyForDays(60)).toBe("90");
  });

  it("maps 90 to '90'", () => {
    expect(thresholdKeyForDays(90)).toBe("90");
  });

  it("maps 120 to null", () => {
    expect(thresholdKeyForDays(120)).toBeNull();
  });

  it("AVAILABILITY_THRESHOLD_DAYS contains 7, 30, 90", () => {
    expect(AVAILABILITY_THRESHOLD_DAYS).toEqual([7, 30, 90]);
  });
});

function makeEntry(
  override: Partial<{
    isExpired: boolean;
    isExpiringSoon: boolean;
    daysUntilExpiration: number | null;
    expirationDate: Date | null;
  }> = {},
) {
  return {
    productId: "p1",
    productName: "Product 1",
    sourceChannelId: "ch1",
    status: {
      isExpired: false,
      isExpiringSoon: true,
      daysUntilExpiration: 5,
      expirationDate: new Date("2026-06-20"),
      ...override,
    },
  };
}

function makeFirestore(exists: boolean, archived: boolean) {
  const docStub = {
    get: vi.fn().mockResolvedValue({
      exists,
      data: () => (exists ? { archived } : undefined),
    }),
    set: vi.fn().mockResolvedValue(undefined),
  };
  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(docStub),
    }),
    _docStub: docStub,
  };
}

describe("createAvailabilityNotifications dedupe", () => {
  it("creates zero notifications when doc exists and is not archived", async () => {
    const { createAvailabilityNotifications: realCreate } = await vi.importActual<
      typeof import("@/lib/catalog/product-availability-notifications")
    >("@/lib/catalog/product-availability-notifications");

    const fs = makeFirestore(true, false);
    const audits = [
      {
        channelId: "ch1",
        channelName: "Channel 1",
        entries: [
          makeEntry({
            isExpired: false,
            isExpiringSoon: true,
            daysUntilExpiration: 5,
          }),
        ],
      },
    ];

    const count = await realCreate({
      firestore: fs as unknown as FirebaseFirestore.Firestore,
      audits,
      now: new Date(),
    });

    expect(count).toBe(0);
    expect(fs._docStub.set).not.toHaveBeenCalled();
  });

  it("creates one notification per non-empty bucket when doc does not exist", async () => {
    const { createAvailabilityNotifications: realCreate } = await vi.importActual<
      typeof import("@/lib/catalog/product-availability-notifications")
    >("@/lib/catalog/product-availability-notifications");

    const fs = makeFirestore(false, false);
    const audits = [
      {
        channelId: "ch1",
        channelName: "Channel 1",
        entries: [
          makeEntry({
            isExpired: false,
            isExpiringSoon: true,
            daysUntilExpiration: 5,
          }),
        ],
      },
    ];

    const count = await realCreate({
      firestore: fs as unknown as FirebaseFirestore.Firestore,
      audits,
      now: new Date(),
    });

    expect(count).toBe(1);
    expect(fs._docStub.set).toHaveBeenCalledTimes(1);
  });

  it("does not recreate a notification when one already exists for the window, even if archived", async () => {
    // Option B dedupe: the notification id is window-scoped, and any existing
    // doc for the current window is left untouched — archiving sticks for the
    // window instead of re-firing on the next cron run.
    const { createAvailabilityNotifications: realCreate } = await vi.importActual<
      typeof import("@/lib/catalog/product-availability-notifications")
    >("@/lib/catalog/product-availability-notifications");

    const fs = makeFirestore(true, true);
    const audits = [
      {
        channelId: "ch1",
        channelName: "Channel 1",
        entries: [
          makeEntry({
            isExpired: false,
            isExpiringSoon: true,
            daysUntilExpiration: 5,
          }),
        ],
      },
    ];

    const count = await realCreate({
      firestore: fs as unknown as FirebaseFirestore.Firestore,
      audits,
      now: new Date(),
    });

    expect(count).toBe(0);
    expect(fs._docStub.set).not.toHaveBeenCalled();
  });
});
