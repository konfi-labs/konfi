"use server";

import "server-only";

import { getVertexThinkingProviderOptions } from "@/lib/ai/server-vertex";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { loadAdminAiInstructionSettings } from "@/lib/ai/ai-instruction-settings.server";
import {
  callWithRetry,
  getModel,
  getStructuredOutputFallback,
  loadAdminPrintingMethodsSettings,
  runMeteredAdminTextCall,
} from "./admin-ai-action-utils";
import { MODELS } from "@konfi/firebase";
import {
  Attribute,
  Unit,
  type Order,
  type OrderItem,
  type PrintingMethodId,
} from "@konfi/types";
import {
  applyOrderItemPrintingMethodAssignments,
  buildOrderImpositionTemplateSuggestionContext,
  buildOrderImpositionTemplateSuggestionSystemPrompt,
  buildOrderPrintingMethodsClassificationContext,
  buildOrderPrintingMethodsClassificationSystemPrompt,
  getActivePrintingMethodIds,
  getKnownPrintingMethodIds,
  mergeOrderPrintingMethodsFromItemAssignments,
  normalizeInferredItemPrintingMethods,
  normalizeInferredPrintingMethods,
  type OrderPrintingMethodItemAssignment,
  type OrderImpositionTemplateExistingMatch,
  type OrderImpositionTemplateSuggestionItem,
  type OrderImpositionWorkflowCandidate,
} from "@konfi/utils";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { OrderPrintingMethodItem } from "@konfi/utils";
import { checkAdmin } from "./index";

export interface GenerateAdminTextInput {
  systemPrompt: string;
  context: string;
  modelId?: string;
}

export async function generateAdminText(
  input: GenerateAdminTextInput,
): Promise<string> {
  await checkAdmin();

  const { systemPrompt, context, modelId } = input;
  if (!systemPrompt || !context) {
    throw new Error("Bad Request: systemPrompt and context are required");
  }

  const { text } = await callWithRetry(() =>
    runMeteredAdminTextCall({
      modelId,
      prompt: context,
      instructions: systemPrompt,
      run: async () =>
        generateText({
          model: await getModel(modelId),
          instructions: systemPrompt,
          prompt: context,
        }),
    }),
  );

  return text;
}

export interface RetrieveAttributesInput {
  attributes: Attribute[];
  text: string;
  modelId?: string;
}

export async function retrieveAttributesAdmin(
  input: RetrieveAttributesInput,
): Promise<{ selectedAttributes: Record<string, string[]> }> {
  await checkAdmin();

  const { attributes, text, modelId } = input;
  if (!Array.isArray(attributes)) {
    throw new Error("Bad Request: attributes must be an array");
  }

  const schema = z.object({
    selectedAttributes: z.record(z.string(), z.array(z.string())),
  });

  const system = `You are an intelligent assistant that specializes in selecting proper attributes based on provided data.
You should always provide a list of attributes that are most likely to be used by the user.
If the user provides an attribute that is not on the list, you should skip it.

Always return a JSON object with attributes. Example:
{
  "selectedAttributes": {
    "attributeId": ["optionValue"]
  }
}

Make sure that option value is used and not the title.
Available attributes list (choose from these only): ${JSON.stringify(attributes)}

Return only JSON. Do not wrap in markdown.`;

  const { output } = await callWithRetry(() =>
    runMeteredAdminTextCall({
      modelId,
      prompt: text,
      system,
      run: async () =>
        generateText({
          model: await getModel(modelId),
          output: Output.object({ schema }),
          system,
          prompt: text,
        }),
    }),
  );

  return output;
}

export interface RetrievePricesInput {
  combinations: string[];
  volumes: number[];
  text: string;
  modelId?: string;
}

