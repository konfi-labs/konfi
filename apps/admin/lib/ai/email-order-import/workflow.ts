import "server-only";

import { ShippingOptions } from "@konfi/types";
import type { NestedCustomer } from "@konfi/types";
import { type ModelCallStreamPart, WorkflowAgent } from "@ai-sdk/workflow";
import { getWritable } from "workflow";
import { z } from "zod";
import { DURABLE_AGENT_MAX_RETRIES } from "@/lib/ai/agent-harness";
import {
  evaluateCustomerMatchStep,
  getCustomerByIdStep,
  searchCustomersStep,
  searchProductsStep,
} from "../durable-agents/steps";
import { createWorkflowVertexLanguageModel } from "../durable-agents/workflow-vertex-model";
import {
  createFatalAgentWorkflowError,
  getAgentWorkflowErrorMessage,
} from "../durable-agents/workflow-errors";
import {
  buildConversationPrompt,
  buildDraftSpecialNotes,
  createFallbackContact,
  createFallbackCustomerLabel,
  DEFAULT_IMPORT_SHIPPING_OPTION,
} from "./utils";
import {
  saveEmailOrderImportDraftStep,
  saveEmailOrderImportFailureStep,
  saveEmailOrderImportFollowUpStep,
} from "./steps";
import type {
  EmailOrderImportDraft,
  EmailOrderImportMode,
  EmailOrderImportStatus,
  EmailOrderImportWorkflowContext,
  EmailOrderImportWorkflowInput,
} from "./types";

const shippingOptions = [
  "PERSONAL_COLLECTION",
  "DHL",
  "INPOST",
  "COMPANY_COURIER",
  "CUSTOM",
] as const;

function stopAfterStepCount(stepCount: number) {
  return ({ steps }: { steps: readonly unknown[] }) =>
    steps.length === stepCount;
}

function createSystemPrompt(mode: EmailOrderImportMode) {
  const manualFollowUpMode = mode === "followup";

  return `You import email conversations into internal order drafts for a print/e-commerce admin team.

Your job is to decide between exactly two outcomes:
1. Create an internal order draft now.
2. Create a follow-up email draft asking for missing critical information.

${
  manualFollowUpMode
    ? "The admin explicitly requested a manual follow-up. You MUST create a follow-up email draft and MUST NOT create an order draft in this run."
    : "Be RELAXED and biased toward creating an internal draft. Drafts are editable by staff later, so do NOT ask follow-up questions for minor uncertainties."
}

You MUST follow these rules:
${
  manualFollowUpMode
    ? "- Because follow-up mode was explicitly requested, skip draft creation and finish with saveFollowUpEmail."
    : "- Always try customer lookup before giving up. Use sender email first, then sender name, then any company, phone number, or NIP mentioned in the thread."
}
${
  manualFollowUpMode
    ? "- Base the follow-up on the existing conversation and ask only for the missing information needed to move forward."
    : "- Always try product suggestion before deciding a follow-up is needed."
}
${
  manualFollowUpMode
    ? "- Keep the follow-up concise, helpful, and written in Polish."
    : "- Proceed with a draft when you can identify at least one plausible print product/order item."
}
${
  manualFollowUpMode
    ? "- Before finishing, call saveFollowUpEmail exactly once and then stop."
    : "- Missing shipping method, payment type, billing data, artwork status, deadline, or fine-grained finishing details are NOT enough to force a follow-up."
}
${
  manualFollowUpMode
    ? ""
    : "- Only request a follow-up when you cannot produce any reasonable draft item or the conversation is too ambiguous to identify what should be ordered."
}
${
  manualFollowUpMode
    ? ""
    : "- If customer lookup is ambiguous, you may still proceed using the raw sender/company details instead of blocking."
}
${
  manualFollowUpMode
    ? ""
    : "- Before finishing, call exactly one final tool: saveOrderDraft or saveFollowUpEmail."
}
- After calling the final tool, stop.

Use Polish for any generated follow-up email content.`;
}

