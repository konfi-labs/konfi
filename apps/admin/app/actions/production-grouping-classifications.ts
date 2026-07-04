"use server";

import "server-only";

import {
  callWithRetry,
  getModel,
  logStructuredOutputFailure,
  runMeteredAdminTextCall,
} from "./admin-ai-action-utils";
import { requireTenantAdminChannelAccess } from "@/actions/auth-utils";
import { getVertexThinkingProviderOptions } from "@/lib/ai/server-vertex";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  classifyProductionGroupingDeterministic,
  createProductionGroupingClassifiedValue,
  getProductionGroupingCacheKey,
  getProductionGroupingItemRef,
  getProductionGroupingProfileHash,
  isFreshProductionGroupingClassification,
  PRODUCTION_GROUPING_AI_CONFIDENCE_THRESHOLD,
  PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
  type ProductionGroupingClassificationItem,
  type ProductionGroupingItemRef,
  type ProductionGroupingResolvedClassification,
} from "@/lib/orders/production-materials";
import { MODELS, tenantFirestorePaths } from "@konfi/firebase";
import {
  productionGroupingClassificationVersion,
  type ProductionGroupingClassification,
  type ProductionGroupingClassificationCacheResult,
  type ProductionGroupingClassifiedValue,
  type ProductionGroupingProfile,
} from "@konfi/types";
import { normalizeProductionGroupingSettings } from "@konfi/utils";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
export interface GetProductionGroupingClassificationsAdminInput {
  channelId: string;
  itemRefs: ProductionGroupingItemRef[];
  profile?: ProductionGroupingProfile;
}

export interface ClassifyAndPersistProductionGroupingsAdminInput {
  channelId: string;
  items: ProductionGroupingClassificationItem[];
  orderId: string;
  profile?: ProductionGroupingProfile;
}

export interface ClassifyAndPersistProductionGroupingBatchOrderInput {
  items: ProductionGroupingClassificationItem[];
  orderId: string;
}

export interface ClassifyAndPersistProductionGroupingsBatchAdminInput {
  channelId: string;
  orders: ClassifyAndPersistProductionGroupingBatchOrderInput[];
  profile?: ProductionGroupingProfile;
}

export type GetProductionMaterialClassificationsAdminInput =
  GetProductionGroupingClassificationsAdminInput;

export type ClassifyAndPersistProductionMaterialsAdminInput =
  ClassifyAndPersistProductionGroupingsAdminInput;

export type ClassifyAndPersistProductionMaterialsBatchAdminInput =
  ClassifyAndPersistProductionGroupingsBatchAdminInput;

type ProductionGroupingClassificationDocument =
  ProductionGroupingClassification & {
    orderId?: string;
  };

const PRODUCTION_GROUPING_AI_BATCH_SIZE = 50;
const PRODUCTION_GROUPING_WRITE_BATCH_SIZE = 450;
const PRODUCTION_GROUPING_KNOWN_VALUE_LIMIT = 120;

type ProductionGroupingWriteBatch = ReturnType<
  ReturnType<typeof getAdminDb>["batch"]
>;

interface ProductionGroupingWriteOperation {
  apply: (batch: ProductionGroupingWriteBatch) => void;
}

interface AiProductionGroupingClassification {
  confidence: number;
  primaryLabel?: string;
  reasoning?: string;
  secondaryLabel?: string;
}

interface ProductionGroupingKnownAxisValue {
  axisId: string;
  label: string;
}

interface ProductionGroupingKnownAxisValues {
  primary: ProductionGroupingKnownAxisValue[];
  secondary: ProductionGroupingKnownAxisValue[];
}

function normalizeProductionGroupingPathSegment(
  value: string,
  name: string,
): string {
  const segment = value.trim();

  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/")
  ) {
    throw new Error(`Bad Request: ${name} must be a single path segment`);
  }

  return segment;
}

function normalizeProductionGroupingProfile(
  profile?: ProductionGroupingProfile,
): ProductionGroupingProfile {
  return normalizeProductionGroupingSettings(profile ? { profile } : undefined)
    .profile;
}

