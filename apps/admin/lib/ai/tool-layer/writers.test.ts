import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFirestoreToolLayerWriters } from "./writers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getFirebaseAdminApp: vi.fn(),
}));

const { MockServerTimestampSentinel, mockServerTimestamp } = vi.hoisted(() => {
  class TimestampSentinel {
    readonly kind = "serverTimestamp";
  }

  return {
    MockServerTimestampSentinel: TimestampSentinel,
    mockServerTimestamp: vi.fn(() => new TimestampSentinel()),
  };
});

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: mockServerTimestamp,
  },
  getFirestore: vi.fn(),
}));

describe("Firestore tool-layer writers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves Firestore sentinels while removing undefined draft fields", async () => {
    const set = vi.fn(async () => undefined);
    const firestore = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          id: "draft-run-1",
          set,
        })),
      })),
    } as unknown as Parameters<typeof createFirestoreToolLayerWriters>[0];
    const writers = createFirestoreToolLayerWriters(firestore);

    await writers.saveDraftRecord({
      channelId: "channel-1",
      createdBy: {
        id: "user-1",
        name: "Admin",
      },
      draftType: "quote",
      messages: [
        {
          content: "Create quote",
          role: "user",
        },
      ],
      prompt: "Create quote",
      result: {
        optional: undefined,
      },
      summary: "Draft summary",
    });

    const [payload] = set.mock.calls[0] as [Record<string, unknown>];

    expect(payload.createdAt).toBeInstanceOf(MockServerTimestampSentinel);
    expect(payload.completedAt).toBeInstanceOf(MockServerTimestampSentinel);
    expect(payload.updatedAt).toBeInstanceOf(MockServerTimestampSentinel);
    expect(payload.result).toEqual({});
  });

  it("supports global MCP task drafts without a channel id", async () => {
    const set = vi.fn(async () => undefined);
    const firestore = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          id: "draft-run-2",
          set,
        })),
      })),
    } as unknown as Parameters<typeof createFirestoreToolLayerWriters>[0];
    const writers = createFirestoreToolLayerWriters(firestore);

    await writers.saveDraftRecord({
      createdBy: {
        id: "user-1",
        name: "Admin",
      },
      draftType: "businessUpdate",
      messages: [],
      prompt: "Update member",
      result: {
        businessUpdateDraft: {
          recordId: "member-1",
        },
      },
    });

    const [payload] = set.mock.calls[0] as [Record<string, unknown>];

    expect(payload.channelId).toBeUndefined();
    expect(payload.taskType).toBe("businessUpdate");
    expect(payload.workflowStatus).toBe("mcp_draft");
  });

  it("updates an existing matching MCP draft record", async () => {
    const existingCreatedAt = { seconds: 1 };
    const set = vi.fn();
    const draftRef = {
      id: "draft-run-1",
    };
    const get = vi.fn(async () => ({
      data: () => ({
        channelId: "channel-1",
        createdAt: existingCreatedAt,
        source: "mcp",
        taskType: "quote",
        workflowStatus: "mcp_draft",
      }),
      exists: true,
    }));
    const firestore = {
      collection: vi.fn(() => ({
        doc: vi.fn((id?: string) => ({
          ...draftRef,
          id: id ?? "new-draft-run",
        })),
      })),
      runTransaction: vi.fn(
        async (
          operation: (transaction: {
            get: typeof get;
            set: typeof set;
          }) => unknown,
        ) =>
          operation({
            get,
            set,
          }),
      ),
    } as unknown as Parameters<typeof createFirestoreToolLayerWriters>[0];
    const writers = createFirestoreToolLayerWriters(firestore);

    const result = await writers.saveDraftRecord({
      channelId: "channel-1",
      createdBy: {
        id: "user-1",
        name: "Admin",
      },
      draftType: "quote",
      existingRunId: "draft-run-1",
      messages: [
        {
          content: "Updated quote",
          role: "user",
        },
      ],
      prompt: "Updated quote",
      result: {
        itemCount: 1,
      },
    });

    const [, payload] = set.mock.calls[0] as [
      { id: string },
      Record<string, unknown>,
    ];

    expect(result.runId).toBe("draft-run-1");
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft-run-1" }),
    );
    expect(payload.createdAt).toEqual(existingCreatedAt);
    expect(payload.runId).toBe("draft-run-1");
    expect(payload.result).toEqual({ itemCount: 1 });
    expect(payload.updatedAt).toBeInstanceOf(MockServerTimestampSentinel);
  });

  it("rejects editing non-MCP draft records", async () => {
    const set = vi.fn();
    const get = vi.fn(async () => ({
      data: () => ({
        channelId: "channel-1",
        source: "durable-agent",
        taskType: "quote",
        workflowStatus: "completed",
      }),
      exists: true,
    }));
    const firestore = {
      collection: vi.fn(() => ({
        doc: vi.fn((id?: string) => ({
          id: id ?? "new-draft-run",
        })),
      })),
      runTransaction: vi.fn(
        async (
          operation: (transaction: {
            get: typeof get;
            set: typeof set;
          }) => unknown,
        ) =>
          operation({
            get,
            set,
          }),
      ),
    } as unknown as Parameters<typeof createFirestoreToolLayerWriters>[0];
    const writers = createFirestoreToolLayerWriters(firestore);

    await expect(
      writers.saveDraftRecord({
        channelId: "channel-1",
        createdBy: {
          id: "user-1",
          name: "Admin",
        },
        draftType: "quote",
        existingRunId: "draft-run-1",
        messages: [],
        prompt: "Updated quote",
        result: {},
      }),
    ).rejects.toMatchObject({
      code: "resource_denied",
    });
    expect(set).not.toHaveBeenCalled();
  });
});
