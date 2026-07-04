import { Timestamp } from "firebase/firestore";
import { NestedMember } from "../configuration/member";

export type TeamChatChannelKind = "app" | "custom" | "global";

export interface TeamMessage {
  id: string;
  text: string;
  member: NestedMember; // Who sent the message
  channelId: string;
  createdAt: Timestamp;
  editedAt?: Timestamp;
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
  threadId?: string; // For threading support
  mentions?: string[]; // Member IDs that were mentioned
  isDeleted?: boolean;
}

export interface MessageReaction {
  emoji: string;
  memberIds: string[];
}

export interface MessageAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
}

export interface TeamChatChannel {
  id: string;
  name: string;
  kind: TeamChatChannelKind;
  description?: string;
  memberIds?: string[];
  channelType?: "general" | "project" | "private";
  lastMessage?: TeamMessage;
  lastMessageAt?: Timestamp;
  createdBy?: NestedMember;
  createdAt?: Timestamp | Omit<Timestamp, "toJSON">;
  defaultThreadId?: string; // Default thread for this channel
}

export interface TeamChatThread {
  id: string;
  title: string;
  channelId: string;
  createdBy: NestedMember;
  createdAt: Timestamp;
  lastMessage?: TeamMessage;
  lastMessageAt?: Timestamp;
  isDefault?: boolean; // Mark as default thread for channel
}

// Forms for creating/updating
export interface TeamMessageCreate extends Omit<
  TeamMessage,
  "id" | "createdAt"
> {
  createdAt?: Timestamp;
}

export interface TeamChatChannelCreate extends Omit<
  TeamChatChannel,
  "id" | "kind" | "lastMessage" | "lastMessageAt"
> {
  kind?: TeamChatChannelKind;
  createdBy: NestedMember;
  createdAt?: Timestamp;
}

export interface TeamChatThreadCreate extends Omit<
  TeamChatThread,
  "id" | "createdAt" | "lastMessage" | "lastMessageAt"
> {
  createdAt?: Timestamp;
}
