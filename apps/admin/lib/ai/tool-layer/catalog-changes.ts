import "server-only";

import { toSlug } from "@konfi/utils";
import { ToolLayerError } from "./errors";
import type {
  ProductAgentBlockedItem,
  ProductAgentCatalogChange,
  ProductAgentCatalogChangeStatus,
  ProductAgentCatalogSetupAttribute,
  ProductAgentCatalogSetupOption,
  ProductAgentCatalogSetupPlan,
  ProductAgentCatalogSetupProductType,
  ProductAgentCatalogSetupProductTypeAttributeRef,
} from "../durable-agents/product-workflow.types";
import type {
  BusinessRecordOutput,
  BusinessResourceDescriptor,
  DraftSchemaType,
  ToolAuthContext,
  ToolTaskType,
} from "./types";
import {
  isAttributeInputType,
  isRecord,
  optionalArray,
  optionalBoolean,
  optionalCatalogChangeStatus,
  optionalNonEmpty,
  optionalString,
} from "./tool-helpers";
import type {
  BusinessUpdateDraftChange,
  SaveBusinessUpdateDraftInput,
  SaveDraftInput,
} from "./tool-inputs";

function catalogSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "change";
}

function stableCatalogChangeId(kind: string, parts: string[]): string {
  return `catalog-${catalogSlug(kind)}-${catalogSlug(parts.join("-"))}`;
}

function catalogOptionFromRecord(
  value: unknown,
): ProductAgentCatalogSetupOption | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const label = optionalString(value.label) ?? optionalString(value.name);
  const optionValue = optionalString(value.value) ?? label;

  if (!label || !optionValue) {
    return undefined;
  }

  return {
    label,
    value: optionValue,
  };
}

function catalogOptionsFromUnknown(
  value: unknown,
): ProductAgentCatalogSetupOption[] {
  return (optionalArray(value) ?? []).flatMap((option) => {
    const catalogOption = catalogOptionFromRecord(option);

    return catalogOption ? [catalogOption] : [];
  });
}

function catalogAttributeFromRecord(
  value: unknown,
): ProductAgentCatalogSetupAttribute | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = optionalString(value.name);
  const inputType = optionalString(value.inputType) ?? value.suggestedType;

  if (!name || !isAttributeInputType(inputType)) {
    return undefined;
  }

  return {
    calculated: optionalBoolean(value.calculated) ?? true,
    name,
    options: catalogOptionsFromUnknown(value.options),
    reason:
      optionalString(value.reason) ??
      "Required by the product draft before the product can be created.",
    suggestedId: optionalString(value.suggestedId) ?? catalogSlug(name),
    suggestedType: inputType,
  };
}

function catalogProductTypeRefsFromUnknown(
  value: unknown,
): ProductAgentCatalogSetupProductTypeAttributeRef[] {
  return (optionalArray(value) ?? []).flatMap((ref) => {
    if (!isRecord(ref)) {
      return [];
    }

    const attributeName = optionalString(ref.attributeName);

    if (!attributeName) {
      return [];
    }

    return [
      {
        ...(optionalString(ref.attributeId)
          ? { attributeId: optionalString(ref.attributeId) }
          : {}),
        attributeName,
      },
    ];
  });
}

function catalogProductTypeFromRecord(
  value: unknown,
): ProductAgentCatalogSetupProductType | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = optionalString(value.name);

  if (!name) {
    return undefined;
  }

  return {
    attributeRefs: catalogProductTypeRefsFromUnknown(value.attributeRefs),
    isShippable: optionalBoolean(value.isShippable) ?? true,
    name,
    suggestedId: optionalString(value.suggestedId) ?? catalogSlug(name),
  };
}

function blockedItemsFromUnknown(
  value: unknown,
): ProductAgentBlockedItem[] | undefined {
  const blockedItems = optionalArray(value);

  return blockedItems ? (blockedItems as ProductAgentBlockedItem[]) : undefined;
}

