import {
  AGENT_MEMORY_SCOPES,
  AGENT_MEMORY_STATUSES,
  AGENT_MEMORY_TYPES,
  AGENT_TASK_TYPES,
  type AgentMemoryScope,
  type AgentMemoryScopeMetadata,
  type AgentMemoryStatus,
  type AgentMemoryType,
  type AgentTaskType,
} from "@konfi/types";

export const AGENT_MEMORY_CONTENT_MAX_LENGTH = 2000;
export const AGENT_MEMORY_CONTENT_MIN_LENGTH = 8;
export const AGENT_MEMORY_RATIONALE_MAX_LENGTH = 1000;
export const AGENT_MEMORY_SEARCH_QUERY_MAX_LENGTH = 500;
export const AGENT_MEMORY_MAX_TASK_TYPES = 4;
export const AGENT_MEMORY_EMBEDDING_DIMENSION = 768;
export const AGENT_MEMORY_EMBEDDING_MODEL = "gemini-embedding-2";

export interface AgentMemoryValidationResult<T> {
  errors: string[];
  value?: T;
}

export interface AgentMemoryPayloadInput {
  channelId?: unknown;
  content?: unknown;
  customerId?: unknown;
  orderId?: unknown;
  productId?: unknown;
  query?: unknown;
  quoteId?: unknown;
  rationale?: unknown;
  scope?: unknown;
  status?: unknown;
  taskType?: unknown;
  taskTypes?: unknown;
  type?: unknown;
}

export interface NormalizedAgentMemoryPayload {
  content: string;
  rationale?: string;
  scope: AgentMemoryScope;
  scopeMetadata: AgentMemoryScopeMetadata;
  taskTypes: AgentTaskType[];
  type: AgentMemoryType;
}

export interface NormalizedAgentMemorySearchPayload {
  channelId?: string;
  customerId?: string;
  limit: number;
  orderId?: string;
  productId?: string;
  query: string;
  quoteId?: string;
  taskType: AgentTaskType;
}

function isStringLiteral<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 256 ? trimmed : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

export function isAgentMemoryStatus(
  value: unknown,
): value is AgentMemoryStatus {
  return isStringLiteral(value, AGENT_MEMORY_STATUSES);
}

export function isAgentMemoryType(value: unknown): value is AgentMemoryType {
  return isStringLiteral(value, AGENT_MEMORY_TYPES);
}

export function isAgentMemoryScope(value: unknown): value is AgentMemoryScope {
  return isStringLiteral(value, AGENT_MEMORY_SCOPES);
}

export function isAgentTaskType(value: unknown): value is AgentTaskType {
  return isStringLiteral(value, AGENT_TASK_TYPES);
}

export function normalizeAgentMemoryStatus(
  value: unknown,
): AgentMemoryStatus | undefined {
  return isAgentMemoryStatus(value) ? value : undefined;
}

export function normalizeAgentMemoryType(
  value: unknown,
): AgentMemoryType | undefined {
  return isAgentMemoryType(value) ? value : undefined;
}

export function normalizeAgentMemoryScope(
  value: unknown,
): AgentMemoryScope | undefined {
  return isAgentMemoryScope(value) ? value : undefined;
}

export function normalizeAgentTaskType(
  value: unknown,
): AgentTaskType | undefined {
  return isAgentTaskType(value) ? value : undefined;
}

export function normalizeAgentMemoryTaskTypes(
  value: unknown,
): AgentTaskType[] | undefined {
  const values = Array.isArray(value) ? value : [value];
  const normalized: AgentTaskType[] = [];

  for (const item of values) {
    const taskType = normalizeAgentTaskType(item);
    if (!taskType || taskType === "invoice") {
      return undefined;
    }
    if (!normalized.includes(taskType)) {
      normalized.push(taskType);
    }
  }

  return normalized.length > 0 &&
    normalized.length <= AGENT_MEMORY_MAX_TASK_TYPES
    ? normalized
    : undefined;
}

function normalizeScopeMetadata(
  input: AgentMemoryPayloadInput,
): AgentMemoryScopeMetadata {
  const channelId = normalizeOptionalId(input.channelId);
  const customerId = normalizeOptionalId(input.customerId);
  const orderId = normalizeOptionalId(input.orderId);
  const productId = normalizeOptionalId(input.productId);
  const quoteId = normalizeOptionalId(input.quoteId);

  return {
    ...(channelId ? { channelId } : {}),
    ...(customerId ? { customerId } : {}),
    ...(orderId ? { orderId } : {}),
    ...(productId ? { productId } : {}),
    ...(quoteId ? { quoteId } : {}),
  };
}

