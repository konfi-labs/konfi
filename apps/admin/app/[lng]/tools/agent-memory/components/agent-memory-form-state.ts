import type {
  AgentMemoryScope,
  AgentMemoryType,
  AgentMemoryView,
  AgentTaskType,
} from "@konfi/types";

export type MemoryTaskType = Exclude<AgentTaskType, "invoice">;

export interface AgentMemoryFormState {
  channelId: string;
  content: string;
  customerId: string;
  orderId: string;
  productId: string;
  quoteId: string;
  rationale: string;
  scope: AgentMemoryScope;
  taskTypes: MemoryTaskType[];
  type: AgentMemoryType;
}

export type AgentMemoryTextFormKey = keyof Omit<
  AgentMemoryFormState,
  "scope" | "taskTypes" | "type"
>;

export const SCOPE_METADATA_FIELD: Record<
  Exclude<AgentMemoryScope, "tenant">,
  keyof Pick<
    AgentMemoryFormState,
    "channelId" | "customerId" | "orderId" | "productId" | "quoteId"
  >
> = {
  channel: "channelId",
  customer: "customerId",
  order: "orderId",
  product: "productId",
  quote: "quoteId",
};

export function createAgentMemoryFormState(
  channelId?: string,
): AgentMemoryFormState {
  return {
    channelId: channelId ?? "",
    content: "",
    customerId: "",
    orderId: "",
    productId: "",
    quoteId: "",
    rationale: "",
    scope: "tenant",
    taskTypes: ["quote"],
    type: "preference",
  };
}

export function createAgentMemoryFormStateFromMemory(
  memory: AgentMemoryView,
): AgentMemoryFormState {
  return {
    channelId: memory.scopeMetadata.channelId ?? "",
    content: memory.content,
    customerId: memory.scopeMetadata.customerId ?? "",
    orderId: memory.scopeMetadata.orderId ?? "",
    productId: memory.scopeMetadata.productId ?? "",
    quoteId: memory.scopeMetadata.quoteId ?? "",
    rationale: memory.rationale ?? "",
    scope: memory.scope,
    taskTypes: memory.taskTypes.filter(
      (taskType): taskType is MemoryTaskType => taskType !== "invoice",
    ),
    type: memory.type,
  };
}

export function buildAgentMemoryPayload(
  state: AgentMemoryFormState,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    content: state.content.trim(),
    scope: state.scope,
    taskTypes: state.taskTypes,
    type: state.type,
  };
  const rationale = state.rationale.trim();
  if (rationale) {
    payload.rationale = rationale;
  }

  for (const key of [
    "channelId",
    "customerId",
    "orderId",
    "productId",
    "quoteId",
  ] as const) {
    const value = state[key].trim();
    if (value) {
      payload[key] = value;
    }
  }

  return payload;
}

export function isAgentMemoryFormSubmittable(
  state: AgentMemoryFormState,
): boolean {
  const hasRequiredScopeMetadata =
    state.scope === "tenant" ||
    Boolean(state[SCOPE_METADATA_FIELD[state.scope]].trim());

  return (
    state.content.trim().length >= 8 &&
    state.taskTypes.length > 0 &&
    hasRequiredScopeMetadata
  );
}
