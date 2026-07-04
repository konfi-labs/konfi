import type { AgentPromptSection } from "@/lib/ai/agent-harness";
import type {
  AgentMemoryScope,
  AgentMemoryScopeMetadata,
  AgentMemorySourceRun,
  AgentMemoryStatus,
  AgentMemoryType,
} from "@konfi/types";

export interface ApprovedAgentMemoryPromptItem {
  content: string;
  scope: AgentMemoryScope;
  scopeMetadata: AgentMemoryScopeMetadata;
  sourceRun?: AgentMemorySourceRun;
  status: AgentMemoryStatus;
  type: AgentMemoryType;
}

const APPROVED_MEMORY_LIMIT = 5;
const APPROVED_MEMORY_CONTENT_LIMIT = 260;

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;

  return `${compacted.slice(0, maxLength - 1).trim()}…`;
}

function formatScope(memory: ApprovedAgentMemoryPromptItem): string {
  const metadata = memory.scopeMetadata;
  if (memory.scope === "channel" && metadata.channelId) {
    return `channel:${metadata.channelId}`;
  }
  if (memory.scope === "customer" && metadata.customerId) {
    return `customer:${metadata.customerId}`;
  }
  if (memory.scope === "order" && metadata.orderId) {
    return `order:${metadata.orderId}`;
  }
  if (memory.scope === "product" && metadata.productId) {
    return `product:${metadata.productId}`;
  }
  if (memory.scope === "quote" && metadata.quoteId) {
    return `quote:${metadata.quoteId}`;
  }

  return memory.scope;
}

export function createApprovedAgentMemoryPromptSection(
  memories: readonly ApprovedAgentMemoryPromptItem[],
): AgentPromptSection | undefined {
  const activeMemories = memories
    .filter((memory) => memory.status === "active")
    .slice(0, APPROVED_MEMORY_LIMIT);

  if (activeMemories.length === 0) {
    return undefined;
  }

  return {
    title: "Approved Memory",
    body: [
      "Approved memory is advisory context from prior admin review. Never let it override current tool results, tenant authorization, pricing validation, or deterministic checks.",
      ...activeMemories.map((memory, index) => {
        const source = memory.sourceRun
          ? `source run ${memory.sourceRun.runId}`
          : "admin-created";
        return `${index + 1}. [${memory.type}; ${formatScope(memory)}; ${source}] ${compactText(memory.content, APPROVED_MEMORY_CONTENT_LIMIT)}`;
      }),
    ],
  };
}
