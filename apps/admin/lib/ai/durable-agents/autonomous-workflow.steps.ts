import "server-only";

import { getDefaultSystemPrompt } from "@/lib/ai/agent-system-prompt";
import { createApprovedAgentMemoryPromptSection } from "@/lib/ai/agent-memory-prompt";
import { runMeteredAdminAiText } from "@/lib/ai/metered-text";
import { createAssistantTools, type ToolContext } from "@/lib/ai/tools";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import type { Attribute, NestedMember, TenantContext } from "@konfi/types";
import { generateText, isStepCount, tool, type ModelMessage } from "ai";

import type { TFunction } from "i18next";
import type { AgentFileMetadata } from "./types";
import { proposeAgentMemoryStep, searchAgentMemoryStep } from "./steps";
import { z } from "zod";

function createStepT(): TFunction {
  return ((key: string, options?: Record<string, unknown>) => {
    const template =
      (options?.defaultValue as string | undefined) ?? (key as string);
    if (!options) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      const value = options[name];
      return value !== undefined && value !== null
        ? String(value)
        : `{{${name}}}`;
    });
  }) as TFunction;
}

function formatMemoryPromptBody(body: readonly string[] | string): string {
  return typeof body === "string" ? body : body.join("\n");
}

export async function runAutonomousAgentStep({
  attributes,
  channelId,
  createdBy,
  fileMetadata = [],
  locale = "en",
  prompt,
  runId,
  tenantId,
}: {
  attributes: Attribute[];
  channelId: string;
  createdBy: NestedMember;
  fileMetadata?: AgentFileMetadata[];
  locale?: string;
  prompt: string;
  runId: string;
  tenantId?: string;
}) {
  "use step";

  const firestore = getAdminDb();
  const t = createStepT();
  const tenantContext: TenantContext = tenantId
    ? {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId,
      }
    : {
        deploymentMode: "dedicated",
        requireTenantId: false,
      };
  const toolContext: ToolContext = {
    attributes,
    channelId,
    createdBy,
    firestore: firestore as unknown as FirebaseFirestore.Firestore,
    tenantContext,
    t,
    onLog: (message) => {
      if (process.env.NODE_ENV === "development") {
        console.log("[AutonomousAgent Tool Log]:", message);
      }
    },
  };
  const { getAdminVertexLanguageModel } = await import(
    "@/lib/ai/vertex-language-model.server"
  );
  const model = await getAdminVertexLanguageModel(MODELS.GEMINI_FLASH_LATEST);
  const messages: ModelMessage[] = [{ role: "user", content: prompt }];
  const approvedMemory = await searchAgentMemoryStep({
    channelId,
    limit: 5,
    query: prompt,
    taskType: "autonomous",
    ...(tenantId ? { tenantId } : {}),
  });
  const approvedMemorySection = createApprovedAgentMemoryPromptSection(
    approvedMemory.memories,
  );
  const system = [
    getDefaultSystemPrompt(locale),
    "AUTONOMOUS FULL-ACCESS MODE:",
    "You may use every available tool needed to complete the user's request, including business data tools, durable task tools, web search, URL analysis, code execution, and maps.",
    "Prefer direct Konfi catalog/business data tools before external research.",
    "Do not ask for confirmation unless the requested action is destructive, irreversible, or cannot be completed safely from available evidence.",
    approvedMemorySection
      ? `${approvedMemorySection.title}:\n${formatMemoryPromptBody(approvedMemorySection.body)}`
      : undefined,
    fileMetadata.length > 0
      ? `Attached file metadata:\n${JSON.stringify(fileMetadata, null, 2)}`
      : undefined,
    "Finish with a concise summary of what you did, tool-created run IDs or task IDs, and any remaining blockers.",
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");

  const input = {
    messages,
    system,
  };
  const result = await runMeteredAdminAiText({
    channelId,
    input,
    model: MODELS.GEMINI_FLASH_LATEST,
    provider: "google-vertex",
    run: () =>
      generateText({
        model,
        ...input,
        tools: {
          searchAgentMemory: tool({
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
              customerId: z.string().optional(),
              productId: z.string().optional(),
              orderId: z.string().optional(),
              quoteId: z.string().optional(),
            }),
            execute: async ({
              customerId,
              limit,
              orderId,
              productId,
              query,
              quoteId,
            }) =>
              searchAgentMemoryStep({
                channelId,
                query,
                taskType: "autonomous",
                ...(limit ? { limit } : {}),
                ...(tenantId ? { tenantId } : {}),
                ...(customerId ? { customerId } : {}),
                ...(productId ? { productId } : {}),
                ...(orderId ? { orderId } : {}),
                ...(quoteId ? { quoteId } : {}),
              }),
          }),
          proposeAgentMemory: tool({
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
              type: z.enum(["preference", "instruction", "fact", "workflow"]),
              scope: z.enum([
                "tenant",
                "channel",
                "customer",
                "product",
                "order",
                "quote",
              ]),
              taskTypes: z
                .array(z.enum(["quote", "order", "product", "autonomous"]))
                .min(1)
                .max(4)
                .optional(),
              channelId: z.string().optional(),
              customerId: z.string().optional(),
              productId: z.string().optional(),
              orderId: z.string().optional(),
              quoteId: z.string().optional(),
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
                  runId,
                  taskType: "autonomous",
                },
                taskTypes: taskTypes ?? ["autonomous"],
                ...(tenantId ? { tenantId } : {}),
                type,
              }),
          }),
          ...createAssistantTools(toolContext),
        },
        stopWhen: isStepCount(20),
        temperature: 0,
        maxRetries: 2,
        maxOutputTokens: 8192,
      }),
    source: "durable-agent",
    userId: createdBy.id,
  });

  return {
    finishReason: result.finishReason,
    messages: result.response.messages,
    stepsCount: result.steps.length,
    text: result.text,
  };
}
