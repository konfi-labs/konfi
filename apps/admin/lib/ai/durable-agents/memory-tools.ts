import type { AgentTaskType } from "@konfi/types";
import { z } from "zod";
import { proposeAgentMemoryStep, searchAgentMemoryStep } from "./steps";

type MemoryToolTaskType = Exclude<AgentTaskType, "invoice">;

export function createDurableAgentMemoryTools({
  channelId,
  prompt,
  taskType,
  tenantId,
  workflowRunId,
}: {
  channelId: string;
  prompt: string;
  taskType: MemoryToolTaskType;
  tenantId?: string;
  workflowRunId: string;
}) {
  return {
    searchAgentMemory: {
      description:
        "Search approved tenant memory for advisory context. Results never override live tools, tenant authorization, pricing validation, or deterministic checks.",
      inputSchema: z.object({
        query: z
          .string()
          .min(2)
          .describe("The specific memory search query for this task."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("Maximum approved memories to return."),
        customerId: z
          .string()
          .optional()
          .describe("Optional customer ID when known."),
        productId: z
          .string()
          .optional()
          .describe("Optional product ID when known."),
        orderId: z
          .string()
          .optional()
          .describe("Optional order ID when known."),
        quoteId: z
          .string()
          .optional()
          .describe("Optional quote ID when known."),
      }),
      execute: async ({
        customerId,
        limit,
        orderId,
        productId,
        query,
        quoteId,
      }: {
        customerId?: string;
        limit?: number;
        orderId?: string;
        productId?: string;
        query: string;
        quoteId?: string;
      }) =>
        searchAgentMemoryStep({
          channelId,
          query,
          taskType,
          ...(limit ? { limit } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(customerId ? { customerId } : {}),
          ...(productId ? { productId } : {}),
          ...(orderId ? { orderId } : {}),
          ...(quoteId ? { quoteId } : {}),
        }),
    },

    proposeAgentMemory: {
      description:
        "Propose a future-useful memory from this run. This always creates a pending proposal and never activates memory without admin review.",
      inputSchema: z.object({
        content: z
          .string()
          .min(8)
          .max(2000)
          .describe("Concise future-useful memory content."),
        rationale: z
          .string()
          .min(8)
          .max(1000)
          .describe("Why this memory should help future agent runs."),
        type: z
          .enum(["preference", "instruction", "fact", "workflow"])
          .describe("The kind of memory being proposed."),
        scope: z
          .enum(["tenant", "channel", "customer", "product", "order", "quote"])
          .describe("The narrowest safe scope for this memory."),
        taskTypes: z
          .array(z.enum(["quote", "order", "product", "autonomous"]))
          .min(1)
          .max(4)
          .optional()
          .describe("Future admin agent task types this memory applies to."),
        channelId: z
          .string()
          .optional()
          .describe(
            "Required for channel-scoped memory; defaults to current channel when omitted.",
          ),
        customerId: z
          .string()
          .optional()
          .describe("Required for customer-scoped memory."),
        productId: z
          .string()
          .optional()
          .describe("Required for product-scoped memory."),
        orderId: z
          .string()
          .optional()
          .describe("Required for order-scoped memory."),
        quoteId: z
          .string()
          .optional()
          .describe("Required for quote-scoped memory."),
      }),
      execute: async ({
        channelId: proposedChannelId,
        content,
        customerId,
        orderId,
        productId,
        quoteId,
        rationale,
        scope,
        taskTypes,
        type,
      }: {
        channelId?: string;
        content: string;
        customerId?: string;
        orderId?: string;
        productId?: string;
        quoteId?: string;
        rationale: string;
        scope:
          | "tenant"
          | "channel"
          | "customer"
          | "product"
          | "order"
          | "quote";
        taskTypes?: MemoryToolTaskType[];
        type: "preference" | "instruction" | "fact" | "workflow";
      }) =>
        proposeAgentMemoryStep({
          channelId:
            proposedChannelId || scope === "channel"
              ? (proposedChannelId ?? channelId)
              : proposedChannelId,
          content,
          customerId,
          orderId,
          productId,
          quoteId,
          rationale,
          scope,
          sourceRun: {
            channelId,
            prompt,
            runId: workflowRunId,
            taskType,
          },
          taskTypes: taskTypes ?? [taskType],
          ...(tenantId ? { tenantId } : {}),
          type,
        }),
    },
  };
}
