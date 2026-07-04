import "server-only";

import { AttributeInputTypeEnum } from "@konfi/types";
import { defineHook } from "workflow";
import { z } from "zod";

const catalogSetupOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const catalogSetupAttributeSchema = z.object({
  calculated: z.boolean(),
  name: z.string(),
  reason: z.string(),
  suggestedId: z.string(),
  suggestedType: z.enum([
    AttributeInputTypeEnum.DROPDOWN,
    AttributeInputTypeEnum.DROPDOWN_COLOR,
    AttributeInputTypeEnum.RADIO_GROUP,
    AttributeInputTypeEnum.RADIO_GROUP_COLOR,
    AttributeInputTypeEnum.RADIO_GROUP_IMAGE,
  ]),
  options: z.array(catalogSetupOptionSchema),
});

const catalogSetupOptionUpdateSchema = z.object({
  attributeId: z.string(),
  attributeName: z.string(),
  options: z.array(catalogSetupOptionSchema),
});

const catalogSetupProductTypeAttributeRefSchema = z.object({
  attributeId: z.string().optional(),
  attributeName: z.string(),
});

const catalogSetupProductTypeSchema = z.object({
  name: z.string(),
  suggestedId: z.string(),
  attributeRefs: z.array(catalogSetupProductTypeAttributeRefSchema),
  isShippable: z.boolean(),
});

const catalogSetupPlanSchema = z.object({
  attributes: z.array(catalogSetupAttributeSchema),
  options: z.array(catalogSetupOptionUpdateSchema),
  productType: catalogSetupProductTypeSchema.optional(),
});

export type ProductAgentCatalogSetupPlan = z.infer<
  typeof catalogSetupPlanSchema
>;

/**
 * Schema for user confirmation payload - used when the agent needs to confirm something
 * before continuing (e.g., "Is this the right customer?")
 */
const userConfirmationSchema = z.object({
  catalogSetupPlan: catalogSetupPlanSchema.optional(),
  confirmed: z.boolean(),
  response: z.string().optional(),
});

/**
 * Hook for user confirmation - waits for human confirmation before continuing
 * Use this when the agent needs to confirm a choice or get additional input
 */
export const userConfirmationHook = defineHook({
  schema: userConfirmationSchema,
});

export type UserConfirmationPayload = z.infer<typeof userConfirmationSchema>;

/**
 * Schema for quote approval payload
 */
const quoteApprovalSchema = z.object({
  approved: z.boolean(),
  comment: z.string().optional(),
  modifications: z
    .object({
      specialNotes: z.string().optional(),
      removeItemIds: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Hook for quote approval - waits for human confirmation before creating the quote
 */
export const quoteApprovalHook = defineHook({
  schema: quoteApprovalSchema,
});

export type QuoteApprovalPayload = z.infer<typeof quoteApprovalSchema>;

// ============================================================================
// Hook Registry
// ============================================================================

/**
 * All supported hook types keyed by the name stored in Firestore's `pendingHookType`.
 * To add a new hook:
 * 1. Define the schema and hook above
 * 2. Add the entry here
 */
export const hookRegistry = {
  userConfirmation: userConfirmationHook,
  quoteApproval: quoteApprovalHook,
} as const;

export type RegisteredHookType = keyof typeof hookRegistry;

/** Returns true if the string is a known registered hook type. */
export function isRegisteredHookType(type: string): type is RegisteredHookType {
  return Object.hasOwn(hookRegistry, type);
}

/** Returns the hook for the given type, or null if not found. */
export function getHook(type: string) {
  if (isRegisteredHookType(type)) {
    return hookRegistry[type];
  }
  return null;
}