function getProductionGroupingItemDocPath(
  tenantContext: Awaited<ReturnType<typeof getTenantContextForRequest>>,
  channelId: string,
  orderId: string,
  itemId: string,
): string {
  return `${tenantFirestorePaths.orderDoc(
    tenantContext,
    normalizeProductionGroupingPathSegment(channelId, "channelId"),
    normalizeProductionGroupingPathSegment(orderId, "orderId"),
  )}/productionGroupingClassifications/${normalizeProductionGroupingPathSegment(
    itemId,
    "itemId",
  )}`;
}

function getProductionGroupingGlobalCacheDocPath(
  tenantContext: Awaited<ReturnType<typeof getTenantContextForRequest>>,
  channelId: string,
  profile: ProductionGroupingProfile,
  signatureHash: string,
): string {
  const docId = `${normalizeProductionGroupingPathSegment(
    profile.id,
    "profileId",
  )}_${normalizeProductionGroupingPathSegment(signatureHash, "signatureHash")}`;

  return tenantFirestorePaths.channelDocument(
    tenantContext,
    normalizeProductionGroupingPathSegment(channelId, "channelId"),
    "productionGroupingClassificationCache",
    docId,
  );
}

function isProductionGroupingClassificationSource(
  value: unknown,
): value is ProductionGroupingClassification["source"] {
  return (
    value === "deterministic" ||
    value === "ai" ||
    value === "manual" ||
    value === "unclassified"
  );
}

function isProductionGroupingClassifiedValue(
  value: unknown,
): value is ProductionGroupingClassifiedValue {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.axisId === "string" &&
    typeof record.groupKey === "string" &&
    typeof record.key === "string" &&
    typeof record.label === "string"
  );
}

function isProductionGroupingClassification(
  value: unknown,
): value is ProductionGroupingClassificationDocument {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.itemId === "string" &&
    typeof record.inputHash === "string" &&
    typeof record.signatureHash === "string" &&
    typeof record.profileId === "string" &&
    typeof record.profileHash === "string" &&
    typeof record.classificationVersion === "string" &&
    typeof record.confidence === "number" &&
    isProductionGroupingClassificationSource(record.source) &&
    isProductionGroupingClassifiedValue(record.primary) &&
    (record.secondary === undefined ||
      isProductionGroupingClassifiedValue(record.secondary))
  );
}

function isFreshGlobalProductionGroupingClassification(
  classification: ProductionGroupingClassification,
  profile: ProductionGroupingProfile,
  signatureHash: string,
) {
  return (
    classification.classificationVersion ===
      productionGroupingClassificationVersion &&
    classification.profileHash === getProductionGroupingProfileHash(profile) &&
    classification.signatureHash === signatureHash
  );
}

function stripProductionGroupingRuntimeFields(
  classification: ProductionGroupingResolvedClassification,
): ProductionGroupingClassification {
  const { needsAi: _needsAi, ...persistable } = classification;
  return persistable;
}

function toSerializableProductionGroupingClassification(
  classification: ProductionGroupingClassificationDocument,
  fallbackOrderId?: string,
): ProductionGroupingClassification {
  const result: ProductionGroupingClassification = {
    classificationVersion: classification.classificationVersion,
    confidence: classification.confidence,
    inputHash: classification.inputHash,
    itemId: classification.itemId,
    primary: classification.primary,
    profileHash: classification.profileHash,
    profileId: classification.profileId,
    signatureHash: classification.signatureHash,
    source: classification.source,
  };

  if (classification.secondary !== undefined) {
    result.secondary = classification.secondary;
  }

  if (classification.reasoning !== undefined) {
    result.reasoning = classification.reasoning;
  }

  if (classification.orderId ?? fallbackOrderId) {
    result.orderId = classification.orderId ?? fallbackOrderId;
  }

  if (classification.tenantId) {
    result.tenantId = classification.tenantId;
  }

  return result;
}

function cleanProductionGroupingWritePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function chunkProductionGroupingItems<T>(
  items: readonly T[],
  size: number,
): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function commitProductionGroupingWriteOperations(
  db: ReturnType<typeof getAdminDb>,
  operations: readonly ProductionGroupingWriteOperation[],
) {
  for (const chunk of chunkProductionGroupingItems(
    operations,
    PRODUCTION_GROUPING_WRITE_BATCH_SIZE,
  )) {
    const batch = db.batch();

    for (const operation of chunk) {
      operation.apply(batch);
    }

    await batch.commit();
  }
}