export async function retrievePricesAdmin(
  input: RetrievePricesInput,
): Promise<Record<string, Array<{ volume: number; price: number }>>> {
  await checkAdmin();

  const { combinations, volumes, text, modelId } = input;
  if (!Array.isArray(combinations) || !Array.isArray(volumes)) {
    throw new Error("Bad Request: combinations and volumes must be arrays");
  }

  const schema = z.record(
    z.string(),
    z.array(
      z.object({
        volume: z.number(),
        price: z.number(),
      }),
    ),
  );

  const system = `You are an intelligent assistant that specializes in assigning proper prices.

Constraints:
- You can't change the provided combinations.
- Validate that price matches the correct volume.
- Convert the price to smaller unit for example 1,23 should be 123 or 0,32 should be 32.

Combinations: ${JSON.stringify(combinations)}
Volumes: ${JSON.stringify(volumes)}

Return a JSON object mapping combinationId to a list of { volume, price } objects.
Make sure that every combination has ${volumes.length} entries.
Return only JSON. Do not wrap in markdown.`;

  const { output } = await callWithRetry(() =>
    runMeteredAdminTextCall({
      modelId,
      prompt: text,
      system,
      run: async () =>
        generateText({
          model: await getModel(modelId),
          output: Output.object({ schema }),
          system,
          prompt: text,
        }),
    }),
  );

  return output;
}

export interface ClassifyOrderPrintingMethodsInput {
  items: OrderPrintingMethodItem[];
  currentPrintingMethods?: PrintingMethodId[];
  channelId?: string;
  orderId?: string;
}

export async function classifyOrderPrintingMethodsAdmin(
  input: ClassifyOrderPrintingMethodsInput,
): Promise<{
  itemPrintingMethods: OrderPrintingMethodItemAssignment[];
  printingMethods: PrintingMethodId[];
}> {
  await checkAdmin();

  const { items, currentPrintingMethods = [], channelId, orderId } = input;
  if (!Array.isArray(items)) {
    throw new Error("Bad Request: items must be an array");
  }

  if (items.length === 0) {
    return { itemPrintingMethods: [], printingMethods: currentPrintingMethods };
  }

  const printingMethodsSettings =
    await loadAdminPrintingMethodsSettings(channelId);
  const knownPrintingMethodIds = getKnownPrintingMethodIds(
    printingMethodsSettings,
  );
  const activePrintingMethodIds = getActivePrintingMethodIds(
    printingMethodsSettings,
  );

  const context = buildOrderPrintingMethodsClassificationContext({
    items,
    currentPrintingMethods,
    availablePrintingMethods: printingMethodsSettings.methods,
  });
  const firstActivePrintingMethodId = activePrintingMethodIds[0];
  if (!firstActivePrintingMethodId) {
    return { itemPrintingMethods: [], printingMethods: currentPrintingMethods };
  }
  const printingMethodSchema = z.enum([
    firstActivePrintingMethodId,
    ...activePrintingMethodIds.slice(1),
  ]);
  const schema = z.object({
    printingMethods: z.array(printingMethodSchema).max(4),
    itemPrintingMethods: z
      .array(
        z.object({
          itemId: z.string(),
          printingMethods: z.array(printingMethodSchema).max(4),
        }),
      )
      .optional(),
    currentClearlyInvalid: z.boolean(),
    confidence: z.number().min(0).max(1).optional(),
  });
  const tenantContext = await getTenantContextForRequest();
  const aiInstructionSettings = await loadAdminAiInstructionSettings({
    channelId,
    tenantContext,
  });
  const system = buildOrderPrintingMethodsClassificationSystemPrompt(
    printingMethodsSettings.methods,
    aiInstructionSettings,
  );

  try {
    const { output } = await callWithRetry(() =>
      runMeteredAdminTextCall({
        modelId: MODELS.GEMINI_3_FLASH_LITE,
        prompt: context.prompt,
        system,
        run: async () =>
          generateText({
            model: await getModel(MODELS.GEMINI_3_FLASH_LITE),
            providerOptions: getVertexThinkingProviderOptions(
              {
                thinkingLevel: "minimal",
              },
              {
                modelId: MODELS.GEMINI_3_FLASH_LITE,
              },
            ),
            output: Output.object({ schema }),
            system,
            prompt: context.prompt,
          }),
      }),
    );

    const inferredOrderPrintingMethods = normalizeInferredPrintingMethods({
      currentPrintingMethods,
      suggestedPrintingMethods: output.printingMethods,
      strongDeterministicCandidates: context.strongDeterministicCandidates,
      availablePrintingMethodIds: knownPrintingMethodIds,
      aiMarkedCurrentInvalid: output.currentClearlyInvalid,
    });
    const itemPrintingMethods = normalizeInferredItemPrintingMethods({
      items,
      suggestedItemPrintingMethods: output.itemPrintingMethods ?? [],
      orderPrintingMethods: inferredOrderPrintingMethods,
      availablePrintingMethodIds: knownPrintingMethodIds,
    });

    return {
      itemPrintingMethods,
      printingMethods: mergeOrderPrintingMethodsFromItemAssignments({
        itemPrintingMethods,
        orderPrintingMethods: inferredOrderPrintingMethods,
        availablePrintingMethodIds: knownPrintingMethodIds,
      }),
    };
  } catch (error) {
    return getStructuredOutputFallback(
      error,
      { itemPrintingMethods: [], printingMethods: currentPrintingMethods },
      {
        action: "classifyOrderPrintingMethodsAdmin",
        schemaBranch: "printingMethods",
        orderId,
        promptCategory: "order-printing-method-classification",
      },
    );
  }
}

