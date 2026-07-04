import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockVerifyAnyIdToken,
  mockGetStoreRuntimeConfigForRequest,
  mockParseCreateStoreOrderRequest,
  mockCreateStoreOrder,
} = vi.hoisted(() => ({
  mockVerifyAnyIdToken: vi.fn(),
  mockGetStoreRuntimeConfigForRequest: vi.fn(),
  mockParseCreateStoreOrderRequest: vi.fn(),
  mockCreateStoreOrder: vi.fn(),
}));

vi.mock("../../../lib/firebase/serverApp", () => ({
  verifyAnyIdToken: mockVerifyAnyIdToken,
  getStoreRuntimeConfigForRequest: mockGetStoreRuntimeConfigForRequest,
}));

vi.mock("../../../lib/orders/create-order.server", () => ({
  parseCreateStoreOrderRequest: mockParseCreateStoreOrderRequest,
  createStoreOrder: mockCreateStoreOrder,
}));

let POST: (typeof import("./route"))["POST"];

describe("/api/orders POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAnyIdToken.mockResolvedValue({
      uid: "user-1",
      admin: false,
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
    mockParseCreateStoreOrderRequest.mockResolvedValue({
      contact: {
        name: "Example Customer",
        email: "jan@example.com",
        phone: "123456789",
        active: true,
      },
      shipping: {
        type: "SHIPPING",
        name: "Example Customer",
        street: "Main",
        number: "1",
        local: "",
        zip: "00-000",
        city: "Warsaw",
        country: "Polska",
        active: true,
      },
      saveShippingAddress: false,
      anonymousPackageShipping: false,
      invoice: false,
      billing: null,
      saveBillingAddress: false,
      specialNotes: "",
      proofing: "RUN_AS_IS",
      appliedPromotionCodes: [],
      sendStatusChangeEmail: false,
      paymentType: "STRIPE",
      shippingOption: "DHL",
    });
    mockCreateStoreOrder.mockResolvedValue({
      id: "order-1",
      message: "ORDER_CREATED_SUCCESFULLY",
      url: "https://example.com/checkout",
    });
  });

  it("returns 401 when authorization header is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: "UNAUTHENTICATED",
    });
    expect(mockVerifyAnyIdToken).not.toHaveBeenCalled();
  });

  it("returns 401 when firebase token verification fails", async () => {
    mockVerifyAnyIdToken.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer invalid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: "UNAUTHENTICATED",
    });
    expect(mockParseCreateStoreOrderRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when payload parsing fails", async () => {
    mockParseCreateStoreOrderRequest.mockRejectedValue(
      new Error("INVALID_PAYMENT_TYPE"),
    );

    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ paymentType: "NOPE" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "INVALID_PAYMENT_TYPE",
    });
    expect(mockCreateStoreOrder).not.toHaveBeenCalled();
  });

  it("delegates to createStoreOrder for authenticated requests", async () => {
    const requestBody = {
      paymentType: "STRIPE",
      shippingOption: "DHL",
      contact: {
        name: "Example Customer",
        email: "jan@example.com",
        phone: "123456789",
        active: true,
      },
      shipping: {
        type: "SHIPPING",
        name: "Example Customer",
        street: "Main",
        number: "1",
        local: "",
        zip: "00-000",
        city: "Warsaw",
        country: "Polska",
        active: true,
      },
      saveShippingAddress: false,
      invoice: false,
      billing: null,
      saveBillingAddress: false,
      specialNotes: "",
      proofing: "RUN_AS_IS",
      appliedPromotionCodes: [],
      sendStatusChangeEmail: false,
    };

    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockVerifyAnyIdToken).toHaveBeenCalledWith("valid-token");
    expect(mockParseCreateStoreOrderRequest).toHaveBeenCalledWith(requestBody);
    expect(mockCreateStoreOrder).toHaveBeenCalledWith({
      request: await mockParseCreateStoreOrderRequest.mock.results[0].value,
      authUid: "user-1",
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
      id: "order-1",
      message: "ORDER_CREATED_SUCCESFULLY",
      url: "https://example.com/checkout",
    });
  });

  it("returns store business-rule errors from createStoreOrder", async () => {
    mockCreateStoreOrder.mockResolvedValue({
      id: "",
      message: "ORDER_CREATION_FAILED",
      url: "",
      error: "ANONYMOUS_SHIPPING_DOMESTIC_ONLY",
    });

    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ paymentType: "STRIPE", shippingOption: "DHL" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "ANONYMOUS_SHIPPING_DOMESTIC_ONLY",
    });
  });

  it("blocks customer order creation during maintenance", async () => {
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
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ paymentType: "STRIPE", shippingOption: "DHL" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "STORE_MAINTENANCE",
    });
    expect(mockCreateStoreOrder).not.toHaveBeenCalled();
  });
});
