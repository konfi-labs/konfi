import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockGetFirebaseAdminApp,
  mockGetFirestore,
  mockHandlePrzelewy24NotificationWebhook,
} = vi.hoisted(() => ({
  mockGetFirebaseAdminApp: vi.fn(),
  mockGetFirestore: vi.fn(),
  mockHandlePrzelewy24NotificationWebhook: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mockGetFirestore,
  getFirebaseAdminApp: mockGetFirebaseAdminApp,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mockGetFirestore,
}));

vi.mock("@konfi/payments", () => ({
  handlePrzelewy24NotificationWebhook: mockHandlePrzelewy24NotificationWebhook,
}));

let post: (typeof import("./route"))["POST"];

describe("admin Przelewy24 payment webhooks", () => {
  beforeAll(async () => {
    ({ POST: post } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFirebaseAdminApp.mockReturnValue({ name: "admin-app" });
    mockGetFirestore.mockReturnValue({ name: "firestore" });
    mockHandlePrzelewy24NotificationWebhook.mockResolvedValue({
      status: 200,
      body: "OK",
    });
  });

  it("routes Przelewy24 notifications to the shared handler", async () => {
    const body = {
      merchantId: 1,
      posId: 1,
      sessionId: "channels/channel-1/orders/order-1",
      amount: 12300,
      originAmount: 12300,
      currency: "PLN",
      orderId: "p24-order-1",
      methodId: 10,
      statement: "statement",
      sign: "signature",
    };

    const response = await post(
      new Request("http://localhost/api/payments/przelewy24/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(mockHandlePrzelewy24NotificationWebhook).toHaveBeenCalledWith({
      firestore: { name: "firestore" },
      notificationRequest: body,
    });
  });
});
