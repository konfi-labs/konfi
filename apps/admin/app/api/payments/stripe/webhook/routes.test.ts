import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockGetFirebaseAdminApp,
  mockGetFirestore,
  mockHandleStripePaymentIntentWebhook,
} = vi.hoisted(() => ({
  mockGetFirebaseAdminApp: vi.fn(),
  mockGetFirestore: vi.fn(),
  mockHandleStripePaymentIntentWebhook: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mockGetFirestore,
  getFirebaseAdminApp: mockGetFirebaseAdminApp,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mockGetFirestore,
}));

vi.mock("@konfi/payments", () => ({
  handleStripePaymentIntentWebhook: mockHandleStripePaymentIntentWebhook,
}));

let post: (typeof import("./route"))["POST"];

describe("admin stripe payment webhooks", () => {
  beforeAll(async () => {
    ({ POST: post } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFirebaseAdminApp.mockReturnValue({ name: "admin-app" });
    mockGetFirestore.mockReturnValue({ name: "firestore" });
    mockHandleStripePaymentIntentWebhook.mockResolvedValue({
      status: 200,
      body: "OK",
    });
  });

  it("routes Stripe requests to the shared handler", async () => {
    const response = await post(
      new Request("http://localhost/api/payments/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "prod-signature",
        },
        body: JSON.stringify({ id: "evt_123" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(mockHandleStripePaymentIntentWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        firestore: { name: "firestore" },
        signature: "prod-signature",
      }),
    );
  });
});