function buildAttributeCreateChange(
  attribute: ProductAgentCatalogSetupAttribute,
  input: {
    blockedItems?: ProductAgentBlockedItem[];
    id?: string;
    ref?: string;
    status?: ProductAgentCatalogChangeStatus;
  } = {},
): ProductAgentCatalogChange {
  const ref = input.ref ?? `attribute:${attribute.suggestedId}`;

  return {
    ...(input.blockedItems ? { blockedItems: input.blockedItems } : {}),
    id:
      input.id ??
      stableCatalogChangeId("attribute-create", [attribute.suggestedId]),
    kind: "attribute.create",
    payload: {
      calculated: attribute.calculated,
      inputType: attribute.suggestedType,
      name: attribute.name,
      ...(attribute.options.length ? { options: attribute.options } : {}),
      reason: attribute.reason,
      suggestedId: attribute.suggestedId,
    },
    ref,
    status: input.status ?? "proposed",
  };
}

function buildAttributeOptionAddChange(input: {
  attributeId?: string;
  attributeName?: string;
  attributeRef?: string;
  blockedItems?: ProductAgentBlockedItem[];
  id?: string;
  option: ProductAgentCatalogSetupOption;
  reason?: string;
  status?: ProductAgentCatalogChangeStatus;
}): ProductAgentCatalogChange | undefined {
  if (!input.attributeId && !input.attributeRef) {
    return undefined;
  }

  return {
    ...(input.blockedItems ? { blockedItems: input.blockedItems } : {}),
    id:
      input.id ??
      stableCatalogChangeId("attribute-option-add", [
        input.attributeId ?? input.attributeRef ?? "attribute",
        input.option.value,
      ]),
    kind: "attribute.option.add",
    payload: {
      label: input.option.label,
      reason:
        input.reason ??
        "Required by the product draft before the product can be created.",
      value: input.option.value,
    },
    status: input.status ?? "proposed",
    target: {
      ...(input.attributeId ? { attributeId: input.attributeId } : {}),
      ...(input.attributeName ? { attributeName: input.attributeName } : {}),
      ...(input.attributeRef ? { attributeRef: input.attributeRef } : {}),
    },
  };
}

function buildProductTypeCreateChange(
  productType: ProductAgentCatalogSetupProductType,
  input: {
    blockedItems?: ProductAgentBlockedItem[];
    id?: string;
    ref?: string;
    status?: ProductAgentCatalogChangeStatus;
  } = {},
): ProductAgentCatalogChange {
  return {
    ...(input.blockedItems ? { blockedItems: input.blockedItems } : {}),
    id:
      input.id ??
      stableCatalogChangeId("product-type-create", [productType.suggestedId]),
    kind: "productType.create",
    payload: {
      isShippable: productType.isShippable,
      name: productType.name,
      suggestedId: productType.suggestedId,
    },
    ref: input.ref ?? `productType:${productType.suggestedId}`,
    status: input.status ?? "proposed",
  };
}