function scopeHasRequiredMetadata(
  scope: AgentMemoryScope,
  metadata: AgentMemoryScopeMetadata,
): boolean {
  switch (scope) {
    case "tenant":
      return true;
    case "channel":
      return Boolean(metadata.channelId);
    case "customer":
      return Boolean(metadata.customerId);
    case "order":
      return Boolean(metadata.orderId);
    case "product":
      return Boolean(metadata.productId);
    case "quote":
      return Boolean(metadata.quoteId);
  }

  return false;
}

export function validateAgentMemoryPayload(
  input: AgentMemoryPayloadInput,
): AgentMemoryValidationResult<NormalizedAgentMemoryPayload> {
  const errors: string[] = [];
  const content = readString(input.content);
  const rationale = readString(input.rationale);
  const type = normalizeAgentMemoryType(input.type);
  const scope = normalizeAgentMemoryScope(input.scope);
  const taskTypes = normalizeAgentMemoryTaskTypes(input.taskTypes);
  const scopeMetadata = normalizeScopeMetadata(input);

  if (
    !content ||
    content.length < AGENT_MEMORY_CONTENT_MIN_LENGTH ||
    content.length > AGENT_MEMORY_CONTENT_MAX_LENGTH
  ) {
    errors.push(
      `Memory content must be ${AGENT_MEMORY_CONTENT_MIN_LENGTH}-${AGENT_MEMORY_CONTENT_MAX_LENGTH} characters.`,
    );
  }

  if (!type) {
    errors.push("Memory type is not supported.");
  }

  if (!scope) {
    errors.push("Memory scope is not supported.");
  } else if (!scopeHasRequiredMetadata(scope, scopeMetadata)) {
    errors.push(`Memory scope "${scope}" is missing required metadata.`);
  }

  if (!taskTypes) {
    errors.push("Memory task types are not supported.");
  }

  if (rationale && rationale.length > AGENT_MEMORY_RATIONALE_MAX_LENGTH) {
    errors.push(
      `Memory rationale must be at most ${AGENT_MEMORY_RATIONALE_MAX_LENGTH} characters.`,
    );
  }

  if (errors.length > 0 || !content || !type || !scope || !taskTypes) {
    return { errors };
  }

  return {
    errors: [],
    value: {
      content,
      ...(rationale ? { rationale } : {}),
      scope,
      scopeMetadata,
      taskTypes,
      type,
    },
  };
}

export function validateAgentMemorySearchPayload(
  input: AgentMemoryPayloadInput,
): AgentMemoryValidationResult<NormalizedAgentMemorySearchPayload> {
  const errors: string[] = [];
  const query = readString(input.query);
  const taskType = normalizeAgentTaskType(input.taskType);

  if (
    !query ||
    query.length < 2 ||
    query.length > AGENT_MEMORY_SEARCH_QUERY_MAX_LENGTH
  ) {
    errors.push(
      `Search query must be 2-${AGENT_MEMORY_SEARCH_QUERY_MAX_LENGTH} characters.`,
    );
  }

  if (!taskType || taskType === "invoice") {
    errors.push("Search task type is not supported.");
  }

  if (errors.length > 0 || !query || !taskType) {
    return { errors };
  }

  return {
    errors: [],
    value: {
      channelId: normalizeOptionalId(input.channelId),
      customerId: normalizeOptionalId(input.customerId),
      limit: 5,
      orderId: normalizeOptionalId(input.orderId),
      productId: normalizeOptionalId(input.productId),
      query,
      quoteId: normalizeOptionalId(input.quoteId),
      taskType,
    },
  };
}

export function agentMemoryMatchesTaskType(
  memoryTaskTypes: readonly AgentTaskType[],
  taskType: AgentTaskType,
): boolean {
  return memoryTaskTypes.includes(taskType);
}

export function agentMemoryMatchesScope(
  memoryScope: AgentMemoryScope,
  memoryMetadata: AgentMemoryScopeMetadata,
  search: Partial<AgentMemoryScopeMetadata>,
): boolean {
  if (memoryScope === "tenant") return true;

  if (memoryScope === "channel") {
    return Boolean(
      memoryMetadata.channelId && memoryMetadata.channelId === search.channelId,
    );
  }

  if (memoryScope === "customer") {
    return Boolean(
      memoryMetadata.customerId &&
      memoryMetadata.customerId === search.customerId,
    );
  }

  if (memoryScope === "order") {
    return Boolean(
      memoryMetadata.orderId && memoryMetadata.orderId === search.orderId,
    );
  }

  if (memoryScope === "product") {
    return Boolean(
      memoryMetadata.productId && memoryMetadata.productId === search.productId,
    );
  }

  return Boolean(
    memoryMetadata.quoteId && memoryMetadata.quoteId === search.quoteId,
  );
}
