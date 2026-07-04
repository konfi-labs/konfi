import "server-only";

import {
  buildAgentHarnessSystemPrompt,
  createAgentFormInteraction,
  createAgentQuestionInteraction,
  DURABLE_AGENT_MAX_RETRIES,
  formatAgentStepLog,
  getAgentInteractionLabel,
} from "@/lib/ai/agent-harness";
import { Attribute, NestedMember } from "@konfi/types";
import { type ModelCallStreamPart, WorkflowAgent } from "@ai-sdk/workflow";
import { getWorkflowMetadata, getWritable } from "workflow";
import { z } from "zod";
import { createAgentFileMetadataPromptSection } from "./file-metadata";
import { userConfirmationHook } from "./hooks";
import { appendAgentMessageStep, searchAgentMemoryStep } from "./steps";
import type { AgentFileMetadata } from "./types";
import { createApprovedAgentMemoryPromptSection } from "@/lib/ai/agent-memory-prompt";
import { createDurableAgentMemoryTools } from "./memory-tools";
import {
  applyProductCreationCatalogSetupStep,
  buildProductCreationCatalogSetupConfirmationQuestion,
  buildProductCreationCatalogSetupPlan,
  formatProductDraftPricePreview,
  formatProductCreationCatalogSetupSummary,
  getProductCreationCatalogSetupPlanKey,
  getProductCreationCatalogStep,
  prepareProductCreationDraftStep,
  sanitizeProductCreationCatalogSetupPlan,
  verifyProductCreationDraftStep,
} from "./product-workflow.steps";
import type { ProductAgentData } from "./product-workflow.types";
import {
  createFatalAgentWorkflowError,
  getAgentWorkflowErrorMessage,
} from "./workflow-errors";
import { createWorkflowVertexLanguageModel } from "./workflow-vertex-model";

export interface ProductWorkflowInput {
  prompt: string;
  createdBy: NestedMember;
  channelId: string;
  tenantId?: string;
  fileMetadata?: AgentFileMetadata[];
  messages?: WorkflowModelMessage[];
}

export interface ProductWorkflowContext {
  channelId: string;
  attributes: Attribute[];
  tenantId?: string;
}

type WorkflowModelMessage = {
  role: "assistant" | "system" | "tool" | "user";
  content: unknown;
  [key: string]: unknown;
};
type DurableStepResult = Parameters<typeof formatAgentStepLog>[0];

function stopAfterStepCount(stepCount: number) {
  return ({ steps }: { steps: readonly unknown[] }) =>
    steps.length === stepCount;
}

function summarizeBlockedItems(data: ProductAgentData): string {
  if (data.blockedItems.length === 0) {
    return "No blocked items.";
  }

  return data.blockedItems
    .map(
      (item, index) =>
        `${index + 1}. [blocked] ${item.label}: ${item.reason} ${item.suggestedAction}`,
    )
    .join("\n");
}

function isCatalogSetupBlockedItemType(
  item: ProductAgentData["blockedItems"][number],
) {
  return (
    item.type === "attribute" ||
    item.type === "option" ||
    item.type === "productType"
  );
}

function getProductDraftReviewKey(data: ProductAgentData): string | null {
  if (!data.draft || !data.readyForCreate || data.blockedItems.length > 0) {
    return null;
  }

  return JSON.stringify({
    name: data.draft.product.name ?? null,
    pricePreview: data.pricePreview ?? null,
    priceType: data.draft.priceType,
  });
}

