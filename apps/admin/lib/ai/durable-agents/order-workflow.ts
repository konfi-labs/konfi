import "server-only";

import {
  buildAgentHarnessSystemPrompt,
  createAgentFormInteraction,
  createAgentQuestionInteraction,
  DURABLE_AGENT_MAX_RETRIES,
  formatAgentStepLog,
  getAgentInteractionLabel,
} from "@/lib/ai/agent-harness";
import {
  NestedCustomer,
  NestedMember,
  PaymentType,
  ShippingOptions,
  Unit,
} from "@konfi/types";
import { type ModelCallStreamPart, WorkflowAgent } from "@ai-sdk/workflow";
import { getWorkflowMetadata, getWritable } from "workflow";
import { z } from "zod";
import { agentPaymentTypeValues } from "./constants";
import { createAgentFileMetadataPromptSection } from "./file-metadata";
import { userConfirmationHook } from "./hooks";
import {
  appendAgentMessageStep,
  calculateItemPriceStep,
  evaluateCustomerMatchStep,
  getCustomerByIdStep,
  getRecentCustomerOrderPreferencesStep,
  searchAgentMemoryStep,
  searchCustomersStep,
  searchProductsStep,
  validateQuoteDataStep,
} from "./steps";
import { createApprovedAgentMemoryPromptSection } from "@/lib/ai/agent-memory-prompt";
import type {
  AgentFileMetadata,
  AgentOrderItem,
  QuoteAgentData,
} from "./types";
import { createDurableAgentMemoryTools } from "./memory-tools";
import {
  createFatalAgentWorkflowError,
  getAgentWorkflowErrorMessage,
} from "./workflow-errors";
import { createWorkflowVertexLanguageModel } from "./workflow-vertex-model";

// NOTE: Firebase Admin SDK cannot be imported here - workflows run in a sandboxed
// environment that doesn't support CommonJS require(). All Firestore access
// happens in step functions which run outside the sandbox.

export interface OrderWorkflowInput {
  prompt: string;
  createdBy: NestedMember;
  channelId: string;
  tenantId?: string;
  fileMetadata?: AgentFileMetadata[];
  messages?: WorkflowModelMessage[];
}

