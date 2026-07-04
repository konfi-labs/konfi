import type {
  AiInstructionSettings,
  OrderItem,
  PrintingMethodDefinition,
  PrintingMethodId,
} from "@konfi/types";

import { getClosestVolume } from "./getters/get-closest-volume";
import {
  DEFAULT_PRINTING_METHOD_IDS,
  getEnabledPrintingMethodDefinitions,
  getKnownPrintingMethodIds,
} from "./printing-methods";
import { buildAiInstructionOverlaySection } from "./ai-instructions";

export const PRINTING_METHOD_VALUES = DEFAULT_PRINTING_METHOD_IDS;

type OrderPrintingMethodProductContext = {
  name?: string;
  category?: { name?: string } | null;
  productType?: { name?: string } | null;
  prefferedUnit?: string;
  volumes?: Array<{
    value?: number;
    printType?: PrintingMethodId;
  }> | null;
};

export type OrderPrintingMethodItem = Pick<
  OrderItem,
  | "id"
  | "description"
  | "volume"
  | "width"
  | "height"
  | "quantity"
  | "unit"
  | "customFormat"
> & {
  printingMethods?: readonly PrintingMethodId[] | null;
  product?:
    | (Partial<OrderPrintingMethodProductContext> & { name?: string })
    | null;
};

export interface OrderPrintingMethodItemAssignment {
  itemId: string;
  printingMethods: PrintingMethodId[];
}

export interface OrderPrintingMethodSignal {
  itemId: string;
  productName: string;
  description: string;
  quantity: number;
  volume: number | null;
  width: number | null;
  height: number | null;
  unit: string;
  customFormat: boolean;
  categoryName: string | null;
  productTypeName: string | null;
  preferredUnit: string | null;
  currentPrintingMethods: PrintingMethodId[];
  availableVolumePrintTypes: PrintingMethodId[];
  resolvedVolumePrintType: PrintingMethodId | null;
}

export interface OrderPrintingMethodClassificationContext {
  currentPrintingMethods: PrintingMethodId[];
  strongDeterministicCandidates: PrintingMethodId[];
  availablePrintingMethods: PrintingMethodDefinition[];
  items: OrderPrintingMethodSignal[];
  prompt: string;
}

export interface NormalizeInferredPrintingMethodsInput {
  currentPrintingMethods?: readonly (
    | PrintingMethodId
    | string
    | null
    | undefined
  )[];
  suggestedPrintingMethods?: readonly (
    | PrintingMethodId
    | string
    | null
    | undefined
  )[];
  strongDeterministicCandidates?: readonly (
    | PrintingMethodId
    | string
    | null
    | undefined
  )[];
  availablePrintingMethodIds?: readonly PrintingMethodId[];
  aiMarkedCurrentInvalid?: boolean;
}

export interface NormalizeInferredItemPrintingMethodsInput {
  items: readonly OrderPrintingMethodItem[];
  suggestedItemPrintingMethods?: readonly {
    itemId?: string | null;
    printingMethods?: readonly (PrintingMethodId | string | null | undefined)[];
  }[];
  orderPrintingMethods?: readonly (
    | PrintingMethodId
    | string
    | null
    | undefined
  )[];
  availablePrintingMethodIds?: readonly PrintingMethodId[];
}

function isPrintingMethod(
  value: unknown,
  availableMethodIds: readonly PrintingMethodId[] = PRINTING_METHOD_VALUES,
): value is PrintingMethodId {
  return typeof value === "string" && availableMethodIds.includes(value);
}

function uniquePrintingMethods(
  values: readonly (PrintingMethodId | string | null | undefined)[],
  availableMethodIds: readonly PrintingMethodId[] = PRINTING_METHOD_VALUES,
): PrintingMethodId[] {
  return Array.from(
    new Set(
      values.filter((value): value is PrintingMethodId =>
        isPrintingMethod(value, availableMethodIds),
      ),
    ),
  );
}

