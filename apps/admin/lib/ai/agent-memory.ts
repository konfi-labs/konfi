import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { embedGeminiEmbeddingText } from "@/lib/product-search/semantic-product-index";
import type {
  AgentMemoryActor,
  AgentMemoryRecord,
  AgentMemoryScope,
  AgentMemoryScopeMetadata,
  AgentMemorySearchFilters,
  AgentMemorySourceRun,
  AgentMemoryStatus,
  AgentMemoryType,
  AgentMemoryView,
  AgentTaskType,
  NestedMember,
} from "@konfi/types";
import {
  agentMemoryMatchesScope,
  agentMemoryMatchesTaskType,
  AGENT_MEMORY_EMBEDDING_DIMENSION,
  AGENT_MEMORY_EMBEDDING_MODEL,
  validateAgentMemoryPayload,
  type AgentMemoryPayloadInput,
  type NormalizedAgentMemoryPayload,
} from "@konfi/utils";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

const AGENT_MEMORIES_COLLECTION = "agentMemories";
const AGENT_MEMORY_DISTANCE_FIELD = "distance";
const AGENT_MEMORY_VECTOR_SEARCH_POOL_LIMIT = 50;
const AGENT_MEMORY_FALLBACK_POOL_LIMIT = 100;

export type AgentMemoryAction = "approve" | "archive" | "reject" | "update";

export interface AgentMemoryListParams {
  limit?: number;
  query?: string;
  scope?: AgentMemoryScope;
  status?: AgentMemoryStatus;
  taskType?: AgentTaskType;
  tenantId: string;
  type?: AgentMemoryType;
}

export interface CreateAgentMemoryProposalParams {
  payload: NormalizedAgentMemoryPayload;
  sourceRun: AgentMemorySourceRun;
  tenantId: string;
}

export interface CreateAdminAgentMemoryParams {
  actor: AgentMemoryActor;
  payload: NormalizedAgentMemoryPayload;
  tenantId: string;
}

export interface MutateAgentMemoryParams {
  action: AgentMemoryAction;
  actor: AgentMemoryActor;
  memoryId: string;
  payload?: AgentMemoryPayloadInput;
  tenantId: string;
}

interface StoredAgentMemoryDocument {
  content?: unknown;
  createdAt?: unknown;
  createdBy?: unknown;
  embeddingDimension?: unknown;
  embeddingModel?: unknown;
  rationale?: unknown;
  reviewedAt?: unknown;
  reviewedBy?: unknown;
  scope?: unknown;
  scopeMetadata?: unknown;
  sourceRun?: unknown;
  status?: unknown;
  taskTypes?: unknown;
  tenantId?: unknown;
  type?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readTimestamp(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (isRecord(value)) {
    const toDate = value.toDate;
    if (typeof toDate === "function") {
      const date = toDate.call(value);
      return date instanceof Date ? date.toISOString() : null;
    }

    const seconds = value.seconds ?? value["_seconds"];
    if (typeof seconds === "number") {
      return new Date(seconds * 1000).toISOString();
    }
  }

  return null;
}

function readActor(
  value: unknown,
  fallback: AgentMemoryActor,
): AgentMemoryActor {
  if (!isRecord(value)) return fallback;

  const id = readString(value.id);
  const name = readString(value.name);
  const kind = value.kind === "agent" ? "agent" : "admin";

  if (!id || !name) return fallback;

  return { id, kind, name };
}

function readScopeMetadata(value: unknown): AgentMemoryScopeMetadata {
  if (!isRecord(value)) return {};

  return {
    ...(readString(value.channelId)
      ? { channelId: readString(value.channelId) }
      : {}),
    ...(readString(value.customerId)
      ? { customerId: readString(value.customerId) }
      : {}),
    ...(readString(value.orderId)
      ? { orderId: readString(value.orderId) }
      : {}),
    ...(readString(value.productId)
      ? { productId: readString(value.productId) }
      : {}),
    ...(readString(value.quoteId)
      ? { quoteId: readString(value.quoteId) }
      : {}),
  };
}

function readTaskTypes(value: unknown): AgentTaskType[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is AgentTaskType =>
      item === "quote" ||
      item === "order" ||
      item === "product" ||
      item === "autonomous",
  );
}

function readSourceRun(value: unknown): AgentMemorySourceRun | undefined {
  if (!isRecord(value)) return undefined;

  const runId = readString(value.runId);
  const taskType = readString(value.taskType);
  if (
    !runId ||
    (taskType !== "quote" &&
      taskType !== "order" &&
      taskType !== "product" &&
      taskType !== "autonomous")
  ) {
    return undefined;
  }

  return {
    ...(readString(value.channelId)
      ? { channelId: readString(value.channelId) }
      : {}),
    ...(readString(value.prompt) ? { prompt: readString(value.prompt) } : {}),
    runId,
    taskType,
  };
}