async function loadProductionGroupingItemSnapshots(
  input: GetProductionGroupingClassificationsAdminInput,
  tenantContext: Awaited<ReturnType<typeof getTenantContextForRequest>>,
) {
  const db = getAdminDb();
  const dedupedRefs = new Map<string, ProductionGroupingItemRef>();

  for (const ref of input.itemRefs) {
    if (
      !ref?.orderId ||
      !ref.itemId ||
      !ref.inputHash ||
      !ref.profileHash ||
      !ref.signatureHash
    ) {
      continue;
    }

    dedupedRefs.set(getProductionGroupingCacheKey(ref.orderId, ref.itemId), {
      inputHash: ref.inputHash,
      itemId: ref.itemId,
      orderId: ref.orderId,
      profileHash: ref.profileHash,
      signatureHash: ref.signatureHash,
    });
  }

  const entries = Array.from(dedupedRefs.values()).map((itemRef) => ({
    itemRef,
    ref: db.doc(
      getProductionGroupingItemDocPath(
        tenantContext,
        input.channelId,
        itemRef.orderId,
        itemRef.itemId,
      ),
    ),
  }));

  if (entries.length === 0) {
    return [];
  }

  const snapshots = await db.getAll(...entries.map((entry) => entry.ref));

  return entries.map((entry, index) => ({
    ...entry,
    snapshot: snapshots[index],
  }));
}

async function loadProductionGroupingGlobalSnapshots(
  input: GetProductionGroupingClassificationsAdminInput,
  tenantContext: Awaited<ReturnType<typeof getTenantContextForRequest>>,
) {
  const profile = normalizeProductionGroupingProfile(input.profile);
  const db = getAdminDb();
  const dedupedRefs = new Map<string, ProductionGroupingItemRef>();

  for (const ref of input.itemRefs) {
    if (!ref?.signatureHash) {
      continue;
    }

    dedupedRefs.set(ref.signatureHash, ref);
  }

  const entries = Array.from(dedupedRefs.values()).map((itemRef) => ({
    itemRef,
    ref: db.doc(
      getProductionGroupingGlobalCacheDocPath(
        tenantContext,
        input.channelId,
        profile,
        itemRef.signatureHash,
      ),
    ),
  }));

  if (entries.length === 0) {
    return [];
  }

  const snapshots = await db.getAll(...entries.map((entry) => entry.ref));

  return entries.map((entry, index) => ({
    ...entry,
    snapshot: snapshots[index],
  }));
}

export async function getProductionGroupingClassificationsAdmin(
  input: GetProductionGroupingClassificationsAdminInput,
): Promise<ProductionGroupingClassificationCacheResult> {
  if (!input.channelId || !Array.isArray(input.itemRefs)) {
    throw new Error("Bad Request: channelId and itemRefs are required");
  }

  const channelId = await requireTenantAdminChannelAccess(input.channelId);
  const profile = normalizeProductionGroupingProfile(input.profile);
  const tenantContext = await getTenantContextForRequest();
  const entries = await loadProductionGroupingItemSnapshots(
    {
      ...input,
      channelId,
      profile,
    },
    tenantContext,
  );
  const result: ProductionGroupingClassificationCacheResult = {};

  for (const { itemRef, snapshot } of entries) {
    if (!snapshot.exists) {
      continue;
    }

    const data = snapshot.data();
    if (
      !isProductionGroupingClassification(data) ||
      !isFreshProductionGroupingClassification(data, itemRef.inputHash, profile)
    ) {
      continue;
    }

    result[getProductionGroupingCacheKey(itemRef.orderId, itemRef.itemId)] = {
      ...toSerializableProductionGroupingClassification(data, itemRef.orderId),
    };
  }

  return result;
}

function buildProductionGroupingClassificationPrompt(
  items: ProductionGroupingClassificationItem[],
  profile: ProductionGroupingProfile,
  knownValues: ProductionGroupingKnownAxisValues,
): string {
  const contextItems = items.map((item) => ({
    advancedAttributeSelections: item.advancedAttributeSelections ?? null,
    calculatedCombination: item.calculatedCombination ?? null,
    categoryName: item.product?.category?.name ?? null,
    combination: item.combination ?? null,
    customFormat: item.customFormat,
    customPrice: item.customPrice,
    description: item.description,
    height: item.height ?? null,
    itemId: item.id,
    itemName: item.name ?? null,
    pageCount: item.pageCount ?? null,
    priceType: item.product?.priceType ?? null,
    productAttributeOptions: item.product?.attributeOptions ?? null,
    productName: item.product?.name ?? null,
    productTypeName: item.product?.productType?.name ?? null,
    unit: item.unit,
    width: item.width ?? null,
  }));

  return JSON.stringify(
    {
      items: contextItems,
      knownValues,
      profile,
    },
    null,
    2,
  );
}