function resolveVolumePrintType(
  item: OrderPrintingMethodItem,
  availableMethodIds: readonly PrintingMethodId[],
): {
  availableVolumePrintTypes: PrintingMethodId[];
  resolvedVolumePrintType: PrintingMethodId | null;
} {
  const volumes = Array.isArray(item.product?.volumes)
    ? item.product.volumes
    : [];
  const availableVolumePrintTypes = uniquePrintingMethods(
    volumes.map((volume) => volume.printType),
    availableMethodIds,
  );

  if (typeof item.volume !== "number" || volumes.length === 0) {
    return {
      availableVolumePrintTypes,
      resolvedVolumePrintType: null,
    };
  }

  const numericVolumes = volumes
    .map((volume) => volume.value)
    .filter((value): value is number => typeof value === "number");

  if (numericVolumes.length === 0) {
    return {
      availableVolumePrintTypes,
      resolvedVolumePrintType: null,
    };
  }

  const closestVolume = getClosestVolume(item.volume, numericVolumes);
  const resolvedVolumePrintType =
    volumes.find(
      (volume) =>
        volume.value === closestVolume &&
        isPrintingMethod(volume.printType, availableMethodIds),
    )?.printType ?? null;

  return {
    availableVolumePrintTypes,
    resolvedVolumePrintType,
  };
}

export function getOrderPrintingMethodSignals(
  items: readonly OrderPrintingMethodItem[],
  availableMethodIds: readonly PrintingMethodId[] = PRINTING_METHOD_VALUES,
): OrderPrintingMethodSignal[] {
  return items.map((item) => {
    const { availableVolumePrintTypes, resolvedVolumePrintType } =
      resolveVolumePrintType(item, availableMethodIds);
    const currentPrintingMethods = uniquePrintingMethods(
      item.printingMethods ?? [],
      availableMethodIds,
    );

    return {
      itemId: item.id ?? "",
      productName: item.product?.name ?? "",
      description: item.description ?? "",
      quantity: item.quantity,
      volume: typeof item.volume === "number" ? item.volume : null,
      width: typeof item.width === "number" ? item.width : null,
      height: typeof item.height === "number" ? item.height : null,
      unit: item.unit,
      customFormat: Boolean(item.customFormat),
      categoryName: item.product?.category?.name ?? null,
      productTypeName: item.product?.productType?.name ?? null,
      preferredUnit:
        typeof item.product?.prefferedUnit === "string"
          ? item.product.prefferedUnit
          : null,
      currentPrintingMethods,
      availableVolumePrintTypes,
      resolvedVolumePrintType,
    };
  });
}

export function toSerializableOrderPrintingMethodItems(
  items: readonly OrderPrintingMethodItem[],
  availableMethodIds: readonly PrintingMethodId[] = PRINTING_METHOD_VALUES,
): OrderPrintingMethodItem[] {
  return items.map((item) => ({
    id: item.id ?? "",
    description: item.description ?? "",
    volume: typeof item.volume === "number" ? item.volume : undefined,
    width: typeof item.width === "number" ? item.width : undefined,
    height: typeof item.height === "number" ? item.height : undefined,
    quantity: item.quantity,
    unit: item.unit,
    customFormat: Boolean(item.customFormat),
    printingMethods: uniquePrintingMethods(
      item.printingMethods ?? [],
      availableMethodIds,
    ),
    product: item.product
      ? {
          name: item.product.name ?? "",
          category: item.product.category?.name
            ? { name: item.product.category.name }
            : null,
          productType: item.product.productType?.name
            ? { name: item.product.productType.name }
            : null,
          prefferedUnit:
            typeof item.product.prefferedUnit === "string"
              ? item.product.prefferedUnit
              : undefined,
          volumes: Array.isArray(item.product.volumes)
            ? item.product.volumes.map((volume) => ({
                value:
                  typeof volume.value === "number" ? volume.value : undefined,
                printType: isPrintingMethod(
                  volume.printType,
                  availableMethodIds,
                )
                  ? volume.printType
                  : undefined,
              }))
            : undefined,
        }
      : null,
  }));
}

