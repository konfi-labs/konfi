import type { AssistantMessage } from "@konfi/types";
import type { Firestore } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAssistantMessage,
  getAssistantMessages,
} from "../assistant-history";

const {
  mockAddDoc,
  mockCollection,
  mockDoc,
  mockGetDocs,
  mockIncrement,
  mockLimit,
  mockOrderBy,
  mockQuery,
  mockServerTimestamp,
  mockUpdateDoc,
  mockWhere,
} = vi.hoisted(() => ({
  mockAddDoc: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockIncrement: vi.fn((value: number) => ({
    __type: "increment",
    value,
  })),
  mockLimit: vi.fn((value: number) => ({ __type: "limit", value })),
  mockOrderBy: vi.fn((field: string, direction: string) => ({
    __type: "orderBy",
    direction,
    field,
  })),
  mockQuery: vi.fn(),
  mockServerTimestamp: { __type: "serverTimestamp" },
  mockUpdateDoc: vi.fn(),
  mockWhere: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: mockAddDoc,
  collection: mockCollection,
  doc: mockDoc,
  getDoc: vi.fn(),
  getDocs: mockGetDocs,
  increment: mockIncrement,
  limit: mockLimit,
  orderBy: mockOrderBy,
  query: mockQuery,
  serverTimestamp: vi.fn(() => mockServerTimestamp),
  Timestamp: {
    fromMillis: vi.fn(),
    now: vi.fn(),
  },
  updateDoc: mockUpdateDoc,
  where: mockWhere,
}));

describe("assistant history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockImplementation(
      (_firestore: Firestore, ...segments: string[]) => segments.join("/"),
    );
    mockDoc.mockImplementation((_firestore: Firestore, ...segments: string[]) =>
      segments.join("/"),
    );
    mockQuery.mockImplementation(
      (collectionRef: string, ...constraints: unknown[]) => ({
        collectionRef,
        constraints,
      }),
    );
  });

  it("preserves the provided message timestamp when persisting", async () => {
    const timestamp = {
      seconds: 1712300000,
      nanoseconds: 123000000,
    } as AssistantMessage["timestamp"];
    mockAddDoc.mockResolvedValueOnce({ id: "message-1" });

    await addAssistantMessage({} as Firestore, "conversation-1", {
      parts: [{ type: "text", text: "Hello" }],
      role: "assistant",
      timestamp,
      references: [],
      orderItems: [],
    });

    expect(mockAddDoc).toHaveBeenCalledWith(
      "assistantConversations/conversation-1/messages",
      expect.objectContaining({
        conversationId: "conversation-1",
        timestamp,
      }),
    );
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      "assistantConversations/conversation-1",
      expect.objectContaining({
        lastMessageAt: mockServerTimestamp,
        messageCount: { __type: "increment", value: 1 },
        updatedAt: mockServerTimestamp,
      }),
    );
  });

  it("returns messages in chronological order", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: "assistant-2",
          data: () => ({
            conversationId: "conversation-1",
            orderItems: [],
            parts: [{ type: "text", text: "Second" }],
            references: [],
            role: "assistant",
            timestamp: { seconds: 20, nanoseconds: 0 },
          }),
        },
        {
          id: "user-1",
          data: () => ({
            conversationId: "conversation-1",
            orderItems: [],
            parts: [{ type: "text", text: "First" }],
            references: [],
            role: "user",
            timestamp: { seconds: 10, nanoseconds: 0 },
          }),
        },
      ],
    });

    const result = await getAssistantMessages(
      {} as Firestore,
      "conversation-1",
      10,
    );

    expect(result.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-2",
    ]);
    expect(mockQuery).toHaveBeenCalledWith(
      "assistantConversations/conversation-1/messages",
      expect.objectContaining({
        __type: "orderBy",
        direction: "desc",
        field: "timestamp",
      }),
      expect.objectContaining({
        __type: "limit",
        value: 10,
      }),
    );
  });
});