function normalizeCatalogChange(
  value: unknown,
): ProductAgentCatalogChange | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const kind = optionalString(value.kind) ?? optionalString(value.type);
  const id = optionalString(value.id);
  const status = optionalCatalogChangeStatus(value.status);
  const blockedItems = blockedItemsFromUnknown(value.blockedItems);

  switch (kind) {
    case "attribute.create": {
      const attribute = catalogAttributeFromRecord(
        isRecord(value.payload) ? value.payload : value.attribute,
      );

      return attribute
        ? buildAttributeCreateChange(attribute, {
            blockedItems,
            id,
            ref: optionalString(value.ref),
            status,
          })
        : undefined;
    }
    case "attribute.option.add": {
      const target = isRecord(value.target) ? value.target : value;
      const payload = isRecord(value.payload) ? value.payload : value.option;
      const option = catalogOptionFromRecord(payload);

      return option
        ? buildAttributeOptionAddChange({
            attributeId: optionalString(target.attributeId),
            attributeName: optionalString(target.attributeName),
            attributeRef: optionalString(target.attributeRef),
            blockedItems,
            id,
            option,
            reason: optionalString(isRecord(payload) ? payload.reason : null),
            status,
          })
        : undefined;
    }
    case "productType.create": {
      const productType = catalogProductTypeFromRecord(
        isRecord(value.payload) ? value.payload : value.productType,
      );

      return productType
        ? buildProductTypeCreateChange(productType, {
            blockedItems,
            id,
            ref: optionalString(value.ref),
            status,
          })
        : undefined;
    }
    case "productType.attribute.attach": {
      const target = isRecord(value.target) ? value.target : {};
      const payload = isRecord(value.payload) ? value.payload : {};
      const attributeName = optionalString(payload.attributeName);

      if (!attributeName) {
        return undefined;
      }

      return {
        ...(blockedItems ? { blockedItems } : {}),
        id:
          id ??
          stableCatalogChangeId("product-type-attribute-attach", [
            optionalString(target.productTypeId) ??
              optionalString(target.productTypeRef) ??
              "product-type",
            optionalString(payload.attributeId) ??
              optionalString(payload.attributeRef) ??
              attributeName,
          ]),
        kind: "productType.attribute.attach",
        payload: {
          ...(optionalString(payload.attributeId)
            ? { attributeId: optionalString(payload.attributeId) }
            : {}),
          attributeName,
          ...(optionalString(payload.attributeRef)
            ? { attributeRef: optionalString(payload.attributeRef) }
            : {}),
        },
        status,
        target: {
          ...(optionalString(target.productTypeId)
            ? { productTypeId: optionalString(target.productTypeId) }
            : {}),
          ...(optionalString(target.productTypeRef)
            ? { productTypeRef: optionalString(target.productTypeRef) }
            : {}),
        },
      };
    }
    default:
      return undefined;
  }
}

function catalogChangeKey(change: ProductAgentCatalogChange): string {
  switch (change.kind) {
    case "attribute.create":
      return `${change.kind}:${change.payload.suggestedId}`;
    case "attribute.option.add":
      return `${change.kind}:${
        change.target.attributeId ?? change.target.attributeRef ?? "attribute"
      }:${change.payload.value}`;
    case "productType.create":
      return `${change.kind}:${change.payload.suggestedId}`;
    case "productType.attribute.attach":
      return `${change.kind}:${
        change.target.productTypeId ??
        change.target.productTypeRef ??
        "product-type"
      }:${
        change.payload.attributeId ??
        change.payload.attributeRef ??
        change.payload.attributeName
      }`;
  }

  const exhaustiveChange: never = change;
  return exhaustiveChange;
}

function dedupeCatalogChanges(
  changes: ProductAgentCatalogChange[],
): ProductAgentCatalogChange[] {
  const byKey = new Map<string, ProductAgentCatalogChange>();

  for (const change of changes) {
    byKey.set(catalogChangeKey(change), change);
  }

  return Array.from(byKey.values());
}

function buildMissingAttributeCatalogChanges(
  draft: Record<string, unknown>,
): ProductAgentCatalogChange[] {
  return (optionalArray(draft.missingAttributes) ?? []).flatMap(
    (missingAttribute) => {
      const attribute = catalogAttributeFromRecord(missingAttribute);

      return attribute ? [buildAttributeCreateChange(attribute)] : [];
    },
  );
}

