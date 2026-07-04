import type {
  Attribute,
  Category,
  Channel,
  Customer,
  DynamicPricingConfig,
  DynamicPricingPreset,
  FakturowniaCostMapping,
  FormattedOrderItem,
  NestedMember,
  Order,
  Price,
  Product,
  ProductPageCountPrice,
  ProductPrice,
  ProductType,
  ApprovedFakturowniaCostEntry,
} from "@konfi/types";
import type { SemanticMaterialCostSearchResult } from "@/lib/fakturownia/cost-intelligence";

export type ToolActorKind = "konfi-session" | "oauth-user" | "machine";

export type ToolScope =
  | "user:context"
  | "channels:read"
  | "orders:read"
  | "orders:write"
  | "products:read"
  | "products:write"
  | "customers:read"
  | "customers:write"
  | "business:read"
  | "business:write"
  | "costs:read"
  | "pricing:explain"
  | "pricing:write"
  | "drafts:preview"
  | "drafts:write"
  | "files:metadata";

export const READ_ONLY_TOOL_SCOPES = [
  "user:context",
  "channels:read",
  "orders:read",
  "products:read",
  "customers:read",
  "business:read",
  "costs:read",
  "pricing:explain",
  "drafts:preview",
  "files:metadata",
] as const satisfies readonly ToolScope[];

export const WRITE_TOOL_SCOPES = [
  "orders:write",
  "products:write",
  "customers:write",
  "business:write",
  "pricing:write",
  "drafts:write",
] as const satisfies readonly ToolScope[];

export type ToolCallSource =
  | "mcp"
  | "admin-assistant"
  | "durable-agent"
  | "test"
  | "automation";

export interface ToolAuthContext {
  actor: {
    displayName?: string;
    email?: string;
    kind: ToolActorKind;
    uid: string;
  };
  permissions: {
    channelIds: string[];
    isAdmin: boolean;
    isSuperAdmin: boolean;
    scopes: ToolScope[];
    tenantId?: string;
  };
  request: {
    requestId: string;
    source: ToolCallSource;
  };
  token?: {
    clientId?: string;
    expiresAtMs: number;
    jti?: string;
    resource: string;
    scopes: ToolScope[];
    tenantId?: string;
  };
}

export type ToolAuditSummaryValue = string | number | boolean | null;
export type ToolAuditSummary = Record<string, ToolAuditSummaryValue>;

export type BusinessJsonValue =
  | string
  | number
  | boolean
  | null
  | BusinessJsonObject
  | BusinessJsonValue[];

export interface BusinessJsonObject {
  [key: string]: BusinessJsonValue;
}

export const BUSINESS_RESOURCE_NAMES = [
  "agents",
  "attributes",
  "b2bInquiries",
  "campaigns",
  "categories",
  "channelCms",
  "channelMetadata",
  "channelPages",
  "channelSettings",
  "complaints",
  "designatedPickupAreas",
  "dynamicPricingPresets",
  "emailOrderImports",
  "externalProducts",
  "externalProviders",
  "fakturowniaInvoices",
  "generatedOrderItems",
  "impositionWorkflows",
  "members",
  "notes",
  "orders",
  "productTypes",
  "products",
  "promotions",
  "quotes",
  "scheduleRules",
  "schedules",
  "shiftRequests",
  "suppliers",
  "warehouses",
] as const;

export type BusinessResourceName = (typeof BUSINESS_RESOURCE_NAMES)[number];
export type BusinessResourceSource = "fakturownia" | "firestore";

export const PRODUCT_PRICE_TABLES = [
  "prices",
  "pageCountStepPrices",
  "pageCountPrices",
  "pageCountSegmentStepPrices",
] as const;

export type ProductPriceTable = (typeof PRODUCT_PRICE_TABLES)[number];
export type ProductPriceTableRow = ProductPrice | ProductPageCountPrice;