export async function createEmailOrderImportWorkflow(
  input: EmailOrderImportWorkflowInput,
  context: EmailOrderImportWorkflowContext,
) {
  "use workflow";

  const writable = getWritable<ModelCallStreamPart>();
  const prompt = buildConversationPrompt({
    conversationId: input.conversationId,
    subject: input.subject,
    emails: input.emails,
  });
  const requestedMode = input.requestedMode;
  const model = createWorkflowVertexLanguageModel("email-order-import");

  let selectedCustomer: NestedCustomer | string | undefined;
  let selectedItems: Awaited<
    ReturnType<typeof searchProductsStep>
  >["products"] = [];
  let finalizedStatus: EmailOrderImportStatus | null = null;

  const agent = new WorkflowAgent({
    model,
    instructions: createSystemPrompt(requestedMode),
    temperature: 0.3,
    maxRetries: DURABLE_AGENT_MAX_RETRIES,
    tools: {
      searchCustomers: {
        description:
          "Search for customers by any available clue such as email, sender name, company name, phone number, or NIP.",
        inputSchema: z.object({
          query: z.string().describe("Lookup query for customer search"),
          limit: z.number().optional().default(5),
        }),
        execute: async ({ query, limit }) => {
          const result = await searchCustomersStep({ query, limit });

          const customers = result.customers ?? [];
          const aiMatch = await evaluateCustomerMatchStep({
            query,
            customers,
          });

          const matchedCustomer = aiMatch.selectedCustomerId
            ? (customers.find(
                (customer) => customer.id === aiMatch.selectedCustomerId,
              ) ?? null)
            : null;

          if (matchedCustomer && aiMatch.autoSelect) {
            selectedCustomer = matchedCustomer;
          }

          return {
            ...result,
            aiMatch,
            selectedCustomerId: matchedCustomer?.id ?? null,
          };
        },
      },
      selectCustomer: {
        description:
          "Select a specific customer after reviewing search results.",
        inputSchema: z.object({
          customerId: z.string(),
        }),
        execute: async ({ customerId }) => {
          const result = await getCustomerByIdStep({ customerId });
          if (!result.customer) {
            return { success: false, error: "Customer not found" };
          }

          selectedCustomer = result.customer;

          return {
            success: true,
            customer: result.customer,
          };
        },
      },
      suggestOrderItems: {
        description:
          "Suggest internal order items based on the full customer request from the email conversation.",
        inputSchema: z.object({
          request: z
            .string()
            .describe(
              "The full product request extracted from the conversation",
            ),
        }),
        execute: async ({ request }) => {
          const result = await searchProductsStep(
            { query: request },
            {
              channelId: context.channelId,
              attributes: context.attributes,
            },
          );

          selectedItems = result.products ?? [];

          return {
            ...result,
            count: selectedItems.length,
          };
        },
      },
      saveOrderDraft: {
        description:
          "Persist the final import result as an internal order draft. Use this whenever a workable draft can be created.",
        inputSchema: z.object({
          customerId: z.string().optional(),
          customerName: z.string().optional(),
          customerEmail: z.string().optional(),
          contactName: z.string().optional(),
          contactEmail: z.string().optional(),
          contactPhone: z.string().optional(),
          shippingOption: z.enum(shippingOptions).optional(),
          rationale: z.string().optional(),
          missingButNonBlocking: z.array(z.string()).optional(),
        }),
        execute: async ({
          customerId,
          customerName,
          customerEmail,
          contactName,
          contactEmail,
          contactPhone,
          shippingOption,
          rationale,
          missingButNonBlocking,
        }) => {
          if (finalizedStatus) {
            return {
              success: false,
              error: `Import already finalized as ${finalizedStatus}`,
            };
          }

          if (requestedMode === "followup") {
            return {
              success: false,
              error:
                "This run is in follow-up mode. Use saveFollowUpEmail instead of saveOrderDraft.",
            };
          }

          if (selectedItems.length === 0) {
            return {
              success: false,
              error: "Cannot save draft without any order items",
            };
          }

          let resolvedCustomer = selectedCustomer;
          if (customerId?.trim()) {
            const result = await getCustomerByIdStep({ customerId });
            if (result.customer) {
              resolvedCustomer = result.customer;
            }
          }

          const fallbackCustomerName =
            customerName?.trim() || createFallbackCustomerLabel(input.emails);
          const fallbackContact = createFallbackContact({
            emails: input.emails,
            contactName,
            contactEmail: contactEmail || customerEmail,
            contactPhone,
          });

          const draft: EmailOrderImportDraft = {
            customer: resolvedCustomer ?? fallbackCustomerName,
            contact: fallbackContact,
            email: fallbackContact.email ?? "",
            shippingOption:
              (shippingOption as ShippingOptions | undefined) ??
              DEFAULT_IMPORT_SHIPPING_OPTION,
            specialNotes: buildDraftSpecialNotes({
              conversationId: input.conversationId,
              subject: input.subject,
              rationale,
              missingButNonBlocking,
            }),
            items: selectedItems,
            mailLink: input.mailLink,
          };

          await saveEmailOrderImportDraftStep({
            importId: input.importId,
            draft,
          });

          finalizedStatus = "draft-ready";

          return {
            success: true,
            status: finalizedStatus,
            itemCount: draft.items.length,
          };
        },
      },
      saveFollowUpEmail: {
        description:
          "Persist a follow-up email draft when the conversation truly lacks enough information for even a rough internal order draft.",
        inputSchema: z.object({
          subject: z.string().describe("Follow-up email subject in Polish"),
          body: z.string().describe("Follow-up email body in Polish"),
          rationale: z.string().optional(),
          missingInformation: z.array(z.string()).default([]),
        }),
        execute: async ({ subject, body, rationale, missingInformation }) => {
          if (finalizedStatus) {
            return {
              success: false,
              error: `Import already finalized as ${finalizedStatus}`,
            };
          }

          await saveEmailOrderImportFollowUpStep({
            importId: input.importId,
            followUpEmail: {
              subject,
              body,
              rationale,
              missingInformation,
            },
          });

          finalizedStatus = "followup-required";

          return {
            success: true,
            status: finalizedStatus,
          };
        },
      },
    },
  });

  try {
    await agent.stream({
      messages: [{ role: "user", content: prompt }],
      writable,
      stopWhen: stopAfterStepCount(12),
    });

    if (!finalizedStatus) {
      if (requestedMode !== "followup" && selectedItems.length > 0) {
        const draft: EmailOrderImportDraft = {
          customer:
            selectedCustomer ?? createFallbackCustomerLabel(input.emails),
          contact: createFallbackContact({ emails: input.emails }),
          email: createFallbackContact({ emails: input.emails }).email ?? "",
          shippingOption: DEFAULT_IMPORT_SHIPPING_OPTION,
          specialNotes: buildDraftSpecialNotes({
            conversationId: input.conversationId,
            subject: input.subject,
            rationale:
              "Automatic fallback draft created because the workflow completed without explicitly finalizing the result.",
          }),
          items: selectedItems,
          mailLink: input.mailLink,
        };

        await saveEmailOrderImportDraftStep({
          importId: input.importId,
          draft,
        });
        finalizedStatus = "draft-ready";
      } else {
        await saveEmailOrderImportFollowUpStep({
          importId: input.importId,
          followUpEmail: {
            subject: `Re: ${input.subject || "Twoje zapytanie"}`,
            body: "Dzień dobry,\n\nDziękujemy za wiadomość. Aby przygotować zamówienie, potrzebujemy jeszcze kilku informacji o produkcie, który mamy wycenić i zrealizować. Prosimy o doprecyzowanie rodzaju produktu, nakładu oraz najważniejszych parametrów.\n\nPozdrawiamy,",
            rationale:
              "Fallback follow-up created because no workable order items were generated.",
            missingInformation: [
              "rodzaj produktu",
              "nakład",
              "kluczowe parametry zamówienia",
            ],
          },
        });
        finalizedStatus = "followup-required";
      }
    }

    return { status: finalizedStatus };
  } catch (error) {
    const message = getAgentWorkflowErrorMessage(
      error,
      "Email order import workflow failed",
    );
    await saveEmailOrderImportFailureStep({
      importId: input.importId,
      error: message,
    });
    throw createFatalAgentWorkflowError(
      error,
      "Email order import workflow failed",
    );
  } finally {
    await writable.close();
  }
}
