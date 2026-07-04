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
  mockIsAuthorizedCronRequest: vi.fn(),
  mockIsSharedSaasCronRuntime: vi.fn(),
  mockListCartIds: vi.fn(),
  mockMarkCartReminderSent: vi.fn(),
  mockReleaseAutomatedCartReminderReservation: vi.fn(),
  mockReserveAutomatedCartReminder: vi.fn(),
  mockRunForCronTenants: vi.fn(),
  mockResolveCustomerByCartId: vi.fn(),
  mockSendCartReminderEmail: vi.fn(),
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

vi.mock("@/lib/customer-carts/cart-reminder-service", () => ({
  listCartIds: mocks.mockListCartIds,
  markCartReminderSent: mocks.mockMarkCartReminderSent,
  releaseAutomatedCartReminderReservation:
    mocks.mockReleaseAutomatedCartReminderReservation,
  reserveAutomatedCartReminder: mocks.mockReserveAutomatedCartReminder,
  resolveCustomerByCartId: mocks.mockResolveCustomerByCartId,
  sendCartReminderEmail: mocks.mockSendCartReminderEmail,
}));

let GET: (typeof import("./route"))["GET"];

const originalCronSecret = process.env.CRON_SECRET;
const originalNoReplyEmail = process.env.NO_REPLY_EMAIL;

function createRequest() {
  return new NextRequest("http://localhost/api/cron/customer-cart-reminders", {
    method: "GET",
  });
}

function createFirestoreMock() {
  const cartDocSnapshot = {
    data: () => ({ lastReminderLocale: "en" }),
  };
  const itemUpdatedAt = new Date("2026-04-08T10:00:00.000Z");
  const itemsSnapshot = {
    docs: [
      {
        data: () => ({
          description: " Business cards ",
          product: { name: "Cards" },
          quantity: 2,
        }),
        id: "item-1",
        updateTime: {
          toDate: () => itemUpdatedAt,
        },
      },
    ],
    empty: false,
    size: 1,
  };

  return {
    collection: vi.fn((path: string) => {
      if (path === "carts") {
        return {
          doc: () => ({
            get: async () => cartDocSnapshot,
          }),
        };
      }

      return {
        get: async () => itemsSnapshot,
      };
    }),
  };
}

describe("/api/cron/customer-cart-reminders GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "super-secret";
    process.env.NO_REPLY_EMAIL = "noreply@example.com";
    mocks.mockGetFirebaseAdminApp.mockReturnValue({});
    mocks.mockGetFirestore.mockReturnValue(createFirestoreMock());
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
    mocks.mockListCartIds.mockResolvedValue(["cart-1"]);
    mocks.mockResolveCustomerByCartId.mockResolvedValue({
      active: true,
      email: "customer@example.com",
      id: "cart-1",
      name: "Customer",
    });
    mocks.mockMarkCartReminderSent.mockResolvedValue(undefined);
    mocks.mockReleaseAutomatedCartReminderReservation.mockResolvedValue(
      undefined,
    );
    mocks.mockReserveAutomatedCartReminder.mockResolvedValue("reservation-1");
    mocks.mockSendCartReminderEmail.mockResolvedValue(undefined);
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
  });

  it("uses the shared cron auth helper", async () => {
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(false);

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mocks.mockIsAuthorizedCronRequest).toHaveBeenCalledTimes(1);
    expect(mocks.mockListCartIds).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("sends one reminder after reserving the cart", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mockReserveAutomatedCartReminder).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendCartReminderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.mockMarkCartReminderSent).toHaveBeenCalledWith({
      cartId: "cart-1",
      locale: "en",
      source: "AUTOMATED",
      tenantContext: dedicatedTenantContext,
    });
    await expect(response.json()).resolves.toEqual({
      scanned: 1,
      sent: 1,
      skipped: 0,
      success: true,
      tenants: [
        {
          result: {
            scanned: 1,
            sent: 1,
            skipped: 0,
          },
          status: "processed",
          tenantId: "default",
        },
      ],
    });
  });

  it("does not send when another run already reserved the reminder", async () => {
    mocks.mockReserveAutomatedCartReminder.mockResolvedValue(undefined);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mockReserveAutomatedCartReminder).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendCartReminderEmail).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      scanned: 1,
      sent: 0,
      skipped: 1,
      success: true,
      tenants: [
        {
          result: {
            scanned: 1,
            sent: 0,
            skipped: 1,
          },
          status: "processed",
          tenantId: "default",
        },
      ],
    });
  });

  it("releases the reservation when sending the email fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.mockSendCartReminderEmail.mockRejectedValue(new Error("send failed"));

    try {
      const response = await GET(createRequest());

      expect(response.status).toBe(500);
      expect(
        mocks.mockReleaseAutomatedCartReminderReservation,
      ).toHaveBeenCalledWith({
        cartId: "cart-1",
        tenantContext: dedicatedTenantContext,
      });
      expect(mocks.mockMarkCartReminderSent).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toEqual({
        error: "send failed",
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
