import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminAgentMemory: vi.fn(),
  createAdminMemoryActor: vi.fn((member: { id: string; name: string }) => ({
    id: member.id,
    kind: "admin",
    name: member.name,
  })),
  getAuthenticatedAdminMember: vi.fn(),
  listAgentMemories: vi.fn(),
  requireTenantAdminAuthContext: vi.fn(),
  searchAgentMemories: vi.fn(),
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
  createAdminAgentMemory: mocks.createAdminAgentMemory,
  createAdminMemoryActor: mocks.createAdminMemoryActor,
  listAgentMemories: mocks.listAgentMemories,
  searchAgentMemories: mocks.searchAgentMemories,
}));

let GET: (typeof import("./route"))["GET"];
let POST: (typeof import("./route"))["POST"];

function createRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init);
}

describe("/api/agent-memory", () => {
  beforeAll(async () => {
    ({ GET, POST } = await import("./route"));
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
    mocks.listAgentMemories.mockResolvedValue([]);
    mocks.searchAgentMemories.mockResolvedValue([]);
    mocks.createAdminAgentMemory.mockResolvedValue({ id: "memory-1" });
  });

  it("lists memory in the server-derived tenant", async () => {
    const response = await GET(
      createRequest(
        "http://localhost/api/agent-memory?status=pending&taskType=quote",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.listAgentMemories).toHaveBeenCalledWith({
      limit: undefined,
      query: undefined,
      scope: undefined,
      status: "pending",
      taskType: "quote",
      tenantId: "tenant-1",
      type: undefined,
    });
  });

  it("requires semantic search task type and query", async () => {
    const response = await GET(
      createRequest("http://localhost/api/agent-memory?semantic=true"),
    );

    expect(response.status).toBe(400);
    expect(mocks.searchAgentMemories).not.toHaveBeenCalled();
  });

  it("passes scoped semantic search filters through to retrieval", async () => {
    const response = await GET(
      createRequest(
        "http://localhost/api/agent-memory?semantic=true&query=matte&taskType=quote&channelId=channel-1&customerId=customer-1&productId=product-1&orderId=order-1&quoteId=quote-1",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.searchAgentMemories).toHaveBeenCalledWith({
      channelId: "channel-1",
      customerId: "customer-1",
      limit: undefined,
      orderId: "order-1",
      productId: "product-1",
      query: "matte",
      quoteId: "quote-1",
      taskType: "quote",
      tenantId: "tenant-1",
    });
  });

  it("creates reviewed admin memory without accepting a body tenant id", async () => {
    const response = await POST(
      createRequest("http://localhost/api/agent-memory", {
        body: JSON.stringify({
          content: "Use matte stock for repeat ACME quotes.",
          scope: "tenant",
          taskTypes: ["quote"],
          tenantId: "other-tenant",
          type: "preference",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createAdminAgentMemory).toHaveBeenCalledWith({
      actor: {
        id: "admin-1",
        kind: "admin",
        name: "Admin One",
      },
      payload: expect.objectContaining({
        content: "Use matte stock for repeat ACME quotes.",
        scope: "tenant",
        taskTypes: ["quote"],
        type: "preference",
      }),
      tenantId: "tenant-1",
    });
  });
});