function buildMissingOptionCatalogChanges(
  draft: Record<string, unknown>,
): ProductAgentCatalogChange[] {
  const missingOptionChanges = (
    optionalArray(draft.missingOptions) ?? []
  ).flatMap((missingOption) => {
    if (!isRecord(missingOption)) {
      return [];
    }

    const attributeId = optionalString(missingOption.attributeId);
    const attributeName = optionalString(missingOption.attributeName);
    const option = catalogOptionFromRecord(missingOption.option);
    const options = catalogOptionsFromUnknown(missingOption.options);
    const proposedOptions = options.length ? options : option ? [option] : [];
    const reason = optionalString(missingOption.reason);

    return proposedOptions.flatMap((proposedOption) => {
      const change = buildAttributeOptionAddChange({
        attributeId,
        attributeName,
        option: proposedOption,
        reason,
      });

      return change ? [change] : [];
    });
  });
  const blockedOptionChanges = (
    optionalArray(draft.blockedItems) ?? []
  ).flatMap((blockedItem) => {
    if (!isRecord(blockedItem) || blockedItem.type !== "option") {
      return [];
    }

    const attributeId = optionalString(blockedItem.attributeId);
    const optionValue = optionalString(blockedItem.optionValue);
    const optionLabel =
      optionalString(blockedItem.label) ??
      optionalString(blockedItem.name) ??
      optionValue;

    if (!attributeId || !optionLabel || !optionValue) {
      return [];
    }

    const change = buildAttributeOptionAddChange({
      attributeId,
      attributeName: optionalString(blockedItem.attributeName),
      blockedItems: [blockedItem as unknown as ProductAgentBlockedItem],
      option: {
        label: optionLabel,
        value: optionValue,
      },
      reason:
        optionalString(blockedItem.reason) ??
        "Blocked product draft is missing this attribute option.",
    });

    return change ? [change] : [];
  });

  return [...missingOptionChanges, ...blockedOptionChanges];
}

function buildExplicitCatalogChanges(
  draft: Record<string, unknown>,
): ProductAgentCatalogChange[] {
  return (optionalArray(draft.catalogChanges) ?? []).flatMap((change) => {
    const normalized = normalizeCatalogChange(change);

    return normalized ? [normalized] : [];
  });
}

function buildProductDraftCatalogChanges(
  draft: Record<string, unknown>,
): ProductAgentCatalogChange[] {
  return dedupeCatalogChanges([
    ...buildExplicitCatalogChanges(draft),
    ...buildMissingAttributeCatalogChanges(draft),
    ...buildMissingOptionCatalogChanges(draft),
  ]);
}

function buildCatalogSetupPlanFromChanges(
  catalogChanges: ProductAgentCatalogChange[],
): ProductAgentCatalogSetupPlan | null {
  const attributesById = new Map<string, ProductAgentCatalogSetupAttribute>();
  const optionUpdatesByAttribute = new Map<
    string,
    {
      attributeId: string;
      attributeName: string;
      options: ProductAgentCatalogSetupOption[];
    }
  >();
  let productType: ProductAgentCatalogSetupProductType | undefined;

  for (const change of catalogChanges) {
    switch (change.kind) {
      case "attribute.create": {
        attributesById.set(change.payload.suggestedId, {
          calculated: change.payload.calculated,
          name: change.payload.name,
          options: change.payload.options ?? [],
          reason:
            change.payload.reason ??
            "Required by the product draft before the product can be created.",
          suggestedId: change.payload.suggestedId,
          suggestedType: change.payload.inputType,
        });
        break;
      }
      case "attribute.option.add": {
        if (!change.target.attributeId) {
          break;
        }

        const optionUpdate = optionUpdatesByAttribute.get(
          change.target.attributeId,
        ) ?? {
          attributeId: change.target.attributeId,
          attributeName:
            change.target.attributeName ?? change.target.attributeId,
          options: [],
        };
        const hasOption = optionUpdate.options.some(
          (option) => option.value === change.payload.value,
        );

        if (!hasOption) {
          optionUpdate.options.push({
            label: change.payload.label,
            value: change.payload.value,
          });
        }

        optionUpdatesByAttribute.set(change.target.attributeId, optionUpdate);
        break;
      }
      case "productType.create": {
        productType = {
          attributeRefs: productType?.attributeRefs ?? [],
          isShippable: change.payload.isShippable,
          name: change.payload.name,
          suggestedId: change.payload.suggestedId,
        };
        break;
      }
      case "productType.attribute.attach": {
        if (!productType) {
          break;
        }

        const attributeRef = {
          ...(change.payload.attributeId
            ? { attributeId: change.payload.attributeId }
            : {}),
          attributeName: change.payload.attributeName,
        };
        const hasRef = productType.attributeRefs.some(
          (ref) =>
            (ref.attributeId && ref.attributeId === attributeRef.attributeId) ||
            ref.attributeName === attributeRef.attributeName,
        );

        if (!hasRef) {
          productType.attributeRefs.push(attributeRef);
        }
        break;
      }
    }
  }

  if (
    attributesById.size === 0 &&
    optionUpdatesByAttribute.size === 0 &&
    !productType
  ) {
    return null;
  }

  return {
    attributes: Array.from(attributesById.values()),
    options: Array.from(optionUpdatesByAttribute.values()),
    ...(productType ? { productType } : {}),
  };
}