export interface BusinessResourceDescriptor {
  channelScoped: boolean;
  description: string;
  label: string;
  name: BusinessResourceName;
  searchFields: string[];
  source: BusinessResourceSource;
}

export interface BusinessRecord {
  channelId?: string;
  data: Record<string, unknown>;
  id: string;
  path?: string;
  resource: BusinessResourceName;
}

export interface BusinessRecordSummary {
  channelId?: string;
  description?: string;
  fields: BusinessJsonObject;
  id: string;
  label: string;
  resource: BusinessResourceName;
}

export interface BusinessRecordsOutput {
  notes: string[];
  records: BusinessRecordSummary[];
  resource: BusinessResourceName;
  totalReturned: number;
}

export interface BusinessRecordOutput {
  notes: string[];
  record: BusinessRecordSummary & {
    data: BusinessJsonObject;
    path?: string;
  };
}

export type FirestoreQueryWhereOperator =
  | "<"
  | "<="
  | "=="
  | "!="
  | ">="
  | ">"
  | "array-contains"
  | "array-contains-any"
  | "in"
  | "not-in";

export type FirestoreQueryOrderDirection = "asc" | "desc";

export type FirestoreQueryRuntimeValue =
  | string
  | number
  | boolean
  | null
  | Date
  | FirestoreQueryRuntimeValue[];

export interface FirestoreQueryWhereClause {
  field: string;
  op: FirestoreQueryWhereOperator;
  value: FirestoreQueryRuntimeValue;
}

export interface FirestoreQueryOrderByClause {
  direction: FirestoreQueryOrderDirection;
  field: string;
}

export interface FirestoreQueryRecordOutput extends BusinessRecordSummary {
  data: BusinessJsonObject;
  path?: string;
}

export interface FirestoreQueryRecordsOutput {
  collectionPath: string;
  limit: number;
  notes: string[];
  orderBy: FirestoreQueryOrderByClause[];
  page: number;
  records: FirestoreQueryRecordOutput[];
  resource: BusinessResourceName;
  totalReturned: number;
  where: FirestoreQueryWhereClause[];
}

export interface ToolAuditEvent {
  actor: {
    clientId?: string;
    email?: string;
    kind: ToolActorKind;
    uid: string;
  };
  authorization: {
    channelIds: string[];
    decision: "allow" | "deny";
    denialReason?:
      | "ambiguous_channel"
      | "channel_required"
      | "missing_scope"
      | "invalid_token"
      | "channel_denied"
      | "resource_denied"
      | "validation_error";
    grantedScopes: ToolScope[];
    requestedScopes: ToolScope[];
  };
  errorCode?: string;
  latencyMs: number;
  requestId: string;
  source: Exclude<ToolCallSource, "test"> | "test";
  status: "success" | "error" | "denied";
  token?: {
    jti?: string;
    resource?: string;
    scopes: ToolScope[];
  };
  tool: {
    inputSummary: ToolAuditSummary;
    name: string;
    outputSummary?: ToolAuditSummary;
  };
}

export interface ToolAuditLogger {
  logToolCall(event: ToolAuditEvent): Promise<void>;
}