export async function createProductWorkflow(
  input: ProductWorkflowInput,
  workflowContext: ProductWorkflowContext,
) {
  "use workflow";

  void workflowContext;

  const { prompt, channelId, fileMetadata, messages = [] } = input;
  const tenantId = input.tenantId ?? workflowContext.tenantId;
  const { workflowRunId } = getWorkflowMetadata();
  const fileMetadataSection =
    createAgentFileMetadataPromptSection(fileMetadata);
  const approvedMemory = await searchAgentMemoryStep({
    channelId,
    limit: 5,
    query: prompt,
    taskType: "product",
    ...(tenantId ? { tenantId } : {}),
  });
  const approvedMemorySection = createApprovedAgentMemoryPromptSection(
    approvedMemory.memories,
  );
  const model = createWorkflowVertexLanguageModel("product");
  const writable = getWritable<ModelCallStreamPart>();
  let collectedData: ProductAgentData = {
    blockedItems: [],
    readyForCreate: false,
  };
  let pendingCatalogSetupPlan = collectedData.catalogSetupPlan;
  const appliedCatalogSetupPlanKeys = new Set<string>();
  const reviewedProductDraftKeys = new Set<string>();

  const agent = new WorkflowAgent({
    model,
    instructions: buildAgentHarnessSystemPrompt({
      role: "a durable Konfi Product Creation Agent that prepares complete product-creation drafts from messy product descriptions and price tables",
      workflow: [
        "Call inspectProductCreationCatalog to see existing categories, product types, attributes, and options.",
        "Use attached file metadata when product descriptions reference artwork filenames, page counts, sticker sizes, dimensions, or quantity-to-file relationships.",
        "Call prepareProductDraft with the full working request; include useful user clarifications from prior confirmations.",
        "If prepareProductDraft returns catalogSetupAvailable=true, call requestUserConfirmation with catalogSetupQuestion and a structured form interaction for the catalog setup plan.",
        "If the user confirms catalog setup, call applyCatalogSetup, inspect the catalog again, and prepare the draft again.",
        "If blocked items remain and catalogSetupAvailable=false, call requestUserConfirmation with a concise review in the user's language listing every blocked item and asking only for missing clarification.",
        "When no blocked items remain, show the user the product/pricing review once with requestUserConfirmation unless draftReviewAlreadyConfirmed=true.",
        "After the user confirms the product/pricing review, call finalizeProductDraft; this stores a reusable draft for opening in the product form and does not create the product.",
      ],
      rules: [
        "Low-risk reversible choices may be made without asking.",
        "If prepareProductDraft returns readyForCreate=true, blockedItems is empty, and draftReviewRequired=true, call requestUserConfirmation with draftReviewQuestion and pricePreview context instead of finalizing.",
        "If the user confirms the product/pricing review, call finalizeProductDraft immediately.",
        "If the user says the product or pricing looks wrong, call prepareProductDraft again with the original request plus the user's correction.",
        "If clarification is needed, include concrete visible details from pricePreview, catalogSetupSummary, or blocked items in the same question/context.",
        "When you need any user response, call requestUserConfirmation; prose-only questions cannot resume the workflow.",
        "When calling requestUserConfirmation, provide interaction labels and titles in the same language as the user conversation.",
        "After explicit user confirmation, you may automatically create missing attributes, attribute options, and product types by calling applyCatalogSetup.",
        "Do not ask the user to manually create attributes, options, or product types when catalogSetupAvailable=true; offer the automatic setup path instead.",
        "Do not offer the same automatic catalog setup again if catalogSetupAlreadyApplied=true and the draft is still blocked; ask for clarification instead.",
        "Do not create categories or the final product inside this workflow.",
        "Choose exactly one price type and keep it consistent with attributes, options, and prices.",
        "If source prices are additive per attribute or component, prefer DYNAMIC pricing and preserve those numbers in the draft.",
        "If source prices have already-total quantity tiers plus an order-level add-on, prefer DYNAMIC over MATRIX and convert order-level add-ons to per-unit conditional rules.",
        "For matrix pricing, ensure every price row has valid existing option values and a product type that contains the selected attributes.",
        "Only treat the product as pricing-blocked when the prompt cannot be expressed as explicit matrix rows or a dynamic pricing configuration.",
        "If a price cell is blank, ambiguous, or impossible, mark it blocked instead of inventing a value.",
        "Final output must be ready for product-form review or clearly blocked.",
      ],
      contextSections: [
        ...(approvedMemorySection ? [approvedMemorySection] : []),
        ...(fileMetadataSection ? [fileMetadataSection] : []),
      ],
      language: "Use the same language as the user conversation.",
    }),
    tools: {
      ...createDurableAgentMemoryTools({
        channelId,
        prompt,
        taskType: "product",
        ...(tenantId ? { tenantId } : {}),
        workflowRunId,
      }),

      inspectProductCreationCatalog: {
        description:
          "Load existing Konfi categories, product types, attributes, and options for this channel before preparing a product draft.",
        inputSchema: z.object({}),
        execute: async () => {
          const catalog = await getProductCreationCatalogStep({ channelId });

          return {
            attributeCount: catalog.attributes.length,
            attributes: catalog.attributes.map((attribute) => ({
              id: attribute.id,
              name: attribute.name,
              optionCount: attribute.options.length,
              options: attribute.options.map((option) => ({
                label: option.label,
                value: option.value,
              })),
            })),
            categories: catalog.categories,
            categoryCount: catalog.categories.length,
            productTypeCount: catalog.productTypes.length,
            productTypes: catalog.productTypes,
          };
        },
      },

      prepareProductDraft: {
        description:
          "Analyze the current working request, choose price type, match existing attributes/options/product type/category, and prepare reusable product form data. Call this after inspecting the catalog.",
        inputSchema: z.object({
          request: z
            .string()
            .describe(
              "The complete working product creation request, including follow-up clarifications when available.",
            ),
        }),
        execute: async ({ request }) => {
          const draft = await prepareProductCreationDraftStep({
            channelId,
            prompt: request,
          });
          const pricePreview = formatProductDraftPricePreview(draft);
          const nextCatalogSetupPlan = buildProductCreationCatalogSetupPlan({
            draft,
          });
          const catalogSetupPlanKey = nextCatalogSetupPlan
            ? getProductCreationCatalogSetupPlanKey(nextCatalogSetupPlan)
            : undefined;
          const catalogSetupAlreadyApplied = Boolean(
            catalogSetupPlanKey &&
            appliedCatalogSetupPlanKeys.has(catalogSetupPlanKey),
          );
          pendingCatalogSetupPlan =
            !catalogSetupAlreadyApplied && nextCatalogSetupPlan
              ? nextCatalogSetupPlan
              : undefined;
          collectedData = {
            blockedItems: draft.blockedItems,
            catalogSetupPlan: pendingCatalogSetupPlan ?? null,
            draft,
            pricePreview,
            readyForCreate: draft.readyForCreate,
          };
          const draftReviewKey = getProductDraftReviewKey(collectedData);
          const draftReviewAlreadyConfirmed = Boolean(
            draftReviewKey && reviewedProductDraftKeys.has(draftReviewKey),
          );
          const draftReviewRequired = Boolean(
            draftReviewKey && !draftReviewAlreadyConfirmed,
          );

          return {
            blockedItems: draft.blockedItems,
            blockedItemsSummary: summarizeBlockedItems(collectedData),
            catalogSetupAlreadyApplied,
            catalogSetupAvailable: Boolean(pendingCatalogSetupPlan),
            catalogSetupQuestion: pendingCatalogSetupPlan
              ? buildProductCreationCatalogSetupConfirmationQuestion(
                  pendingCatalogSetupPlan,
                )
              : null,
            catalogSetupSummary: pendingCatalogSetupPlan
              ? formatProductCreationCatalogSetupSummary(
                  pendingCatalogSetupPlan,
                )
              : null,
            missingAttributes: draft.missingAttributes,
            missingOptions: draft.missingOptions,
            priceCount: draft.product.prices?.length ?? 0,
            pricingDiagnostics: draft.pricingPreview?.diagnostics ?? [],
            pricePreview,
            priceType: draft.priceType,
            priceTypeReason: draft.priceTypeReason,
            productName: draft.product.name,
            draftReviewAlreadyConfirmed,
            draftReviewQuestion: draftReviewRequired
              ? "Review the product draft and calculated pricing preview. If it looks correct, confirm and I will save the draft for opening in the product form. If something looks wrong, describe the correction."
              : null,
            draftReviewRequired,
            readyForCreate: draft.readyForCreate,
            reviewSummary: draft.reviewSummary,
            selectedAttributes: draft.selectedAttributes,
            _nextStep: draftReviewRequired
              ? "Ask for product/pricing review confirmation using draftReviewQuestion and pricePreview as context."
              : draft.readyForCreate && draft.blockedItems.length === 0
                ? "The draft is reviewed and ready. Call finalizeProductDraft now."
                : pendingCatalogSetupPlan
                  ? "Ask for catalog setup confirmation using catalogSetupQuestion."
                  : "Ask only for the missing clarification described in blockedItemsSummary, including concrete pricePreview details if relevant.",
          };
        },
      },

      applyCatalogSetup: {
        description:
          "Create the confirmed missing attributes, attribute options, and product type for the current product draft. Call this only after the user explicitly confirms the proposed catalog setup.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!pendingCatalogSetupPlan) {
            return {
              success: false,
              error:
                "No pending catalog setup plan is available. Prepare the draft again before applying setup.",
            };
          }

          const appliedPlanKey = getProductCreationCatalogSetupPlanKey(
            pendingCatalogSetupPlan,
          );
          const result = await applyProductCreationCatalogSetupStep({
            createdBy: input.createdBy,
            plan: pendingCatalogSetupPlan,
          });
          appliedCatalogSetupPlanKeys.add(appliedPlanKey);
          pendingCatalogSetupPlan = undefined;
          collectedData = {
            ...collectedData,
            blockedItems: collectedData.blockedItems.filter(
              (item) => !isCatalogSetupBlockedItemType(item),
            ),
            catalogSetupPlan: null,
          };

          return {
            ...result,
            success: true,
          };
        },
      },

      requestUserConfirmation: {
        description:
          "Pause the workflow for reversible review or missing-data confirmation. Use this for blocked product drafts and clarification.",
        inputSchema: z.object({
          context: z.string().optional(),
          interaction: z
            .object({
              cancelLabel: z.string().optional(),
              confirmLabel: z.string().optional(),
              declineLabel: z.string().optional(),
              fieldDescription: z.string().optional(),
              fieldLabel: z.string().optional(),
              submitLabel: z.string().optional(),
              title: z.string().optional(),
            })
            .optional()
            .describe(
              "Short UI title, action labels, and field labels in the same language as the conversation.",
            ),
          question: z.string().describe("The question to ask the user."),
        }),
        execute: async (
          { question, context, interaction: interactionLabels },
          { toolCallId },
        ) => {
          const { workflowRunId } = getWorkflowMetadata();
          const interaction = pendingCatalogSetupPlan
            ? createAgentFormInteraction({
                body: context ? `${question}\n\n${context}` : question,
                cancelLabel: getAgentInteractionLabel(
                  interactionLabels,
                  "cancelLabel",
                  "Cancel",
                ),
                fields: [
                  {
                    description: getAgentInteractionLabel(
                      interactionLabels,
                      "fieldDescription",
                      "The plan will be validated before it is applied.",
                    ),
                    id: "catalogSetupPlan",
                    kind: "json",
                    label: getAgentInteractionLabel(
                      interactionLabels,
                      "fieldLabel",
                      "Catalog changes plan",
                    ),
                    required: true,
                    value: pendingCatalogSetupPlan,
                  },
                ],
                metadata: {
                  hookType: "userConfirmation",
                  reason: "catalogSetup",
                  workflow: "product",
                },
                submitLabel: getAgentInteractionLabel(
                  interactionLabels,
                  "submitLabel",
                  "Approve plan",
                ),
                title: getAgentInteractionLabel(
                  interactionLabels,
                  "title",
                  "Catalog setup",
                ),
              })
            : createAgentQuestionInteraction({
                confirmLabel: getAgentInteractionLabel(
                  interactionLabels,
                  "confirmLabel",
                  "Confirm",
                ),
                context,
                declineLabel: getAgentInteractionLabel(
                  interactionLabels,
                  "declineLabel",
                  "Reject",
                ),
                metadata: {
                  hookType: "userConfirmation",
                  workflow: "product",
                },
                question,
                title: getAgentInteractionLabel(
                  interactionLabels,
                  "title",
                  "Product clarification",
                ),
              });

          await appendAgentMessageStep({
            runId: workflowRunId,
            status: "awaiting-approval",
            pendingHookToken: toolCallId,
            pendingHookType: "userConfirmation",
            result: { collectedData },
            message: {
              role: "assistant",
              content: [
                { type: "text", text: question },
                {
                  type: "tool-call",
                  toolCallId,
                  toolName: "requestUserConfirmation",
                  args: context
                    ? { question, context, interaction }
                    : { question, interaction },
                },
              ],
            },
          });

          const hook = userConfirmationHook.create({ token: toolCallId });
          const response = await hook;

          if (response.catalogSetupPlan && pendingCatalogSetupPlan) {
            pendingCatalogSetupPlan = sanitizeProductCreationCatalogSetupPlan(
              response.catalogSetupPlan,
            );
            collectedData = {
              ...collectedData,
              catalogSetupPlan: pendingCatalogSetupPlan,
            };
          }

          const reviewKey = getProductDraftReviewKey(collectedData);
          if (!pendingCatalogSetupPlan && response.confirmed && reviewKey) {
            reviewedProductDraftKeys.add(reviewKey);
          }

          return {
            catalogSetupPlan: response.catalogSetupPlan,
            confirmed: response.confirmed,
            message: response.confirmed
              ? "The user confirmed. Recheck the data."
              : `The user did not confirm. Response: ${response.response ?? "No details"}`,
            userResponse: response.response,
          };
        },
      },

      finalizeProductDraft: {
        description:
          "Finalize and persist the product draft for user review. Call only when the draft has no blocked items.",
        inputSchema: z.object({
          message: z.string().describe("Final review summary for the user."),
        }),
        execute: async ({ message }) => {
          const { workflowRunId } = getWorkflowMetadata();

          if (!collectedData.draft) {
            return {
              success: false,
              error: "No product draft has been prepared yet.",
            };
          }

          const draft = collectedData.draft;
          const draftReviewKey = getProductDraftReviewKey(collectedData);
          if (
            !draftReviewKey ||
            !reviewedProductDraftKeys.has(draftReviewKey)
          ) {
            return {
              success: false,
              blockedItems: collectedData.blockedItems,
              error:
                "Product draft has not been confirmed by the user yet. Ask for product/pricing review confirmation before finalizing.",
              pricePreview: collectedData.pricePreview,
            };
          }
          const verification = await verifyProductCreationDraftStep({ draft });
          collectedData = {
            ...collectedData,
            blockedItems: verification.blockedItems,
            catalogSetupPlan: null,
            readyForCreate: verification.readyForCreate,
          };

          if (!verification.readyForCreate) {
            return {
              success: false,
              blockedItems: verification.blockedItems,
              error:
                "Product draft is still blocked. Ask for clarification or required setup before finalizing.",
            };
          }

          await appendAgentMessageStep({
            runId: workflowRunId,
            status: "completed",
            result: { collectedData },
            message: {
              role: "assistant",
              content: message,
            },
          });

          return {
            success: true,
            message,
            productName: draft.product.name,
            readyForCreate: true,
          };
        },
      },
    },
    temperature: 0.2,
    maxRetries: DURABLE_AGENT_MAX_RETRIES,
  });

  const initialMessages: WorkflowModelMessage[] = [
    ...messages,
    { role: "user" as const, content: prompt },
  ];

  const handleStepFinish = async (step: DurableStepResult) => {
    console.log(`[ProductWorkflow] Step finished: ${formatAgentStepLog(step)}`);
  };

  try {
    const result: Awaited<ReturnType<typeof agent.stream>> = await agent.stream(
      {
        messages: initialMessages as unknown as NonNullable<
          Parameters<typeof agent.stream>[0]["messages"]
        >,
        writable,
        stopWhen: stopAfterStepCount(24),
        onStepEnd: handleStepFinish,
        onEnd: async ({ steps }) => {
          console.log(`[ProductWorkflow] Completed with ${steps.length} steps`);
        },
      },
    );

    const { workflowRunId } = getWorkflowMetadata();

    await appendAgentMessageStep({
      runId: workflowRunId,
      status: "completed",
      result: { collectedData },
      messages: result.messages,
      stepsCount: result.steps.length,
      clearPendingHook: true,
    });

    return {
      messages: result.messages,
      collectedData,
      steps: result.steps.length,
    };
  } catch (error) {
    const { workflowRunId } = getWorkflowMetadata();
    const errorMessage = getAgentWorkflowErrorMessage(
      error,
      "Product workflow failed",
    );

    await appendAgentMessageStep({
      runId: workflowRunId,
      status: "failed",
      error: errorMessage,
      result: { collectedData },
      clearPendingHook: true,
      message: {
        role: "assistant",
        content: `Nie udało się ukończyć zadania: ${errorMessage}`,
      },
    });

    throw createFatalAgentWorkflowError(error, "Product workflow failed");
  }
}