export function buildDraftPrompt(input: SaveDraftInput): string {
  const title = optionalNonEmpty(input.title, "title");

  if (title) {
    return title;
  }

  return `MCP ${input.draftType} draft`;
}

export function buildDraftSummary(input: SaveDraftInput): string {
  const summary = optionalNonEmpty(input.summary, "summary");

  if (summary) {
    return summary;
  }

  return `Draft saved from MCP for human review in the ${input.draftType} form.`;
}

export function buildBusinessUpdatePrompt(input: {
  descriptor: BusinessResourceDescriptor;
  input: SaveBusinessUpdateDraftInput;
}): string {
  const title = optionalNonEmpty(input.input.title, "title");

  if (title) {
    return title;
  }

  return `MCP update draft for ${input.descriptor.label} ${input.input.recordId}`;
}

export function buildBusinessUpdateSummary(input: {
  changeCount: number;
  descriptor: BusinessResourceDescriptor;
  input: SaveBusinessUpdateDraftInput;
}): string {
  const summary = optionalNonEmpty(input.input.summary, "summary");

  if (summary) {
    return summary;
  }

  return `Review ${input.changeCount} MCP-proposed change${
    input.changeCount === 1 ? "" : "s"
  } for ${input.descriptor.label} ${input.input.recordId}.`;
}

export function actorMember(auth: ToolAuthContext) {
  return {
    id: auth.actor.uid,
    name: auth.actor.displayName ?? auth.actor.email ?? auth.actor.uid,
  };
}

export function openUrlForDraft(
  draftType: DraftSchemaType,
  runId: string,
): string {
  switch (draftType) {
    case "category":
      return `/catalog?create=category&agentRunId=${encodeURIComponent(runId)}`;
    case "order":
      return `/orders/create?agentRunId=${encodeURIComponent(runId)}`;
    case "product":
      return `/catalog/products/create?agentRunId=${encodeURIComponent(runId)}`;
    case "productType":
      return `/configuration/product-types?type=create-new&agentRunId=${encodeURIComponent(runId)}`;
    case "quote":
      return `/quotes/create?agentRunId=${encodeURIComponent(runId)}`;
  }
}

export function openUrlForBusinessUpdateDraft(runId: string): string {
  return `/tools/tasks?runId=${encodeURIComponent(runId)}`;
}

function isDraftSchemaType(value: string): value is DraftSchemaType {
  return (
    value === "category" ||
    value === "order" ||
    value === "product" ||
    value === "productType" ||
    value === "quote"
  );
}

export function isToolTaskType(
  value: string | undefined,
): value is ToolTaskType {
  return (
    value === "businessUpdate" || Boolean(value && isDraftSchemaType(value))
  );
}

export function openUrlForSavedDraft(
  draftType: ToolTaskType,
  runId: string,
): string {
  return draftType === "businessUpdate"
    ? openUrlForBusinessUpdateDraft(runId)
    : openUrlForDraft(draftType, runId);
}

export function buildBusinessUpdateDraftResult(input: {
  channelId?: string;
  changes: readonly BusinessUpdateDraftChange[];
  descriptor: BusinessResourceDescriptor;
  record: BusinessRecordOutput["record"];
  summary: string;
}): Record<string, unknown> {
  const updateDraft = {
    ...(input.channelId ? { channelId: input.channelId } : {}),
    changes: input.changes,
    readyForReview: true,
    record: {
      fields: input.record.fields,
      id: input.record.id,
      label: input.record.label,
      ...(input.record.description
        ? { description: input.record.description }
        : {}),
      ...(input.record.path ? { path: input.record.path } : {}),
    },
    resource: input.descriptor.name,
    resourceLabel: input.descriptor.label,
    summary: input.summary,
  };

  return {
    businessUpdateDraft: updateDraft,
    collectedData: {
      businessUpdateDraft: updateDraft,
      readyForReview: true,
    },
    readyForReview: true,
  };
}

