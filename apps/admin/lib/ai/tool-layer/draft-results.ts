import "server-only";

import { toSlug } from "@konfi/utils";
import { ToolLayerError } from "./errors";
import type { DraftSchemaType } from "./types";
import {
  isRecord,
  optionalArray,
  optionalBoolean,
  optionalNumber,
  optionalString,
} from "./tool-helpers";
import {
  buildSavedCategoryDraftResult,
  buildSavedProductDraftResult,
} from "./catalog-changes";

function productTypeIdFromName(value: string): string {
  const words = toSlug(value)
    .split("-")
    .map((word) => word.replace(/[^a-zA-Z]/g, ""))
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "productType";
  }

  const [firstWord, ...remainingWords] = words;
  return [
    firstWord.toLowerCase(),
    ...remainingWords.map(
      (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    ),
  ].join("");
}

function productTypeDraftId(
  productType: Record<string, unknown>,
  name: string,
) {
  const explicitId =
    optionalString(productType.id) ?? optionalString(productType.suggestedId);

  if (explicitId && /^[a-zA-Z]+$/.test(explicitId)) {
    return explicitId;
  }

  return productTypeIdFromName(explicitId ?? name);
}

function productTypeAttributeId(attribute: unknown): string | undefined {
  if (typeof attribute === "string") {
    return optionalString(attribute);
  }

  if (isRecord(attribute)) {
    return optionalString(attribute.id);
  }

  return undefined;
}

function productTypeDraftAttributes(productType: Record<string, unknown>) {
  return Array.from(
    new Set(
      (optionalArray(productType.attributes) ?? []).flatMap((attribute) => {
        const attributeId = productTypeAttributeId(attribute);
        return attributeId ? [attributeId] : [];
      }),
    ),
  );
}

function buildSavedProductTypeDraftResult(input: {
  draft: Record<string, unknown>;
  prompt: string;
  summary: string;
}): Record<string, unknown> {
  const productType = isRecord(input.draft.productType)
    ? input.draft.productType
    : input.draft;
  const name = optionalString(productType.name);

  if (!name) {
    throw new ToolLayerError(
      "validation_error",
      "Product type drafts must include productType.name or name.",
    );
  }

  const attributes = productTypeDraftAttributes(productType);
  if (attributes.length === 0) {
    throw new ToolLayerError(
      "validation_error",
      "Product type drafts must include at least one existing attribute id in productType.attributes.",
    );
  }

  const blockedItems = optionalArray(input.draft.blockedItems) ?? [];
  const readyForCreate =
    (optionalBoolean(input.draft.readyForCreate) ?? true) &&
    blockedItems.length === 0;
  const draft = {
    blockedItems,
    productType: {
      attributes,
      id: productTypeDraftId(productType, name),
      isShippable: optionalBoolean(productType.isShippable) ?? true,
      name,
    },
    readyForCreate,
    reviewSummary: optionalString(input.draft.reviewSummary) ?? input.summary,
    sourcePrompt: input.prompt,
  };

  return {
    blockedItems,
    collectedData: {
      draft,
      productTypeDraft: draft,
      readyForCreate,
    },
    productTypeDraft: draft,
    readyForCreate,
  };
}

function buildSavedQuoteOrOrderDraftResult(input: {
  draft: Record<string, unknown>;
}): Record<string, unknown> {
  const items = optionalArray(input.draft.items) ?? [];

  if (items.length === 0) {
    throw new ToolLayerError(
      "validation_error",
      "Quote and order drafts must include at least one item.",
    );
  }

  return {
    collectedData: input.draft,
    customer: isRecord(input.draft.customer)
      ? optionalString(input.draft.customer.name)
      : optionalString(input.draft.customer),
    itemCount: items.length,
    totalPrice: optionalNumber(input.draft.totalPrice),
  };
}

export function buildSavedDraftResult(input: {
  draft: Record<string, unknown>;
  draftType: DraftSchemaType;
  prompt: string;
  summary: string;
}): Record<string, unknown> {
  if (input.draftType === "category") {
    return buildSavedCategoryDraftResult(input);
  }

  if (input.draftType === "product") {
    return buildSavedProductDraftResult(input);
  }

  if (input.draftType === "productType") {
    return buildSavedProductTypeDraftResult(input);
  }

  return buildSavedQuoteOrOrderDraftResult(input);
}
