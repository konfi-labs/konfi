import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminMemoryActor: vi.fn((member: { id: string; name: string }) => ({
    id: member.id,
    kind: "admin",
    name: member.name,
  })),
  getAuthenticatedAdminMember: vi.fn(),
  mutateAgentMemory: vi.fn(),
  requireTenantAdminAuthContext: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");

  return {
    ...actual,
    connection: vi.fn(),
  };
});

vi.mock("@/actions/auth-utils", () => ({
  AdminAuthError: class AdminAuthError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  getAuthenticatedAdminMember: mocks.getAuthenticatedAdminMember,
  requireTenantAdminAuthContext: mocks.requireTenantAdminAuthContext,
}));

vi.mock("@/lib/ai/agent-memory", () => ({
  createAdminMemoryActor: mocks.createAdminMemoryActor,
  mutateAgentMemory: mocks.mutateAgentMemory,
}));

let PATCH: (typeof import("./route"))["PATCH"];

function createPatchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/agent-memory/memory-1", {
    body: JSON.stringify(body),
    method: "PATCH",
  });
}

describe("/api/agent-memory/[memoryId]", () => {
  beforeAll(async () => {
    ({ PATCH } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantAdminAuthContext.mockResolvedValue({
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-1",
      },
    });
    mocks.getAuthenticatedAdminMember.mockResolvedValue({
      id: "admin-1",
      name: "Admin One",
    });
    mocks.mutateAgentMemory.mockResolvedValue({ id: "memory-1" });
  });

  it("rejects unsupported actions before mutating memory", async () => {
    const response = await PATCH(createPatchRequest({ action: "delete" }), {
      params: Promise.resolve({ memoryId: "memory-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.mutateAgentMemory).not.toHaveBeenCalled();
  });

  it("mutates memory in the server-derived tenant", async () => {
    const response = await PATCH(
      createPatchRequest({
        action: "archive",
      }),
      {
        params: Promise.resolve({ memoryId: "memory-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.mutateAgentMemory).toHaveBeenCalledWith({
      action: "archive",
      actor: {
        id: "admin-1",
        kind: "admin",
        name: "Admin One",
      },
      memoryId: "memory-1",
      payload: { action: "archive" },
      tenantId: "tenant-1",
    });
  });
});