function buildProductionGroupingClassificationSystemPrompt(): string {
  return `You classify production order items for a tenant-configured operations board.

Rules:
- Return only structured JSON matching the requested schema.
- Only return item IDs supplied in the prompt.
- Use the supplied profile axes. Do not invent a different grouping axis.
- Extract the primary axis value and, when configured and visible, the secondary axis value.
- When an axis has allowed values, prefer those labels and normalize aliases to those labels.
- Reuse labels from knownValues whenever a supplied item has the same underlying axis value.
- Keep labels consistent across all items in the same request; equivalent values must receive the exact same label.
- Treat casing, punctuation, word order, unit notation, and synonym differences as possible representations of the same production bucket.
- When an axis allows AI-suggested values and no allowed value matches, use a concise canonical label from the item data.
- If the primary value is unclear, return confidence below ${PRODUCTION_GROUPING_AI_CONFIDENCE_THRESHOLD}.
- Do not invent dimensions, quantities, prices, deadlines, order numbers, or customer metadata.`;
}

async function classifyProductionGroupingsWithAi(
  items: ProductionGroupingClassificationItem[],
  profile: ProductionGroupingProfile,
  knownValues: ProductionGroupingKnownAxisValues,
  orderId: string,
): Promise<Map<string, AiProductionGroupingClassification>> {
  if (items.length === 0) {
    return new Map();
  }

  const schema = z.object({
    classifications: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1),
          itemId: z.string(),
          primaryLabel: z.string().max(80).optional(),
          reasoning: z.string().max(300).optional(),
          secondaryLabel: z.string().max(80).optional(),
        }),
      )
      .max(items.length),
  });
  const validItemIds = new Set(items.map((item) => item.id));
  const prompt = buildProductionGroupingClassificationPrompt(
    items,
    profile,
    knownValues,
  );
  const system = buildProductionGroupingClassificationSystemPrompt();

  try {
    const { output } = await callWithRetry(() =>
      runMeteredAdminTextCall({
        modelId: MODELS.GEMINI_3_FLASH_LITE,
        prompt,
        system,
        run: async () =>
          generateText({
            model: await getModel(MODELS.GEMINI_3_FLASH_LITE),
            providerOptions: getVertexThinkingProviderOptions({
              thinkingLevel: "minimal",
            }),
            output: Output.object({ schema }),
            system,
            prompt,
          }),
      }),
    );

    const classifications = new Map<
      string,
      AiProductionGroupingClassification
    >();

    for (const classification of output.classifications) {
      if (
        !validItemIds.has(classification.itemId) ||
        classifications.has(classification.itemId)
      ) {
        continue;
      }

      const primaryLabel = classification.primaryLabel?.trim() || undefined;
      const secondaryLabel = classification.secondaryLabel?.trim() || undefined;

      classifications.set(classification.itemId, {
        confidence: classification.confidence,
        primaryLabel,
        reasoning: classification.reasoning?.trim() || undefined,
        secondaryLabel,
      });
    }

    return classifications;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      logStructuredOutputFailure(error, {
        action: "classifyAndPersistProductionGroupingsAdmin",
        schemaBranch: "productionGroupingClassifications",
        orderId,
        promptCategory: "production-grouping-classification",
      });
    } else {
      console.error(
        "[classifyAndPersistProductionGroupingsAdmin] Failed to classify production groupings",
        {
          error,
          orderId,
        },
      );
    }

    return new Map();
  }
}

function projectProductionGroupingClassification(
  classification: ProductionGroupingClassification,
  deterministic: ProductionGroupingResolvedClassification,
  orderId: string,
): ProductionGroupingClassification {
  const {
    createdAt: _createdAt,
    orderId: _orderId,
    updatedAt: _updatedAt,
    ...persistableClassification
  } = classification;

  return {
    ...persistableClassification,
    inputHash: deterministic.inputHash,
    itemId: deterministic.itemId,
    orderId,
    profileHash: deterministic.profileHash,
    profileId: deterministic.profileId,
    signatureHash: deterministic.signatureHash,
  };
}