export interface SuggestOrderImpositionTemplatesInput {
  items: OrderImpositionTemplateSuggestionItem[];
  workflowCandidates: OrderImpositionWorkflowCandidate[];
  existingMatchesByItem: OrderImpositionTemplateExistingMatch[];
}

export async function suggestOrderImpositionTemplatesAdmin(
  input: SuggestOrderImpositionTemplatesInput,
): Promise<{
  suggestions: Array<{
    orderItemId: string;
    workflowIds: string[];
  }>;
}> {
  await checkAdmin();

  const { items, workflowCandidates, existingMatchesByItem } = input;

  if (
    !Array.isArray(items) ||
    !Array.isArray(workflowCandidates) ||
    !Array.isArray(existingMatchesByItem)
  ) {
    throw new Error(
      "Bad Request: items, workflowCandidates, and existingMatchesByItem must be arrays",
    );
  }

  if (items.length === 0 || workflowCandidates.length === 0) {
    return { suggestions: [] };
  }

  const context = buildOrderImpositionTemplateSuggestionContext({
    items,
    workflowCandidates,
    existingMatchesByItem,
  });
  const workflowIds = workflowCandidates.map((workflow) => workflow.id);
  const workflowIdSchema = z.enum(workflowIds as [string, ...string[]]);
  const schema = z.object({
    suggestions: z
      .array(
        z.object({
          orderItemId: z.string(),
          workflowIds: z.array(workflowIdSchema).max(1),
        }),
      )
      .max(Math.min(items.length, 3)),
  });
  const validItemIds = new Set(items.map((item) => item.id));

  try {
    const { output } = await callWithRetry(() =>
      runMeteredAdminTextCall({
        modelId: MODELS.GEMINI_3_FLASH_LITE,
        prompt: context.prompt,
        instructions: buildOrderImpositionTemplateSuggestionSystemPrompt(),
        run: async () =>
          generateText({
            model: await getModel(MODELS.GEMINI_3_FLASH_LITE),
            providerOptions: getVertexThinkingProviderOptions(
              {
                thinkingLevel: "minimal",
              },
              {
                modelId: MODELS.GEMINI_3_FLASH_LITE,
              },
            ),
            output: Output.object({ schema }),
            instructions: buildOrderImpositionTemplateSuggestionSystemPrompt(),
            prompt: context.prompt,
          }),
      }),
    );

    const suggestionsByItemId = new Map<
      string,
      (typeof output.suggestions)[number]
    >();

    for (const suggestion of output.suggestions) {
      if (
        !validItemIds.has(suggestion.orderItemId) ||
        suggestion.workflowIds.length === 0 ||
        suggestionsByItemId.has(suggestion.orderItemId)
      ) {
        continue;
      }

      suggestionsByItemId.set(suggestion.orderItemId, suggestion);
    }

    return {
      suggestions: Array.from(suggestionsByItemId.values()),
    };
  } catch (error) {
    return getStructuredOutputFallback(
      error,
      { suggestions: [] },
      {
        action: "suggestOrderImpositionTemplatesAdmin",
        schemaBranch: "impositionTemplateSuggestions",
        promptCategory: "order-imposition-template-suggestion",
      },
    );
  }
}