export interface ToolLayerReaders {
  getAttributeOptionCosts(input: {
    attributeId: string;
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    optionValue: string;
    productId?: string;
    tenantId?: string;
  }): Promise<ApprovedFakturowniaCostEntry[]>;
  getBusinessRecord(input: {
    channelId?: string;
    recordId: string;
    resource: BusinessResourceName;
  }): Promise<BusinessRecord | null>;
  getDraftRecord(input: { runId: string }): Promise<McpDraftRecord | null>;
  getProductCosts(input: {
    attributeId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    optionValue?: string;
    productId: string;
    tenantId?: string;
  }): Promise<ApprovedFakturowniaCostEntry[]>;
  listChannels(): Promise<Channel[]>;
  listBusinessRecords(input: {
    channelId?: string;
    limit: number;
    query?: string;
    resource: BusinessResourceName;
  }): Promise<BusinessRecord[]>;
  queryBusinessRecords(input: {
    channelId?: string;
    limit: number;
    offset: number;
    orderBy: FirestoreQueryOrderByClause[];
    resource: BusinessResourceName;
    where: FirestoreQueryWhereClause[];
  }): Promise<{
    collectionPath: string;
    records: BusinessRecord[];
  }>;
  listProductCostMappings(input: {
    limit: number;
    productId?: string;
    tenantId?: string;
  }): Promise<FakturowniaCostMapping[]>;
  listAttributes(): Promise<Attribute[]>;
  listCategories(input: { channelId: string }): Promise<Category[]>;
  getCustomer(customerId: string): Promise<Customer | null>;
  getCustomerOrders(input: {
    channelId: string;
    customerId: string;
    limit: number;
  }): Promise<Order[]>;
  getDynamicPricingAttributes(attributeIds: string[]): Promise<Attribute[]>;
  getDynamicPricingPresetsByIds(input: {
    channelId: string;
    presetIds: string[];
  }): Promise<DynamicPricingPreset[]>;
  getOrder(input: {
    channelId: string;
    orderId: string;
  }): Promise<Order | null>;
  getOrderByNumber(input: {
    channelId: string;
    orderNumber: number;
  }): Promise<Order | null>;
  getProduct(input: {
    channelId: string;
    productId: string;
  }): Promise<Product | null>;
  getProductDynamicPricing(input: {
    channelId: string;
    productId: string;
  }): Promise<DynamicPricingConfig | null>;
  listProductPriceRows(input: {
    channelId: string;
    limit: number;
    offset: number;
    productId: string;
    table: ProductPriceTable;
  }): Promise<ProductPriceTableRow[]>;
  listOrdersByIds(input: {
    channelId: string;
    orderIds: string[];
  }): Promise<Order[]>;
  listOrders(input: {
    channelId: string;
    limit: number;
    offset: number;
  }): Promise<Order[]>;
  listProducts(input: {
    channelId: string;
    limit: number;
    offset: number;
  }): Promise<Product[]>;
  listProductsByIds(input: {
    channelId: string;
    productIds: string[];
  }): Promise<Product[]>;
  listProductTypes(): Promise<ProductType[]>;
  searchCustomers(input: { limit: number; query: string }): Promise<string[]>;
  searchOrders(input: {
    channelId: string;
    limit: number;
    page: number;
    query: string;
  }): Promise<{ orderIds: string[]; totalHits: number }>;
  searchProducts(input: {
    channelId: string;
    limit: number;
    query: string;
  }): Promise<string[]>;
  searchCostEvidence(input: {
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    productId?: string;
    query?: string;
    tenantId?: string;
  }): Promise<ApprovedFakturowniaCostEntry[]>;
  searchMaterialCostsByQuery(input: {
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    productId?: string;
    query: string;
    tenantId?: string;
  }): Promise<SemanticMaterialCostSearchResult>;
}

export type ToolTaskType = DraftSchemaType | "businessUpdate";

export interface SaveDraftRecordInput {
  channelId?: string;
  createdBy: NestedMember;
  draftType: ToolTaskType;
  existingRunId?: string;
  messages: {
    content: string;
    role: "assistant" | "user";
  }[];
  prompt: string;
  result: Record<string, unknown>;
  summary?: string;
}

export interface SaveDraftRecordOutput {
  runId: string;
}

export interface ToolLayerWriters {
  saveDraftRecord(input: SaveDraftRecordInput): Promise<SaveDraftRecordOutput>;
}

export interface ToolLayerRuntime {
  audit?: ToolAuditLogger;
  auth: ToolAuthContext;
  readers: ToolLayerReaders;
  writers?: ToolLayerWriters;
}

export interface McpDraftRecord {
  channelId?: string;
  createdBy?: NestedMember;
  result: Record<string, unknown>;
  runId: string;
  source?: string;
  status?: string;
  summary?: string;
  taskType?: string;
  tenantId?: string;
  workflowStatus?: string;
}