export function buildSavedProductDraftResult(input: {
  draft: Record<string, unknown>;
  prompt: string;
  summary: string;
}): Record<string, unknown> {
  const product = isRecord(input.draft.product)
    ? input.draft.product
    : input.draft;
  const productName = optionalString(product.name);
  const priceType =
    optionalString(input.draft.priceType) ?? optionalString(product.priceType);

  if (!productName) {
    throw new ToolLayerError(
      "validation_error",
      "Product drafts must include product.name.",
    );
  }

  if (!priceType) {
    throw new ToolLayerError(
      "validation_error",
      "Product drafts must include product.priceType or draft.priceType.",
    );
  }

  const blockedItems = optionalArray(input.draft.blockedItems) ?? [];
  const catalogChanges = buildProductDraftCatalogChanges(input.draft);
  const catalogSetupPlan = buildCatalogSetupPlanFromChanges(catalogChanges);
  const readyForCreate =
    (optionalBoolean(input.draft.readyForCreate) ?? true) &&
    blockedItems.length === 0 &&
    catalogChanges.length === 0;
  const draft = {
    blockedItems,
    ...(catalogChanges.length
      ? {
          catalogChanges,
          catalogChangesVersion: 1,
        }
      : {}),
    grossPrices: optionalBoolean(input.draft.grossPrices) ?? true,
    missingAttributes: optionalArray(input.draft.missingAttributes) ?? [],
    missingOptions: optionalArray(input.draft.missingOptions) ?? [],
    priceType,
    priceTypeReason:
      optionalString(input.draft.priceTypeReason) ??
      "Selected by the MCP draft.",
    ...(isRecord(input.draft.pricingPreview)
      ? { pricingPreview: input.draft.pricingPreview }
      : {}),
    product,
    readyForCreate,
    reviewSummary: optionalString(input.draft.reviewSummary) ?? input.summary,
    selectedAttributes: optionalArray(input.draft.selectedAttributes) ?? [],
    sourcePrompt: input.prompt,
  };

  return {
    blockedItems,
    ...(catalogChanges.length
      ? {
          catalogChanges,
          catalogChangesVersion: 1,
        }
      : {}),
    collectedData: {
      blockedItems,
      ...(catalogChanges.length
        ? {
            catalogChanges,
            catalogChangesVersion: 1,
          }
        : {}),
      ...(catalogSetupPlan ? { catalogSetupPlan } : {}),
      draft,
      readyForCreate,
    },
    productDraft: draft,
    readyForCreate,
  };
}

export function buildSavedCategoryDraftResult(input: {
  draft: Record<string, unknown>;
  prompt: string;
  summary: string;
}): Record<string, unknown> {
  const category = isRecord(input.draft.category)
    ? input.draft.category
    : input.draft;
  const name = optionalString(category.name);

  if (!name) {
    throw new ToolLayerError(
      "validation_error",
      "Category drafts must include category.name or name.",
    );
  }

  const seo = isRecord(category.seo) ? category.seo : {};
  const description = optionalString(category.description) ?? "";
  const blockedItems = optionalArray(input.draft.blockedItems) ?? [];
  const readyForCreate =
    (optionalBoolean(input.draft.readyForCreate) ?? true) &&
    blockedItems.length === 0;
  const draft = {
    blockedItems,
    category: {
      description,
      name,
      seo: {
        description: optionalString(seo.description) ?? description,
        slug: toSlug(optionalString(seo.slug) ?? name),
        title: optionalString(seo.title) ?? name,
      },
    },
    readyForCreate,
    reviewSummary: optionalString(input.draft.reviewSummary) ?? input.summary,
    sourcePrompt: input.prompt,
  };

  return {
    blockedItems,
    categoryDraft: draft,
    collectedData: {
      categoryDraft: draft,
      draft,
      readyForCreate,
    },
    readyForCreate,
  };
}
