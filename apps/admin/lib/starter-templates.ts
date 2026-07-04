import { CurrencyEnum, PriceTypeEnum, type Attribute } from "@konfi/types";
import type { ProductPrice } from "@konfi/types";
import {
  calculatePricesFromSubcollection,
  DEFAULT_PRICE,
  generateKeywords,
} from "@konfi/utils";
import type { DeploymentMode, TenantContext } from "@sblyvwx/cloud-contracts";

export const STARTER_TEMPLATE_FORMAT = "konfi.starter-template.sanitized";
export const STARTER_TEMPLATE_VERSION = 1;

const SAFE_CHANNEL_SETTING_IDS = [
  "buying",
  "express",
  "freeShipping",
  "shippingOptionsPrices",
  "supportTaxonomy",
  "tax",
  "underConstruction",
] as const;

const PRICE_SUBCOLLECTION_RESOURCES = {
  pageCountPrices: "productPageCountPrices",
  pageCountSegmentStepPrices: "productPageCountSegmentStepPrices",
  pageCountStepPrices: "productPageCountStepPrices",
  prices: "productPrices",
} as const;

const PRODUCT_PRICE_SUBCOLLECTIONS = Object.keys(
  PRICE_SUBCOLLECTION_RESOURCES,
) as Array<keyof typeof PRICE_SUBCOLLECTION_RESOURCES>;

const DISALLOWED_PATH_SEGMENTS = new Set([
  "agents",
  "assistantConversations",
  "auth",
  "carts",
  "changes",
  "customers",
  "emailOrderImports",
  "externalImports",
  "externalProducts",
  "fakturowniaAutomation",
  "fcmTokens",
  "fulfillmentRequests",
  "generatedOrderItems",
  "imageGeneration",
  "impositionTemplates",
  "impositionWorkflows",
  "inboundEmails",
  "members",
  "notes",
  "orders",
  "quotes",
  "ratings",
  "scanEvents",
  "storageAttachments",
  "teamMessages",
  "users",
]);

const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /auth/i,
  /client[-_]?secret/i,
  /credential/i,
  /password/i,
  /private[-_]?key/i,
  /refresh[-_]?token/i,
  /secret/i,
  /session/i,
  /token/i,
] as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type StarterTemplateResource =
  | "attribute"
  | "attributeTranslation"
  | "category"
  | "categoryTranslation"
  | "channel"
  | "channelCms"
  | "channelCmsTranslation"
  | "channelMetadata"
  | "channelMetadataTranslation"
  | "channelPage"
  | "channelPageTranslation"
  | "channelSetting"
  | "customerGroup"
  | "dynamicPricingPreset"
  | "product"
  | "productDynamicPricing"
  | "productPageCountPrices"
  | "productPageCountSegmentStepPrices"
  | "productPageCountStepPrices"
  | "productPrices"
  | "productTranslation"
  | "productType";

const STARTER_TEMPLATE_RESOURCES = [
  "attribute",
  "attributeTranslation",
  "category",
  "categoryTranslation",
  "channel",
  "channelCms",
  "channelCmsTranslation",
  "channelMetadata",
  "channelMetadataTranslation",
  "channelPage",
  "channelPageTranslation",
  "channelSetting",
  "customerGroup",
  "dynamicPricingPreset",
  "product",
  "productDynamicPricing",
  "productPageCountPrices",
  "productPageCountSegmentStepPrices",
  "productPageCountStepPrices",
  "productPrices",
  "productTranslation",
  "productType",
] as const satisfies readonly StarterTemplateResource[];

const STARTER_TEMPLATE_RESOURCE_SET = new Set<StarterTemplateResource>(
  STARTER_TEMPLATE_RESOURCES,
);

export interface StarterTemplateDocument {
  id: string;
  resource: StarterTemplateResource;
  sourcePath: string;
  data: JsonObject;
}

export interface StarterTemplateManifest {
  exportedAt: string;
  format: typeof STARTER_TEMPLATE_FORMAT;
  version: typeof STARTER_TEMPLATE_VERSION;
  name: string;
  source: {
    channelId: string;
    deploymentMode: DeploymentMode;
    tenantId?: string;
  };
  storagePolicy: {
    includeObjects: false;
    productMedia: "filename-only";
  };
  resources: StarterTemplateDocument[];
  counts: Record<StarterTemplateResource, number>;
}

export interface StarterTemplateActor {
  id: string;
  name: string;
}

export interface ExportStarterTemplateInput {
  db: FirestoreLike;
  name?: string;
  sourceChannelId: string;
  sourceTenantContext: TenantContext;
  exportedAt?: Date;
}

export interface ImportStarterTemplateInput {
  actor: StarterTemplateActor;
  allowOverwrite?: boolean;
  channelName?: string;
  db: FirestoreLike;
  importedAt?: Date;
  manifest: StarterTemplateManifest;
  targetChannelId: string;
  targetTenantContext: TenantContext;
}

export interface StarterTemplateImportResult {
  channelId: string;
  documentCount: number;
  idRewrites: {
    attributes: Record<string, string>;
    productTypes: Record<string, string>;
  };
  targetTenantId?: string;
}

export interface DocumentReferenceLike {
  id: string;
  path: string;
}

export interface ReadableDocumentReferenceLike extends DocumentReferenceLike {
  get(): Promise<DocumentSnapshotLike>;
}

export interface DocumentSnapshotLike {
  id: string;
  exists: boolean;
  ref: DocumentReferenceLike;
  data(): Record<string, unknown> | undefined;
}

export interface QuerySnapshotLike {
  docs: DocumentSnapshotLike[];
}

export interface QueryLike {
  get(): Promise<QuerySnapshotLike>;
}

export interface CollectionReferenceLike extends QueryLike {
  doc(id?: string): DocumentReferenceLike;
  path: string;
  where(fieldPath: string, opStr: "==", value: unknown): QueryLike;
}

export interface WriteBatchLike {
  set(
    ref: DocumentReferenceLike,
    data: Record<string, unknown>,
  ): WriteBatchLike;
  commit(): Promise<void>;
}

export interface FirestoreLike {
  batch(): WriteBatchLike;
  collection(path: string): CollectionReferenceLike;
  doc(path: string): ReadableDocumentReferenceLike;
  getAll?(
    ...documentRefs: ReadableDocumentReferenceLike[]
  ): Promise<DocumentSnapshotLike[]>;
}

interface RewriteContext {
  attributeIds: Map<string, string>;
  productTypeIds: Map<string, string>;
  sourceChannelId: string;
  sourceTenantId?: string;
  targetChannelId: string;
  targetTenantContext: TenantContext;
  targetTenantId?: string;
}

interface PreparedTemplateWrite {
  data: Record<string, unknown>;
  path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value);
}

function normalizeSegment(value: string, name: string): string {
  const normalized = value.trim();

  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error(`${name} is required.`);
  }

  if (normalized.includes("/")) {
    throw new Error(`${name} must be a single Firestore path segment.`);
  }

  return normalized;
}