export interface OrderWorkflowContext {
  channelId: string;
  tenantId?: string;
  attributes: import("@konfi/types").Attribute[];
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

/**
 * Durable workflow for creating orders with AI assistance.
 *
 * Similar to the quote workflow but targets order creation directly.
 * Steps:
 * 1. Search for and select a customer
 * 2. Find and configure products
 * 3. Calculate pricing
 * 4. Confirm with user before placing the order
 */
export async function createOrderWorkflow(
  input: OrderWorkflowInput,
  workflowContext: OrderWorkflowContext,
) {
  "use workflow";

  const {
    prompt,
    createdBy: _createdBy,
    channelId,
    fileMetadata,
    messages = [],
  } = input;
  const { attributes } = workflowContext;
  const tenantId = input.tenantId ?? workflowContext.tenantId;
  const { workflowRunId } = getWorkflowMetadata();
  const fileMetadataSection =
    createAgentFileMetadataPromptSection(fileMetadata);
  const approvedMemory = await searchAgentMemoryStep({
    channelId,
    limit: 5,
    query: prompt,
    taskType: "order",
    ...(tenantId ? { tenantId } : {}),
  });
  const approvedMemorySection = createApprovedAgentMemoryPromptSection(
    approvedMemory.memories,
  );
  const model = createWorkflowVertexLanguageModel("order");

  const writable = getWritable<ModelCallStreamPart>();

  let collectedData: QuoteAgentData = {};
  let latestCustomerCandidates: NestedCustomer[] = [];

  const agent = new WorkflowAgent({
    model,
    instructions: buildAgentHarnessSystemPrompt({
      role: "a helpful durable assistant that creates Konfi orders for customers",
      workflow: [
        "Search for the customer with searchCustomers.",
        "If the AI matching step returns a deterministic high-confidence auto-selection, proceed without user confirmation; otherwise call requestUserConfirmation before proceeding.",
        "Search for products with searchProducts/suggestOrderItems using the complete user request.",
        "Use attached file metadata when the user references artwork filenames, page counts, sticker sizes, dimensions, or quantity-to-file relationships.",
        "Configure each product with options and quantities.",
        "Calculate prices for each item when needed.",
        "If the user did not state delivery/pickup or payment preferences and a database customer is selected, call getRecentCustomerOrderPreferences after selecting the customer. If one previous order exists, you may reuse its payment and shipping values when the current request does not contradict them. If two previous orders agree, you may reuse the agreed values. If they differ or there is no history, ask whether the customer wants courier delivery, parcel locker/pickup point, or personal pickup.",
        "Set payment type with setPaymentType and delivery/pickup with setShippingOption before final confirmation when those values are available from user input or recent order history.",
        "Call requestUserConfirmation for final order confirmation, then validateAndCompleteOrder.",
      ],
      rules: [
        "Never ask a question in plain text and then stop; questions require a resumable tool call.",
        "When you need any confirmation or input from the user, call requestUserConfirmation.",
        "After finding a customer, call requestUserConfirmation unless the customer tool returned a validated high-confidence auto-selection.",
        "Do not invent payment or delivery preferences. Use explicit user input or getRecentCustomerOrderPreferences results; if history conflicts, ask the user through requestUserConfirmation.",
        "Before completing an order, show a concrete summary and wait for confirmation.",
        "When calling requestUserConfirmation, provide interaction labels and titles in the same language as the user conversation.",
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
        taskType: "order",
        ...(tenantId ? { tenantId } : {}),
        workflowRunId,
      }),

      searchCustomers: {
        description:
          "Search for customers by name, email, phone, or NIP. Uses AI matching to auto-select only when confidence is high. Otherwise call requestUserConfirmation before proceeding.",
        inputSchema: z.object({
          query: z
            .string()
            .describe("Search query - can be name, email, phone, or NIP"),
          limit: z
            .number()
            .optional()
            .default(10)
            .describe("Maximum results to return"),
        }),
        execute: async ({ query, limit }) => {
          const result = await searchCustomersStep({
            query,
            limit,
            ...(tenantId ? { tenantId } : {}),
          });

          const customers = result.customers ?? [];
          latestCustomerCandidates = customers;
          const matchResult = await evaluateCustomerMatchStep({
            query,
            customers,
          });
          const matchedCustomer = matchResult.selectedCustomerId
            ? (customers.find(
                (customer) => customer.id === matchResult.selectedCustomerId,
              ) ?? null)
            : null;
          const shouldAutoSelect = Boolean(
            matchedCustomer && matchResult.autoSelect,
          );

          if (shouldAutoSelect && matchedCustomer) {
            collectedData.customer = matchedCustomer;
            latestCustomerCandidates = [];
          }

          return {
            ...result,
            aiMatch: matchResult,
            autoSelectedCustomer:
              shouldAutoSelect && matchedCustomer
                ? {
                    customerId: matchedCustomer.id,
                    customerName: matchedCustomer.name,
                    confidence: matchResult.confidence,
                    reason: matchResult.rationale,
                  }
                : null,
            _nextStep: shouldAutoSelect
              ? "AI found a high-confidence customer match and auto-selected it. Proceed to product search without user confirmation."
              : "IMPORTANT: Now call requestUserConfirmation to confirm the customer before proceeding!",
          };
        },
      },

      getCustomerById: {
        description:
          "Get detailed information about a specific customer by their ID.",
        inputSchema: z.object({
          customerId: z.string().describe("The customer ID to look up"),
        }),
        execute: async ({ customerId }) => {
          const result = await getCustomerByIdStep({
            customerId,
            ...(tenantId ? { tenantId } : {}),
          });
          if (result.customer) {
            collectedData.customer = result.customer;
            latestCustomerCandidates = [];
          }
          return result;
        },
      },

      selectCustomer: {
        description: "Select a customer for the order from the search results.",
        inputSchema: z.object({
          customerId: z.string().describe("The customer ID to select"),
          customerName: z
            .string()
            .describe("The customer name for confirmation"),
        }),
        execute: async ({ customerId, customerName }) => {
          const result = await getCustomerByIdStep({
            customerId,
            ...(tenantId ? { tenantId } : {}),
          });
          if (result.customer) {
            collectedData.customer = result.customer;
            latestCustomerCandidates = [];
            return {
              success: true,
              message: `Selected customer: ${customerName}`,
              customer: result.customer,
            };
          }
          return { success: false, error: "Failed to select customer" };
        },
      },

      getRecentCustomerOrderPreferences: {
        description:
          "Look up the selected customer's newest one or two active orders in this channel to infer payment type and delivery/pickup preferences when the user did not state them. Use this only after selecting a database customer. If one previous order exists, its values can be reused when not contradicted. If two exist and conflict, ask the user instead of guessing.",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(2)
            .optional()
            .default(2)
            .describe("How many recent orders to inspect. Use 2 by default."),
        }),
        execute: async ({ limit }) => {
          if (
            !collectedData.customer ||
            typeof collectedData.customer === "string"
          ) {
            return {
              success: false,
              error:
                "Select a database customer before looking up previous orders.",
            };
          }

          const result = await getRecentCustomerOrderPreferencesStep({
            channelId,
            customerId: collectedData.customer.id,
            limit,
            ...(tenantId ? { tenantId } : {}),
          });

          return {
            ...result,
            _nextStep:
              result.orders.length === 0
                ? "No previous orders were found. Ask the user whether they prefer courier delivery, parcel locker/pickup point, or personal pickup, and which payment type to use."
                : "Review the recent orders. If only one order exists, you may reuse its paymentType and shippingOption when the current request does not contradict them. If two orders agree, you may reuse the agreed value. If they differ, ask the user which payment and delivery/pickup method to use.",
          };
        },
      },

      suggestOrderItems: {
        description:
          "Analyze the user's product request and suggest pre-configured order items with pricing. Pass the COMPLETE user request including ALL product details. IMPORTANT: Items returned by this tool are automatically added to the order — do NOT call addItemToOrder for the same products afterwards, as that will create duplicates.",
        inputSchema: z.object({
          request: z
            .string()
            .describe(
              "The COMPLETE user request with all product details including names, quantities, sizes, paper types, finishes, colors, etc.",
            ),
        }),
        execute: async ({ request }) => {
          const result = await searchProductsStep(
            { query: request },
            { channelId, attributes, ...(tenantId ? { tenantId } : {}) },
          );

          if (result.products && result.products.length > 0) {
            const newItems: AgentOrderItem[] = result.products.map(
              (product) => ({
                id: product.id,
                productId: product.product?.id ?? "",
                productName: product.product?.name ?? "",
                description: product.description ?? "",
                combination: product.combination
                  ? { value: product.combination }
                  : undefined,
                calculatedCombination:
                  product.calculatedCombination ?? undefined,
                customFormat: product.customFormat ?? false,
                quantity: product.quantity ?? 1,
                volume: product.volume,
                width: product.width,
                height: product.height,
                totalPrice: product.totalPrice ?? 0,
                customPrice: product.customPrice ?? null,
                discount: product.discount ?? {
                  type: "PERCENTAGE",
                  discountValue: 0,
                  discountedAmount: 0,
                  code: null,
                },
                unit: product.unit ?? Unit.PCS,
                customSizes: product.customSizes,
              }),
            );

            if (!collectedData.items) {
              collectedData.items = [];
            }
            collectedData.items.push(...newItems);
          }

          return {
            ...result,
            _nextStep:
              result.products && result.products.length > 0
                ? "Products found and automatically added to the order. IMPORTANT: Do NOT call addItemToOrder for these items - they are already in the order. Review the items with the user, then call requestUserConfirmation to get final order confirmation."
                : "No products found. Ask the user for more details about what they need.",
          };
        },
      },

      addItemToOrder: {
        description:
          "Manually add a product item to the order with quantity and configuration. Only use this for items NOT already added by suggestOrderItems. Using both tools for the same product will create duplicates.",
        inputSchema: z.object({
          productId: z.string().describe("The product ID to add"),
          productName: z.string().describe("The product name"),
          quantity: z.number().min(1).describe("Quantity to add"),
          width: z.number().optional().describe("Width in mm (if applicable)"),
          height: z
            .number()
            .optional()
            .describe("Height in mm (if applicable)"),
          combination: z
            .record(z.string(), z.string())
            .optional()
            .describe("Attribute combination"),
        }),
        execute: async ({
          productId,
          productName,
          quantity,
          width,
          height,
          combination,
        }) => {
          const item: AgentOrderItem = {
            id: `item-${Date.now()}`,
            productId,
            productName,
            description: productName,
            combination: combination ?? undefined,
            customFormat: false,
            quantity,
            width: width ?? undefined,
            height: height ?? undefined,
            totalPrice: 0,
            customPrice: null,
            discount: {
              type: "PERCENTAGE",
              discountValue: 0,
              discountedAmount: 0,
              code: null,
            },
            unit: Unit.PCS,
          };

          const priceResult = await calculateItemPriceStep(
            { item },
            { channelId },
          );
          if (priceResult.price) {
            item.totalPrice = priceResult.price;
          }

          if (!collectedData.items) {
            collectedData.items = [];
          }
          collectedData.items.push(item);

          return {
            success: true,
            message: `Added ${quantity}x ${productName} to order`,
            item,
            totalItems: collectedData.items.length,
          };
        },
      },

      removeItemFromOrder: {
        description: "Remove an item from the order by its index.",
        inputSchema: z.object({
          index: z.number().describe("Index of the item to remove (0-based)"),
        }),
        execute: async ({ index }) => {
          if (!collectedData.items || index >= collectedData.items.length) {
            return { success: false, error: "Invalid item index" };
          }
          const removed = collectedData.items.splice(index, 1)[0];
          return {
            success: true,
            message: `Removed ${removed.productName} from order`,
            remainingItems: collectedData.items.length,
          };
        },
      },

      setShippingOption: {
        description: "Set the shipping option for the order.",
        inputSchema: z.object({
          option: z
            .enum([
              "PERSONAL_COLLECTION",
              "DHL",
              "INPOST",
              "COMPANY_COURIER",
              "CUSTOM",
            ])
            .describe("Shipping option"),
        }),
        execute: async ({ option }) => {
          collectedData.shippingOption = option as ShippingOptions;
          return { success: true, message: `Shipping set to: ${option}` };
        },
      },

      setPaymentType: {
        description:
          "Set the payment type for the order from explicit user input or recent order history.",
        inputSchema: z.object({
          paymentType: z.enum(agentPaymentTypeValues),
        }),
        execute: async ({ paymentType }) => {
          collectedData.paymentType = paymentType as PaymentType;
          return {
            success: true,
            message: `Payment type set to: ${paymentType}`,
          };
        },
      },

      setSpecialNotes: {
        description: "Add special notes or comments to the order.",
        inputSchema: z.object({
          notes: z.string().describe("Special notes for the order"),
        }),
        execute: async ({ notes }) => {
          collectedData.specialNotes = notes;
          return { success: true, message: "Special notes added" };
        },
      },

      getOrderSummary: {
        description:
          "Get a summary of the current order data collected so far.",
        inputSchema: z.object({}),
        execute: async () => {
          const totalPrice =
            collectedData.items?.reduce(
              (sum, item) => sum + (item.totalPrice ?? 0),
              0,
            ) ?? 0;
          return {
            customer: collectedData.customer
              ? typeof collectedData.customer === "string"
                ? collectedData.customer
                : collectedData.customer.name
              : null,
            contact: collectedData.contact,
            itemCount: collectedData.items?.length ?? 0,
            items: collectedData.items?.map((item) => ({
              name: item.productName,
              quantity: item.quantity,
              price: item.totalPrice,
            })),
            shippingOption: collectedData.shippingOption,
            paymentType: collectedData.paymentType,
            specialNotes: collectedData.specialNotes,
            totalPrice,
          };
        },
      },

      requestUserConfirmation: {
        description:
          "Call this tool whenever you need ANY confirmation or input from the user. This PAUSES the workflow and waits for user response.",
        inputSchema: z.object({
          question: z.string().describe("The question to ask the user."),
          context: z
            .string()
            .optional()
            .describe("Additional context about what is being confirmed"),
          interaction: z
            .object({
              cancelLabel: z.string().optional(),
              confirmLabel: z.string().optional(),
              declineLabel: z.string().optional(),
              fieldLabel: z.string().optional(),
              submitLabel: z.string().optional(),
              title: z.string().optional(),
            })
            .optional()
            .describe(
              "Short UI title, action labels, and field labels in the same language as the conversation.",
            ),
        }),
        execute: async (
          { question, context, interaction: interactionLabels },
          { toolCallId },
        ) => {
          const { workflowRunId } = getWorkflowMetadata();
          const customerSelectionOptions = latestCustomerCandidates
            .slice(0, 10)
            .map((customer, index) => ({
              description: [
                customer.personName && customer.personName !== customer.name
                  ? customer.personName
                  : undefined,
                customer.email,
                customer.nip ? `NIP: ${customer.nip}` : undefined,
                customer.b2b ? "B2B" : undefined,
              ]
                .filter((value): value is string => Boolean(value))
                .join(" • "),
              label: `${index + 1}. ${
                customer.name ||
                customer.personName ||
                customer.email ||
                customer.id
              }`,
              value: customer.id,
            }));
          const shouldShowCustomerSelection = Boolean(
            !collectedData.customer && customerSelectionOptions.length > 0,
          );
          const interactionMetadata = {
            hookType: "userConfirmation",
            workflow: "order",
            ...(shouldShowCustomerSelection
              ? { candidateCount: customerSelectionOptions.length }
              : {}),
          };
          const interactionBody = context
            ? `${question}\n\n${context}`
            : question;
          const interaction = shouldShowCustomerSelection
            ? createAgentFormInteraction({
                body: interactionBody,
                cancelLabel: getAgentInteractionLabel(
                  interactionLabels,
                  "cancelLabel",
                  "Skip",
                ),
                fields: [
                  {
                    id: "customerId",
                    kind: "select",
                    label: getAgentInteractionLabel(
                      interactionLabels,
                      "fieldLabel",
                      "Customer",
                    ),
                    options: customerSelectionOptions,
                    required: true,
                  },
                ],
                metadata: interactionMetadata,
                submitLabel: getAgentInteractionLabel(
                  interactionLabels,
                  "submitLabel",
                  "Select customer",
                ),
                title: getAgentInteractionLabel(
                  interactionLabels,
                  "title",
                  "Customer selection",
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
                metadata: interactionMetadata,
                question,
                title: getAgentInteractionLabel(
                  interactionLabels,
                  "title",
                  "Order confirmation",
                ),
              });

          await appendAgentMessageStep({
            runId: workflowRunId,
            status: "awaiting-approval",
            pendingHookToken: toolCallId,
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

          return {
            confirmed: response.confirmed,
            userResponse: response.response,
            message: response.confirmed
              ? "The user confirmed. Continue."
              : `The user did not confirm. Response: ${response.response ?? "No additional details"}`,
          };
        },
      },

      validateAndCompleteOrder: {
        description:
          "Validate the order data and mark it as ready for processing. Call this after the user confirms the order.",
        inputSchema: z.object({
          message: z
            .string()
            .describe("Summary message confirming the order details"),
        }),
        execute: async ({ message }) => {
          const { workflowRunId } = getWorkflowMetadata();

          const validation = await validateQuoteDataStep({
            customer: collectedData.customer,
            items: collectedData.items,
            shippingOption: collectedData.shippingOption,
          });

          if (!validation.valid) {
            return {
              success: false,
              error: "Order data is incomplete",
              validationErrors: validation.errors,
            };
          }

          const totalPrice =
            collectedData.items?.reduce(
              (sum, item) => sum + (item.totalPrice ?? 0),
              0,
            ) ?? 0;
          collectedData.totalPrice = totalPrice;

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
            message: "Order created successfully",
            orderData: collectedData,
          };
        },
      },
    },
    temperature: 0.7,
    maxRetries: DURABLE_AGENT_MAX_RETRIES,
  });

  const initialMessages: WorkflowModelMessage[] = [
    ...messages,
    { role: "user" as const, content: prompt },
  ];

  const handleStepFinish = async (step: DurableStepResult) => {
    console.log(`[OrderWorkflow] Step finished: ${formatAgentStepLog(step)}`);
  };

  try {
    const result: Awaited<ReturnType<typeof agent.stream>> = await agent.stream(
      {
        messages: initialMessages as unknown as NonNullable<
          Parameters<typeof agent.stream>[0]["messages"]
        >,
        writable,
        stopWhen: stopAfterStepCount(20),
        onStepEnd: handleStepFinish,
        onEnd: async ({ steps }) => {
          console.log(`[OrderWorkflow] Completed with ${steps.length} steps`);
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
      "Order workflow failed",
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

    throw createFatalAgentWorkflowError(error, "Order workflow failed");
  }
}
