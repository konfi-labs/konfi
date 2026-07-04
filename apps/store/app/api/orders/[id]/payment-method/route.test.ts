import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockVerifyAnyIdToken,
  mockGetStoreRuntimeConfigForRequest,
  mockChangeStoreOrderPaymentMethod,
} = vi.hoisted(() => ({
  mockVerifyAnyIdToken: vi.fn(),
  mockGetStoreRuntimeConfigForRequest: vi.fn(),
  mockChangeStoreOrderPaymentMethod: vi.fn(),
}));

vi.mock("../../../../../lib/firebase/serverApp", () => ({
  verifyAnyIdToken: mockVerifyAnyIdToken,
  getStoreRuntimeConfigForRequest: mockGetStoreRuntimeConfigForRequest,
}));

vi.mock("../../../../../lib/orders/change-payment-method.server", () => ({
  changeStoreOrderPaymentMethod: mockChangeStoreOrderPaymentMethod,
}));

let POST: (typeof import("./route"))["POST"];

describe("/api/orders/[id]/payment-method POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAnyIdToken.mockResolvedValue({
      uid: "customer-1",
      admin: false,
      name: "Example Customer",
      email: "jan@example.com",
    });
    mockGetStoreRuntimeConfigForRequest.mockResolvedValue({
      adminBaseUrl: "https://admin.example.com",
      channelId: "channel-1",
      maintenance: { enabled: false },
      storeBaseUrl: "https://store.example.com",
      tenantContext: {
        deploymentMode: "dedicated",
        requireTenantId: false,
        tenantId: "default",
      },
    });
    mockChangeStoreOrderPaymentMethod.mockResolvedValue({
      success: true,
      message: "PAYMENT_METHOD_CHANGED",
      checkoutSessionUrl: "https://stripe.test/session",
    });
  });

  it("returns 401 when authorization header is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/orders/order-1/payment-method", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ paymentType: "STRIPE" }),
      }),
      { params: Promise.resolve({ id: "order-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      message: "UNAUTHENTICATED",
    });
    expect(mockVerifyAnyIdToken).not.toHaveBeenCalled();
  });

  it("returns 400 when paymentType is invalid", async () => {
    const response = await POST(
      new Request("http://localhost/api/orders/order-1/payment-method", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ paymentType: "NOPE" }),
      }),
      { params: Promise.resolve({ id: "order-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      message: "INVALID_ARGUMENT",
    });
    expect(mockChangeStoreOrderPaymentMethod).not.toHaveBeenCalled();
  });

  it("delegates authenticated requests to the store order mutation", async () => {
    const response = await POST(
      new Request("http://localhost/api/orders/order-1/payment-method", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ paymentType: "STRIPE" }),
      }),
      { params: Promise.resolve({ id: "order-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockVerifyAnyIdToken).toHaveBeenCalledWith("valid-token");
    expect(mockChangeStoreOrderPaymentMethod).toHaveBeenCalledWith({
      orderId: "order-1",
      paymentType: "STRIPE",
      authUid: "customer-1",
      actor: {
        id: "customer-1",
        name: "Example Customer",
      },
      isAdmin: false,
      tenantContext: {
        deploymentMode: "dedicated",
        requireTenantId: false,
        tenantId: "default",
      },
      runtimeConfig: {
        adminBaseUrl: "https://admin.example.com",
        channelId: "channel-1",
        maintenance: { enabled: false },
        storeBaseUrl: "https://store.example.com",
        tenantContext: {
          deploymentMode: "dedicated",
          requireTenantId: false,
          tenantId: "default",
        },
      },
    });
    expect(await response.json()).toMatchObject({
      success: true,
      message: "PAYMENT_METHOD_CHANGED",
      checkoutSessionUrl: "https://stripe.test/session",
    });
  });

  it("blocks customer payment changes during maintenance", async () => {
    mockGetStoreRuntimeConfigForRequest.mockResolvedValue({
      adminBaseUrl: "https://admin.example.com",
      channelId: "channel-1",
      maintenance: { enabled: true },
      storeBaseUrl: "https://store.example.com",
      tenantContext: {
        deploymentMode: "dedicated",
        requireTenantId: false,
        tenantId: "default",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/orders/order-1/payment-method", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ paymentType: "STRIPE" }),
      }),
      { params: Promise.resolve({ id: "order-1" }) },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      message: "STORE_MAINTENANCE",
    });
    expect(mockChangeStoreOrderPaymentMethod).not.toHaveBeenCalled();
  });
});