function readStatus(value: unknown): AgentMemoryStatus | undefined {
  return value === "pending" ||
    value === "active" ||
    value === "rejected" ||
    value === "archived"
    ? value
    : undefined;
}

function readType(value: unknown): AgentMemoryType | undefined {
  return value === "preference" ||
    value === "instruction" ||
    value === "fact" ||
    value === "workflow"
    ? value
    : undefined;
}

function readScope(value: unknown): AgentMemoryScope | undefined {
  return value === "tenant" ||
    value === "channel" ||
    value === "customer" ||
    value === "product" ||
    value === "order" ||
    value === "quote"
    ? value
    : undefined;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (!value || !Number.isFinite(value)) return fallback;

  return Math.min(Math.max(1, Math.floor(value)), 50);
}

function createAgentActor(sourceRun: AgentMemorySourceRun): AgentMemoryActor {
  return {
    id: sourceRun.runId,
    kind: "agent",
    name: `${sourceRun.taskType} agent`,
  };
}

function createEmbeddingDeleteFields(): Record<string, FieldValue> {
  return {
    embedding: FieldValue.delete(),
    embeddingDimension: FieldValue.delete(),
    embeddingModel: FieldValue.delete(),
  };
}

export function createAdminMemoryActor(member: NestedMember): AgentMemoryActor {
  return {
    id: member.id,
    kind: "admin",
    name: member.name,
  };
}

function collection() {
  return getAdminDb().collection(AGENT_MEMORIES_COLLECTION);
}

function mapSnapshotToView(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): AgentMemoryView | null {
  const data = snapshot.data() as StoredAgentMemoryDocument;
  const fallbackActor: AgentMemoryActor = {
    id: "unknown",
    kind: "admin",
    name: "Unknown",
  };
  const tenantId = readString(data.tenantId);
  const content = readString(data.content);
  const status = readStatus(data.status);
  const type = readType(data.type);
  const scope = readScope(data.scope);
  const createdBy = readActor(data.createdBy, fallbackActor);
  const updatedBy = readActor(data.updatedBy, createdBy);
  const taskTypes = readTaskTypes(data.taskTypes);

  if (!tenantId || !content || !status || !type || !scope) {
    return null;
  }

  return {
    id: snapshot.id,
    content,
    createdAt: readTimestamp(data.createdAt),
    createdBy,
    distance: readNumber(snapshot.get(AGENT_MEMORY_DISTANCE_FIELD)) ?? null,
    ...(readNumber(data.embeddingDimension)
      ? { embeddingDimension: readNumber(data.embeddingDimension) }
      : {}),
    ...(readString(data.embeddingModel)
      ? { embeddingModel: readString(data.embeddingModel) }
      : {}),
    ...(readString(data.rationale)
      ? { rationale: readString(data.rationale) }
      : {}),
    reviewedAt: readTimestamp(data.reviewedAt),
    ...(isRecord(data.reviewedBy)
      ? { reviewedBy: readActor(data.reviewedBy, fallbackActor) }
      : {}),
    scope,
    scopeMetadata: readScopeMetadata(data.scopeMetadata),
    ...(readSourceRun(data.sourceRun)
      ? { sourceRun: readSourceRun(data.sourceRun) }
      : {}),
    status,
    taskTypes,
    tenantId,
    type,
    updatedAt: readTimestamp(data.updatedAt),
    updatedBy,
  };
}

async function createEmbeddingFields(content: string, context: string) {
  try {
    const embedding = await embedGeminiEmbeddingText({
      context,
      text: `task: retrieve approved Konfi admin-agent memory | text: ${content}`,
    });

    if (embedding.length !== AGENT_MEMORY_EMBEDDING_DIMENSION) {
      console.warn("[agentMemory] Unexpected embedding dimension", {
        actual: embedding.length,
        expected: AGENT_MEMORY_EMBEDDING_DIMENSION,
      });
      return {};
    }

    return {
      embedding: FieldValue.vector(embedding),
      embeddingDimension: AGENT_MEMORY_EMBEDDING_DIMENSION,
      embeddingModel: AGENT_MEMORY_EMBEDDING_MODEL,
    };
  } catch (error) {
    console.warn("[agentMemory] Continuing without embedding", {
      context,
      error,
    });
    return {};
  }
}

async function getMemoryForTenant(memoryId: string, tenantId: string) {
  const snapshot = await collection().doc(memoryId).get();

  if (!snapshot.exists) {
    throw new Error("Memory was not found.");
  }

  const data = snapshot.data() as StoredAgentMemoryDocument | undefined;
  if (data?.tenantId !== tenantId) {
    throw new Error("Memory was not found.");
  }

  return { data, ref: snapshot.ref, snapshot };
}