function mergeAiProductionGroupingClassification(
  deterministic: ProductionGroupingResolvedClassification,
  profile: ProductionGroupingProfile,
  aiClassification: AiProductionGroupingClassification | undefined,
): ProductionGroupingClassification {
  const normalizedProfile = normalizeProductionGroupingProfile(profile);
  const acceptedAi =
    aiClassification &&
    aiClassification.confidence >= PRODUCTION_GROUPING_AI_CONFIDENCE_THRESHOLD;
  const aiPrimary =
    acceptedAi && aiClassification.primaryLabel
      ? createProductionGroupingClassifiedValue(
          normalizedProfile.primaryAxis,
          aiClassification.primaryLabel,
        )
      : null;
  const aiSecondary =
    acceptedAi &&
    aiClassification.secondaryLabel &&
    normalizedProfile.secondaryAxis
      ? createProductionGroupingClassifiedValue(
          normalizedProfile.secondaryAxis,
          aiClassification.secondaryLabel,
        )
      : null;
  const primary =
    aiPrimary ??
    (deterministic.primary.groupKey !== PRODUCTION_GROUPING_UNCLASSIFIED_KEY
      ? deterministic.primary
      : {
          axisId: normalizedProfile.primaryAxis.id,
          groupKey: PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
          key: PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
          label: "Unclassified",
        });
  const source =
    aiPrimary || aiSecondary
      ? "ai"
      : primary.groupKey === PRODUCTION_GROUPING_UNCLASSIFIED_KEY
        ? "unclassified"
        : deterministic.source;

  return {
    classificationVersion: productionGroupingClassificationVersion,
    confidence: acceptedAi
      ? aiClassification.confidence
      : (aiClassification?.confidence ?? deterministic.confidence),
    inputHash: deterministic.inputHash,
    itemId: deterministic.itemId,
    primary,
    profileHash: deterministic.profileHash,
    profileId: deterministic.profileId,
    reasoning:
      aiClassification?.reasoning ??
      deterministic.reasoning ??
      "AI classification was unavailable or below the confidence threshold.",
    secondary: aiSecondary ?? deterministic.secondary,
    signatureHash: deterministic.signatureHash,
    source,
  };
}

function withTenantContext(
  classification: ProductionGroupingClassification,
  tenantContext: Awaited<ReturnType<typeof getTenantContextForRequest>>,
): ProductionGroupingClassification {
  return {
    ...classification,
    ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
  };
}

function createProductionGroupingKnownAxisValueKey(
  axisId: string,
  label: string,
) {
  return `${axisId}:${label.trim().toLowerCase()}`;
}

function addKnownProductionGroupingAxisValue(
  values: Map<string, ProductionGroupingKnownAxisValue>,
  value: ProductionGroupingKnownAxisValue,
) {
  const label = value.label.trim();

  if (!label || label === PRODUCTION_GROUPING_UNCLASSIFIED_KEY) {
    return;
  }

  const key = createProductionGroupingKnownAxisValueKey(value.axisId, label);

  if (!values.has(key)) {
    values.set(key, {
      axisId: value.axisId,
      label,
    });
  }
}

function addKnownProductionGroupingClassification(
  knownValues: {
    primary: Map<string, ProductionGroupingKnownAxisValue>;
    secondary: Map<string, ProductionGroupingKnownAxisValue>;
  },
  classification: ProductionGroupingClassification,
  profile: ProductionGroupingProfile,
) {
  if (
    classification.primary.groupKey !== PRODUCTION_GROUPING_UNCLASSIFIED_KEY &&
    classification.primary.axisId === profile.primaryAxis.id
  ) {
    addKnownProductionGroupingAxisValue(knownValues.primary, {
      axisId: classification.primary.axisId,
      label: classification.primary.label,
    });
  }

  if (
    classification.secondary &&
    profile.secondaryAxis &&
    classification.secondary.groupKey !==
      PRODUCTION_GROUPING_UNCLASSIFIED_KEY &&
    classification.secondary.axisId === profile.secondaryAxis.id
  ) {
    addKnownProductionGroupingAxisValue(knownValues.secondary, {
      axisId: classification.secondary.axisId,
      label: classification.secondary.label,
    });
  }
}

