import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type AgentDoc = {
  data: Record<string, unknown>;
  id: string;
};

const mocks = vi.hoisted(() => {
  const agentDocs: AgentDoc[] = [];
  const whereCalls: Array<[string, string, unknown]> = [];

  return {
    agentDocs,
    requireAuthorizedAgentApiRequest: vi.fn(),
    whereCalls,
  };
});

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");

  return {
    ...actual,
    connection: vi.fn(),
  };
});

vi.mock("@/lib/ai/durable-agents/agent-run-auth", () => ({
  requireAuthorizedAgentApiRequest: mocks.requireAuthorizedAgentApiRequest,
}));

function createAgentsQuery(filters: Array<[string, string, unknown]> = []) {
  return {
    limit: (limitValue: number) => ({
      get: async () => ({
        docs: mocks.agentDocs
          .filter((doc) =>
            filters.every(([field, operator, value]) => {
              expect(operator).toBe("==");
              return doc.data[field] === value;
            }),
          )
          .slice(0, limitValue)
          .map((doc) => ({
            data: () => doc.data,
            id: doc.id,
          })),
      }),
    }),
    where: (field: string, operator: string, value: unknown) => {
      const filter: [string, string, unknown] = [field, operator, value];
      mocks.whereCalls.push(filter);
      return createAgentsQuery([...filters, filter]);
    },
  };
}

function createFirestore() {
  return {
    collection: (collectionName: string) => {
      expect(collectionName).toBe("agents");
      return createAgentsQuery();
    },
  };
}

function createRequest() {
  return new NextRequest("http://localhost/api/agents/list", {
    headers: {
      authorization: "Bearer valid-token",
    },
  });
}

let GET: (typeof import("./route"))["GET"];

describe("/api/agents/list", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentDocs.length = 0;
    mocks.whereCalls.length = 0;
    mocks.requireAuthorizedAgentApiRequest.mockResolvedValue({
      firestore: createFirestore(),
      tenantScopeId: "tenant-a",
      user: { uid: "admin-1" },
    });
    mocks.agentDocs.push(
      {
        data: {
          createdAt: new Date("2026-05-30T08:00:00.000Z"),
          prompt: "owned",
          runId: "run-owned",
          status: "completed",
          taskType: "quote",
          tenantId: "tenant-a",
        },
        id: "run-owned",
      },
      {
        data: {
          createdAt: new Date("2026-05-30T09:00:00.000Z"),
          prompt: "foreign",
          runId: "run-foreign",
          status: "completed",
          taskType: "quote",
          tenantId: "tenant-b",
        },
        id: "run-foreign",
      },
    );
  });

  it("filters agent runs to the server-derived tenant", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runs: [
        {
          prompt: "owned",
          runId: "run-owned",
        },
      ],
    });
    expect(mocks.whereCalls).toEqual([["tenantId", "==", "tenant-a"]]);
  });

  it("uses the Firestore document id as the action run id", async () => {
    mocks.agentDocs[0].data.runId = "stale-run-field";

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runs: [
        {
          prompt: "owned",
          runId: "run-owned",
        },
      ],
    });
  });
});