export interface ChannelToolSummary {
  active: boolean;
  name: string;
}

export interface CustomerToolSummary {
  b2b?: boolean;
  contactCount: number;
  contacts: {
    hasEmail: boolean;
    hasPhone: boolean;
    name: string;
  }[];
  id: string;
  name: string;
  nip?: string;
  personName?: string;
  specialNotes?: string;
}

export interface OrderToolSummary {
  channelId: string;
  createdAt: string | null;
  currency: string;
  customer: {
    id?: string;
    name: string;
  };
  deadline: string | null;
  filesStatus: string;
  id: string;
  itemCount: number;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
  }[];
  number: number;
  paymentStatus: string;
  paymentType: string;
  shippingOption: string | null;
  status: string;
  totalPrice: number;
}

export interface ProductToolSummary {
  active: boolean;
  attributeCount: number;
  attributeOptionCount: number;
  category?: string;
  channelId?: string;
  customSize: boolean;
  description?: string;
  id: string;
  name: string;
  pageCount?: {
    enabled: boolean;
    maximum: number;
    minimum: number;
    step: number;
  };
  priceRowCount: number;
  priceType: string;
  published: boolean;
}

export interface ProductListOutput {
  limit: number;
  nextPage?: number;
  page: number;
  products: ProductToolSummary[];
  totalReturned: number;
}

export interface ProductPriceRowSummary {
  calculatedCombination?: string;
  id: string;
  isDefault?: boolean;
  pageCount?: number;
  prices: Price[];
}

export interface ProductPriceRowsOutput {
  channelId: string;
  limit: number;
  nextPage?: number;
  page: number;
  priceType: Product["priceType"];
  productId: string;
  rows: ProductPriceRowSummary[];
  table: ProductPriceTable;
  totalReturned: number;
}

export interface ProductDynamicPricingConfigOutput {
  channelId: string;
  config: DynamicPricingConfig | null;
  linkedPresets?: DynamicPricingPreset[];
  notes: string[];
  priceType: Product["priceType"];
  productId: string;
}

export interface ProductConfigurationOption {
  color?: string;
  customFormat: boolean;
  formatHeight?: number | null;
  formatWidth?: number | null;
  label: string;
  pages?: number | null;
  value: string;
}

export interface ProductConfigurationAttribute {
  calculated: boolean;
  format: boolean;
  id: string;
  name: string;
  options: ProductConfigurationOption[];
  pages: boolean;
  required: boolean;
  type: Attribute["type"];
}

export interface ProductConfigurationSchema {
  attributeDependencies?: Product["attributeDependencies"];
  attributes: ProductConfigurationAttribute[];
  channelId: string;
  customSize: {
    enabled: boolean;
    height?: {
      maximum?: number;
      minimum?: number;
      step?: number;
    };
    width?: {
      maximum?: number;
      minimum?: number;
      step?: number;
    };
  };
  pageCount?: {
    coverPages: number;
    maximum: number;
    minimum: number;
    pricingMode?: string;
    step: number;
  };
  priceCombinations: {
    id: string;
    name: string;
    priceRows: number;
  }[];
  priceType: string;
  pricingTool: {
    name: "explain_price";
    notes: string[];
    optionalInputs: string[];
    requiredInputs: string[];
  };
  productId: string;
  productName: string;
  quantity: {
    default: number;
    maximum: number;
    minimum: number;
    step: number;
  };
  unit: Product["prefferedUnit"];
}

export type DraftSchemaType =
  | "category"
  | "order"
  | "product"
  | "productType"
  | "quote";

export const KONFI_DRAFTING_DOC_TOPICS = [
  "overview",
  "category",
  "quote",
  "order",
  "product",
  "attribute",
  "productType",
  "pageCount",
  "money",
  "configuration",
  "dependencies",
  "draftShapes",
  "customSize",
  "volume",
  "advancedFinishing",
  "blockedDrafts",
  "atomicChanges",
  "examples",
  "pricing",
] as const;

