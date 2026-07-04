import type {
  ApprovedFakturowniaCostEntry,
  FakturowniaCostMapping,
} from "@konfi/types";
import type { SemanticMaterialCostSearchResult } from "@/lib/fakturownia/cost-intelligence";
import type {
  BusinessJsonValue,
  BusinessResourceDescriptor,
  BusinessResourceName,
  ChannelToolSummary,
  DraftSchemaType,
  FirestoreQueryOrderDirection,
  FirestoreQueryWhereOperator,
  FirestoreQueryRecordsOutput,
  KonfiDraftingDocsTopic,
  OrderToolSummary,
  ProductPriceTable,
  SearchResultSummary,
  ToolAuthContext,
} from "./types";

export type CurrentUserToolContext = Pick<
  ToolAuthContext,
  "actor" | "permissions" | "request"
>;

export interface SearchOrdersInput {
  channelId?: string;
  channelName?: string;
  limit?: number;
  page?: number;
  query: string;
}

export interface SearchOrdersOutput {
  results: SearchResultSummary[];
  totalHits: number;
}

export interface ListOrdersInput {
  channelId?: string;
  channelName?: string;
  limit?: number;
  page?: number;
}

export interface ListOrdersOutput {
  limit: number;
  nextPage?: number;
  page: number;
  results: OrderToolSummary[];
  totalReturned: number;
}

export interface GetOrderByNumberInput {
  channelId?: string;
  channelName?: string;
  orderNumber: number;
}

export interface SearchProductsInput {
  channelId?: string;
  channelName?: string;
  limit?: number;
  query: string;
}

export interface ListProductsInput {
  channelId?: string;
  channelName?: string;
  limit?: number;
  page?: number;
}

export interface SuggestOrderItemsInput {
  channelId?: string;
  channelName?: string;
  limit?: number;
  query: string;
}

export interface SearchCustomersInput {
  limit?: number;
  query: string;
}

export interface ListBusinessResourcesOutput {
  notes: string[];
  resources: BusinessResourceDescriptor[];
}

export interface SearchBusinessRecordsInput {
  channelId?: string;
  channelName?: string;
  limit?: number;
  query?: string;
  resource: BusinessResourceName;
}

export interface FirestoreQueryWhereInput {
  field: string;
  op: FirestoreQueryWhereOperator;
  value: BusinessJsonValue;
}

export interface FirestoreQueryOrderByInput {
  direction?: FirestoreQueryOrderDirection;
  field: string;
}

export interface QueryFirestoreRecordsInput {
  channelId?: string;
  channelName?: string;
  limit?: number;
  orderBy?: FirestoreQueryOrderByInput[];
  page?: number;
  resource: BusinessResourceName;
  where?: FirestoreQueryWhereInput[];
}

export type QueryFirestoreRecordsOutput = FirestoreQueryRecordsOutput;

export interface GetBusinessRecordInput {
  channelId?: string;
  channelName?: string;
  recordId: string;
  resource: BusinessResourceName;
}

export interface GetOrderInput {
  channelId?: string;
  channelName?: string;
  orderId: string;
}

export interface GetProductInput {
  channelId?: string;
  channelName?: string;
  productId: string;
}

export type GetProductConfigurationSchemaInput = GetProductInput;

export interface ListProductPriceRowsInput extends GetProductInput {
  limit?: number;
  page?: number;
  table?: ProductPriceTable;
}

export interface GetProductDynamicPricingConfigInput extends GetProductInput {
  includeLinkedPresets?: boolean;
}

export interface GetCustomerInput {
  customerId: string;
}

export interface ListCustomerOrdersInput {
  channelId?: string;
  channelName?: string;
  customerId: string;
  limit?: number;
}

export interface ListChannelsOutput {
  channels: ChannelToolSummary[];
}

export interface GetDraftSchemaInput {
  draftType: DraftSchemaType;
}

export interface GetDraftResourceOptionsInput {
  channelId?: string;
  channelName?: string;
  draftType: DraftSchemaType;
}

export interface GetKonfiDraftingDocsInput {
  topic?: KonfiDraftingDocsTopic;
}

export interface SaveDraftInput {
  channelId?: string;
  channelName?: string;
  draft: Record<string, unknown>;
  draftRunId?: string;
  draftType: DraftSchemaType;
  summary?: string;
  title?: string;
}

export interface GetSavedDraftInput {
  draftRunId: string;
}

export interface BusinessUpdateDraftChange {
  note?: string;
  path: string;
  previousValue?: BusinessJsonValue;
  value: BusinessJsonValue;
}

export interface SaveBusinessUpdateDraftInput {
  channelId?: string;
  channelName?: string;
  changes: BusinessUpdateDraftChange[];
  draftRunId?: string;
  recordId: string;
  resource: BusinessResourceName;
  summary?: string;
  title?: string;
}

export interface GetProductCostsInput {
  attributeId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  optionValue?: string;
  productId: string;
}

export interface ListProductCostMappingsInput {
  limit?: number;
  productId?: string;
}

export interface GetAttributeOptionCostsInput {
  attributeId: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  optionValue: string;
  productId?: string;
}

export interface SearchCostEvidenceInput {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  productId?: string;
  query?: string;
}

export interface ProductCostsOutput {
  costs: ApprovedFakturowniaCostEntry[];
  notes: string[];
  totalReturned: number;
}

export interface SearchMaterialCostsInput {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  productId?: string;
  query: string;
}

export interface SearchMaterialCostsOutput extends SemanticMaterialCostSearchResult {
  notes: string[];
}

export interface ProductCostMappingsOutput {
  mappings: FakturowniaCostMapping[];
  notes: string[];
  totalReturned: number;
}
