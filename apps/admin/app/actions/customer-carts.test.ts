import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCustomerCartReminder } from "./customer-carts";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mockCartDocSet: vi.fn(),
  mockFieldValueDelete: vi.fn(),
  mockGetFirebaseAdminApp: vi.fn(),
  mockGetFirestore: vi.fn(),
  mockRequireTenantAdminAuthContext: vi.fn(),
  mockSendEmail: vi.fn(),
  mockTimestampNow: vi.fn(),
}));

vi.mock("./auth-utils", () => ({
  requireTenantAdminAuthContext: mocks.mockRequireTenantAdminAuthContext,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.mockSendEmail,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetFirestore,
  getFirebaseAdminApp: mocks.mockGetFirebaseAdminApp,
}));

vi.mock("@konfi/emails", () => ({
  AbandonedCartReminder: () => null,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: mocks.mockFieldValueDelete,
  },
  getFirestore: mocks.mockGetFirestore,
  Timestamp: {
    now: mocks.mockTimestampNow,
  },
}));

type FirestoreRecord = Record<string, unknown>;

interface CartFixture {
  cartData?: FirestoreRecord;
  cartItems?: FirestoreRecord[];
  customerData?: FirestoreRecord;
}

const tenantAContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} satisfies TenantContext;

const dedicatedContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
} satisfies TenantContext;

const originalNoReplyEmail = process.env.NO_REPLY_EMAIL;
const originalStoreUrl = process.env.STORE_URL;

function createSnapshot(data?: FirestoreRecord) {
  return {
    exists: Boolean(data),
    data: () => data,
    get: (field: string) => data?.[field],
  };
}

function createItemSnapshot(id: string, data: FirestoreRecord) {
  return {
    data: () => data,
    get: (field: string) => data[field],
    id,
    updateTime: {
      toDate: () => new Date("2026-04-01T10:00:00.000Z"),
    },
  };
}

function createFirestore(fixture: CartFixture) {
  return {
    collection: (path: string) => {
      if (path === "carts") {
        return {
          doc: () => ({
            get: async () => createSnapshot(fixture.cartData),
            set: mocks.mockCartDocSet,
          }),
        };
      }

      if (path === "customers") {
        return {
          doc: () => ({
            get: async () => createSnapshot(fixture.customerData),
          }),
          where: () => ({
            where: () => ({
              limit: () => ({
                get: async () => ({
                  docs: [],
                  empty: true,
                }),
              }),
            }),
          }),
        };
      }

      if (path.includes("/items")) {
        const docs = (fixture.cartItems ?? []).map((item, index) =>
          createItemSnapshot(`item-${index + 1}`, item),
        );

        return {
          get: async () => ({
            docs,
            empty: docs.length === 0,
          }),
        };
      }

      throw new Error(`Unexpected collection path: ${path}`);
    },
  } as unknown as FirebaseFirestore.Firestore;
}

function setTenantContext(tenantContext: TenantContext) {
  mocks.mockRequireTenantAdminAuthContext.mockResolvedValue({
    membership: null,
    tenantContext,
    uid: "admin-uid",
  });
}

describe("customer cart reminder actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NO_REPLY_EMAIL = "noreply@example.com";
    process.env.STORE_URL = "https://store.example.com";
    mocks.mockFieldValueDelete.mockReturnValue("DELETE_FIELD");
    mocks.mockGetFirebaseAdminApp.mockReturnValue({});
    mocks.mockSendEmail.mockResolvedValue(undefined);
    mocks.mockTimestampNow.mockReturnValue({
      toDate: () => new Date("2026-05-02T11:05:00.000Z"),
    });
  });

  afterAll(() => {
    if (originalNoReplyEmail === undefined) {
      delete process.env.NO_REPLY_EMAIL;
    } else {
      process.env.NO_REPLY_EMAIL = originalNoReplyEmail;
    }
    if (originalStoreUrl === undefined) {
      delete process.env.STORE_URL;
    } else {
      process.env.STORE_URL = originalStoreUrl;
    }
  });

  it("does not send a tenant B cart reminder from tenant A context", async () => {
    setTenantContext(tenantAContext);
    mocks.mockGetFirestore.mockReturnValue(
      createFirestore({
        cartData: {
          tenantId: "tenant-b",
        },
        cartItems: [
          {
            description: "Tenant B cards",
            quantity: 2,
            tenantId: "tenant-b",
            totalPrice: 100,
          },
        ],
        customerData: {
          active: true,
          email: "tenant-b@example.com",
          id: "cart-b",
          name: "Tenant B",
          tenantId: "tenant-b",
        },
      }),
    );

    await expect(sendCustomerCartReminder("cart-b", "en")).resolves.toEqual({
      sent: false,
      error: "Cart not found.",
    });
    expect(mocks.mockRequireTenantAdminAuthContext).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendEmail).not.toHaveBeenCalled();
    expect(mocks.mockCartDocSet).not.toHaveBeenCalled();
  });

  it("keeps dedicated mode legacy cart reminder sends working", async () => {
    setTenantContext(dedicatedContext);
    mocks.mockGetFirestore.mockReturnValue(
      createFirestore({
        cartData: {},
        cartItems: [
          {
            description: "Legacy cards",
            quantity: 2,
            totalPrice: 100,
          },
        ],
        customerData: {
          active: true,
          email: "customer@example.com",
          id: "cart-1",
          name: "Customer",
        },
      }),
    );

    await expect(sendCustomerCartReminder("cart-1", "en")).resolves.toEqual({
      sent: true,
    });
    expect(mocks.mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.mockCartDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lastReminderLocale: "en",
        lastReminderSentAt: expect.objectContaining({
          toDate: expect.any(Function),
        }),
        lastReminderSource: "MANUAL",
      }),
      { merge: true },
    );
  });
});