export type KonfiDraftingDocsTopic = (typeof KONFI_DRAFTING_DOC_TOPICS)[number];

export interface KonfiDraftingDocsSection {
  bullets: string[];
  title: string;
}

export interface KonfiPriceTypeGuide {
  draftShape: string[];
  priceType: Product["priceType"];
  useWhen: string;
  validationNotes: string[];
}

export interface KonfiDraftingDocsExample {
  description: string;
  title: string;
  value: Record<string, unknown>;
}

export interface KonfiDraftingDocsOutput {
  examples?: KonfiDraftingDocsExample[];
  notes: string[];
  priceTypes?: KonfiPriceTypeGuide[];
  relatedTools: string[];
  sections: KonfiDraftingDocsSection[];
  sourceModels: string[];
  topic: KonfiDraftingDocsTopic;
}

export interface ResourceOption {
  id: string;
  label: string;
}

export interface CatalogAttributeResource extends ResourceOption {
  calculated: boolean;
  format: boolean;
  optionCount: number;
  options: ProductConfigurationOption[];
  pages: boolean;
  required: boolean;
  type: Attribute["type"];
}

export interface ProductTypeResource extends ResourceOption {
  attributeIds: string[];
  isShippable: boolean;
}

export interface DraftResourceOptionsOutput {
  attributes?: CatalogAttributeResource[];
  categories?: ResourceOption[];
  channelId?: string;
  draftType: DraftSchemaType;
  enums: {
    filesStatuses?: ResourceOption[];
    orderStatuses?: ResourceOption[];
    paymentStatuses?: ResourceOption[];
    paymentTypes?: ResourceOption[];
    priceTypes?: ResourceOption[];
    shippingOptions?: ResourceOption[];
    shippingTypes?: ResourceOption[];
    units?: ResourceOption[];
  };
  notes: string[];
  productTypes?: ProductTypeResource[];
}

export interface DraftSchemaField {
  description: string;
  name: string;
  required: boolean;
  type: string;
}

export interface DraftSchemaOutput {
  draftType: DraftSchemaType;
  fields: DraftSchemaField[];
  itemFields?: DraftSchemaField[];
  notes: string[];
  pricingFlow?: {
    description: string;
    tools: string[];
  };
}

export interface SavedDraftOutput {
  channelId: string;
  draftType: DraftSchemaType;
  openUrl: string;
  runId: string;
  status: "completed";
}

export interface SavedBusinessUpdateDraftOutput {
  channelId?: string;
  openUrl: string;
  recordId: string;
  resource: BusinessResourceName;
  runId: string;
  status: "completed";
}

export interface SavedDraftRecordOutput {
  channelId?: string;
  draftType: ToolTaskType;
  openUrl: string;
  result: Record<string, unknown>;
  runId: string;
  status: string;
  summary?: string;
}

export interface SearchResultSummary {
  id: string;
  label: string;
  type: "customer" | "order" | "product";
}

export interface SuggestOrderItemsOutput {
  catalogCandidateCount: number;
  count: number;
  items: FormattedOrderItem[];
  notes: string[];
  totalAvailable: number;
}

export interface PriceExplanation {
  channelId: string;
  deliveryTime?: number;
  error?: string;
  formattedPrice?: string;
  productId: string;
  productName: string;
  priceType: string;
  pricesConsidered: number;
  quantity: number;
  result?: number;
  selectedCombination: string;
  volume?: number;
}

export interface ExplainProductPriceInput {
  calculatedCombination?: string;
  channelId?: string;
  channelName?: string;
  customFormat?: boolean;
  customPrice?: number | null;
  discount?: number;
  height?: number;
  pageCount?: number | null;
  productId: string;
  quantity: number;
  selectedAttributeOptions?: Record<string, string> | null;
  volume?: number;
  width?: number;
}

export interface PriceResolutionResult {
  prices: Price[];
}
