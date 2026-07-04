import { describe, it, expect, vi } from "vitest";
import { TeamMessage, TeamChatChannel } from "@konfi/types";

const createdAt = {
  seconds: 1234567890,
  nanoseconds: 0,
} as TeamMessage["createdAt"];

// Mock Firebase modules
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
  Timestamp: {
    fromDate: vi.fn(),
    now: vi.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
  },
}));

// Mock the firestore db functions
vi.mock("../firestore", () => ({
  db: {
    collection: vi.fn(),
    doc: vi.fn(),
    query: vi.fn(),
  },
  create: vi.fn(),
  update: vi.fn(),
}));

describe("Team Chat Types", () => {
  it("should create a valid TeamMessage interface", () => {
    const message: TeamMessage = {
      id: "test-message-1",
      text: "Hello, team!",
      member: {
        id: "member-1",
        name: "John Doe",
      },
      channelId: "channel-1",
      createdAt,
    };

    expect(message.id).toBe("test-message-1");
    expect(message.text).toBe("Hello, team!");
    expect(message.member.name).toBe("John Doe");
    expect(message.channelId).toBe("channel-1");
  });

  it("should create a valid TeamChatChannel interface", () => {
    const channel: TeamChatChannel = {
      id: "channel-1",
      name: "General Chat",
      kind: "custom",
      memberIds: ["member-1", "member-2"],
      channelType: "general",
      createdBy: {
        id: "member-1",
        name: "John Doe",
      },
      createdAt,
    };

    expect(channel.id).toBe("channel-1");
    expect(channel.name).toBe("General Chat");
    expect(channel.kind).toBe("custom");
    expect(channel.memberIds).toHaveLength(2);
    expect(channel.channelType).toBe("general");
  });

  it("should handle optional fields correctly", () => {
    const message: TeamMessage = {
      id: "test-message-2",
      text: "Message with mentions",
      member: {
        id: "member-1",
        name: "John Doe",
      },
      channelId: "channel-1",
      createdAt,
      threadId: "thread-1",
      mentions: ["member-2"],
      reactions: [
        {
          emoji: "👍",
          memberIds: ["member-2", "member-3"],
        },
      ],
    };

    expect(message.threadId).toBe("thread-1");
    expect(message.mentions).toContain("member-2");
    expect(message.reactions?.[0].emoji).toBe("👍");
    expect(message.reactions?.[0].memberIds).toHaveLength(2);
  });
});