export function buildOrderPrintingMethodsClassificationSystemPrompt(
  availablePrintingMethods?: readonly PrintingMethodDefinition[],
  aiInstructionSettings?: AiInstructionSettings | null,
): string {
  const methods = getEnabledPrintingMethodDefinitions({
    methods: availablePrintingMethods
      ? [...availablePrintingMethods]
      : undefined,
  });
  const allowedValues = methods
    .map((method) => `- ${method.id}: ${method.name}`)
    .join("\n");

  const coreInstructions = `You classify print-shop execution departments for internal queue routing.

Choose one or more printing method ids that best represent which department should see the order.

Allowed printing method ids:
${allowedValues}

Rules:
- Prefer the department that truly executes the work, not a generic DIGITAL fallback.
- Return multiple values only when the order genuinely spans multiple departments.
- Classify itemPrintingMethods per item. One item may need multiple departments when work is split across production steps.
- Preserve current item printing methods unless they are empty or clearly inconsistent with the item.
- If an item has no deterministic print type but the order clearly belongs to one department, assign that department to the item.
- Treat resolved volume print types as the strongest deterministic evidence.
- Banners, mesh, foil, roll-ups, wallpapers, boards, signs, and similar oversized print products usually belong to the large-format family.
- Use INSTALLATION only when mounting or install work is explicitly part of the order.
- Use CUTTING only when contour cutting, plotter cutting, kiss-cutting, cut-to-shape, or similar cutting work is explicit.
- Mark currentClearlyInvalid as true only when the current printingMethods are empty or obviously inconsistent with the order context.
- Keep the output conservative. Do not invent departments without evidence.`;

  return [
    coreInstructions,
    buildAiInstructionOverlaySection(
      aiInstructionSettings,
      "printMethodResolution",
    ),
    "Return only structured data.",
  ]
    .filter((section): section is string => Boolean(section?.trim()))
    .join("\n\n");
}

export function buildOrderPrintingMethodsClassificationContext(input: {
  items: readonly OrderPrintingMethodItem[];
  currentPrintingMethods?: readonly (
    | PrintingMethodId
    | string
    | null
    | undefined
  )[];
  availablePrintingMethods?: readonly PrintingMethodDefinition[];
}): OrderPrintingMethodClassificationContext {
  const availablePrintingMethods = input.availablePrintingMethods
    ? [...input.availablePrintingMethods]
    : getEnabledPrintingMethodDefinitions();
  const availableMethodIds = getKnownPrintingMethodIds({
    methods: availablePrintingMethods,
  });
  const items = getOrderPrintingMethodSignals(input.items, availableMethodIds);
  const currentPrintingMethods = uniquePrintingMethods(
    input.currentPrintingMethods ?? [],
    availableMethodIds,
  );
  const strongDeterministicCandidates = uniquePrintingMethods(
    items.map((item) => item.resolvedVolumePrintType),
    availableMethodIds,
  );

  const promptPayload = {
    availablePrintingMethods: getEnabledPrintingMethodDefinitions({
      methods: availablePrintingMethods,
    }).map((method) => ({
      id: method.id,
      name: method.name,
    })),
    currentPrintingMethods,
    strongDeterministicCandidates,
    items,
  };

  return {
    currentPrintingMethods,
    strongDeterministicCandidates,
    availablePrintingMethods,
    items,
    prompt: JSON.stringify(promptPayload, null, 2),
  };
}

export function normalizeInferredPrintingMethods(
  input: NormalizeInferredPrintingMethodsInput,
): PrintingMethodId[] {
  const availableMethodIds =
    input.availablePrintingMethodIds ?? PRINTING_METHOD_VALUES;
  const currentPrintingMethods = uniquePrintingMethods(
    input.currentPrintingMethods ?? [],
    availableMethodIds,
  );
  const suggestedPrintingMethods = uniquePrintingMethods(
    input.suggestedPrintingMethods ?? [],
    availableMethodIds,
  );
  const strongDeterministicCandidates = uniquePrintingMethods(
    input.strongDeterministicCandidates ?? [],
    availableMethodIds,
  );

  if (currentPrintingMethods.length === 0) {
    return suggestedPrintingMethods.length > 0
      ? suggestedPrintingMethods
      : strongDeterministicCandidates;
  }

  const currentMatchesStrongSignal =
    strongDeterministicCandidates.length === 0 ||
    currentPrintingMethods.some((method) =>
      strongDeterministicCandidates.includes(method),
    );

  if (!currentMatchesStrongSignal) {
    if (suggestedPrintingMethods.length === 0) {
      return strongDeterministicCandidates;
    }

    const suggestedMatchesStrongSignal = suggestedPrintingMethods.some(
      (method) => strongDeterministicCandidates.includes(method),
    );

    return suggestedMatchesStrongSignal
      ? suggestedPrintingMethods
      : strongDeterministicCandidates;
  }

  if (input.aiMarkedCurrentInvalid && suggestedPrintingMethods.length > 0) {
    if (strongDeterministicCandidates.length === 0) {
      return suggestedPrintingMethods;
    }

    const suggestedMatchesStrongSignal = suggestedPrintingMethods.some(
      (method) => strongDeterministicCandidates.includes(method),
    );

    if (suggestedMatchesStrongSignal) {
      return suggestedPrintingMethods;
    }
  }

  return currentPrintingMethods;
}

