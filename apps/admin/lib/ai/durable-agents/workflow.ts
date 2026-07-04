import "server-only";

import {
  buildAgentHarnessSystemPrompt,
  createAgentApprovalInteraction,
  createAgentFormInteraction,
  createAgentQuestionInteraction,
  DURABLE_AGENT_MAX_RETRIES,
  formatAgentStepLog,
  getAgentInteractionLabel,
} from "@/lib/ai/agent-harness";
import {
  Attribute,
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
import { quoteApprovalHook, userConfirmationHook } from "./hooks";
import {
  appendAgentMessageStep,
  calculateItemPriceStep,
  evaluateCustomerMatchStep,
  getCustomerByIdStep,
  getExpressProcessingSettingsStep,
  getProductDetailsStep,
  getRecentCustomerOrderPreferencesStep,
  searchAgentMemoryStep,
  searchCustomersStep,
  searchProductsStep,
  validateQuoteDataStep,
} from "./steps";
import { createApprovedAgentMemoryPromptSection } from "@/lib/ai/agent-memory-prompt";
import { createDurableAgentMemoryTools } from "./memory-tools";
import type {
  AgentFileMetadata,
  AgentOrderItem,
  QuoteAgentData,
} from "./types";
import {
  createFatalAgentWorkflowError,
  getAgentWorkflowErrorMessage,
} from "./workflow-errors";
import { createWorkflowVertexLanguageModel } from "./workflow-vertex-model";

// NOTE: Firebase Admin SDK cannot be imported here - workflows run in a sandboxed
// environment that doesn't support CommonJS require(). All Firestore access
// happens in step functions which run outside the sandbox.

export interface QuoteWorkflowInput {
  prompt: string;
  createdBy: NestedMember;
  channelId: string;
  tenantId?: string;
  fileMetadata?: AgentFileMetadata[];
  messages?: WorkflowModelMessage[];
}

export interface QuoteWorkflowContext {
  channelId: string;
  tenantId?: string;
  attributes: Attribute[];
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
 * Durable workflow for creating quotes with AI assistance.
 *
 * This workflow:
 * 1. Searches for and selects customers
 * 2. Finds and configures products
 * 3. Calculates pricing
 * 4. Waits for human approval
 * 5. Creates the quote upon approval
 */
export async function createQuoteWorkflow(
  input: QuoteWorkflowInput,
  workflowContext: QuoteWorkflowContext,
) {
  "use workflow";

  const { prompt, channelId, fileMetadata, messages = [] } = input;
  const { attributes } = workflowContext;
  const tenantId = input.tenantId ?? workflowContext.tenantId;
  const { workflowRunId } = getWorkflowMetadata();
  const fileMetadataSection =
    createAgentFileMetadataPromptSection(fileMetadata);
  const approvedMemory = await searchAgentMemoryStep({
    channelId,
    limit: 5,
    query: prompt,
    taskType: "quote",
    ...(tenantId ? { tenantId } : {}),
  });
  const approvedMemorySection = createApprovedAgentMemoryPromptSection(
    approvedMemory.memories,
  );
  const model = createWorkflowVertexLanguageModel("quote");

  // NOTE: Firestore access happens inside step functions (which run outside the sandbox)
  const writable = getWritable<ModelCallStreamPart>();

  // Collected data for the quote
  let collectedData: QuoteAgentData = {};
  let latestCustomerCandidates: NestedCustomer[] = [];

  const suggestQuoteOrderItems = async (request: string) => {
    const result = await searchProductsStep(
      { query: request },
      { channelId, attributes, ...(tenantId ? { tenantId } : {}) },
    );
    const hasProducts = Boolean(result.products?.length);

    // If products were found, automatically add them to collectedData.items.
    if (hasProducts && result.products) {
      const newItems: AgentOrderItem[] = result.products.map((product) => ({
        id: product.id,
        productId: product.product?.id ?? "",
        productName: product.product?.name ?? "",
        description: product.description ?? "",
        combination: product.combination
          ? { value: product.combination }
          : undefined,
        calculatedCombination: product.calculatedCombination ?? undefined,
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
        expressPercent: product.expressPercent,
      }));

      if (!collectedData.items) {
        collectedData.items = [];
      }

      collectedData.items.push(...newItems);
    }

    return {
      ...result,
      _nextStep: hasProducts
        ? "Products found and automatically added to the quote. IMPORTANT: Do NOT call addItemToQuote for these items - they are already in the quote. If the original request mentioned urgency, express processing, or a deadline (for example 'na jutro' or 'do godziny 18'), call getExpressProcessingSettings and applyExpressProcessing before requestQuoteApproval. Otherwise review the items with the user, then proceed to requestQuoteApproval when ready, or call requestUserConfirmation if you need to verify anything with the user."
        : "No safe Konfi catalog product was selected for this request. Ask the user to clarify the catalog product/configuration or provide supplier pricing evidence before continuing.",
    };
  };

  const agent = new WorkflowAgent({
    // Use step function to get Vertex model (runs outside sandbox with Node.js access)
    model,
    instructions: buildAgentHarnessSystemPrompt({
      role: "a helpful durable assistant that creates quotes for Konfi customers",
      workflow: [
        "Search for the customer with searchCustomers.",
        "If the AI matching step returns a deterministic high-confidence auto-selection, proceed without user confirmation; otherwise call requestUserConfirmation before proceeding.",
        "If searchCustomers finds NO results at all, call setCustomerName with the customer name from the user's request — do NOT try to create a new customer.",
        "Call suggestOrderItems exactly once with the complete product request after the customer is selected or recorded.",
        "Prefer Konfi catalog products. If product tools cannot find a suitable Konfi product match, ask the user for supplier pricing evidence or clearer catalog/product details.",
        "Use attached file metadata when the user references artwork filenames, page counts, sticker sizes, dimensions, or quantity-to-file relationships.",
        "Configure each product with options, quantities, and dimensions from the full user request.",
        "Calculate prices for each item when needed.",
        "If the request mentions urgency, express processing, or a deadline (for example 'na jutro' or 'do godziny 18'), call getExpressProcessingSettings and then applyExpressProcessing before final approval.",
        "If the user did not state delivery/pickup or payment preferences and a database customer is selected, call getRecentCustomerOrderPreferences after selecting the customer. If one previous order exists, you may reuse its payment and shipping values when the current request does not contradict them. If two previous orders agree, you may reuse the agreed values. If they differ or there is no history, ask whether the customer wants courier delivery, parcel locker/pickup point, or personal pickup.",
        "Call setShippingOption after all items are configured. Prefer the user's explicit delivery/pickup choice; otherwise use recent order history when available.",
        "Call requestQuoteApproval for final human approval once data is complete.",
      ],
      rules: [
        "Never ask a question in plain text and then stop; questions require a resumable tool call.",
        "When you need any confirmation or input from the user, call requestUserConfirmation.",
        "After finding a customer, call requestUserConfirmation unless the customer tool returned a validated high-confidence auto-selection.",
        "After finding products, call requestUserConfirmation only when clarification is needed before safe progress.",
        "Do not invent quote items when no suitable catalog product is found. Ask the user for supplier pricing evidence or clearer catalog/product details before final quote approval.",
        "For final quote approval, call requestQuoteApproval instead of plain text.",
        "When calling requestUserConfirmation or requestQuoteApproval, provide interaction labels and titles in the same language as the user conversation.",
        "If no customer exists in the database, use setCustomerName to record the name as a plain string — the quote does not require a database customer record.",
        "Do not invent express percentages. When express or deadline handling is needed, first retrieve the configured express percentage with getExpressProcessingSettings, then pass that returned percentage to applyExpressProcessing.",
        "Do not invent payment or delivery preferences. Use explicit user input or getRecentCustomerOrderPreferences results; if history conflicts, ask the user through requestUserConfirmation.",
        "Only call setSpecialNotes for explicit printing or production instructions (e.g., artwork file requirements, special finishing, custom color instructions). Do NOT add urgency, deadlines, delivery date/time requirements (e.g., 'need it by tomorrow at 6pm'), or general turnaround expectations as special notes — these cannot be stored in the quote system.",
      ],
      contextSections: [
        ...(approvedMemorySection ? [approvedMemorySection] : []),
        ...(fileMetadataSection ? [fileMetadataSection] : []),
        {
          title: "Example flow",
          body: `1. User: "Stwórz ofertę dla Cubana na 100 wizytówek"
2. Call searchCustomers with query "Cubana".
3. If the AI match is validated as high confidence, proceed. Otherwise call requestUserConfirmation with a concrete customer confirmation question.
4. After the workflow resumes, call suggestOrderItems with the complete original request and continue.`,
        },
      ],
      language: "Use the same language as the user conversation.",
    }),
    tools: {
      ...createDurableAgentMemoryTools({
        channelId,
        prompt,
        taskType: "quote",
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
              : customers.length === 0
                ? "No customers found in the database. Call setCustomerName with the customer name from the user's request, then proceed to product search."
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
        description: "Select a customer for the quote from the search results.",
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

      setCustomerName: {
        description:
          "Set the customer for this quote as a plain name string. Use this when searchCustomers finds no matching customer — the quote can proceed with just a name. Do NOT use this if a matching customer was found; use selectCustomer instead.",
        inputSchema: z.object({
          name: z
            .string()
            .describe(
              "The customer name to use for the quote (free-form string, no database record required)",
            ),
        }),
        execute: async ({ name }) => {
          collectedData.customer = name;
          latestCustomerCandidates = [];
          return {
            success: true,
            message: `Customer name set to: ${name}`,
            customerName: name,
            _nextStep:
              "Customer name recorded as a plain string. Proceed to product search.",
          };
        },
      },

      setContactInfo: {
        description: "Set or update the contact information for the quote.",
        inputSchema: z.object({
          name: z.string().describe("Contact person name"),
          email: z.string().optional().describe("Contact email"),
          phone: z.string().optional().describe("Contact phone"),
        }),
        execute: async ({ name, email, phone }) => {
          collectedData.contact = {
            name,
            email: email ?? "",
            phone: phone ?? "",
            active: true,
          };
          return {
            success: true,
            message: `Contact set: ${name}`,
            contact: collectedData.contact,
          };
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
                ? "No previous orders were found. Ask the user whether they prefer courier delivery, parcel locker/pickup point, or personal pickup."
                : "Review the recent orders. If only one order exists, you may reuse its paymentType and shippingOption when the current request does not contradict them. If two orders agree, you may reuse the agreed value. If they differ, ask the user which payment and delivery/pickup method to use.",
          };
        },
      },

      searchProducts: {
        description:
          "Alias for suggestOrderItems. Use this to search Konfi products and return safe catalog matches.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "The COMPLETE user request with all product details. Include everything: product names, quantities, sizes, paper types, finishes, colors, and any other specifications mentioned by the user.",
            ),
        }),
        execute: async ({ query }) => {
          return suggestQuoteOrderItems(query);
        },
      },

      suggestOrderItems: {
        description:
          "Analyze the user's product request and suggest pre-configured order items with pricing. Pass the COMPLETE user request including ALL product details (names, sizes, quantities, paper types, finishes, etc.). The AI will parse this and return configured items ready for the quote. Call this ONCE with the full request, not separately for each product. IMPORTANT: Items returned by this tool are automatically added to the quote — do NOT call addItemToQuote for the same products afterwards, as that will create duplicates. This tool does not apply express/deadline markup; when the request includes urgency or a deadline, call getExpressProcessingSettings and applyExpressProcessing after items are added.",
        inputSchema: z.object({
          request: z
            .string()
            .describe(
              "The COMPLETE user request with all product details. Include everything: product names, quantities, sizes (dimensions), paper types, finishes, colors, and any other specifications mentioned by the user.",
            ),
        }),
        execute: async ({ request }) => {
          return suggestQuoteOrderItems(request);
        },
      },

      getProductDetails: {
        description:
          "Get detailed information about a specific product including pricing.",
        inputSchema: z.object({
          productId: z.string().describe("The product ID to look up"),
        }),
        execute: async ({ productId }) => {
          return getProductDetailsStep({ productId }, { channelId });
        },
      },

      addItemToQuote: {
        description:
          "Manually add a product item to the quote with quantity and configuration. Only use this for items NOT already added by suggestOrderItems. Using both tools for the same product will create duplicates.",
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

          // Calculate price
          const priceResult = await calculateItemPriceStep(
            { item },
            { channelId },
          );

          if (priceResult.price) {
            item.totalPrice = priceResult.price;
          }

          // Add to items array
          if (!collectedData.items) {
            collectedData.items = [];
          }
          collectedData.items.push(item);

          return {
            success: true,
            message: `Added ${quantity}x ${productName} to quote`,
            item,
            totalItems: collectedData.items.length,
          };
        },
      },

      removeItemFromQuote: {
        description: "Remove an item from the quote by its index.",
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
            message: `Removed ${removed.productName} from quote`,
            remainingItems: collectedData.items.length,
          };
        },
      },

      getExpressProcessingSettings: {
        description:
          "Retrieve the configured express processing settings for this channel. Call this when the customer asks for urgent/express/next-day/same-day production or gives a deadline such as 'na jutro' or 'do godziny 18'. If enabled, use the returned percent with applyExpressProcessing.",
        inputSchema: z.object({}),
        execute: async () => {
          const settings = await getExpressProcessingSettingsStep({
            channelId,
          });

          if (!settings) {
            return {
              success: false,
              enabled: false,
              message:
                "Express processing is not configured or is disabled for this channel.",
            };
          }

          return {
            success: true,
            enabled: true,
            percent: settings.percent,
            message: `Express processing is enabled with ${settings.percent}% markup.`,
          };
        },
      },

      applyExpressProcessing: {
        description:
          "Apply express processing to quote items using the percent returned by getExpressProcessingSettings, then recalculate item prices. Use this after retrieving express settings when the customer requested urgent/express/deadline-based production.",
        inputSchema: z.object({
          percent: z
            .number()
            .min(0)
            .max(100)
            .describe(
              "Express markup percentage returned by getExpressProcessingSettings.",
            ),
          itemIndexes: z
            .array(z.number().int().min(0))
            .optional()
            .describe(
              "Optional zero-based item indexes. Omit to apply express processing to all quote items.",
            ),
        }),
        execute: async ({ percent, itemIndexes }) => {
          const items = collectedData.items;
          if (!items || items.length === 0) {
            return {
              success: false,
              error: "No quote items available for express processing.",
            };
          }

          const requestedIndexes = Array.isArray(itemIndexes)
            ? itemIndexes.filter(
                (index): index is number =>
                  typeof index === "number" &&
                  Number.isInteger(index) &&
                  index >= 0,
              )
            : [];
          const targetIndexes =
            requestedIndexes.length > 0
              ? Array.from(new Set(requestedIndexes))
              : items.map((_, index) => index);
          const invalidIndex = targetIndexes.find(
            (index) => index >= items.length,
          );
          if (invalidIndex !== undefined) {
            return {
              success: false,
              error: `Invalid item index: ${invalidIndex}`,
            };
          }

          const recalculatedItems: {
            index: number;
            item: AgentOrderItem;
            price: number;
          }[] = [];

          for (const index of targetIndexes) {
            const item = items[index];
            const itemWithExpress: AgentOrderItem = {
              ...item,
              expressPercent: percent,
            };
            const priceResult = await calculateItemPriceStep(
              { item: itemWithExpress },
              { channelId },
            );

            if (priceResult.error) {
              return {
                success: false,
                error: priceResult.error,
                itemIndex: index,
              };
            }

            recalculatedItems.push({
              index,
              item: itemWithExpress,
              price: priceResult.price,
            });
          }

          for (const { index, item, price } of recalculatedItems) {
            items[index] = {
              ...item,
              totalPrice: price,
            };
          }

          return {
            success: true,
            percent,
            updatedItems: recalculatedItems.map(({ index, price }) => ({
              index,
              price,
            })),
            message: `Applied ${percent}% express processing to ${recalculatedItems.length} item(s).`,
          };
        },
      },

      setShippingOption: {
        description: "Set the shipping option for the quote.",
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
          return {
            success: true,
            message: `Shipping set to: ${option}`,
          };
        },
      },

      setPaymentType: {
        description:
          "Set the payment type suggested by explicit user input or recent order history. Quotes do not require payment type, but storing it helps when the quote is opened as an order draft.",
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
        description: "Add special notes or comments to the quote.",
        inputSchema: z.object({
          notes: z.string().describe("Special notes for the quote"),
        }),
        execute: async ({ notes }) => {
          collectedData.specialNotes = notes;
          return {
            success: true,
            message: "Special notes added",
          };
        },
      },

      getQuoteSummary: {
        description:
          "Get a summary of the current quote data collected so far.",
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
          "Call this tool whenever you need ANY confirmation or input from the user. This PAUSES the workflow and waits for user response. Use this after finding a customer unless the AI matching step auto-selected with high confidence. Do NOT ask questions in text - they won't be answered!",
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
            workflow: "quote",
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
                  "Confirmation",
                ),
              });

          // Persist the assistant question + tool call so UI can show it while paused
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

          // Create confirmation hook - workflow pauses here until user responds
          const hook = userConfirmationHook.create({ token: toolCallId });

          // Wait for user response
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

      requestQuoteApproval: {
        description:
          "Request human approval for the quote. Call this when all data is collected and validated.",
        inputSchema: z.object({
          message: z
            .string()
            .describe("Summary message for the approval request"),
          interaction: z
            .object({
              approveLabel: z.string().optional(),
              rejectLabel: z.string().optional(),
              title: z.string().optional(),
            })
            .optional()
            .describe(
              "Short approval title and action labels in the same language as the conversation.",
            ),
        }),
        execute: async (
          { message, interaction: interactionLabels },
          { toolCallId },
        ) => {
          const { workflowRunId } = getWorkflowMetadata();

          // Validate the data first
          const validation = await validateQuoteDataStep({
            customer: collectedData.customer,
            items: collectedData.items,
            shippingOption: collectedData.shippingOption,
          });

          if (!validation.valid) {
            return {
              success: false,
              error: "Quote data is incomplete",
              validationErrors: validation.errors,
            };
          }

          // Calculate total price
          const totalPrice =
            collectedData.items?.reduce(
              (sum, item) => sum + (item.totalPrice ?? 0),
              0,
            ) ?? 0;
          collectedData.totalPrice = totalPrice;

          // Quote summary for UI display
          const quoteSummary = {
            customer: collectedData.customer,
            contact: collectedData.contact,
            items: collectedData.items,
            shippingOption: collectedData.shippingOption,
            paymentType: collectedData.paymentType,
            specialNotes: collectedData.specialNotes,
            totalPrice,
          };
          const interaction = createAgentApprovalInteraction({
            approveLabel: getAgentInteractionLabel(
              interactionLabels,
              "approveLabel",
              "Approve",
            ),
            body: message,
            metadata: {
              hookType: "quoteApproval",
              quoteSummary,
              workflow: "quote",
            },
            rejectLabel: getAgentInteractionLabel(
              interactionLabels,
              "rejectLabel",
              "Reject",
            ),
            title: getAgentInteractionLabel(
              interactionLabels,
              "title",
              "Quote approval",
            ),
          });

          // Persist the assistant message + tool call so UI can show it while paused
          await appendAgentMessageStep({
            runId: workflowRunId,
            status: "awaiting-approval",
            pendingHookToken: toolCallId,
            pendingHookType: "quoteApproval",
            result: { collectedData },
            message: {
              role: "assistant",
              content: [
                { type: "text", text: message },
                {
                  type: "tool-call",
                  toolCallId,
                  toolName: "requestQuoteApproval",
                  args: { message, quoteSummary, interaction },
                },
              ],
            },
          });

          // Create approval hook - use toolCallId as the token for the UI to reference
          const hook = quoteApprovalHook.create({ token: toolCallId });

          // Wait for approval
          const approval = await hook;

          if (approval.approved) {
            // Apply any modifications
            if (approval.modifications?.specialNotes) {
              collectedData.specialNotes = approval.modifications.specialNotes;
            }
            if (approval.modifications?.removeItemIds?.length) {
              collectedData.items = collectedData.items?.filter(
                (_, index) =>
                  !approval.modifications?.removeItemIds?.includes(
                    String(index),
                  ),
              );
            }

            return {
              success: true,
              approved: true,
              message: "Quote approved! Creating quote...",
              comment: approval.comment,
              quoteData: collectedData,
            };
          } else {
            return {
              success: false,
              approved: false,
              message: "Quote rejected",
              comment: approval.comment,
            };
          }
        },
      },
    },
    temperature: 0.7,
    maxRetries: DURABLE_AGENT_MAX_RETRIES,
  });

  // Run the agent with the user's prompt
  const initialMessages: WorkflowModelMessage[] = [
    ...messages,
    {
      role: "user" as const,
      content: prompt,
    },
  ];

  const handleStepFinish = async (step: DurableStepResult) => {
    const finishSummary = formatAgentStepLog(step);
    console.log(`[QuoteWorkflow] Step finished: ${finishSummary}`);
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
          console.log(`[QuoteWorkflow] Completed with ${steps.length} steps`);
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
      "Quote workflow failed",
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

    throw createFatalAgentWorkflowError(error, "Quote workflow failed");
  }
}
