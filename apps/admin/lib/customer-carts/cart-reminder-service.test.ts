import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listCartIds,
  markCartReminderSent,
  reserveAutomatedCartReminder,
  resolveCustomerByCartId,
} from "./cart-reminder-service";
import type { TenantContext } from "@konfi/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mockCartDocSet: vi.fn(),
  mockFieldValueDelete: vi.fn(),
  mockGetFirebaseAdminApp: vi.fn(),
  mockGetFirestore: vi.fn(),
  mockShouldSendAutomatedCartReminder: vi.fn(),
  mockTimestampFromDate: vi.fn(),
  mockTimestampNow: vi.fn(),
  mockTransactionGet: vi.fn(),
  mockTransactionSet: vi.fn(),
}));

vi.mock("@/lib/customer-carts/cart-reminder-helpers", () => ({
  getCartReminderCopy: vi.fn(),
  shouldSendAutomatedCartReminder: mocks.mockShouldSendAutomatedCartReminder,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
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
    fromDate: mocks.mockTimestampFromDate,
    now: mocks.mockTimestampNow,
  },
}));

type CartReminderTransactionMock = {
  get: typeof mocks.mockTransactionGet;
  set: typeof mocks.mockTransactionSet;
};

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

describe("cart reminder reservation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockCartDocSet.mockResolvedValue(undefined);
    mocks.mockFieldValueDelete.mockReturnValue("DELETE_FIELD");
    mocks.mockGetFirebaseAdminApp.mockReturnValue({});
    mocks.mockGetFirestore.mockReturnValue({
      collection: () => ({
        doc: () => ({
          set: mocks.mockCartDocSet,
        }),
      }),
      runTransaction: async (
        callback: (
          transaction: CartReminderTransactionMock,
        ) => Promise<string | undefined>,
      ) =>
        callback({
          get: mocks.mockTransactionGet,
          set: mocks.mockTransactionSet,
        }),
    });
    mocks.mockShouldSendAutomatedCartReminder.mockReturnValue({
      shouldSend: true,
    });
    mocks.mockTimestampFromDate.mockImplementation((date: Date) => ({
      toDate: () => date,
    }));
    mocks.mockTimestampNow.mockReturnValue({
      toDate: () => new Date("2026-05-02T11:05:00.000Z"),
    });
    mocks.mockTransactionGet.mockResolvedValue({
      data: () => undefined,
    });
  });

  it("reserves automated reminders without marking them as sent", async () => {
    const reservationId = await reserveAutomatedCartReminder({
      cartId: "cart-1",
      itemCount: 1,
      lastUpdatedAt: new Date("2026-05-02T10:00:00.000Z"),
      locale: "en",
      now: new Date("2026-05-02T11:00:00.000Z"),
      recipientEmail: "customer@example.com",
    });

    expect(reservationId).toEqual(expect.any(String));
    expect(mocks.mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      {
        reminderReservationExpiresAt: expect.objectContaining({
          toDate: expect.any(Function),
        }),
        reminderReservationId: reservationId,
        reminderReservedAt: expect.objectContaining({
          toDate: expect.any(Function),
        }),
      },
      { merge: true },
    );
    const reservationUpdate = mocks.mockTransactionSet.mock.calls[0]?.[1] as {
      reminderReservationExpiresAt: { toDate(): Date };
    };
    expect(reservationUpdate.reminderReservationExpiresAt.toDate()).toEqual(
      new Date("2026-05-02T11:30:00.000Z"),
    );
    expect(reservationUpdate).not.toHaveProperty("lastReminderSentAt");
  });

  it("does not reserve while another automated reminder lease is active", async () => {
    mocks.mockTransactionGet.mockResolvedValue({
      data: () => ({
        reminderReservationExpiresAt: {
          toDate: () => new Date("2026-05-02T11:10:00.000Z"),
        },
      }),
    });

    const reservationId = await reserveAutomatedCartReminder({
      cartId: "cart-1",
      itemCount: 1,
      lastUpdatedAt: new Date("2026-05-02T10:00:00.000Z"),
      locale: "en",
      now: new Date("2026-05-02T11:00:00.000Z"),
      recipientEmail: "customer@example.com",
    });

    expect(reservationId).toBeUndefined();
    expect(mocks.mockTransactionSet).not.toHaveBeenCalled();
  });

  it("marks reminders as sent only after the email succeeds", async () => {
    await markCartReminderSent({
      cartId: "cart-1",
      locale: "en",
      source: "AUTOMATED",
      tenantContext: dedicatedContext,
    });

    expect(mocks.mockCartDocSet).toHaveBeenCalledWith(
      {
        lastReminderLocale: "en",
        lastReminderSentAt: expect.objectContaining({
          toDate: expect.any(Function),
        }),
        lastReminderSource: "AUTOMATED",
        reminderReservationExpiresAt: "DELETE_FIELD",
        reminderReservationId: "DELETE_FIELD",
        reminderReservedAt: "DELETE_FIELD",
      },
      { merge: true },
    );
  });

  it("filters SaaS cart listing to the authenticated tenant", async () => {
    const cartDocumentsGet = vi.fn(async () => ({
      docs: [{ id: "cart-from-parent" }],
    }));
    const cartItemsGet = vi.fn(async () => ({
      docs: [
        {
          id: "item-1",
          ref: {
            parent: {
              parent: {
                id: "cart-from-item",
                parent: { id: "carts" },
              },
            },
          },
        },
      ],
    }));
    const cartsWhere = vi.fn(() => ({ get: cartDocumentsGet }));
    const itemsWhere = vi.fn(() => ({ get: cartItemsGet }));
    const collection = vi.fn((collectionName: string) => {
      expect(collectionName).toBe("carts");

      return {
        where: cartsWhere,
      };
    });
    const collectionGroup = vi.fn((collectionName: string) => {
      expect(collectionName).toBe("items");

      return {
        where: itemsWhere,
      };
    });

    mocks.mockGetFirestore.mockReturnValue({
      collection,
      collectionGroup,
    });

    await expect(listCartIds(tenantAContext)).resolves.toEqual([
      "cart-from-item",
      "cart-from-parent",
    ]);
    expect(cartsWhere).toHaveBeenCalledWith("tenantId", "==", "tenant-a");
    expect(itemsWhere).toHaveBeenCalledWith("tenantId", "==", "tenant-a");
  });

  it("does not resolve a customer from another SaaS tenant", async () => {
    const customersDocGet = vi.fn(async () => ({
      exists: true,
      data: () => ({
        active: true,
        id: "cart-tenant-b",
        tenantId: "tenant-b",
      }),
    }));

    mocks.mockGetFirestore.mockReturnValue({
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: customersDocGet,
        })),
      })),
    });

    await expect(
      resolveCustomerByCartId("cart-tenant-b", tenantAContext),
    ).resolves.toBeUndefined();
  });

  it("rejects marking a tenant B cart from tenant A context", async () => {
    const cartDocGet = vi.fn(async () => ({
      exists: true,
      data: () => ({
        tenantId: "tenant-b",
      }),
    }));
    const cartDoc = vi.fn(() => ({
      get: cartDocGet,
      set: mocks.mockCartDocSet,
    }));

    mocks.mockGetFirestore.mockReturnValue({
      collection: vi.fn(() => ({
        doc: cartDoc,
      })),
    });

    await expect(
      markCartReminderSent({
        cartId: "cart-tenant-b",
        locale: "en",
        source: "MANUAL",
        tenantContext: tenantAContext,
      }),
    ).rejects.toThrow("Cart does not belong to the current tenant.");
    expect(mocks.mockCartDocSet).not.toHaveBeenCalled();
  });
});
