import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: vi.fn() };
});

const {
  mockGetAuthenticatedAdminUid,
  mockRequireSuperAdminAuth,
  mockParsePaymentProviderKey,
  mockRequestAdminPaymentRefund,
  MockAdminAuthError,
  MockAdminPaymentRefundError,
} = vi.hoisted(() => {
  class MockAdminAuthError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AdminAuthError";
      this.statusCode = statusCode;
    }
  }

  class MockAdminPaymentRefundError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AdminPaymentRefundError";
      this.statusCode = statusCode;
    }
  }

  return {
    mockGetAuthenticatedAdminUid: vi.fn(),
    mockRequireSuperAdminAuth: vi.fn(),
    mockParsePaymentProviderKey: vi.fn(),
    mockRequestAdminPaymentRefund: vi.fn(),
    MockAdminAuthError,
    MockAdminPaymentRefundError,
  };
});

vi.mock("@/actions/auth-utils", () => ({
  AdminAuthError: MockAdminAuthError,
  getAuthenticatedAdminUid: mockGetAuthenticatedAdminUid,
  requireSuperAdminAuth: mockRequireSuperAdminAuth,
}));

vi.mock("@/lib/payments/admin", () => ({
  AdminPaymentRefundError: MockAdminPaymentRefundError,
  parsePaymentProviderKey: mockParsePaymentProviderKey,
  requestAdminPaymentRefund: mockRequestAdminPaymentRefund,
}));

let POST: (typeof import("./route"))["POST"];

describe("/api/payments/admin/[provider]/refund POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSuperAdminAuth.mockResolvedValue(undefined);
    mockGetAuthenticatedAdminUid.mockResolvedValue("admin-1");
    mockParsePaymentProviderKey.mockReturnValue("stripe");
    mockRequestAdminPaymentRefund.mockResolvedValue({
      message: "Refund completed successfully",
      refundStatus: "COMPLETED",
    });
  });

  it("returns business-rule refund failures as 4xx responses", async () => {
    mockRequestAdminPaymentRefund.mockRejectedValue(
      new MockAdminPaymentRefundError(
        "Refund amount exceeds the remaining refundable balance",
        409,
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/payments/admin/stripe/refund", {
        method: "POST",
        body: JSON.stringify({
          orderPath: "channels/channel-1/orders/order-1",
          reason: "Customer requested a partial refund",
          refundAmount: 2500,
        }),
      }) as never,
      { params: Promise.resolve({ provider: "stripe" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Refund amount exceeds the remaining refundable balance",
    });
  });

  it("returns 400 when the request body is incomplete", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments/admin/stripe/refund", {
        method: "POST",
        body: JSON.stringify({
          orderPath: "channels/channel-1/orders/order-1",
          refundAmount: 2500,
        }),
      }) as never,
      { params: Promise.resolve({ provider: "stripe" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "orderPath, reason, and refundAmount are required",
    });
    expect(mockRequestAdminPaymentRefund).not.toHaveBeenCalled();
  });

  it("returns 403 when the admin is not a super admin", async () => {
    mockRequireSuperAdminAuth.mockRejectedValue(
      new MockAdminAuthError("Unauthorized: Super admin access required", 403),
    );

    const response = await POST(
      new Request("http://localhost/api/payments/admin/stripe/refund", {
        method: "POST",
        body: JSON.stringify({
          orderPath: "channels/channel-1/orders/order-1",
          reason: "Customer requested a partial refund",
          refundAmount: 2500,
        }),
      }) as never,
      { params: Promise.resolve({ provider: "stripe" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized: Super admin access required",
    });
    expect(mockRequestAdminPaymentRefund).not.toHaveBeenCalled();
  });

  it("passes valid refund requests to the admin refund action", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments/admin/stripe/refund", {
        method: "POST",
        body: JSON.stringify({
          orderPath: "channels/channel-1/orders/order-1",
          reason: "Customer requested a partial refund",
          refundAmount: 2500,
        }),
      }) as never,
      { params: Promise.resolve({ provider: "stripe" }) },
    );

    expect(response.status).toBe(200);
    expect(mockRequestAdminPaymentRefund).toHaveBeenCalledWith({
      provider: "stripe",
      orderPath: "channels/channel-1/orders/order-1",
      reason: "Customer requested a partial refund",
      refundAmount: 2500,
      requestedBy: "admin-1",
    });
  });
});
