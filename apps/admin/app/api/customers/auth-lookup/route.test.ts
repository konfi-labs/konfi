import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminAuth: vi.fn(() => ({
    getUserByEmail: mocks.getUserByEmail,
  })),
  verifyIdToken: mocks.verifyIdToken,
}));

let POST: (typeof import("./route"))["POST"];

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/customers/auth-lookup", {
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("/api/customers/auth-lookup", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyIdToken.mockResolvedValue({
      customClaims: { accessLevel: 1, admin: true },
      uid: "admin-uid",
    });
    mocks.getUserByEmail.mockResolvedValue({
      email: "customer@example.com",
      uid: "customer-uid",
    });
  });

  it("denies ordinary tenant admins before global Firebase Auth lookup", async () => {
    const response = await POST(
      createRequest({ email: "customer@example.com" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
  });

  it("allows explicit super admins to look up Firebase Auth users by email", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      customClaims: { accessLevel: 9999, admin: true },
      uid: "super-admin-uid",
    });

    const response = await POST(
      createRequest({ email: " Customer@Example.com " }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: "customer@example.com",
      uid: "customer-uid",
    });
    expect(mocks.getUserByEmail).toHaveBeenCalledWith("customer@example.com");
  });
});
