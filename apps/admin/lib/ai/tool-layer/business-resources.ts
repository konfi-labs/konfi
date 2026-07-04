import type {
  BusinessJsonObject,
  BusinessJsonValue,
  BusinessRecord,
  BusinessRecordSummary,
  BusinessResourceDescriptor,
  BusinessResourceName,
} from "./types";

interface InternalBusinessResourceDescriptor extends BusinessResourceDescriptor {
  collectionPath?: (input: { channelId?: string }) => string;
  descriptionFields: string[];
  labelFields: string[];
  previewFields: string[];
}

const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_KEYS = 80;
const MAX_STRING_LENGTH = 1_200;
const MAX_SANITIZE_DEPTH = 6;

const SENSITIVE_KEY_FRAGMENTS = [
  "accesstoken",
  "apikey",
  "api_token",
  "authorization",
  "cookie",
  "credential",
  "encryptedpassword",
  "encryptedusername",
  "headers",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "tokenvalue",
];
const NORMALIZED_SENSITIVE_KEY_FRAGMENTS = SENSITIVE_KEY_FRAGMENTS.map(
  (fragment) => normalizeKey(fragment),
);

const ROOT = (collectionPath: string) => () => collectionPath;
const CHANNEL =
  (collectionName: string) =>
  ({ channelId }: { channelId?: string }) => {
    if (!channelId) {
      throw new Error(`channelId is required for ${collectionName}.`);
    }

    return `channels/${channelId}/${collectionName}`;
  };