function memoryMatchesFilters(
  memory: AgentMemoryView,
  filters: Omit<AgentMemoryListParams, "tenantId">,
): boolean {
  if (filters.status && memory.status !== filters.status) return false;
  if (filters.type && memory.type !== filters.type) return false;
  if (filters.scope && memory.scope !== filters.scope) return false;
  if (
    filters.taskType &&
    !agentMemoryMatchesTaskType(memory.taskTypes, filters.taskType)
  ) {
    return false;
  }

  const query = filters.query?.trim().toLowerCase();
  if (!query) return true;

  return [memory.content, memory.rationale, memory.sourceRun?.prompt]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => value.toLowerCase().includes(query));
}

function scoreTextMatch(memory: AgentMemoryView, query: string): number {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const content = [
    memory.content,
    memory.rationale,
    memory.type,
    memory.scope,
    memory.sourceRun?.prompt,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLowerCase();

  return terms.reduce(
    (score, term) => score + (content.includes(term) ? 1 : 0),
    0,
  );
}

function memoryMatchesSearchScope(
  memory: AgentMemoryView,
  search: AgentMemorySearchFilters,
): boolean {
  return agentMemoryMatchesScope(memory.scope, memory.scopeMetadata, search);
}

export async function createAgentMemoryProposal({
  payload,
  sourceRun,
  tenantId,
}: CreateAgentMemoryProposalParams): Promise<AgentMemoryView> {
  const ref = collection().doc();
  const actor = createAgentActor(sourceRun);
  const now = FieldValue.serverTimestamp();
  const document: Omit<AgentMemoryRecord, "createdAt" | "updatedAt"> & {
    createdAt: FieldValue;
    updatedAt: FieldValue;
  } = {
    id: ref.id,
    content: payload.content,
    createdAt: now,
    createdBy: actor,
    ...(payload.rationale ? { rationale: payload.rationale } : {}),
    scope: payload.scope,
    scopeMetadata: payload.scopeMetadata,
    sourceRun,
    status: "pending",
    taskTypes: payload.taskTypes,
    tenantId,
    type: payload.type,
    updatedAt: now,
    updatedBy: actor,
  };

  await ref.set(document);

  const snapshot = await ref.get();
  const view = mapSnapshotToView(
    snapshot as QueryDocumentSnapshot<DocumentData>,
  );
  if (!view) {
    throw new Error("Created memory proposal could not be read.");
  }

  return view;
}

export async function createAdminAgentMemory({
  actor,
  payload,
  tenantId,
}: CreateAdminAgentMemoryParams): Promise<AgentMemoryView> {
  const ref = collection().doc();
  const now = FieldValue.serverTimestamp();
  const embeddingFields = await createEmbeddingFields(
    payload.content,
    `admin memory ${ref.id}`,
  );

  await ref.set({
    id: ref.id,
    content: payload.content,
    createdAt: now,
    createdBy: actor,
    ...embeddingFields,
    ...(payload.rationale ? { rationale: payload.rationale } : {}),
    reviewedAt: now,
    reviewedBy: actor,
    scope: payload.scope,
    scopeMetadata: payload.scopeMetadata,
    status: "active",
    taskTypes: payload.taskTypes,
    tenantId,
    type: payload.type,
    updatedAt: now,
    updatedBy: actor,
  });

  const snapshot = await ref.get();
  const view = mapSnapshotToView(
    snapshot as QueryDocumentSnapshot<DocumentData>,
  );
  if (!view) {
    throw new Error("Created memory could not be read.");
  }

  return view;
}

export async function listAgentMemories({
  limit,
  query,
  scope,
  status,
  taskType,
  tenantId,
  type,
}: AgentMemoryListParams): Promise<AgentMemoryView[]> {
  let firestoreQuery = collection().where("tenantId", "==", tenantId);
  if (status) {
    firestoreQuery = firestoreQuery
      .where("status", "==", status)
      .orderBy("updatedAt", "desc");
  }

  const snapshot = await firestoreQuery
    .limit(
      Math.max(normalizeLimit(limit, 50), AGENT_MEMORY_FALLBACK_POOL_LIMIT),
    )
    .get();
  const filters = { limit, query, scope, status, taskType, type };

  return snapshot.docs
    .map(mapSnapshotToView)
    .filter((memory): memory is AgentMemoryView => memory !== null)
    .filter((memory) => memoryMatchesFilters(memory, filters))
    .toSorted((left, right) =>
      (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
    )
    .slice(0, normalizeLimit(limit, 50));
}

export async function searchAgentMemories({
  tenantId,
  ...search
}: AgentMemorySearchFilters & { tenantId: string }): Promise<
  AgentMemoryView[]
> {
  const limit = normalizeLimit(search.limit, 5);

  try {
    const embedding = await embedGeminiEmbeddingText({
      context: `agent memory query "${search.query}"`,
      text: `task: retrieve approved Konfi admin-agent memory | query: ${search.query}`,
    });

    if (embedding.length !== AGENT_MEMORY_EMBEDDING_DIMENSION) {
      console.warn("[agentMemory] Unexpected query embedding dimension", {
        actual: embedding.length,
        expected: AGENT_MEMORY_EMBEDDING_DIMENSION,
      });
      throw new Error("Unexpected query embedding dimension.");
    }

    const snapshot = await collection()
      .where("tenantId", "==", tenantId)
      .where("status", "==", "active")
      .findNearest({
        vectorField: "embedding",
        queryVector: embedding,
        limit: AGENT_MEMORY_VECTOR_SEARCH_POOL_LIMIT,
        distanceMeasure: "COSINE",
        distanceResultField: AGENT_MEMORY_DISTANCE_FIELD,
      })
      .get();

    const hits = snapshot.docs
      .map(mapSnapshotToView)
      .filter((memory): memory is AgentMemoryView => memory !== null)
      .filter(
        (memory) =>
          memory.embeddingModel === AGENT_MEMORY_EMBEDDING_MODEL &&
          memory.embeddingDimension === AGENT_MEMORY_EMBEDDING_DIMENSION &&
          agentMemoryMatchesTaskType(memory.taskTypes, search.taskType) &&
          memoryMatchesSearchScope(memory, search),
      )
      .slice(0, limit);

    if (hits.length > 0) {
      return hits;
    }
  } catch (error) {
    console.warn("[agentMemory] Falling back without semantic hits", {
      error,
      taskType: search.taskType,
      tenantId,
    });
  }

  const fallback = await listAgentMemories({
    limit: AGENT_MEMORY_FALLBACK_POOL_LIMIT,
    status: "active",
    taskType: search.taskType,
    tenantId,
  });

  return fallback
    .filter((memory) => memoryMatchesSearchScope(memory, search))
    .map((memory) => ({
      memory,
      score: scoreTextMatch(memory, search.query),
    }))
    .filter(({ score }) => score > 0)
    .toSorted((left, right) => right.score - left.score)
    .map(({ memory }) => memory)
    .slice(0, limit);
}

export async function mutateAgentMemory({
  action,
  actor,
  memoryId,
  payload,
  tenantId,
}: MutateAgentMemoryParams): Promise<AgentMemoryView> {
  const { data, ref } = await getMemoryForTenant(memoryId, tenantId);
  const currentStatus = readStatus(data.status);
  const now = FieldValue.serverTimestamp();
  const update: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: actor,
  };

  if (action === "archive") {
    update.status = "archived";
  } else if (action === "reject") {
    if (currentStatus !== "pending") {
      throw new Error("Only pending memory proposals can be rejected.");
    }
    update.status = "rejected";
    update.reviewedAt = now;
    update.reviewedBy = actor;
  } else {
    const validation = validateAgentMemoryPayload({
      content: data.content,
      rationale: data.rationale,
      scope: data.scope,
      taskTypes: data.taskTypes,
      type: data.type,
      ...readScopeMetadata(data.scopeMetadata),
      ...payload,
    });
    if (!validation.value) {
      throw new Error(validation.errors.join(" "));
    }

    const next = validation.value;
    const contentChanged = next.content !== readString(data.content);
    update.content = next.content;
    update.type = next.type;
    update.scope = next.scope;
    update.scopeMetadata = next.scopeMetadata;
    update.taskTypes = next.taskTypes;
    if (next.rationale) {
      update.rationale = next.rationale;
    } else {
      update.rationale = FieldValue.delete();
    }

    if (action === "approve") {
      if (currentStatus !== "pending") {
        throw new Error("Only pending memory proposals can be approved.");
      }
      update.status = "active";
      update.reviewedAt = now;
      update.reviewedBy = actor;
    } else if (action === "update" && currentStatus !== "active") {
      throw new Error("Only active memories can be edited.");
    }

    const embeddingFields = await createEmbeddingFields(
      next.content,
      `memory ${memoryId}`,
    );
    Object.assign(
      update,
      Object.keys(embeddingFields).length > 0
        ? embeddingFields
        : contentChanged
          ? createEmbeddingDeleteFields()
          : {},
    );
  }

  await ref.set(update, { merge: true });

  const snapshot = await ref.get();
  const view = mapSnapshotToView(
    snapshot as QueryDocumentSnapshot<DocumentData>,
  );
  if (!view) {
    throw new Error("Updated memory could not be read.");
  }

  return view;
}