function addKnownAiProductionGroupingClassification(
  knownValues: {
    primary: Map<string, ProductionGroupingKnownAxisValue>;
    secondary: Map<string, ProductionGroupingKnownAxisValue>;
  },
  classification: AiProductionGroupingClassification,
  profile: ProductionGroupingProfile,
) {
  if (classification.confidence < PRODUCTION_GROUPING_AI_CONFIDENCE_THRESHOLD) {
    return;
  }

  if (classification.primaryLabel) {
    const primary = createProductionGroupingClassifiedValue(
      profile.primaryAxis,
      classification.primaryLabel,
    );

    if (primary) {
      addKnownProductionGroupingAxisValue(knownValues.primary, {
        axisId: primary.axisId,
        label: primary.label,
      });
    }
  }

  if (classification.secondaryLabel && profile.secondaryAxis) {
    const secondary = createProductionGroupingClassifiedValue(
      profile.secondaryAxis,
      classification.secondaryLabel,
    );

    if (secondary) {
      addKnownProductionGroupingAxisValue(knownValues.secondary, {
        axisId: secondary.axisId,
        label: secondary.label,
      });
    }
  }
}

function toProductionGroupingKnownValuesSnapshot(knownValues: {
  primary: Map<string, ProductionGroupingKnownAxisValue>;
  secondary: Map<string, ProductionGroupingKnownAxisValue>;
}): ProductionGroupingKnownAxisValues {
  return {
    primary: Array.from(knownValues.primary.values())
      .toSorted((left, right) => left.label.localeCompare(right.label))
      .slice(0, PRODUCTION_GROUPING_KNOWN_VALUE_LIMIT),
    secondary: Array.from(knownValues.secondary.values())
      .toSorted((left, right) => left.label.localeCompare(right.label))
      .slice(0, PRODUCTION_GROUPING_KNOWN_VALUE_LIMIT),
  };
}

interface ProductionGroupingBatchItem {
  cacheKey: string;
  deterministic: ProductionGroupingResolvedClassification;
  item: ProductionGroupingClassificationItem;
  itemRef: ProductionGroupingItemRef;
  orderId: string;
}

interface ProductionGroupingItemClassificationWrite {
  classification: ProductionGroupingClassification;
  orderId: string;
}