export interface SuggestUnitInput {
  orderItemContext: string;
  productContext: string;
  availableUnits: string[];
}

export async function suggestUnitAdmin(
  input: SuggestUnitInput,
): Promise<{ unit: string }> {
  await checkAdmin();

  const { orderItemContext, productContext, availableUnits } = input;
  if (!Array.isArray(availableUnits) || availableUnits.length === 0) {
    throw new Error("Bad Request: availableUnits must be a non-empty array");
  }

  const schema = z.object({
    unit: z.enum(availableUnits as [string, ...string[]]),
  });

  const system = `You are an intelligent assistant that specializes in suggesting the most appropriate unit of measurement for print products based on order item and product context. You analyze the product type, dimensions, custom format, and quantity/volume to recommend the best unit.

Available units and their typical use cases:
- PCS (pieces): Standard for countable items like business cards, flyers, brochures, stickers
- M2 (square meters): For large format prints sold by area like banners, wallpapers, vinyl, big stickers
- MB (running meters): For roll materials like banners, fabrics sold by length
- HOUR: For services or time-based products
- SHEET: For paper sheets or materials sold as sheets
- KM (kilometers): For very long materials
- CMB (cubic meters): For volumetric measurements
- CM2 (square centimeters): For very small area-based products

Available units for this product: ${JSON.stringify(availableUnits)}

Guidelines:
1. If customFormat is true and the product has large dimensions (width/height > 500mm), consider M2 or MB
2. If customFormat is true with smaller dimensions, consider PCS or CM2
3. For standard products without custom formats, use PCS for countable items
4. For standard paper sizes, use PCS — e.g., A-series (A0 width: 841 height: 1189, A1 width: 594 height: 841, A2 width: 420 height: 594, A3 width: 297 height: 420, A4 width: 210 height: 297) and B-series (B0 width: 1000 height: 1414, B1 width: 707 height: 1000, B2 width: 500 height: 707)
5. Consider the product name and type - banners, posters, signs often use M2 or MB
6. Small items like business cards, flyers, stickers use PCS
7. The product's preferred unit should be given consideration but can be overridden based on the specific order context
8. Always return M2 when width === 1000 and height === 1000mm (1m x 1m) regardless of other factors

Always return a JSON object with the suggested unit. Example:
{
  "unit": "PCS"
}
Never return any other text outside the JSON object.  
`;

  const prompt = `Order Item Context: ${orderItemContext}\n\nProduct Context: ${productContext}`;

  try {
    const { output } = await callWithRetry(() =>
      runMeteredAdminTextCall({
        modelId: MODELS.GEMINI_3_FLASH,
        prompt,
        system,
        run: async () =>
          generateText({
            model: await getModel(MODELS.GEMINI_3_FLASH),
            providerOptions: getVertexThinkingProviderOptions({
              thinkingLevel: "medium",
            }),
            output: Output.object({ schema }),
            system,
            prompt,
          }),
      }),
    );

    return output;
  } catch (error) {
    console.error("[suggestUnitAdmin] Failed to suggest unit:", error);
    return { unit: Unit.PCS };
  }
}