export const BUSINESS_RESOURCE_DESCRIPTORS: readonly InternalBusinessResourceDescriptor[] =
  [
    {
      channelScoped: false,
      collectionPath: ROOT("agents"),
      description:
        "AI agent runs, MCP draft tasks, workflow state, approvals, and saved task summaries.",
      descriptionFields: ["summary", "workflowStatus", "status"],
      label: "AI tasks and drafts",
      labelFields: ["prompt", "summary", "runId"],
      name: "agents",
      previewFields: [
        "runId",
        "status",
        "workflowStatus",
        "taskType",
        "channelId",
        "source",
        "summary",
        "createdAt",
        "updatedAt",
        "completedAt",
      ],
      searchFields: [
        "runId",
        "prompt",
        "summary",
        "taskType",
        "status",
        "workflowStatus",
        "source",
      ],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("attributes"),
      description:
        "Reusable product configuration attributes, selectable options, stock tracking flags, and calculated attribute metadata.",
      descriptionFields: ["type"],
      label: "Catalog attributes",
      labelFields: ["name", "id"],
      name: "attributes",
      previewFields: [
        "name",
        "active",
        "type",
        "required",
        "format",
        "pages",
        "calculated",
        "trackStock",
        "options",
      ],
      searchFields: ["name", "id", "type", "options"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("b2bInquiries"),
      description:
        "B2B inquiry intake records that can be used to understand pending business requests.",
      descriptionFields: ["status", "companyName", "email"],
      label: "B2B inquiries",
      labelFields: ["companyName", "name", "email", "id"],
      name: "b2bInquiries",
      previewFields: ["companyName", "name", "email", "status", "createdAt"],
      searchFields: ["companyName", "name", "email", "status", "message"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("campaigns"),
      description:
        "Promotion campaign definitions, budgets, identifiers, availability windows, and attached promotion metadata.",
      descriptionFields: ["description", "campaignIdentifier"],
      label: "Campaigns",
      labelFields: ["name", "campaignIdentifier", "id"],
      name: "campaigns",
      previewFields: [
        "name",
        "campaignIdentifier",
        "startsAt",
        "endsAt",
        "availabilityTypes",
        "budget",
        "createdAt",
        "updatedAt",
      ],
      searchFields: [
        "name",
        "description",
        "campaignIdentifier",
        "availabilityTypes",
      ],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("categories"),
      description:
        "Store catalog categories, SEO metadata, and category names for the selected channel.",
      descriptionFields: ["seo.title", "seo.description"],
      label: "Channel categories",
      labelFields: ["name", "seo.title", "id"],
      name: "categories",
      previewFields: [
        "name",
        "seo.slug",
        "seo.title",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["name", "seo.slug", "seo.title", "seo.description"],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("cms"),
      description:
        "Channel CMS documents such as hero sections and store page content blocks.",
      descriptionFields: ["title", "subtitle"],
      label: "Channel CMS",
      labelFields: ["title", "name", "id"],
      name: "channelCms",
      previewFields: ["title", "subtitle", "active", "updatedAt"],
      searchFields: ["title", "subtitle", "description", "id"],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("metadata"),
      description:
        "Channel metadata documents used by the storefront, SEO, and integrations.",
      descriptionFields: ["title", "description"],
      label: "Channel metadata",
      labelFields: ["title", "name", "id"],
      name: "channelMetadata",
      previewFields: ["title", "description", "updatedAt"],
      searchFields: ["title", "description", "keywords", "id"],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("pages"),
      description:
        "Channel page content documents, translations, and storefront page configuration.",
      descriptionFields: ["title", "description"],
      label: "Channel pages",
      labelFields: ["title", "name", "id"],
      name: "channelPages",
      previewFields: ["title", "description", "active", "updatedAt"],
      searchFields: ["title", "description", "slug", "id"],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("settings"),
      description:
        "Channel settings documents such as buying, shipping, free-shipping, under-construction, and express configuration.",
      descriptionFields: ["message", "description"],
      label: "Channel settings",
      labelFields: ["name", "id"],
      name: "channelSettings",
      previewFields: [
        "enabled",
        "min",
        "max",
        "percent",
        "message",
        "shippingOptionsPrices",
        "freeShipping",
        "underConstruction",
        "updatedAt",
      ],
      searchFields: ["id", "message", "enabled"],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("complaints"),
      description:
        "Order complaint records for the selected channel, including statuses and linked order metadata.",
      descriptionFields: ["status", "orderId", "customer.name"],
      label: "Complaints",
      labelFields: ["number", "title", "orderId", "id"],
      name: "complaints",
      previewFields: [
        "number",
        "orderId",
        "status",
        "customer.name",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["number", "orderId", "status", "customer.name", "title"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("designatedPickupAreas"),
      description:
        "Designated pickup area configuration used by shipping and pickup flows.",
      descriptionFields: ["description"],
      label: "Designated pickup areas",
      labelFields: ["name", "id"],
      name: "designatedPickupAreas",
      previewFields: ["name", "active", "address", "createdAt", "updatedAt"],
      searchFields: ["name", "description", "address"],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("dynamicPricingPresets"),
      description:
        "Dynamic pricing presets used by configurable product pricing and external price fetch flows.",
      descriptionFields: ["description", "strategy"],
      label: "Dynamic pricing presets",
      labelFields: ["name", "id"],
      name: "dynamicPricingPresets",
      previewFields: ["name", "active", "strategy", "createdAt", "updatedAt"],
      searchFields: ["name", "description", "strategy"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("emailOrderImports"),
      description:
        "Inbound email order import workflow records, extracted intent, draft state, and import status.",
      descriptionFields: ["status", "subject", "summary"],
      label: "Email order imports",
      labelFields: ["subject", "conversationId", "id"],
      name: "emailOrderImports",
      previewFields: [
        "conversationId",
        "status",
        "channelId",
        "subject",
        "summary",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["conversationId", "status", "subject", "summary"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("externalProducts"),
      description:
        "External-provider product import drafts, mapped attributes, supplier pricing fetch state, and pending price review data.",
      descriptionFields: [
        "importStatus",
        "priceRefreshStatus",
        "source.platform",
      ],
      label: "External products",
      labelFields: ["originalName", "name", "productId", "id"],
      name: "externalProducts",
      previewFields: [
        "originalName",
        "imported",
        "importStatus",
        "productId",
        "source.platform",
        "source.providerId",
        "priceRefreshStatus",
        "priceConfigurationsCount",
        "pendingPriceConfigurationsCount",
        "priceMarginPercent",
        "priceTaxPercent",
        "priceDiscountPercent",
        "createdAt",
        "updatedAt",
      ],
      searchFields: [
        "originalName",
        "originalDescription",
        "source.platform",
        "source.providerId",
        "importStatus",
        "productId",
        "priceRefreshStatus",
      ],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("externalProviders"),
      description:
        "External supplier/provider definitions, endpoint metadata, and schema discovery state.",
      descriptionFields: ["description", "baseUrl"],
      label: "External providers",
      labelFields: ["name", "baseUrl", "id"],
      name: "externalProviders",
      previewFields: [
        "name",
        "active",
        "baseUrl",
        "description",
        "logoUrl",
        "allProductsEndpoint",
        "productEndpoint",
        "createdAt",
        "updatedAt",
      ],
      searchFields: [
        "name",
        "description",
        "baseUrl",
        "allProductsEndpoint",
        "productEndpoint",
      ],
      source: "firestore",
    },
    {
      channelScoped: false,
      description:
        "Fakturownia invoices and accounting documents fetched from the configured Fakturownia account.",
      descriptionFields: ["kind", "status", "buyerName"],
      label: "Fakturownia invoices",
      labelFields: ["number", "buyerName", "id"],
      name: "fakturowniaInvoices",
      previewFields: [
        "number",
        "kind",
        "status",
        "issueDate",
        "sellDate",
        "paymentTo",
        "priceGross",
        "priceNet",
        "currency",
        "buyerName",
        "buyerTaxNo",
        "clientId",
      ],
      searchFields: [
        "number",
        "kind",
        "status",
        "buyerName",
        "buyerEmail",
        "buyerTaxNo",
        "clientId",
      ],
      source: "fakturownia",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("generatedOrderItems"),
      description:
        "AI-generated order item drafts and generated configuration artifacts.",
      descriptionFields: ["status", "summary"],
      label: "Generated order items",
      labelFields: ["name", "summary", "id"],
      name: "generatedOrderItems",
      previewFields: ["name", "status", "channelId", "summary", "createdAt"],
      searchFields: ["name", "status", "summary", "channelId"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("impositionWorkflows"),
      description:
        "Production imposition workflow records and generated prepress state.",
      descriptionFields: ["status", "name"],
      label: "Imposition workflows",
      labelFields: ["name", "fileName", "id"],
      name: "impositionWorkflows",
      previewFields: ["name", "fileName", "status", "createdAt", "updatedAt"],
      searchFields: ["name", "fileName", "status"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("members"),
      description:
        "Admin team member records, roles, access levels, and channel access assignments.",
      descriptionFields: ["email", "accessLevel"],
      label: "Members",
      labelFields: ["name", "email", "id"],
      name: "members",
      previewFields: [
        "name",
        "email",
        "active",
        "accessLevel",
        "channelIds",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["name", "email", "accessLevel", "channelIds"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("notes"),
      description:
        "Shared notes records used across admin workflows and customer/order context.",
      descriptionFields: ["content", "body"],
      label: "Notes",
      labelFields: ["title", "name", "id"],
      name: "notes",
      previewFields: ["title", "name", "content", "createdAt", "updatedAt"],
      searchFields: ["title", "name", "content", "body"],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("orders"),
      description:
        "Raw channel order records. Prefer get_order for a compact redacted order summary.",
      descriptionFields: ["status", "customer.name"],
      label: "Orders",
      labelFields: ["number", "customer.name", "id"],
      name: "orders",
      previewFields: [
        "number",
        "status",
        "paymentStatus",
        "filesStatus",
        "customer.name",
        "totalPrice",
        "currency",
        "deadline",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["number", "status", "customer.name", "customerId", "id"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("productTypes"),
      description:
        "Reusable product type definitions, default attribute sets, and shipping flags.",
      descriptionFields: ["description"],
      label: "Product types",
      labelFields: ["name", "id"],
      name: "productTypes",
      previewFields: [
        "name",
        "active",
        "attributes",
        "isShippable",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["name", "description", "attributes"],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("products"),
      description:
        "Raw channel product records. Prefer get_product and get_product_configuration_schema for compact product and configuration summaries.",
      descriptionFields: ["description", "priceType"],
      label: "Products",
      labelFields: ["name", "seo.title", "id"],
      name: "products",
      previewFields: [
        "name",
        "active",
        "availability.published",
        "category.name",
        "priceType",
        "prefferedUnit",
        "productType",
        "createdAt",
        "updatedAt",
      ],
      searchFields: [
        "name",
        "description",
        "seo.title",
        "seo.slug",
        "category.name",
        "priceType",
      ],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("promotions"),
      description:
        "Promotion codes, automatic promotions, campaign links, rule definitions, and application methods.",
      descriptionFields: ["type", "campaignId"],
      label: "Promotions",
      labelFields: ["code", "name", "id"],
      name: "promotions",
      previewFields: [
        "code",
        "type",
        "active",
        "isAutomatic",
        "isOneTime",
        "minimumOrderValue",
        "campaignId",
        "applicationMethod",
        "rules",
        "createdAt",
        "updatedAt",
      ],
      searchFields: [
        "code",
        "type",
        "campaignId",
        "rules",
        "applicationMethod",
      ],
      source: "firestore",
    },
    {
      channelScoped: true,
      collectionPath: CHANNEL("quotes"),
      description:
        "Channel quote records, customer quote details, item drafts, and quote status metadata.",
      descriptionFields: ["status", "customer.name"],
      label: "Quotes",
      labelFields: ["number", "customer.name", "id"],
      name: "quotes",
      previewFields: [
        "number",
        "status",
        "customer.name",
        "totalPrice",
        "currency",
        "validUntil",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["number", "status", "customer.name", "customerId", "id"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("scheduleRules"),
      description:
        "Scheduling rules used by production planning and workforce scheduling.",
      descriptionFields: ["description", "type"],
      label: "Schedule rules",
      labelFields: ["name", "title", "id"],
      name: "scheduleRules",
      previewFields: [
        "name",
        "title",
        "active",
        "type",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["name", "title", "description", "type"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("schedules"),
      description:
        "Scheduling records used for production and staffing calendars.",
      descriptionFields: ["status", "date"],
      label: "Schedules",
      labelFields: ["name", "title", "date", "id"],
      name: "schedules",
      previewFields: [
        "name",
        "title",
        "date",
        "status",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["name", "title", "date", "status"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("shiftRequests"),
      description:
        "Shift request records used by scheduling and internal operations.",
      descriptionFields: ["status", "date"],
      label: "Shift requests",
      labelFields: ["name", "memberName", "date", "id"],
      name: "shiftRequests",
      previewFields: [
        "name",
        "memberName",
        "date",
        "status",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["name", "memberName", "date", "status"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("suppliers"),
      description:
        "Supplier records, contacts, payment terms, and supplier metadata used by procurement.",
      descriptionFields: ["description", "paymentTerms"],
      label: "Suppliers",
      labelFields: ["name", "companyName", "id"],
      name: "suppliers",
      previewFields: [
        "name",
        "companyName",
        "active",
        "paymentTerms",
        "createdAt",
        "updatedAt",
      ],
      searchFields: ["name", "companyName", "description", "paymentTerms"],
      source: "firestore",
    },
    {
      channelScoped: false,
      collectionPath: ROOT("warehouses"),
      description:
        "Warehouse records, pickup/fulfillment locations, and stock management roots.",
      descriptionFields: ["address.city", "address.street"],
      label: "Warehouses",
      labelFields: ["name", "id"],
      name: "warehouses",
      previewFields: ["name", "active", "address", "createdAt", "updatedAt"],
      searchFields: ["name", "address.city", "address.street"],
      source: "firestore",
    },
  ];

const RESOURCE_DESCRIPTOR_BY_NAME = new Map(
  BUSINESS_RESOURCE_DESCRIPTORS.map((descriptor) => [
    descriptor.name,
    descriptor,
  ]),
);

export function listBusinessResourceDescriptors(): BusinessResourceDescriptor[] {
  return BUSINESS_RESOURCE_DESCRIPTORS.map(
    ({ collectionPath: _collectionPath, ...descriptor }) => descriptor,
  );
}

export function getBusinessResourceDescriptor(
  resource: BusinessResourceName,
): BusinessResourceDescriptor {
  const { collectionPath: _collectionPath, ...descriptor } =
    getInternalBusinessResourceDescriptor(resource);
  return descriptor;
}

export function getInternalBusinessResourceDescriptor(
  resource: BusinessResourceName,
): InternalBusinessResourceDescriptor {
  const descriptor = RESOURCE_DESCRIPTOR_BY_NAME.get(resource);

  if (!descriptor) {
    throw new Error(`Unsupported business resource: ${resource}`);
  }

  return descriptor;
}

export function firestoreCollectionPathForBusinessResource(
  resource: BusinessResourceName,
  input: { channelId?: string },
): string {
  const descriptor = getInternalBusinessResourceDescriptor(resource);

  if (!descriptor.collectionPath) {
    throw new Error(`${resource} is not backed by Firestore.`);
  }

  return descriptor.collectionPath(input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

export function isSensitiveBusinessRecordKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return NORMALIZED_SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
}

function timestampToIso(value: Record<string, unknown>): string | undefined {
  const toDate = value.toDate;
  if (typeof toDate === "function") {
    const date = toDate.call(value);
    return date instanceof Date ? date.toISOString() : undefined;
  }

  const seconds = value.seconds ?? value["_seconds"];
  const nanoseconds = value.nanoseconds ?? value["_nanoseconds"];
  if (typeof seconds === "number") {
    const millis =
      seconds * 1000 +
      (typeof nanoseconds === "number"
        ? Math.floor(nanoseconds / 1_000_000)
        : 0);
    return new Date(millis).toISOString();
  }

  const millis = value.millis;
  return typeof millis === "number"
    ? new Date(millis).toISOString()
    : undefined;
}

function truncateString(value: string): string {
  return value.length <= MAX_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

function toBusinessJsonValue(
  value: unknown,
  depth: number = 0,
): BusinessJsonValue | undefined {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return typeof value === "string" ? truncateString(value) : value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => toBusinessJsonValue(item, depth + 1))
      .filter((item): item is BusinessJsonValue => item !== undefined);

    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`...${value.length - MAX_ARRAY_ITEMS} more items`);
    }

    return items;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const timestamp = timestampToIso(value);
  if (timestamp) {
    return timestamp;
  }

  if (depth >= MAX_SANITIZE_DEPTH) {
    return "[object]";
  }

  const output: BusinessJsonObject = {};
  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);

  for (const [key, item] of entries) {
    if (isSensitiveBusinessRecordKey(key)) {
      output[key] = "[redacted]";
      continue;
    }

    const sanitized = toBusinessJsonValue(item, depth + 1);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  const remainingKeyCount = Object.keys(value).length - entries.length;
  if (remainingKeyCount > 0) {
    output.truncatedKeyCount = remainingKeyCount;
  }

  return output;
}

export function sanitizeBusinessRecordData(
  data: Record<string, unknown>,
): BusinessJsonObject {
  const sanitized = toBusinessJsonValue(data);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized
    : {};
}

function getPathValue(
  data: BusinessJsonObject,
  path: string,
): BusinessJsonValue | undefined {
  let current: BusinessJsonValue | undefined = data;

  for (const segment of path.split(".")) {
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !(segment in current)
    ) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function compactValueToString(value: BusinessJsonValue): string | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    const values = value
      .map(compactValueToString)
      .filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.slice(0, 4).join(", ") : undefined;
  }

  return undefined;
}

function firstStringValue(
  data: BusinessJsonObject,
  fields: readonly string[],
): string | undefined {
  for (const field of fields) {
    const value = getPathValue(data, field);
    if (value === undefined) {
      continue;
    }

    const compact = compactValueToString(value);
    if (compact && compact.trim()) {
      return compact.trim();
    }
  }

  return undefined;
}

function buildPreviewFields(
  data: BusinessJsonObject,
  fields: readonly string[],
): BusinessJsonObject {
  const output: BusinessJsonObject = {};

  for (const field of fields) {
    const value = getPathValue(data, field);
    if (value !== undefined) {
      output[field] = value;
    }
  }

  return output;
}

function collectSearchValues(value: BusinessJsonValue): string[] {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectSearchValues);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectSearchValues);
  }

  return [];
}

export function businessRecordMatchesQuery(
  descriptor: BusinessResourceDescriptor,
  record: BusinessRecord,
  query: string | undefined,
): boolean {
  const normalizedQuery = query?.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const data = sanitizeBusinessRecordData(record.data);
  const values = descriptor.searchFields.flatMap((field) => {
    const value = getPathValue(data, field);
    return value === undefined ? [] : collectSearchValues(value);
  });
  values.push(record.id);

  return values.join(" ").toLowerCase().includes(normalizedQuery);
}

export function summarizeBusinessRecord(
  descriptor: BusinessResourceDescriptor,
  record: BusinessRecord,
): BusinessRecordSummary {
  const internalDescriptor = getInternalBusinessResourceDescriptor(
    descriptor.name,
  );
  const data = sanitizeBusinessRecordData(record.data);
  const label =
    firstStringValue(data, internalDescriptor.labelFields) ?? record.id;
  const description = firstStringValue(
    data,
    internalDescriptor.descriptionFields,
  );

  return {
    ...(record.channelId ? { channelId: record.channelId } : {}),
    ...(description ? { description } : {}),
    fields: buildPreviewFields(data, internalDescriptor.previewFields),
    id: record.id,
    label,
    resource: record.resource,
  };
}