function getCurrentItemPrintingMethods(
  item: OrderPrintingMethodItem,
  availableMethodIds: readonly PrintingMethodId[],
): PrintingMethodId[] {
  return uniquePrintingMethods(item.printingMethods ?? [], availableMethodIds);
}

function getDeterministicItemPrintingMethods(
  item: OrderPrintingMethodItem,
  availableMethodIds: readonly PrintingMethodId[],
): PrintingMethodId[] {
  const { availableVolumePrintTypes, resolvedVolumePrintType } =
    resolveVolumePrintType(item, availableMethodIds);

  if (resolvedVolumePrintType) {
    return [resolvedVolumePrintType];
  }

  return availableVolumePrintTypes.length === 1
    ? availableVolumePrintTypes
    : [];
}

export function normalizeInferredItemPrintingMethods(
  input: NormalizeInferredItemPrintingMethodsInput,
): OrderPrintingMethodItemAssignment[] {
  const availableMethodIds =
    input.availablePrintingMethodIds ?? PRINTING_METHOD_VALUES;
  const orderPrintingMethods = uniquePrintingMethods(
    input.orderPrintingMethods ?? [],
    availableMethodIds,
  );
  const singleOrderPrintingMethod =
    orderPrintingMethods.length === 1 ? orderPrintingMethods[0] : null;
  const suggestedByItemId = new Map<string, PrintingMethodId[]>();

  for (const suggestion of input.suggestedItemPrintingMethods ?? []) {
    const itemId = suggestion.itemId;

    if (!itemId) {
      continue;
    }

    const printingMethods = uniquePrintingMethods(
      suggestion.printingMethods ?? [],
      availableMethodIds,
    );

    if (printingMethods.length > 0) {
      suggestedByItemId.set(itemId, printingMethods);
    }
  }

  return input.items
    .map((item) => {
      const itemId = item.id ?? "";

      if (!itemId) {
        return null;
      }

      const deterministicPrintingMethods = getDeterministicItemPrintingMethods(
        item,
        availableMethodIds,
      );
      const currentPrintingMethods = getCurrentItemPrintingMethods(
        item,
        availableMethodIds,
      );
      const suggestedPrintingMethods = suggestedByItemId.get(itemId) ?? [];
      const inferredPrintingMethods = uniquePrintingMethods(
        [...deterministicPrintingMethods, ...suggestedPrintingMethods],
        availableMethodIds,
      );
      const printingMethods =
        currentPrintingMethods.length > 0
          ? currentPrintingMethods
          : inferredPrintingMethods.length > 0
            ? inferredPrintingMethods
            : singleOrderPrintingMethod
              ? [singleOrderPrintingMethod]
              : [];

      return printingMethods.length > 0
        ? {
            itemId,
            printingMethods,
          }
        : null;
    })
    .filter(
      (assignment): assignment is OrderPrintingMethodItemAssignment =>
        assignment !== null,
    );
}

export function mergeOrderPrintingMethodsFromItemAssignments(input: {
  itemPrintingMethods?: readonly OrderPrintingMethodItemAssignment[];
  orderPrintingMethods?: readonly (
    | PrintingMethodId
    | string
    | null
    | undefined
  )[];
  availablePrintingMethodIds?: readonly PrintingMethodId[];
}): PrintingMethodId[] {
  const availableMethodIds =
    input.availablePrintingMethodIds ?? PRINTING_METHOD_VALUES;

  return uniquePrintingMethods(
    [
      ...(input.orderPrintingMethods ?? []),
      ...(input.itemPrintingMethods ?? []).flatMap(
        (assignment) => assignment.printingMethods,
      ),
    ],
    availableMethodIds,
  );
}

export function applyOrderItemPrintingMethodAssignments<
  TItem extends { id?: string; printingMethods?: readonly PrintingMethodId[] },
>(
  items: readonly TItem[],
  assignments: readonly OrderPrintingMethodItemAssignment[],
): TItem[] {
  const assignmentsByItemId = new Map(
    assignments.map((assignment) => [assignment.itemId, assignment]),
  );

  return items.map((item) => {
    const assignment = item.id ? assignmentsByItemId.get(item.id) : undefined;

    return assignment
      ? {
          ...item,
          printingMethods: assignment.printingMethods,
        }
      : item;
  });
}