export interface CalculatePacksFromOrderItemsInput {
  orderItems: Array<{
    description: string;
    quantity: number;
    width?: number;
    height?: number;
    volume?: number;
    unit: string;
    product?: {
      name?: string;
      weight?: number;
    };
  }>;
  modelId?: string;
}

export type PackCalculationResult = {
  packs: Array<{
    width: number;
    height: number;
    length: number;
    weight: number;
    amount: number;
    type: "ST";
  }>;
};

export async function calculatePacksFromOrderItemsAdmin(
  input: CalculatePacksFromOrderItemsInput,
): Promise<PackCalculationResult> {
  await checkAdmin();

  const { orderItems, modelId } = input;
  if (!Array.isArray(orderItems)) {
    throw new Error("Bad Request: orderItems must be an array");
  }

  const schema = z.object({
    packs: z.array(
      z.object({
        width: z.number(),
        height: z.number(),
        length: z.number(),
        weight: z.number(),
        amount: z.number(),
        type: z.enum(["ST", "NST", "PPAL", "PAL", "DLU"]),
      }),
    ),
  });

  const system = `You are an intelligent assistant specialized in calculating optimal packaging for shipping orders.

Key Rules:
1. Multiple smaller items can be packed together
2. Each pack should NOT exceed 30kg
3. Consider dimensions - standard box sizes are preferred (10-100cm)
4. Pack type must ALWAYS be ST (standard package type)
5. Amount should be 1 per pack entry (quantity of identical packs)

Return only JSON of the following shape:
{
  "packs": [
    { "width": number, "height": number, "length": number, "weight": number, "amount": number, "type": "ST" }
  ]
}

All dimensions must be in cm and weight in kg.
Return only JSON. Do not wrap in markdown.`;

  const prompt = `Calculate optimal packs for these order items:\n\n${JSON.stringify(orderItems, null, 2)}`;

  try {
    const { output } = await callWithRetry(() =>
      runMeteredAdminTextCall({
        modelId,
        prompt,
        system,
        run: async () =>
          generateText({
            model: await getModel(modelId),
            providerOptions: getVertexThinkingProviderOptions({
              thinkingLevel: "medium",
            }),
            output: Output.object({ schema }),
            system,
            prompt,
          }),
      }),
    );

    return {
      packs: output.packs.map((pack) => ({
        ...pack,
        type: "ST" as const,
      })),
    };
  } catch (error) {
    console.error(
      "[calculatePacksFromOrderItemsAdmin] Failed to calculate packs:",
      error,
    );
    return {
      packs: [
        {
          width: 30,
          height: 20,
          length: 40,
          weight: 5,
          amount: 1,
          type: "ST",
        },
      ],
    };
  }
}

export interface ClassifyAndPersistOrderPrintingMethodsInput {
  channelId: string;
  orderId: string;
  items: OrderPrintingMethodItem[];
  currentPrintingMethods?: PrintingMethodId[];
}

export async function classifyAndPersistOrderPrintingMethodsAdmin(
  input: ClassifyAndPersistOrderPrintingMethodsInput,
): Promise<void> {
  await checkAdmin();

  const { channelId, orderId, items, currentPrintingMethods = [] } = input;

  const { itemPrintingMethods, printingMethods } =
    await classifyOrderPrintingMethodsAdmin({
      items,
      currentPrintingMethods,
      channelId,
      orderId,
    });
  const db = getAdminDb();
  const orderRef = db.doc(`channels/${channelId}/orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  const order = orderSnapshot.data() as Partial<Order> | undefined;
  const orderItems = Array.isArray(order?.items)
    ? (order.items as OrderItem[])
    : [];
  const updatePayload: Partial<Order> = { printingMethods };

  if (itemPrintingMethods.length > 0 && orderItems.length > 0) {
    updatePayload.items = applyOrderItemPrintingMethodAssignments(
      orderItems,
      itemPrintingMethods,
    );
  }

  await orderRef.update(updatePayload);
}
