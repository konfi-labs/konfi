import { type UIMessage } from "@ai-sdk/react";
import { Timestamp } from "firebase/firestore";
import { FormattedOrderItem } from "./orders";

export interface AssistantConversation {
  id: string;
  title: string;
  userId: string;
  channelId: string;
  modelId: string;
  messageCount: number;
  lastMessageAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  active: boolean;
}

export interface AssistantMessage {
  id: string;
  conversationId: string;
  parts: UIMessage["parts"];
  role: "user" | "system" | "assistant";
  timestamp: Timestamp;
  thoughtSignature?: string;
  references?: Array<{
    url: string;
    title: string;
    content: string;
    thumbnail: string;
  }>;
  orderItems?: FormattedOrderItem[];
}

export interface AssistantSession {
  conversationId?: string;
  messages: AssistantMessage[];
  modelId: string;
  private: boolean;
}
