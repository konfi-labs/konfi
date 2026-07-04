import type { AgentTaskType } from "./agent-memory-task";
import type { TenantOwned } from "./tenant";
import type { Timestamp } from "firebase/firestore";

export const AGENT_MEMORY_STATUSES = [
  "pending",
  "active",
  "rejected",
  "archived",
] as const;

export type AgentMemoryStatus = (typeof AGENT_MEMORY_STATUSES)[number];

export const AGENT_MEMORY_TYPES = [
  "preference",
  "instruction",
  "fact",
  "workflow",
] as const;

export type AgentMemoryType = (typeof AGENT_MEMORY_TYPES)[number];

export const AGENT_MEMORY_SCOPES = [
  "tenant",
  "channel",
  "customer",
  "product",
  "order",
  "quote",
] as const;

export type AgentMemoryScope = (typeof AGENT_MEMORY_SCOPES)[number];

export type AgentMemoryActorKind = "admin" | "agent";

export interface AgentMemoryActor {
  id: string;
  kind: AgentMemoryActorKind;
  name: string;
}

export interface AgentMemoryScopeMetadata {
  channelId?: string;
  customerId?: string;
  orderId?: string;
  productId?: string;
  quoteId?: string;
}

export interface AgentMemorySourceRun {
  channelId?: string;
  prompt?: string;
  runId: string;
  taskType: AgentTaskType;
}

export interface AgentMemoryRecord extends TenantOwned {
  id: string;
  content: string;
  createdAt: Timestamp | Omit<Timestamp, "toJSON">;
  createdBy: AgentMemoryActor;
  embeddingDimension?: number;
  embeddingModel?: string;
  rationale?: string;
  reviewedAt?: Timestamp | Omit<Timestamp, "toJSON">;
  reviewedBy?: AgentMemoryActor;
  scope: AgentMemoryScope;
  scopeMetadata: AgentMemoryScopeMetadata;
  sourceRun?: AgentMemorySourceRun;
  status: AgentMemoryStatus;
  taskTypes: AgentTaskType[];
  type: AgentMemoryType;
  updatedAt: Timestamp | Omit<Timestamp, "toJSON">;
  updatedBy: AgentMemoryActor;
}

export interface AgentMemoryView extends TenantOwned {
  id: string;
  content: string;
  createdAt: string | null;
  createdBy: AgentMemoryActor;
  distance?: number | null;
  embeddingDimension?: number;
  embeddingModel?: string;
  rationale?: string;
  reviewedAt?: string | null;
  reviewedBy?: AgentMemoryActor;
  scope: AgentMemoryScope;
  scopeMetadata: AgentMemoryScopeMetadata;
  sourceRun?: AgentMemorySourceRun;
  status: AgentMemoryStatus;
  taskTypes: AgentTaskType[];
  type: AgentMemoryType;
  updatedAt: string | null;
  updatedBy: AgentMemoryActor;
}

export interface AgentMemoryListFilters {
  limit?: number;
  query?: string;
  scope?: AgentMemoryScope;
  status?: AgentMemoryStatus;
  taskType?: AgentTaskType;
  type?: AgentMemoryType;
}

export interface AgentMemorySearchFilters {
  channelId?: string;
  customerId?: string;
  limit?: number;
  orderId?: string;
  productId?: string;
  query: string;
  quoteId?: string;
  taskType: AgentTaskType;
}
