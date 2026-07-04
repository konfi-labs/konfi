import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreToolAuditLogger } from "./audit";
import type { ToolAuditEvent } from "./types";

const { addMock, serverTimestampMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  serverTimestampMock: vi.fn(() => "server-timestamp"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      add: addMock,
    })),
  })),
  getFirebaseAdminApp: vi.fn(() => ({})),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: serverTimestampMock,
  },
  getFirestore: vi.fn(),
}));

describe("FirestoreToolAuditLogger", () => {
  beforeEach(() => {
    addMock.mockReset();
    serverTimestampMock.mockClear();
  });

  it("strips undefined nested fields before writing audit events", async () => {
    const logger = new FirestoreToolAuditLogger();
    const event: ToolAuditEvent = {
      actor: {
        clientId: undefined,
        email: undefined,
        kind: "machine",
        uid: "konfi-mcp",
      },
      authorization: {
        channelIds: [],
        decision: "allow",
        denialReason: undefined,
        grantedScopes: ["products:read"],
        requestedScopes: ["products:read"],
      },
      errorCode: undefined,
      latencyMs: 1,
      requestId: "request-1",
      source: "mcp",
      status: "success",
      token: {
        jti: undefined,
        resource: "/mcp",
        scopes: ["products:read"],
      },
      tool: {
        inputSummary: {
          query: "cards",
        },
        name: "searchProducts",
        outputSummary: undefined,
      },
    };

    await logger.logToolCall(event);

    expect(addMock).toHaveBeenCalledWith({
      actor: {
        kind: "machine",
        uid: "konfi-mcp",
      },
      authorization: {
        channelIds: [],
        decision: "allow",
        grantedScopes: ["products:read"],
        requestedScopes: ["products:read"],
      },
      createdAt: "server-timestamp",
      latencyMs: 1,
      requestId: "request-1",
      source: "mcp",
      status: "success",
      token: {
        resource: "/mcp",
        scopes: ["products:read"],
      },
      tool: {
        inputSummary: {
          query: "cards",
        },
        name: "searchProducts",
      },
    });
  });
});