function normalizePath(path: string): string {
  const normalized = path.trim().replace(/^\/+|\/+$/g, "");

  if (!normalized) {
    throw new Error("Firestore path is required.");
  }

  const segments = normalized.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid Firestore path "${path}".`);
  }

  return segments.join("/");
}

function pathSegments(path: string): string[] {
  return normalizePath(path).split("/");
}

function getTargetTenantId(context: TenantContext): string | undefined {
  const tenantId = context.tenantId?.trim();

  if (context.deploymentMode === "saas" || context.requireTenantId) {
    if (!tenantId) {
      throw new Error("Target tenant id is required for starter import.");
    }

    return tenantId;
  }

  return tenantId && tenantId !== "default" ? tenantId : undefined;
}

function getSourceTenantId(context: TenantContext): string | undefined {
  const tenantId = context.tenantId?.trim();

  if (context.deploymentMode === "saas" || context.requireTenantId) {
    if (!tenantId) {
      throw new Error("Source tenant id is required for starter export.");
    }

    return tenantId;
  }

  return tenantId && tenantId !== "default" ? tenantId : undefined;
}

function shouldFilterTenant(context: TenantContext): boolean {
  return context.deploymentMode === "saas" || context.requireTenantId;
}

function isTimestampLike(value: unknown): value is { toDate(): Date } {
  return (
    isRecord(value) &&
    typeof value.toDate === "function" &&
    value.toDate() instanceof Date
  );
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isTimestampLike(value)) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    const items: JsonValue[] = [];

    for (const item of value) {
      const jsonValue = toJsonValue(item);
      if (jsonValue !== undefined) {
        items.push(jsonValue);
      }
    }

    return items;
  }

  if (isRecord(value)) {
    const object: JsonObject = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const jsonValue = toJsonValue(nestedValue);
      if (jsonValue !== undefined) {
        object[key] = jsonValue;
      }
    }

    return object;
  }

  throw new Error(`Unsupported starter template value type: ${typeof value}.`);
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  const jsonValue = toJsonValue(value);

  if (!jsonValue || !isJsonObject(jsonValue)) {
    throw new Error("Starter template document data must be an object.");
  }

  return jsonValue;
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readBoolean(value: JsonValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function pickJsonObject(
  source: JsonObject,
  keys: readonly string[],
): JsonObject {
  const result: JsonObject = {};

  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

function setIfDefined(
  target: JsonObject,
  key: string,
  value: JsonValue | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function sanitizeImages(value: JsonValue | undefined): JsonValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => {
    if (typeof item !== "string") {
      return false;
    }

    const image = item.trim();

    return (
      image.length > 0 &&
      !image.includes("/") &&
      !image.toLowerCase().startsWith("ai-") &&
      !image.toLowerCase().includes("generated") &&
      !image.toLowerCase().includes("token")
    );
  });
}

function sanitizeSpec(source: JsonObject): JsonObject {
  const spec = pickJsonObject(source, [
    "defaultOrder",
    "maximumHeight",
    "maximumOrder",
    "maximumRatio",
    "maximumWidth",
    "minimumHeight",
    "minimumOrder",
    "minimumRatio",
    "minimumWidth",
    "step",
    "validateRatio",
    "widthStep",
    "heightStep",
  ]);

  spec.images = sanitizeImages(source.images);

  return spec;
}

function sanitizeAvailability(source: JsonObject | undefined): JsonObject {
  return {
    availableForPurchase:
      readBoolean(source?.availableForPurchase) ??
      readBoolean(source?.published) ??
      true,
    published: readBoolean(source?.published) ?? true,
  };
}

function sanitizeChannel(
  data: JsonObject,
  sourceChannelId: string,
): JsonObject {
  return {
    active: readBoolean(data.active) ?? true,
    currency: readString(data.currency) ?? CurrencyEnum.PLN,
    id: sourceChannelId,
    name: readString(data.name) ?? "Starter channel",
    warehouses: [],
  };
}

function sanitizeAttribute(data: JsonObject, id: string): JsonObject {
  const sanitized = pickJsonObject(data, [
    "calculated",
    "calculateStockFromSheet",
    "format",
    "name",
    "options",
    "pages",
    "required",
    "trackStock",
    "type",
  ]);

  sanitized.active = readBoolean(data.active) ?? true;
  sanitized.id = id;

  return sanitized;
}

function sanitizeProductType(data: JsonObject, id: string): JsonObject {
  const sanitized = pickJsonObject(data, ["attributes", "isShippable", "name"]);

  sanitized.active = readBoolean(data.active) ?? true;
  sanitized.id = id;

  return sanitized;
}

function sanitizeCategory(data: JsonObject, id: string): JsonObject {
  const sanitized = pickJsonObject(data, ["description", "name", "seo"]);
  sanitized.id = id;

  return sanitized;
}

function sanitizeCustomerGroup(data: JsonObject, id: string): JsonObject {
  const sanitized = pickJsonObject(data, ["description", "name"]);
  sanitized.active = readBoolean(data.active) ?? true;
  sanitized.id = id;

  return sanitized;
}

function sanitizeProduct(data: JsonObject, id: string): JsonObject {
  const sanitized = pickJsonObject(data, [
    "allowCustomPrice",
    "attributeDependencies",
    "attributeOptions",
    "attributes",
    "availability",
    "category",
    "customSize",
    "customSizes",
    "description",
    "designSpec",
    "difficulty",
    "disablePriceFetch",
    "name",
    "pageCount",
    "prefferedUnit",
    "priceType",
    "productType",
    "recommended",
    "seo",
    "shipping",
    "specialNotes",
    "spec",
    "threeDModel",
    "volumes",
  ]);

  sanitized.active = readBoolean(data.active) ?? true;
  sanitized.availability = sanitizeAvailability(
    isJsonObject(data.availability) ? data.availability : undefined,
  );
  sanitized.id = id;
  sanitized.prices = [];
  sanitized.spec = sanitizeSpec(isJsonObject(data.spec) ? data.spec : {});

  return sanitized;
}

function sanitizeProductPrice(data: JsonObject, id: string): JsonObject {
  const sanitized = pickJsonObject(data, [
    "calculatedCombination",
    "pageCount",
    "prices",
  ]);

  sanitized.id = id;
  setIfDefined(sanitized, "productId", data.productId);
  setIfDefined(sanitized, "channelId", data.channelId);

  return sanitized;
}

function sanitizeTranslation(data: JsonObject, id: string): JsonObject {
  const sanitized = pickJsonObject(data, [
    "description",
    "locale",
    "name",
    "options",
    "seo",
    "specialNotes",
    "title",
  ]);

  sanitized.id = id;

  return sanitized;
}

function sanitizeGenericChannelDocument(
  data: JsonObject,
  id: string,
): JsonObject {
  const sanitized = { ...data };
  delete sanitized.createdAt;
  delete sanitized.createdBy;
  delete sanitized.keywords;
  delete sanitized.tenantId;
  delete sanitized.updatedAt;
  delete sanitized.updatedBy;

  sanitized.id = id;

  return sanitized;
}

function sanitizeDocumentData(
  resource: StarterTemplateResource,
  id: string,
  data: JsonObject,
  sourceChannelId: string,
): JsonObject {
  switch (resource) {
    case "attribute":
      return sanitizeAttribute(data, id);
    case "attributeTranslation":
    case "categoryTranslation":
    case "channelCmsTranslation":
    case "channelMetadataTranslation":
    case "channelPageTranslation":
    case "productTranslation":
      return sanitizeTranslation(data, id);
    case "category":
      return sanitizeCategory(data, id);
    case "channel":
      return sanitizeChannel(data, sourceChannelId);
    case "customerGroup":
      return sanitizeCustomerGroup(data, id);
    case "product":
      return sanitizeProduct(data, id);
    case "productDynamicPricing":
      return pickJsonObject(data, [
        "attributeRules",
        "baseDeliveryTime",
        "basePrice",
        "enabled",
        "globalRules",
        "inputs",
        "linkedPresetIds",
      ]);
    case "productPageCountPrices":
    case "productPageCountSegmentStepPrices":
    case "productPageCountStepPrices":
    case "productPrices":
      return sanitizeProductPrice(data, id);
    case "productType":
      return sanitizeProductType(data, id);
    case "channelCms":
    case "channelMetadata":
    case "channelPage":
    case "channelSetting":
    case "dynamicPricingPreset":
      return sanitizeGenericChannelDocument(data, id);
  }
}

function assertSafeKeys(value: JsonValue, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSafeKeys(item, [...path, String(index)]),
    );
    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      throw new Error(
        `Starter template contains a sensitive key at ${[...path, key].join(".")}.`,
      );
    }

    assertSafeKeys(nestedValue, [...path, key]);
  }
}

function assertSafePath(path: string): void {
  const segments = pathSegments(path);

  for (const segment of segments) {
    if (DISALLOWED_PATH_SEGMENTS.has(segment)) {
      throw new Error(`Starter template path is not allowed: ${path}.`);
    }
  }
}

function countDocuments(
  documents: StarterTemplateDocument[],
): Record<StarterTemplateResource, number> {
  const counts = Object.fromEntries(
    STARTER_TEMPLATE_RESOURCES.map((resource) => [resource, 0]),
  ) as Record<StarterTemplateResource, number>;

  for (const document of documents) {
    counts[document.resource] += 1;
  }

  return counts;
}

async function getDocument(
  db: FirestoreLike,
  path: string,
): Promise<DocumentSnapshotLike | undefined> {
  const snapshot = await db.doc(normalizePath(path)).get();
  return snapshot.exists ? snapshot : undefined;
}

async function getCollectionDocs(
  db: FirestoreLike,
  path: string,
  context?: TenantContext,
): Promise<DocumentSnapshotLike[]> {
  const collectionRef = db.collection(normalizePath(path));

  if (context && shouldFilterTenant(context)) {
    const tenantId = getSourceTenantId(context);
    const snapshot = await collectionRef
      .where("tenantId", "==", tenantId)
      .get();
    return snapshot.docs;
  }

  const snapshot = await collectionRef.get();
  return snapshot.docs;
}

function makeDocument(
  resource: StarterTemplateResource,
  snapshot: DocumentSnapshotLike,
  sourceChannelId: string,
): StarterTemplateDocument {
  assertSafePath(snapshot.ref.path);

  const data = snapshot.data();
  if (!data) {
    throw new Error(
      `Starter template source document is empty: ${snapshot.ref.path}.`,
    );
  }

  const sanitized = sanitizeDocumentData(
    resource,
    snapshot.id,
    toJsonObject(data),
    sourceChannelId,
  );
  assertSafeKeys(sanitized);

  return {
    data: sanitized,
    id: snapshot.id,
    resource,
    sourcePath: normalizePath(snapshot.ref.path),
  };
}

async function addCollection(
  output: StarterTemplateDocument[],
  options: {
    db: FirestoreLike;
    path: string;
    resource: StarterTemplateResource;
    safeDocumentIds?: readonly string[];
    sourceChannelId: string;
  },
): Promise<void> {
  const docs = await getCollectionDocs(options.db, options.path);
  const safeDocumentIds = options.safeDocumentIds
    ? new Set(options.safeDocumentIds)
    : undefined;

  for (const doc of docs) {
    if (safeDocumentIds && !safeDocumentIds.has(doc.id)) {
      continue;
    }

    output.push(makeDocument(options.resource, doc, options.sourceChannelId));
  }
}

async function addActiveTenantCollection(
  output: StarterTemplateDocument[],
  options: {
    db: FirestoreLike;
    path: string;
    resource: StarterTemplateResource;
    sourceChannelId: string;
    sourceTenantContext: TenantContext;
  },
): Promise<void> {
  const docs = await getCollectionDocs(
    options.db,
    options.path,
    options.sourceTenantContext,
  );

  for (const doc of docs) {
    const data = doc.data();
    if (data?.active === false || data?.archivedAt) {
      continue;
    }

    output.push(makeDocument(options.resource, doc, options.sourceChannelId));
  }
}

async function addNestedTranslations(
  output: StarterTemplateDocument[],
  options: {
    db: FirestoreLike;
    parentPath: string;
    resource: StarterTemplateResource;
    sourceChannelId: string;
  },
): Promise<void> {
  await addCollection(output, {
    db: options.db,
    path: `${options.parentPath}/translations`,
    resource: options.resource,
    sourceChannelId: options.sourceChannelId,
  });
}

function collectProductIds(documents: StarterTemplateDocument[]): string[] {
  return documents
    .filter((document) => document.resource === "product")
    .map((document) => document.id);
}

function collectReferencedAttributeIds(
  documents: StarterTemplateDocument[],
): string[] {
  const ids = new Set<string>();

  for (const document of documents) {
    if (document.resource !== "product") {
      continue;
    }

    readStringArray(document.data.attributes).forEach((id) => ids.add(id));
  }

  return Array.from(ids).toSorted();
}

function collectReferencedProductTypeIds(
  documents: StarterTemplateDocument[],
): string[] {
  const ids = new Set<string>();

  for (const document of documents) {
    if (document.resource !== "product") {
      continue;
    }

    const productType = document.data.productType;
    if (isJsonObject(productType)) {
      const productTypeId = readString(productType.id);
      if (productTypeId) {
        ids.add(productTypeId);
      }
    }
  }

  return Array.from(ids).toSorted();
}

function findEmbeddedProductType(
  documents: StarterTemplateDocument[],
  id: string,
): JsonObject | undefined {
  for (const document of documents) {
    if (document.resource !== "product") {
      continue;
    }

    const productType = document.data.productType;
    if (!isJsonObject(productType) || readString(productType.id) !== id) {
      continue;
    }

    return productType;
  }

  return undefined;
}

function makeEmbeddedProductTypeDocument(
  id: string,
  data: JsonObject,
): StarterTemplateDocument {
  const normalizedId = normalizeSegment(id, "documentId");
  const sourcePath = `productTypes/${normalizedId}`;
  const sanitized = sanitizeProductType(data, normalizedId);

  assertSafePath(sourcePath);
  assertSafeKeys(sanitized);

  return {
    data: sanitized,
    id: normalizedId,
    resource: "productType",
    sourcePath,
  };
}

async function addReferencedRootDocument(
  output: StarterTemplateDocument[],
  options: {
    db: FirestoreLike;
    id: string;
    path: string;
    resource: StarterTemplateResource;
    sourceChannelId: string;
    sourceTenantContext: TenantContext;
  },
): Promise<void> {
  const sourcePath = `${options.path}/${normalizeSegment(options.id, "documentId")}`;
  const snapshot = await getDocument(options.db, sourcePath);

  if (!snapshot) {
    throw new Error(
      `Referenced starter template document was not found: ${sourcePath}.`,
    );
  }

  if (shouldFilterTenant(options.sourceTenantContext)) {
    const tenantId = getSourceTenantId(options.sourceTenantContext);
    const data = snapshot.data();
    if (data?.tenantId !== tenantId) {
      throw new Error(
        `Referenced document ${sourcePath} does not belong to source tenant ${tenantId}.`,
      );
    }
  }

  output.push(
    makeDocument(options.resource, snapshot, options.sourceChannelId),
  );
}

async function addReferencedProductTypeDocument(
  output: StarterTemplateDocument[],
  options: {
    db: FirestoreLike;
    id: string;
    sourceChannelId: string;
    sourceTenantContext: TenantContext;
  },
): Promise<void> {
  const sourcePath = `productTypes/${normalizeSegment(options.id, "documentId")}`;
  const snapshot = await getDocument(options.db, sourcePath);

  if (snapshot) {
    if (shouldFilterTenant(options.sourceTenantContext)) {
      const tenantId = getSourceTenantId(options.sourceTenantContext);
      const data = snapshot.data();
      if (data?.tenantId !== tenantId) {
        throw new Error(
          `Referenced document ${sourcePath} does not belong to source tenant ${tenantId}.`,
        );
      }
    }

    output.push(makeDocument("productType", snapshot, options.sourceChannelId));
    return;
  }

  const embeddedProductType = findEmbeddedProductType(output, options.id);
  if (!embeddedProductType) {
    throw new Error(
      `Referenced starter template document was not found: ${sourcePath}.`,
    );
  }

  output.push(makeEmbeddedProductTypeDocument(options.id, embeddedProductType));
}

export async function exportStarterTemplate({
  db,
  exportedAt = new Date(),
  name = "Starter template",
  sourceChannelId,
  sourceTenantContext,
}: ExportStarterTemplateInput): Promise<StarterTemplateManifest> {
  const normalizedChannelId = normalizeSegment(
    sourceChannelId,
    "sourceChannelId",
  );
  const sourceTenantId = getSourceTenantId(sourceTenantContext);
  const documents: StarterTemplateDocument[] = [];
  const channelSnapshot = await getDocument(
    db,
    `channels/${normalizedChannelId}`,
  );

  if (!channelSnapshot) {
    throw new Error(`Source channel ${normalizedChannelId} was not found.`);
  }

  if (shouldFilterTenant(sourceTenantContext)) {
    const channelData = channelSnapshot.data();
    if (channelData?.tenantId !== sourceTenantId) {
      throw new Error(
        `Source channel ${normalizedChannelId} does not belong to source tenant ${sourceTenantId}.`,
      );
    }
  }

  documents.push(makeDocument("channel", channelSnapshot, normalizedChannelId));

  await addActiveTenantCollection(documents, {
    db,
    path: "customerGroups",
    resource: "customerGroup",
    sourceChannelId: normalizedChannelId,
    sourceTenantContext,
  });

  await addCollection(documents, {
    db,
    path: `channels/${normalizedChannelId}/categories`,
    resource: "category",
    sourceChannelId: normalizedChannelId,
  });

  await addCollection(documents, {
    db,
    path: `channels/${normalizedChannelId}/settings`,
    resource: "channelSetting",
    safeDocumentIds: SAFE_CHANNEL_SETTING_IDS,
    sourceChannelId: normalizedChannelId,
  });

  await addCollection(documents, {
    db,
    path: `channels/${normalizedChannelId}/metadata`,
    resource: "channelMetadata",
    sourceChannelId: normalizedChannelId,
  });

  await addCollection(documents, {
    db,
    path: `channels/${normalizedChannelId}/pages`,
    resource: "channelPage",
    sourceChannelId: normalizedChannelId,
  });

  await addCollection(documents, {
    db,
    path: `channels/${normalizedChannelId}/cms`,
    resource: "channelCms",
    sourceChannelId: normalizedChannelId,
  });

  await addCollection(documents, {
    db,
    path: `channels/${normalizedChannelId}/dynamicPricingPresets`,
    resource: "dynamicPricingPreset",
    sourceChannelId: normalizedChannelId,
  });

  await addCollection(documents, {
    db,
    path: `channels/${normalizedChannelId}/products`,
    resource: "product",
    sourceChannelId: normalizedChannelId,
  });

  const translatableDocuments = documents.filter(
    (document) =>
      document.resource === "category" ||
      document.resource === "channelCms" ||
      document.resource === "channelMetadata" ||
      document.resource === "channelPage",
  );

  for (const document of translatableDocuments) {
    const translationResource = `${document.resource}Translation` as
      | "categoryTranslation"
      | "channelCmsTranslation"
      | "channelMetadataTranslation"
      | "channelPageTranslation";

    await addNestedTranslations(documents, {
      db,
      parentPath: document.sourcePath,
      resource: translationResource,
      sourceChannelId: normalizedChannelId,
    });
  }

  for (const productId of collectProductIds(documents)) {
    const productPath = `channels/${normalizedChannelId}/products/${productId}`;

    await addNestedTranslations(documents, {
      db,
      parentPath: productPath,
      resource: "productTranslation",
      sourceChannelId: normalizedChannelId,
    });

    for (const subcollection of PRODUCT_PRICE_SUBCOLLECTIONS) {
      await addCollection(documents, {
        db,
        path: `${productPath}/${subcollection}`,
        resource: PRICE_SUBCOLLECTION_RESOURCES[subcollection],
        sourceChannelId: normalizedChannelId,
      });
    }

    const dynamicPricing = await getDocument(
      db,
      `${productPath}/dynamicPricing/config`,
    );
    if (dynamicPricing) {
      documents.push(
        makeDocument(
          "productDynamicPricing",
          dynamicPricing,
          normalizedChannelId,
        ),
      );
    }
  }

  for (const attributeId of collectReferencedAttributeIds(documents)) {
    await addReferencedRootDocument(documents, {
      db,
      id: attributeId,
      path: "attributes",
      resource: "attribute",
      sourceChannelId: normalizedChannelId,
      sourceTenantContext,
    });

    await addNestedTranslations(documents, {
      db,
      parentPath: `attributes/${attributeId}`,
      resource: "attributeTranslation",
      sourceChannelId: normalizedChannelId,
    });
  }

  for (const productTypeId of collectReferencedProductTypeIds(documents)) {
    await addReferencedProductTypeDocument(documents, {
      db,
      id: productTypeId,
      sourceChannelId: normalizedChannelId,
      sourceTenantContext,
    });
  }

  validateStarterTemplateManifest({
    counts: countDocuments(documents),
    exportedAt: exportedAt.toISOString(),
    format: STARTER_TEMPLATE_FORMAT,
    name,
    resources: documents,
    source: {
      channelId: normalizedChannelId,
      deploymentMode: sourceTenantContext.deploymentMode,
      ...(sourceTenantId ? { tenantId: sourceTenantId } : {}),
    },
    storagePolicy: {
      includeObjects: false,
      productMedia: "filename-only",
    },
    version: STARTER_TEMPLATE_VERSION,
  });

  return {
    counts: countDocuments(documents),
    exportedAt: exportedAt.toISOString(),
    format: STARTER_TEMPLATE_FORMAT,
    name,
    resources: documents,
    source: {
      channelId: normalizedChannelId,
      deploymentMode: sourceTenantContext.deploymentMode,
      ...(sourceTenantId ? { tenantId: sourceTenantId } : {}),
    },
    storagePolicy: {
      includeObjects: false,
      productMedia: "filename-only",
    },
    version: STARTER_TEMPLATE_VERSION,
  };
}

function createTargetScopedId(
  sourceId: string,
  targetTenantId: string | undefined,
): string {
  if (!targetTenantId) {
    return sourceId;
  }

  const normalizedSourceId = normalizeSegment(sourceId, "sourceId");
  const normalizedTenantId = normalizeSegment(targetTenantId, "targetTenantId");
  const prefix = `${normalizedTenantId}_`;

  return normalizedSourceId.startsWith(prefix)
    ? normalizedSourceId
    : `${prefix}${normalizedSourceId}`;
}

function buildRewriteContext(
  manifest: StarterTemplateManifest,
  targetTenantContext: TenantContext,
  targetChannelId: string,
): RewriteContext {
  const targetTenantId = getTargetTenantId(targetTenantContext);
  const attributeIds = new Map<string, string>();
  const productTypeIds = new Map<string, string>();

  for (const document of manifest.resources) {
    if (document.resource === "attribute") {
      attributeIds.set(
        document.id,
        createTargetScopedId(document.id, targetTenantId),
      );
    }

    if (document.resource === "productType") {
      productTypeIds.set(
        document.id,
        createTargetScopedId(document.id, targetTenantId),
      );
    }
  }

  return {
    attributeIds,
    productTypeIds,
    sourceChannelId: manifest.source.channelId,
    sourceTenantId: manifest.source.tenantId,
    targetChannelId: normalizeSegment(targetChannelId, "targetChannelId"),
    targetTenantContext,
    targetTenantId,
  };
}

function rewriteAttributeId(value: string, context: RewriteContext): string {
  return context.attributeIds.get(value) ?? value;
}

function rewriteProductTypeId(value: string, context: RewriteContext): string {
  return context.productTypeIds.get(value) ?? value;
}

function rewriteAttributeIdArray(
  value: JsonValue | undefined,
  context: RewriteContext,
) {
  return readStringArray(value).map((id) => rewriteAttributeId(id, context));
}

function rewriteAttributeKeyedObject(
  value: JsonValue | undefined,
  context: RewriteContext,
): JsonObject {
  if (!isJsonObject(value)) {
    return {};
  }

  const rewritten: JsonObject = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    rewritten[rewriteAttributeId(key, context)] = rewriteTemplateReferences(
      nestedValue,
      context,
      key,
    );
  }

  return rewritten;
}

function rewriteTemplateReferences(
  value: JsonValue,
  context: RewriteContext,
  key = "",
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteTemplateReferences(item, context, key));
  }

  if (!isJsonObject(value)) {
    if (typeof value === "string" && looksLikeStoragePath(value)) {
      return rewriteStarterTemplateStoragePath({
        path: value,
        sourceChannelId: context.sourceChannelId,
        sourceTenantId: context.sourceTenantId,
        targetChannelId: context.targetChannelId,
        targetTenantContext: context.targetTenantContext,
      });
    }

    return value;
  }

  const result: JsonObject = {};

  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    if (nestedKey === "tenantId") {
      if (context.targetTenantId) {
        result.tenantId = context.targetTenantId;
      }
      continue;
    }

    if (nestedKey === "channelId") {
      result.channelId = context.targetChannelId;
      continue;
    }

    if (
      nestedKey === "attributeId" ||
      nestedKey === "dependsOn" ||
      nestedKey === "attribute"
    ) {
      const attributeId = readString(nestedValue);
      result[nestedKey] = attributeId
        ? rewriteAttributeId(attributeId, context)
        : rewriteTemplateReferences(nestedValue, context, nestedKey);
      continue;
    }

    if (nestedKey === "attributes" && Array.isArray(nestedValue)) {
      result.attributes = nestedValue.map((item) =>
        typeof item === "string" ? rewriteAttributeId(item, context) : item,
      );
      continue;
    }

    if (
      nestedKey === "productTypeId" ||
      (key === "productType" && nestedKey === "id")
    ) {
      const productTypeId = readString(nestedValue);
      result[nestedKey] = productTypeId
        ? rewriteProductTypeId(productTypeId, context)
        : rewriteTemplateReferences(nestedValue, context, nestedKey);
      continue;
    }

    result[nestedKey] = rewriteTemplateReferences(
      nestedValue,
      context,
      nestedKey,
    );
  }

  return result;
}

function addAuditFields(
  data: JsonObject,
  actor: StarterTemplateActor,
  timestamp: Date,
  active = true,
): Record<string, unknown> {
  return {
    ...data,
    active: readBoolean(data.active) ?? active,
    createdAt: timestamp,
    createdBy: actor,
    updatedAt: timestamp,
    updatedBy: actor,
  };
}

function addTenantId(
  data: Record<string, unknown>,
  context: RewriteContext,
): Record<string, unknown> {
  if (!context.targetTenantId) {
    const { tenantId: _tenantId, ...withoutTenantId } = data;
    return withoutTenantId;
  }

  return {
    ...data,
    tenantId: context.targetTenantId,
  };
}

function rewriteProductType(
  value: JsonValue | undefined,
  context: RewriteContext,
): JsonValue {
  if (!isJsonObject(value)) {
    return null;
  }

  const id = readString(value.id);

  return {
    ...value,
    ...(id ? { id: rewriteProductTypeId(id, context) } : {}),
    attributes: rewriteAttributeIdArray(value.attributes, context),
  };
}

function currencyFromChannel(manifest: StarterTemplateManifest): CurrencyEnum {
  const channel = manifest.resources.find(
    (document) => document.resource === "channel",
  );
  const currency = readString(channel?.data.currency);

  return currency &&
    Object.values(CurrencyEnum).includes(currency as CurrencyEnum)
    ? (currency as CurrencyEnum)
    : CurrencyEnum.PLN;
}

function priceRowsForProduct(
  manifest: StarterTemplateManifest,
  productId: string,
): ProductPrice[] {
  return manifest.resources
    .filter((document) => {
      if (document.resource !== "productPrices") {
        return false;
      }

      const segments = pathSegments(document.sourcePath);
      return segments[3] === productId;
    })
    .map((document) => document.data as unknown as ProductPrice);
}

function attributeDefinitionsForProduct(
  manifest: StarterTemplateManifest,
  productData: JsonObject,
  context: RewriteContext,
): Attribute[] {
  const attributeIds = rewriteAttributeIdArray(productData.attributes, context);

  return attributeIds.flatMap((attributeId) => {
    const sourceAttributeId = Array.from(context.attributeIds.entries()).find(
      ([, targetId]) => targetId === attributeId,
    )?.[0];
    const attributeDoc = manifest.resources.find(
      (document) =>
        document.resource === "attribute" &&
        document.id === (sourceAttributeId ?? attributeId),
    );

    return attributeDoc
      ? [
          {
            ...attributeDoc.data,
            id: attributeId,
          } as unknown as Attribute,
        ]
      : [];
  });
}

function calculatedProductListingPrices(
  manifest: StarterTemplateManifest,
  productId: string,
  productData: JsonObject,
  context: RewriteContext,
): {
  defaultPrice: JsonValue;
  highPrice: JsonValue;
  lowPrice: JsonValue;
} {
  const priceRows = priceRowsForProduct(manifest, productId);
  const priceType = readString(productData.priceType) as
    | PriceTypeEnum
    | undefined;
  const minOrder = isJsonObject(productData.spec)
    ? (readNumber(productData.spec.minimumOrder) ?? 1)
    : 1;

  if (priceRows.length > 0) {
    const calculated = calculatePricesFromSubcollection(
      priceRows,
      attributeDefinitionsForProduct(manifest, productData, context),
      minOrder,
      priceType ?? PriceTypeEnum.SINGLE,
      productData.attributeDependencies,
    );
    const calculatedJson = toJsonObject(calculated);
    const fallback = toJsonObject(DEFAULT_PRICE);

    return {
      defaultPrice: calculatedJson.defaultPrice ?? fallback,
      highPrice: calculatedJson.highPrice ?? fallback,
      lowPrice: calculatedJson.lowPrice ?? fallback,
    };
  }

  const dynamicPricing = manifest.resources.find((document) => {
    if (document.resource !== "productDynamicPricing") {
      return false;
    }

    const segments = pathSegments(document.sourcePath);
    return segments[3] === productId;
  });
  const fallback = {
    ...DEFAULT_PRICE,
    currency: currencyFromChannel(manifest),
    value: readNumber(dynamicPricing?.data.basePrice) ?? 0,
  };

  return {
    defaultPrice: toJsonObject(fallback),
    highPrice: toJsonObject(fallback),
    lowPrice: toJsonObject(fallback),
  };
}

function rewriteProductData(
  document: StarterTemplateDocument,
  manifest: StarterTemplateManifest,
  context: RewriteContext,
  actor: StarterTemplateActor,
  timestamp: Date,
): Record<string, unknown> {
  const rewritten = rewriteTemplateReferences(
    {
      ...document.data,
      attributeDependencies: rewriteAttributeKeyedObject(
        document.data.attributeDependencies,
        context,
      ),
      attributeOptions: rewriteAttributeKeyedObject(
        document.data.attributeOptions,
        context,
      ),
      attributes: rewriteAttributeIdArray(document.data.attributes, context),
      availability: sanitizeAvailability(
        isJsonObject(document.data.availability)
          ? document.data.availability
          : undefined,
      ),
      channelId: context.targetChannelId,
      linkedChannels: [],
      linkedWarehouses: [],
      prices: [],
      productType: rewriteProductType(document.data.productType, context),
    },
    context,
  );

  const listingPrices = calculatedProductListingPrices(
    manifest,
    document.id,
    rewritten as JsonObject,
    context,
  );

  return addTenantId(
    addAuditFields(
      {
        ...(rewritten as JsonObject),
        ...listingPrices,
        keywords: generateKeywords(
          readString(document.data.name) ?? document.id,
        ),
      },
      actor,
      timestamp,
    ),
    context,
  );
}

function rewriteRootCatalogData(
  document: StarterTemplateDocument,
  context: RewriteContext,
  actor: StarterTemplateActor,
  timestamp: Date,
): Record<string, unknown> {
  const id =
    document.resource === "attribute"
      ? rewriteAttributeId(document.id, context)
      : rewriteProductTypeId(document.id, context);
  const rewritten = rewriteTemplateReferences(
    {
      ...document.data,
      id,
      keywords: generateKeywords(readString(document.data.name) ?? id),
    },
    context,
  );

  return addTenantId(
    addAuditFields(rewritten as JsonObject, actor, timestamp),
    context,
  );
}

function rewriteChannelData(
  document: StarterTemplateDocument,
  context: RewriteContext,
  actor: StarterTemplateActor,
  timestamp: Date,
  channelName?: string,
): Record<string, unknown> {
  return addTenantId(
    addAuditFields(
      {
        ...document.data,
        id: context.targetChannelId,
        name: channelName?.trim() || readString(document.data.name) || "Store",
        warehouses: [],
      },
      actor,
      timestamp,
    ),
    context,
  );
}

function rewriteGenericData(
  document: StarterTemplateDocument,
  context: RewriteContext,
  actor: StarterTemplateActor,
  timestamp: Date,
): Record<string, unknown> {
  const rewritten = rewriteTemplateReferences(
    document.data,
    context,
  ) as JsonObject;

  if (
    document.resource.endsWith("Translation") ||
    document.resource === "category" ||
    document.resource === "channelCms" ||
    document.resource === "channelMetadata" ||
    document.resource === "channelPage" ||
    document.resource === "dynamicPricingPreset"
  ) {
    const withKeywords: JsonObject = { ...rewritten };
    const keywordSource = readString(withKeywords.name);

    if (keywordSource) {
      withKeywords.keywords = generateKeywords(keywordSource);
    }

    return addTenantId(
      addAuditFields(
        withKeywords,
        actor,
        timestamp,
        readBoolean(rewritten.active) ?? true,
      ),
      context,
    );
  }

  return addTenantId(rewritten as Record<string, unknown>, context);
}

function rewriteCustomerGroupData(
  document: StarterTemplateDocument,
  context: RewriteContext,
  actor: StarterTemplateActor,
  timestamp: Date,
): Record<string, unknown> {
  const id = createTargetScopedId(document.id, context.targetTenantId);
  const rewritten: JsonObject = {
    ...document.data,
    customerIds: [],
    id,
  };

  return addTenantId(
    addAuditFields(rewritten, actor, timestamp, readBoolean(rewritten.active)),
    context,
  );
}

function targetPathForDocument(
  document: StarterTemplateDocument,
  context: RewriteContext,
): string {
  const segments = pathSegments(document.sourcePath);

  switch (document.resource) {
    case "attribute":
      return `attributes/${rewriteAttributeId(document.id, context)}`;
    case "attributeTranslation":
      return `attributes/${rewriteAttributeId(segments[1], context)}/translations/${document.id}`;
    case "category":
      return `channels/${context.targetChannelId}/categories/${document.id}`;
    case "categoryTranslation":
      return `channels/${context.targetChannelId}/categories/${segments[3]}/translations/${document.id}`;
    case "channel":
      return `channels/${context.targetChannelId}`;
    case "channelCms":
      return `channels/${context.targetChannelId}/cms/${document.id}`;
    case "channelCmsTranslation":
      return `channels/${context.targetChannelId}/cms/${segments[3]}/translations/${document.id}`;
    case "channelMetadata":
      return `channels/${context.targetChannelId}/metadata/${document.id}`;
    case "channelMetadataTranslation":
      return `channels/${context.targetChannelId}/metadata/${segments[3]}/translations/${document.id}`;
    case "channelPage":
      return `channels/${context.targetChannelId}/pages/${document.id}`;
    case "channelPageTranslation":
      return `channels/${context.targetChannelId}/pages/${segments[3]}/translations/${document.id}`;
    case "channelSetting":
      return `channels/${context.targetChannelId}/settings/${document.id}`;
    case "customerGroup":
      return `customerGroups/${createTargetScopedId(document.id, context.targetTenantId)}`;
    case "dynamicPricingPreset":
      return `channels/${context.targetChannelId}/dynamicPricingPresets/${document.id}`;
    case "product":
      return `channels/${context.targetChannelId}/products/${document.id}`;
    case "productDynamicPricing":
      return `channels/${context.targetChannelId}/products/${segments[3]}/dynamicPricing/config`;
    case "productPageCountPrices":
    case "productPageCountSegmentStepPrices":
    case "productPageCountStepPrices":
    case "productPrices":
      return `channels/${context.targetChannelId}/products/${segments[3]}/${segments[4]}/${document.id}`;
    case "productTranslation":
      return `channels/${context.targetChannelId}/products/${segments[3]}/translations/${document.id}`;
    case "productType":
      return `productTypes/${rewriteProductTypeId(document.id, context)}`;
  }
}

function prepareTemplateWrites({
  actor,
  channelName,
  context,
  importedAt,
  manifest,
}: {
  actor: StarterTemplateActor;
  channelName?: string;
  context: RewriteContext;
  importedAt: Date;
  manifest: StarterTemplateManifest;
}): PreparedTemplateWrite[] {
  return manifest.resources.map((document) => {
    let data: Record<string, unknown>;

    switch (document.resource) {
      case "attribute":
      case "productType":
        data = rewriteRootCatalogData(document, context, actor, importedAt);
        break;
      case "channel":
        data = rewriteChannelData(
          document,
          context,
          actor,
          importedAt,
          channelName,
        );
        break;
      case "customerGroup":
        data = rewriteCustomerGroupData(document, context, actor, importedAt);
        break;
      case "product":
        data = rewriteProductData(
          document,
          manifest,
          context,
          actor,
          importedAt,
        );
        break;
      default:
        data = rewriteGenericData(document, context, actor, importedAt);
        break;
    }

    return {
      data: stripUndefined(data),
      path: targetPathForDocument(document, context),
    };
  });
}

function stripUndefined(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, nestedValue]) => nestedValue !== undefined,
    ),
  );
}

async function assertTargetsAreNew(
  db: FirestoreLike,
  writes: PreparedTemplateWrite[],
): Promise<void> {
  if (writes.length === 0) {
    return;
  }

  const refs = writes.map((write) => db.doc(write.path));
  const readBatchSize = 400;
  const snapshots: DocumentSnapshotLike[] = [];

  for (let index = 0; index < refs.length; index += readBatchSize) {
    const refsBatch = refs.slice(index, index + readBatchSize);
    const batchSnapshots = db.getAll
      ? await db.getAll(...refsBatch)
      : await Promise.all(refsBatch.map((ref) => ref.get()));

    snapshots.push(...batchSnapshots);
  }

  for (const [index, snapshot] of snapshots.entries()) {
    if (snapshot.exists) {
      const path = writes[index]?.path ?? snapshot.ref.path;
      throw new Error(`Starter template target already exists: ${path}.`);
    }
  }
}

async function commitWrites(
  db: FirestoreLike,
  writes: PreparedTemplateWrite[],
): Promise<void> {
  const batchSize = 400;

  for (let index = 0; index < writes.length; index += batchSize) {
    const batch = db.batch();
    for (const write of writes.slice(index, index + batchSize)) {
      batch.set(db.doc(write.path), write.data);
    }
    await batch.commit();
  }
}

export async function importStarterTemplate({
  actor,
  allowOverwrite = false,
  channelName,
  db,
  importedAt = new Date(),
  manifest,
  targetChannelId,
  targetTenantContext,
}: ImportStarterTemplateInput): Promise<StarterTemplateImportResult> {
  validateStarterTemplateManifest(manifest);

  const context = buildRewriteContext(
    manifest,
    targetTenantContext,
    targetChannelId,
  );
  const writes = prepareTemplateWrites({
    actor,
    channelName,
    context,
    importedAt,
    manifest,
  });

  if (!allowOverwrite) {
    await assertTargetsAreNew(db, writes);
  }

  await commitWrites(db, writes);

  return {
    channelId: context.targetChannelId,
    documentCount: writes.length,
    idRewrites: {
      attributes: Object.fromEntries(context.attributeIds.entries()),
      productTypes: Object.fromEntries(context.productTypeIds.entries()),
    },
    ...(context.targetTenantId
      ? { targetTenantId: context.targetTenantId }
      : {}),
  };
}

function resourceMatchesPath(document: StarterTemplateDocument): boolean {
  const segments = pathSegments(document.sourcePath);

  switch (document.resource) {
    case "attribute":
      return segments.length === 2 && segments[0] === "attributes";
    case "attributeTranslation":
      return (
        segments.length === 4 &&
        segments[0] === "attributes" &&
        segments[2] === "translations"
      );
    case "channel":
      return segments.length === 2 && segments[0] === "channels";
    case "customerGroup":
      return segments.length === 2 && segments[0] === "customerGroups";
    case "productType":
      return segments.length === 2 && segments[0] === "productTypes";
    default:
      if (segments[0] !== "channels") {
        return false;
      }
  }

  const collection = segments[2];

  switch (document.resource) {
    case "category":
      return segments.length === 4 && collection === "categories";
    case "categoryTranslation":
      return (
        segments.length === 6 &&
        collection === "categories" &&
        segments[4] === "translations"
      );
    case "channelCms":
      return segments.length === 4 && collection === "cms";
    case "channelCmsTranslation":
      return (
        segments.length === 6 &&
        collection === "cms" &&
        segments[4] === "translations"
      );
    case "channelMetadata":
      return segments.length === 4 && collection === "metadata";
    case "channelMetadataTranslation":
      return (
        segments.length === 6 &&
        collection === "metadata" &&
        segments[4] === "translations"
      );
    case "channelPage":
      return segments.length === 4 && collection === "pages";
    case "channelPageTranslation":
      return (
        segments.length === 6 &&
        collection === "pages" &&
        segments[4] === "translations"
      );
    case "channelSetting":
      return segments.length === 4 && collection === "settings";
    case "dynamicPricingPreset":
      return segments.length === 4 && collection === "dynamicPricingPresets";
    case "product":
      return segments.length === 4 && collection === "products";
    case "productDynamicPricing":
      return (
        segments.length === 6 &&
        collection === "products" &&
        segments[4] === "dynamicPricing" &&
        segments[5] === "config"
      );
    case "productPageCountPrices":
      return (
        segments.length === 6 &&
        collection === "products" &&
        segments[4] === "pageCountPrices"
      );
    case "productPageCountSegmentStepPrices":
      return (
        segments.length === 6 &&
        collection === "products" &&
        segments[4] === "pageCountSegmentStepPrices"
      );
    case "productPageCountStepPrices":
      return (
        segments.length === 6 &&
        collection === "products" &&
        segments[4] === "pageCountStepPrices"
      );
    case "productPrices":
      return (
        segments.length === 6 &&
        collection === "products" &&
        segments[4] === "prices"
      );
    case "productTranslation":
      return (
        segments.length === 6 &&
        collection === "products" &&
        segments[4] === "translations"
      );
  }
}

function isStarterTemplateResource(
  resource: unknown,
): resource is StarterTemplateResource {
  return (
    typeof resource === "string" &&
    STARTER_TEMPLATE_RESOURCE_SET.has(resource as StarterTemplateResource)
  );
}

export function validateStarterTemplateManifest(
  manifest: unknown,
): asserts manifest is StarterTemplateManifest {
  if (!isRecord(manifest)) {
    throw new Error("Starter template manifest must be an object.");
  }

  if (manifest.format !== STARTER_TEMPLATE_FORMAT) {
    throw new Error("Unsupported starter template format.");
  }

  if (manifest.version !== STARTER_TEMPLATE_VERSION) {
    throw new Error("Unsupported starter template version.");
  }

  if (
    !isRecord(manifest.storagePolicy) ||
    manifest.storagePolicy.includeObjects !== false ||
    manifest.storagePolicy.productMedia !== "filename-only"
  ) {
    throw new Error("Starter template storage object export is not allowed.");
  }

  if (
    !isRecord(manifest.source) ||
    typeof manifest.source.channelId !== "string" ||
    typeof manifest.source.deploymentMode !== "string"
  ) {
    throw new Error("Starter template source is invalid.");
  }

  if (!Array.isArray(manifest.resources)) {
    throw new Error("Starter template resources must be an array.");
  }

  normalizeSegment(manifest.source.channelId, "manifest.source.channelId");

  const channelDocs = manifest.resources.filter(
    (document) => document.resource === "channel",
  );

  if (channelDocs.length !== 1) {
    throw new Error(
      "Starter template must contain exactly one channel document.",
    );
  }

  for (const document of manifest.resources) {
    if (!isRecord(document)) {
      throw new Error("Starter template resource must be an object.");
    }

    if (
      typeof document.id !== "string" ||
      !isStarterTemplateResource(document.resource) ||
      typeof document.sourcePath !== "string" ||
      !isJsonObject(document.data)
    ) {
      throw new Error("Starter template resource is invalid.");
    }

    const starterDocument: StarterTemplateDocument = {
      data: document.data,
      id: document.id,
      resource: document.resource,
      sourcePath: document.sourcePath,
    };

    normalizeSegment(starterDocument.id, "document.id");
    assertSafePath(starterDocument.sourcePath);

    if (!resourceMatchesPath(starterDocument)) {
      throw new Error(
        `Starter template resource ${starterDocument.resource} does not match path ${starterDocument.sourcePath}.`,
      );
    }

    if (
      starterDocument.sourcePath.startsWith("channels/") &&
      pathSegments(starterDocument.sourcePath)[1] !== manifest.source.channelId
    ) {
      throw new Error(
        `Starter template path ${starterDocument.sourcePath} does not match source channel ${manifest.source.channelId}.`,
      );
    }

    assertSafeKeys(starterDocument.data);
  }
}

function looksLikeStoragePath(path: string): boolean {
  const normalized = path.trim().replace(/^\/+/, "");

  return (
    normalized.startsWith("tenants/") ||
    normalized.startsWith("images/") ||
    normalized.startsWith("thumb_images/")
  );
}

export function rewriteStarterTemplateStoragePath(options: {
  path: string;
  sourceChannelId: string;
  sourceTenantId?: string;
  targetChannelId: string;
  targetTenantContext: TenantContext;
}): string {
  const targetTenantId = getTargetTenantId(options.targetTenantContext);
  const normalizedPath = options.path.trim().replace(/^\/+|\/+$/g, "");
  const generatedSegments = [
    "ai",
    "generated",
    "orders",
    "carts",
    "thumb_orders",
  ];
  const normalizedSegments = normalizedPath.split("/");

  if (
    normalizedSegments.some(
      (segment) =>
        generatedSegments.includes(segment) ||
        segment.toLowerCase().startsWith("ai-") ||
        segment.toLowerCase().includes("generated"),
    )
  ) {
    throw new Error(
      "Generated or operational storage paths cannot be imported.",
    );
  }

  const sourceTenantPrefix = options.sourceTenantId
    ? `tenants/${options.sourceTenantId}/`
    : "";
  const withoutTenantPrefix =
    sourceTenantPrefix && normalizedPath.startsWith(sourceTenantPrefix)
      ? normalizedPath.slice(sourceTenantPrefix.length)
      : normalizedPath;
  const sourcePrefix = `images/channels/${options.sourceChannelId}/`;

  if (!withoutTenantPrefix.startsWith(sourcePrefix)) {
    throw new Error(
      `Storage path is outside starter product media: ${options.path}.`,
    );
  }

  const rewritten = `images/channels/${normalizeSegment(
    options.targetChannelId,
    "targetChannelId",
  )}/${withoutTenantPrefix.slice(sourcePrefix.length)}`;

  return targetTenantId ? `tenants/${targetTenantId}/${rewritten}` : rewritten;
}