export async function classifyAndPersistProductionGroupingsBatchAdmin(
  input: ClassifyAndPersistProductionGroupingsBatchAdminInput,
): Promise<ProductionGroupingClassificationCacheResult> {
  if (!input.channelId || !Array.isArray(input.orders)) {
    throw new Error("Bad Request: channelId and orders are required");
  }

  const channelId = await requireTenantAdminChannelAccess(input.channelId);

  if (input.orders.length === 0) {
    return {};
  }

  const profile = normalizeProductionGroupingProfile(input.profile);
  const tenantContext = await getTenantContextForRequest();
  const dedupedItems = new Map<
    string,
    {
      item: ProductionGroupingClassificationItem;
      orderId: string;
    }
  >();

  for (const orderInput of input.orders) {
    if (!orderInput?.orderId || !Array.isArray(orderInput.items)) {
      continue;
    }

    for (const item of orderInput.items) {
      if (!item?.id) {
        continue;
      }

      dedupedItems.set(
        getProductionGroupingCacheKey(orderInput.orderId, item.id),
        {
          item,
          orderId: orderInput.orderId,
        },
      );
    }
  }

  const batchItems: ProductionGroupingBatchItem[] = Array.from(
    dedupedItems.entries(),
  ).map(([cacheKey, { item, orderId }]) => {
    const deterministic = classifyProductionGroupingDeterministic(
      item,
      profile,
    );
    return {
      cacheKey,
      deterministic,
      item,
      itemRef: getProductionGroupingItemRef(orderId, item, profile),
      orderId,
    };
  });

  if (batchItems.length === 0) {
    return {};
  }

  const itemRefs = batchItems.map((batchItem) => batchItem.itemRef);
  const itemEntries = await loadProductionGroupingItemSnapshots(
    {
      channelId,
      itemRefs,
      profile,
    },
    tenantContext,
  );
  const existingItemByCacheKey = new Map<
    string,
    {
      data: ProductionGroupingClassificationDocument | null;
      exists: boolean;
      ref: (typeof itemEntries)[number]["ref"];
    }
  >();

  for (const entry of itemEntries) {
    const snapshotData = entry.snapshot.data();

    existingItemByCacheKey.set(
      getProductionGroupingCacheKey(
        entry.itemRef.orderId,
        entry.itemRef.itemId,
      ),
      {
        data: isProductionGroupingClassification(snapshotData)
          ? snapshotData
          : null,
        exists: entry.snapshot.exists,
        ref: entry.ref,
      },
    );
  }

  const result: ProductionGroupingClassificationCacheResult = {};
  const knownValues = {
    primary: new Map<string, ProductionGroupingKnownAxisValue>(),
    secondary: new Map<string, ProductionGroupingKnownAxisValue>(),
  };
  const unresolvedItems: ProductionGroupingBatchItem[] = [];

  for (const batchItem of batchItems) {
    const existing = existingItemByCacheKey.get(batchItem.cacheKey);

    if (
      existing?.data &&
      isFreshProductionGroupingClassification(
        existing.data,
        batchItem.deterministic.inputHash,
        profile,
      )
    ) {
      const classification = toSerializableProductionGroupingClassification(
        existing.data,
        batchItem.orderId,
      );
      result[batchItem.cacheKey] = classification;
      addKnownProductionGroupingClassification(
        knownValues,
        classification,
        profile,
      );
      continue;
    }

    unresolvedItems.push(batchItem);
  }

  const unresolvedRefs = unresolvedItems.map((batchItem) => batchItem.itemRef);
  const globalEntries = await loadProductionGroupingGlobalSnapshots(
    {
      channelId,
      itemRefs: unresolvedRefs,
      profile,
    },
    tenantContext,
  );
  const existingGlobalBySignature = new Map<
    string,
    {
      data: ProductionGroupingClassificationDocument | null;
      exists: boolean;
      ref: (typeof globalEntries)[number]["ref"];
    }
  >();

  for (const entry of globalEntries) {
    const snapshotData = entry.snapshot.data();

    existingGlobalBySignature.set(entry.itemRef.signatureHash, {
      data: isProductionGroupingClassification(snapshotData)
        ? snapshotData
        : null,
      exists: entry.snapshot.exists,
      ref: entry.ref,
    });
  }

  const itemClassificationsToWrite: ProductionGroupingItemClassificationWrite[] =
    [];
  const globalClassificationsToWrite = new Map<
    string,
    ProductionGroupingClassification
  >();
  const aiCandidateGroups = new Map<
    string,
    {
      deterministic: ProductionGroupingResolvedClassification;
      items: ProductionGroupingBatchItem[];
      representative: ProductionGroupingClassificationItem;
    }
  >();

  for (const batchItem of unresolvedItems) {
    const { deterministic } = batchItem;
    const global = existingGlobalBySignature.get(
      batchItem.itemRef.signatureHash,
    );
    if (
      global?.data &&
      isFreshGlobalProductionGroupingClassification(
        global.data,
        profile,
        batchItem.itemRef.signatureHash,
      )
    ) {
      const classification = projectProductionGroupingClassification(
        global.data,
        deterministic,
        batchItem.orderId,
      );
      itemClassificationsToWrite.push({
        classification,
        orderId: batchItem.orderId,
      });
      addKnownProductionGroupingClassification(
        knownValues,
        classification,
        profile,
      );
      continue;
    }

    if (!deterministic.needsAi) {
      const classification =
        stripProductionGroupingRuntimeFields(deterministic);
      itemClassificationsToWrite.push({
        classification,
        orderId: batchItem.orderId,
      });
      addKnownProductionGroupingClassification(
        knownValues,
        classification,
        profile,
      );
      globalClassificationsToWrite.set(
        deterministic.signatureHash,
        classification,
      );
      continue;
    }

    const existingGroup = aiCandidateGroups.get(deterministic.signatureHash);
    if (existingGroup) {
      existingGroup.items.push(batchItem);
    } else {
      aiCandidateGroups.set(deterministic.signatureHash, {
        deterministic,
        items: [batchItem],
        representative: {
          ...batchItem.item,
          id: deterministic.signatureHash,
        },
      });
    }
  }

  const aiClassifications = new Map<
    string,
    AiProductionGroupingClassification
  >();
  const representativeItems = Array.from(aiCandidateGroups.values()).map(
    (group) => group.representative,
  );

  for (const chunk of chunkProductionGroupingItems(
    representativeItems,
    PRODUCTION_GROUPING_AI_BATCH_SIZE,
  )) {
    const chunkClassifications = await classifyProductionGroupingsWithAi(
      chunk,
      profile,
      toProductionGroupingKnownValuesSnapshot(knownValues),
      "batch",
    );

    for (const [itemId, classification] of chunkClassifications) {
      aiClassifications.set(itemId, classification);
      addKnownAiProductionGroupingClassification(
        knownValues,
        classification,
        profile,
      );
    }
  }

  for (const group of aiCandidateGroups.values()) {
    const classification = mergeAiProductionGroupingClassification(
      group.deterministic,
      profile,
      aiClassifications.get(group.deterministic.signatureHash),
    );
    globalClassificationsToWrite.set(
      group.deterministic.signatureHash,
      classification,
    );
    addKnownProductionGroupingClassification(
      knownValues,
      classification,
      profile,
    );

    for (const batchItem of group.items) {
      itemClassificationsToWrite.push({
        classification: projectProductionGroupingClassification(
          classification,
          batchItem.deterministic,
          batchItem.orderId,
        ),
        orderId: batchItem.orderId,
      });
    }
  }

  if (
    itemClassificationsToWrite.length > 0 ||
    globalClassificationsToWrite.size > 0
  ) {
    const db = getAdminDb();
    const writeOperations: ProductionGroupingWriteOperation[] = [];

    for (const { classification, orderId } of itemClassificationsToWrite) {
      const cacheKey = getProductionGroupingCacheKey(
        orderId,
        classification.itemId,
      );
      const existing = existingItemByCacheKey.get(cacheKey);
      const ref =
        existing?.ref ??
        db.doc(
          getProductionGroupingItemDocPath(
            tenantContext,
            channelId,
            orderId,
            classification.itemId,
          ),
        );
      const payload = cleanProductionGroupingWritePayload({
        ...classification,
        orderId,
        ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
        ...(existing?.exists
          ? {}
          : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      });

      writeOperations.push({
        apply: (batch) => batch.set(ref, payload, { merge: true }),
      });
      result[cacheKey] = withTenantContext(
        {
          ...classification,
          orderId,
        },
        tenantContext,
      );
    }

    for (const [
      signatureHash,
      classification,
    ] of globalClassificationsToWrite) {
      const existing = existingGlobalBySignature.get(signatureHash);
      const ref =
        existing?.ref ??
        db.doc(
          getProductionGroupingGlobalCacheDocPath(
            tenantContext,
            channelId,
            profile,
            signatureHash,
          ),
        );
      const payload = cleanProductionGroupingWritePayload({
        ...classification,
        orderId: undefined,
        ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
        ...(existing?.exists
          ? {}
          : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      });

      writeOperations.push({
        apply: (batch) => batch.set(ref, payload, { merge: true }),
      });
    }

    await commitProductionGroupingWriteOperations(db, writeOperations);
  }

  return result;
}

export async function classifyAndPersistProductionGroupingsAdmin(
  input: ClassifyAndPersistProductionGroupingsAdminInput,
): Promise<ProductionGroupingClassificationCacheResult> {
  if (!input.channelId || !input.orderId || !Array.isArray(input.items)) {
    throw new Error("Bad Request: channelId, orderId, and items are required");
  }

  return classifyAndPersistProductionGroupingsBatchAdmin({
    channelId: input.channelId,
    orders: [
      {
        items: input.items,
        orderId: input.orderId,
      },
    ],
    profile: input.profile,
  });
}

export async function getProductionMaterialClassificationsAdmin(
  input: GetProductionMaterialClassificationsAdminInput,
): Promise<ProductionGroupingClassificationCacheResult> {
  return getProductionGroupingClassificationsAdmin(input);
}

export async function classifyAndPersistProductionMaterialsAdmin(
  input: ClassifyAndPersistProductionMaterialsAdminInput,
): Promise<ProductionGroupingClassificationCacheResult> {
  return classifyAndPersistProductionGroupingsAdmin(input);
}

export async function classifyAndPersistProductionMaterialsBatchAdmin(
  input: ClassifyAndPersistProductionMaterialsBatchAdminInput,
): Promise<ProductionGroupingClassificationCacheResult> {
  return classifyAndPersistProductionGroupingsBatchAdmin(input);
}
