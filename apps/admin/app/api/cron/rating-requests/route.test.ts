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
  mockGetFirebaseAdminApp: vi.fn(),
  mockGetFirestore: vi.fn(),
  mockGetLastSuccessfulRatingRequestRunAt: vi.fn(),
  mockIsAuthorizedCronRequest: vi.fn(),
  mockIsSharedSaasCronRuntime: vi.fn(),
  mockMarkRatingRequestRunSuccessful: vi.fn(),
  mockRunForCronTenants: vi.fn(),
  mockRunAutomatedRatingRequests: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({
  isAuthorizedCronRequest: mocks.mockIsAuthorizedCronRequest,
}));

const dedicatedTenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
} as const;

vi.mock("@/lib/cron/tenant-runner", () => ({
  isSharedSaasCronRuntime: mocks.mockIsSharedSaasCronRuntime,
  runForCronTenants: mocks.mockRunForCronTenants,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetFirestore,
  getFirebaseAdminApp: mocks.mockGetFirebaseAdminApp,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mocks.mockGetFirestore,
}));

vi.mock("@/lib/rating-requests/rating-request-service", () => ({
  getLastSuccessfulRatingRequestRunAt:
    mocks.mockGetLastSuccessfulRatingRequestRunAt,
  markRatingRequestRunSuccessful: mocks.mockMarkRatingRequestRunSuccessful,
  runAutomatedRatingRequests: mocks.mockRunAutomatedRatingRequests,
}));

let GET: (typeof import("./route"))["GET"];

const originalCronSecret = process.env.CRON_SECRET;
const originalNoReplyEmail = process.env.NO_REPLY_EMAIL;
const originalResendApiKey = process.env.RESEND_API_KEY;

function createRequest() {
  return new NextRequest("http://localhost/api/cron/rating-requests", {
    method: "GET",
  });
}

describe("/api/cron/rating-requests GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "super-secret";
    process.env.NO_REPLY_EMAIL = "noreply@example.com";
    process.env.RESEND_API_KEY = "resend-api-key";
    mocks.mockGetFirebaseAdminApp.mockReturnValue({});
    mocks.mockGetFirestore.mockReturnValue({ name: "firestore" });
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(true);
    mocks.mockIsSharedSaasCronRuntime.mockReturnValue(false);
    mocks.mockRunForCronTenants.mockImplementation(
      async (
        runner: (context: {
          tenantContext: typeof dedicatedTenantContext;
          tenantId: string;
        }) => Promise<unknown>,
      ) => [
        {
          tenantId: "default",
          status: "processed",
          result: await runner({
            tenantContext: dedicatedTenantContext,
            tenantId: "default",
          }),
        },
      ],
    );
    mocks.mockGetLastSuccessfulRatingRequestRunAt.mockResolvedValue(
      new Date("2026-05-01T11:00:00.000Z"),
    );
    mocks.mockMarkRatingRequestRunSuccessful.mockResolvedValue(undefined);
    mocks.mockRunAutomatedRatingRequests.mockResolvedValue({
      eligible: 1,
      scanned: 2,
      sent: 1,
      skipped: 0,
    });
  });

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }

    if (originalNoReplyEmail === undefined) {
      delete process.env.NO_REPLY_EMAIL;
    } else {
      process.env.NO_REPLY_EMAIL = originalNoReplyEmail;
    }

    if (originalResendApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendApiKey;
    }
  });

  it("runs rating requests and returns the send summary", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mockIsAuthorizedCronRequest).toHaveBeenCalledTimes(1);
    expect(mocks.mockRunAutomatedRatingRequests).toHaveBeenCalledWith({
      fulfilledAfter: new Date("2026-05-01T11:00:00.000Z"),
      fulfilledBefore: expect.any(Date),
      firestore: { name: "firestore" },
      tenantContext: dedicatedTenantContext,
    });
    expect(mocks.mockMarkRatingRequestRunSuccessful).toHaveBeenCalledWith({
      completedAt: expect.any(Date),
      firestore: { name: "firestore" },
      tenantContext: dedicatedTenantContext,
    });
    await expect(response.json()).resolves.toEqual({
      eligible: 1,
      scanned: 2,
      sent: 1,
      skipped: 0,
      success: true,
      tenants: [
        {
          result: {
            fulfilledAfter: "2026-05-01T11:00:00.000Z",
            fulfilledBefore: expect.any(String),
            initialized: false,
            eligible: 1,
            scanned: 2,
            sent: 1,
            skipped: 0,
          },
          status: "processed",
          tenantId: "default",
        },
      ],
    });
  });

  it("initializes the cron cursor without backfilling older orders", async () => {
    mocks.mockGetLastSuccessfulRatingRequestRunAt.mockResolvedValue(undefined);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mockRunAutomatedRatingRequests).not.toHaveBeenCalled();
    expect(mocks.mockMarkRatingRequestRunSuccessful).toHaveBeenCalledWith({
      completedAt: expect.any(Date),
      firestore: { name: "firestore" },
      tenantContext: dedicatedTenantContext,
    });
    await expect(response.json()).resolves.toEqual({
      eligible: 0,
      scanned: 0,
      sent: 0,
      skipped: 0,
      success: true,
      tenants: [
        {
          result: {
            eligible: 0,
            initialized: true,
            scanned: 0,
            sent: 0,
            skipped: 0,
          },
          status: "processed",
          tenantId: "default",
        },
      ],
    });
  });

  it("returns 401 when the cron request is unauthorized", async () => {
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(false);

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mocks.mockRunAutomatedRatingRequests).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("returns 500 when required email configuration is missing", async () => {
    delete process.env.RESEND_API_KEY;

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    expect(mocks.mockIsAuthorizedCronRequest).toHaveBeenCalledTimes(1);
    expect(mocks.mockRunAutomatedRatingRequests).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "RESEND_API_KEY is not configured.",
    });
  });

  it("does not require process-wide Resend configuration in SaaS mode", async () => {
    delete process.env.RESEND_API_KEY;
    mocks.mockIsSharedSaasCronRuntime.mockReturnValue(true);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mockRunAutomatedRatingRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantContext: dedicatedTenantContext,
      }),
    );
  });
});
