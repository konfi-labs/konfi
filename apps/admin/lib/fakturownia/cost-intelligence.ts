import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { getAdminVertexLanguageModel } from "@/lib/ai/vertex-language-model.server";
import { getFakturowniaClient } from "@/lib/fakturownia/client";
import {
  embedGeminiEmbeddingText,
  PRODUCT_SEARCH_EMBEDDING_DIMENSION,
  PRODUCT_SEARCH_EMBEDDING_MODEL,
} from "@/lib/product-search/semantic-product-index";
import type {
  Address,
  ApprovedFakturowniaCostEntry,
  Attribute,
  FakturowniaCostDecisionMemory,
  FakturowniaCostEvidence,
  FakturowniaCostMapping,
  FakturowniaCostPackaging,
  FakturowniaCostProductLink,
  FakturowniaCostUnit,
  FakturowniaMaterialGroup,
  FakturowniaProductCostRollupBucket,
  FakturowniaProductCostRollup,
  Channel,
  Product,
  Supplier,
} from "@konfi/types";
import { MODELS } from "@konfi/firebase";
import { DateOnly } from "@microsoft/kiota-abstractions";
import {
  type BulkWriter,
  FieldValue,
  Timestamp,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import {
  buildFakturowniaCostDecisionKey,
  buildFakturowniaCostMappingId,
  buildFakturowniaCostMappingSuggestion,
  FAKTUROWNIA_COST_BASE_CURRENCY,
  normalizeFakturowniaCostEvidence,
  normalizeFakturowniaCostText,
} from "./cost-intelligence-normalization";
import {
  buildProductCostRollupId,
  computeProductCostRollup,
} from "./cost-rollup";
import { rankCostProductCandidates } from "./cost-intelligence-candidates";
import { deriveIncrementalDateFrom } from "./cost-intelligence-sync";
import {
  GetIncomeQueryParameterTypeObject,
  GetPeriodQueryParameterTypeObject,
} from "@konfi/fakturownia/out/client/invoicesJson";
import type { Invoice } from "@konfi/fakturownia/out/client/models";
import { z } from "zod";
import {
  AI_COST_MATCH_CONFIDENCE_THRESHOLD,
  resolveHighConfidenceAiCostMatch,
  type ResolvedAiCostMatch,
} from "./cost-intelligence-ai-matching";
import { chunk } from "es-toolkit";
import { generateKeywords, mapWithConcurrency } from "@konfi/utils";

export const FAKTUROWNIA_COST_DECISIONS_COLLECTION = "fakturowniaCostDecisions";
export const FAKTUROWNIA_COST_EVIDENCE_COLLECTION = "fakturowniaCostEvidence";
export const FAKTUROWNIA_COST_MAPPINGS_COLLECTION = "fakturowniaCostMappings";
export const FAKTUROWNIA_COST_SEMANTIC_INDEX_COLLECTION =
  "fakturowniaCostSemanticIndex";
export const FAKTUROWNIA_COST_SYNC_STATE_COLLECTION =
  "fakturowniaCostSyncState";
export const FAKTUROWNIA_COST_SYNC_PROGRESS_COLLECTION =
  "fakturowniaCostSyncProgress";
export const FAKTUROWNIA_PRODUCT_COST_ROLLUPS_COLLECTION =
  "fakturowniaProductCostRollups";
const FAKTUROWNIA_MATERIAL_GROUPS_COLLECTION = "fakturowniaMaterialGroups";
export const SUPPLIERS_COLLECTION = "suppliers";

export { deriveIncrementalDateFrom } from "./cost-intelligence-sync";
export {
  buildProductCostRollupId,
  computeProductCostRollup,
} from "./cost-rollup";

const MAX_SYNC_PAGES = 50;
const SYNC_PAGE_SIZE = 100;
const SUPPLIER_CATALOG_LIMIT = 1000;
const DEFAULT_COST_LIMIT = 25;
const MAX_COST_LIMIT = 100;
const APPROVED_MAPPING_PAGE_SIZE = 200;
const APPROVED_MAPPING_MAX_PAGES = 50;
const DEFAULT_REVIEW_LIMIT = 100;
const AI_COST_MATCH_CANDIDATE_LIMIT = 12;
// Caps for the product-agnostic material catalog sent to the AI matcher so it
// can classify a position as a shared material (attributeId, optionValue).
const AI_COST_MATCH_MATERIAL_ATTRIBUTE_LIMIT = 40;
const AI_COST_MATCH_MATERIAL_OPTION_LIMIT = 40;
const COST_PRODUCT_CATALOG_LIMIT = 600;
// Bounds concurrent Gemini calls per invoice; lower if seeing 429s.
const POSITION_SYNC_CONCURRENCY = 2;
// Batched AI call caps: keep output token pressure low and prompt manageable.
const MAX_BATCH_POSITIONS = 25;
const MAX_BATCH_INPUT_TOKENS = 60_000;
const COST_SEMANTIC_DISTANCE_FIELD = "distance";
const COST_SEMANTIC_SEARCH_POOL_MULTIPLIER = 5;
const COST_SEMANTIC_SEARCH_FALLBACK_POOL = 100;

interface CostAuditMember {
  id: string;
  name: string;
}

export interface CreateManualFakturowniaCostInput {
  attributeId?: string;
  attributeName?: string;
  issueDate?: string;
  member: CostAuditMember;
  name: string;
  optionLabel?: string;
  optionValue?: string;
  productLinks?: FakturowniaCostProductLink[];
  packaging?: FakturowniaCostPackaging;
  productId?: string;
  productName?: string;
  supplierName?: string;
  tenantId?: string;
  unitCostNet: number;
  unit: FakturowniaCostUnit;
}

interface SyncFakturowniaCostInvoicesInput {
  createdBy: CostAuditMember;
  dateFrom?: string;
  dateTo?: string;
  tenantId?: string;
}

interface CostMappingCandidate {
  attributeId?: string;
  attributeName?: string;
  confidence: number;
  decision?: "rejected";
  optionLabel?: string;
  optionValue?: string;
  product?: Product;
  productId?: string;
  productName?: string;
  reasoning?: string;
  sourceSignals: string[];
  supplier?: Supplier;
}

interface CostMatchingCatalog {
  attributesById: ReadonlyMap<string, Attribute>;
  products: Product[];
  suppliers: Supplier[];
}

export interface FakturowniaCostMappingSelectorOption {
  label: string;
  value: string;
}

export interface FakturowniaCostMappingSelectorAttribute {
  id: string;
  name: string;
  options: FakturowniaCostMappingSelectorOption[];
}

export interface FakturowniaCostMappingSelectorProduct {
  attributes: FakturowniaCostMappingSelectorAttribute[];
  categoryName?: string;
  channelId?: string;
  channelName?: string;
  id: string;
  name: string;
}

export interface SyncFakturowniaCostInvoicesResult {
  effectiveDateFrom?: string;
  evidenceCreatedOrUpdated: number;
  incremental: boolean;
  invoicesScanned: number;
  pendingMappingsCreated: number;
  positionsScanned: number;
  truncated: boolean;
}

interface FakturowniaCostSyncStateDoc {
  lastDateTo?: string;
  lastSyncedAt?: Timestamp;
  result?: SyncFakturowniaCostInvoicesResult;
  tenantId?: string;
  updatedAt?: Timestamp;
  updatedBy?: CostAuditMember;
}

export type FakturowniaCostSyncPhase =
  | "scanning"
  | "finalizing"
  | "completed"
  | "failed";

// Persisted snapshot of an in-flight sync so the UI can poll live progress.
// Throttled writes during the scan loop, plus forced writes at start, finalize,
// completion, and failure.
interface FakturowniaCostSyncProgressDoc {
  currentInvoiceNumber?: string;
  effectiveDateFrom?: string;
  error?: string;
  evidenceCreatedOrUpdated: number;
  incremental: boolean;
  invoicesScanned: number;
  page: number;
  pendingMappingsCreated: number;
  phase: FakturowniaCostSyncPhase;
  positionsScanned: number;
  startedAt?: Timestamp;
  status: "running" | "completed" | "failed";
  tenantId?: string;
  truncated?: boolean;
  updatedAt?: Timestamp;
}

// Client-serializable projection (Timestamps → ISO strings, plus elapsedMs).
export interface FakturowniaCostSyncProgress {
  currentInvoiceNumber?: string;
  effectiveDateFrom?: string;
  elapsedMs?: number;
  error?: string;
  evidenceCreatedOrUpdated: number;
  incremental: boolean;
  invoicesScanned: number;
  page: number;
  pendingMappingsCreated: number;
  phase: FakturowniaCostSyncPhase;
  positionsScanned: number;
  startedAt?: string;
  status: "running" | "completed" | "failed";
  truncated?: boolean;
  updatedAt?: string;
}

// How often (ms) progress is flushed to Firestore during the scan loop.
const PROGRESS_THROTTLE_MS = 1000;

export interface CostEvidenceSearchInput {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  productId?: string;
  query?: string;
  tenantId?: string;
}

export interface SemanticMaterialCostSearchInput {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  productId?: string;
  query: string;
  tenantId?: string;
}

export interface SemanticMaterialCostMatch extends ApprovedFakturowniaCostEntry {
  distance?: number | null;
}

export interface SemanticMaterialCostSearchResult {
  baseCurrency: string;
  matches: SemanticMaterialCostMatch[];
  noResultReason?: string;
  query: string;
  summary: FakturowniaProductCostRollupBucket;
  totalReturned: number;
}

export interface FakturowniaCostSemanticIndexBackfillResult {
  deleted: number;
  failed: number;
  indexed: number;
  scanned: number;
  skipped: number;
}

export interface ProductCostQueryInput {
  attributeId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  optionValue?: string;
  productId: string;
  tenantId?: string;
}

export interface AttributeOptionCostQueryInput {
  attributeId: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  optionValue: string;
  productId?: string;
  tenantId?: string;
}

export interface CostMappingListInput {
  limit?: number;
  productId?: string;
  tenantId?: string;
}

export interface CostReviewData {
  approved: Array<{
    evidence?: FakturowniaCostEvidence;
    mapping: FakturowniaCostMapping;
  }>;
  pending: Array<{
    evidence?: FakturowniaCostEvidence;
    mapping: FakturowniaCostMapping;
  }>;
}

function firestore(): AdminFirestore {
  return getAdminDb();
}

async function getAiRuntime(context: { tenantId?: string } = {}) {
  const runtime = await import("ai");

  return {
    ...runtime,
    generateText: createMeteredAdminGenerateText({
      generateText: runtime.generateText,
      model: MODELS.GEMINI_3_FLASH_LITE,
      provider: "google-vertex",
      source: "agent",
      tenantId: context.tenantId,
    }),
  };
}

function limitValue(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_COST_LIMIT;
  }

  return Math.min(
    Math.max(Math.floor(value ?? DEFAULT_COST_LIMIT), 1),
    MAX_COST_LIMIT,
  );
}

function toDateOnly(value: string | undefined): DateOnly | undefined {
  return value ? DateOnly.parse(value) : undefined;
}

function tenantMatches(
  data: { tenantId?: string | null } | undefined,
  tenantId?: string,
): boolean {
  return !tenantId || data?.tenantId === tenantId;
}

function stringInRange(
  value: string | undefined,
  input: {
    dateFrom?: string;
    dateTo?: string;
  },
): boolean {
  if (!value) {
    return true;
  }

  if (input.dateFrom && value < input.dateFrom) {
    return false;
  }

  if (input.dateTo && value > input.dateTo) {
    return false;
  }

  return true;
}

function mappingIssueDate(
  mapping: FakturowniaCostMapping,
  evidence: FakturowniaCostEvidence,
): string | undefined {
  return mapping.issueDate ?? evidence.invoice.issueDate;
}

function asCostEvidence(
  data: FirebaseFirestore.DocumentData | undefined,
): FakturowniaCostEvidence | undefined {
  return data as FakturowniaCostEvidence | undefined;
}

function asCostMapping(
  data: FirebaseFirestore.DocumentData | undefined,
): FakturowniaCostMapping | undefined {
  return data as FakturowniaCostMapping | undefined;
}

function auditTimestamps(member: CostAuditMember) {
  return {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: member,
  };
}

function createTimestamps(member: CostAuditMember) {
  return {
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: member,
    ...auditTimestamps(member),
  };
}

function costEvidenceWriteData(
  evidence: FakturowniaCostEvidence,
): Partial<FakturowniaCostEvidence> {
  const data: Partial<FakturowniaCostEvidence> = { ...evidence };
  delete data.createdAt;
  delete data.createdBy;
  delete data.updatedAt;
  delete data.updatedBy;
  return data;
}

function roundCost(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateOnlyToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeNip(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\D/g, "");
  return normalized || undefined;
}

function optionalStringId(value: string | number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
}

export async function deactivateStaleEvidence(input: {
  activeEvidenceIds: ReadonlySet<string>;
  db: AdminFirestore;
  invoiceId: string;
  member: CostAuditMember;
  tenantId?: string;
  writer: BulkWriter;
}): Promise<Set<string>> {
  // Nested single-field index on `invoice.id` is created automatically by
  // Firestore, so no composite index is required for this equality query.
  let query = input.db
    .collection(FAKTUROWNIA_COST_EVIDENCE_COLLECTION)
    .where("invoice.id", "==", input.invoiceId) as FirebaseFirestore.Query;
  if (input.tenantId) {
    query = query.where("tenantId", "==", input.tenantId);
  }
  const snapshot = await query.get();

  const staleProductIds = new Set<string>();
  const staleDocs = snapshot.docs.filter(
    (doc) =>
      !input.activeEvidenceIds.has(doc.id) &&
      tenantMatches(doc.data(), input.tenantId) &&
      doc.data().active !== false,
  );

  // BulkWriter batches and parallelizes these merge-sets; we do NOT await each
  // op (only the final flush by the caller). We do await the mapping lookups so
  // affected rollups can be recomputed after the queued tombstones are flushed.
  await Promise.all(
    staleDocs.map(async (doc) => {
      const mappingsSnapshot = await input.db
        .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
        .where("evidenceId", "==", doc.id)
        .get();
      mappingsSnapshot.docs.forEach((mappingDoc) => {
        const mapping = asCostMapping(mappingDoc.data());
        if (
          mapping?.status === "approved" &&
          !mapping.reference &&
          tenantMatches(mapping, input.tenantId)
        ) {
          mappingProductLinks(mapping).forEach((link) =>
            staleProductIds.add(link.productId),
          );
        }
      });
      void input.writer.set(
        doc.ref,
        { active: false, ...auditTimestamps(input.member) },
        { merge: true },
      );
    }),
  );

  return staleProductIds;
}

export function buildFakturowniaCostSyncStateWriteData(input: {
  dateTo?: string;
  member: CostAuditMember;
  result: SyncFakturowniaCostInvoicesResult;
  tenantId?: string;
  truncated: boolean;
}): FirebaseFirestore.DocumentData {
  return {
    ...(input.truncated ? {} : { lastSyncedAt: FieldValue.serverTimestamp() }),
    ...(!input.truncated && input.dateTo ? { lastDateTo: input.dateTo } : {}),
    result: input.result,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...auditTimestamps(input.member),
  };
}

function productFromSnapshot(
  snapshot: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
): Product {
  const product = snapshot.data() as Product;
  const sourceChannelId = snapshot.ref.parent.parent?.id;

  return {
    ...product,
    channelId: product.channelId ?? sourceChannelId,
    id: product.id || snapshot.id,
  };
}

function dedupeProducts(products: readonly Product[]): Product[] {
  return Array.from(
    new Map(products.map((product) => [product.id, product])).values(),
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

function cleanProductLink(
  link: Partial<FakturowniaCostProductLink>,
): FakturowniaCostProductLink | undefined {
  const productId = link.productId?.trim();
  if (!productId) {
    return undefined;
  }

  const productName = link.productName?.trim();
  const attributeId = link.attributeId?.trim();
  const attributeName = link.attributeName?.trim();
  const combinationId = link.combinationId?.trim();
  const optionLabel = link.optionLabel?.trim();
  const optionValue = link.optionValue?.trim();

  return {
    productId,
    ...(productName ? { productName } : {}),
    ...(attributeId ? { attributeId } : {}),
    ...(attributeName ? { attributeName } : {}),
    ...(combinationId ? { combinationId } : {}),
    ...(optionLabel ? { optionLabel } : {}),
    ...(optionValue ? { optionValue } : {}),
  };
}

function uniqueProductLinks(
  links: readonly Partial<FakturowniaCostProductLink>[],
): FakturowniaCostProductLink[] {
  const byProductId = new Map<string, FakturowniaCostProductLink>();
  for (const link of links) {
    const cleaned = cleanProductLink(link);
    if (!cleaned || byProductId.has(cleaned.productId)) {
      continue;
    }
    byProductId.set(cleaned.productId, cleaned);
  }
  return Array.from(byProductId.values());
}

function inputProductLinks(input: {
  attributeId?: string;
  attributeName?: string;
  combinationId?: string;
  optionLabel?: string;
  optionValue?: string;
  productId?: string;
  productName?: string;
  productLinks?: FakturowniaCostProductLink[];
}): FakturowniaCostProductLink[] {
  if (input.productLinks !== undefined) {
    return uniqueProductLinks(input.productLinks);
  }

  return uniqueProductLinks([
    {
      ...(input.attributeId ? { attributeId: input.attributeId } : {}),
      ...(input.attributeName ? { attributeName: input.attributeName } : {}),
      ...(input.combinationId ? { combinationId: input.combinationId } : {}),
      ...(input.optionLabel ? { optionLabel: input.optionLabel } : {}),
      ...(input.optionValue ? { optionValue: input.optionValue } : {}),
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.productName ? { productName: input.productName } : {}),
    },
  ]);
}

function mappingProductLinks(
  mapping: FakturowniaCostMapping | undefined,
): FakturowniaCostProductLink[] {
  if (!mapping) {
    return [];
  }
  const links = uniqueProductLinks(mapping.productLinks ?? []);
  if (links.length > 0) {
    return links;
  }
  return inputProductLinks(mapping);
}

function primaryProductLink(
  links: readonly FakturowniaCostProductLink[],
): FakturowniaCostProductLink | undefined {
  return links[0];
}

function productLinkWriteData(
  links: readonly FakturowniaCostProductLink[],
): FirebaseFirestore.DocumentData {
  const primary = primaryProductLink(links);

  if (!primary) {
    return {
      productId: FieldValue.delete(),
      productIds: FieldValue.delete(),
      productLinks: FieldValue.delete(),
      productName: FieldValue.delete(),
    };
  }

  return {
    productId: primary.productId,
    productIds: uniqueStrings(links.map((link) => link.productId)),
    productLinks: links,
    ...(primary.productName
      ? { productName: primary.productName }
      : { productName: FieldValue.delete() }),
  };
}

function mappingMatchesProduct(
  mapping: FakturowniaCostMapping,
  productId: string | undefined,
): boolean {
  if (!productId) {
    return true;
  }
  return mappingProductLinks(mapping).some(
    (link) => link.productId === productId,
  );
}

function mappingLinksForProduct(input: {
  mapping: FakturowniaCostMapping;
  productId?: string;
}): FakturowniaCostProductLink[] {
  const links = mappingProductLinks(input.mapping);
  if (!input.productId) {
    return links;
  }
  return links.filter((link) => link.productId === input.productId);
}

function mappingMatchesAttributeOption(input: {
  attributeId?: string;
  mapping: FakturowniaCostMapping;
  optionValue?: string;
  productId?: string;
}): boolean {
  if (!input.attributeId && !input.optionValue) {
    return true;
  }

  const links = mappingLinksForProduct({
    mapping: input.mapping,
    ...(input.productId ? { productId: input.productId } : {}),
  });
  if (links.length > 0) {
    return links.some(
      (link) =>
        (!input.attributeId || link.attributeId === input.attributeId) &&
        (!input.optionValue || link.optionValue === input.optionValue),
    );
  }

  return (
    (!input.attributeId || input.mapping.attributeId === input.attributeId) &&
    (!input.optionValue || input.mapping.optionValue === input.optionValue)
  );
}

function collectAffectedProductIds(
  ...mappingsOrLinks: Array<
    FakturowniaCostMapping | FakturowniaCostProductLink[] | undefined
  >
): string[] {
  const ids = new Set<string>();
  for (const item of mappingsOrLinks) {
    const links = Array.isArray(item) ? item : mappingProductLinks(item);
    links.forEach((link) => ids.add(link.productId));
  }
  return Array.from(ids);
}

function compareProductsByName(left: Product, right: Product): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

async function listActiveAttributes(
  db: AdminFirestore,
  tenantId?: string,
): Promise<Attribute[]> {
  let query = db.collection("attributes").where("active", "==", true);
  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snapshot = await query.limit(300).get();
  return snapshot.docs
    .map(
      (doc) =>
        ({
          ...doc.data(),
          id: doc.id,
        }) as Attribute,
    )
    .filter((attribute) => tenantMatches(attribute, tenantId));
}

async function listActiveCostProducts(
  db: AdminFirestore,
  tenantId?: string,
): Promise<Product[]> {
  let query = db
    .collectionGroup("products")
    .where("active", "==", true) as FirebaseFirestore.Query;
  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snapshot = await query.limit(COST_PRODUCT_CATALOG_LIMIT).get();
  const products = dedupeProducts(
    snapshot.docs
      .map((doc) => productFromSnapshot(doc))
      .filter((product) => tenantMatches(product, tenantId)),
  );
  products.sort(compareProductsByName);

  return products;
}

async function loadCostMatchingCatalog(
  db: AdminFirestore,
  tenantId?: string,
): Promise<CostMatchingCatalog> {
  const [attributes, products, suppliers] = await Promise.all([
    listActiveAttributes(db, tenantId),
    listActiveCostProducts(db, tenantId),
    loadSupplierCatalog(db, tenantId),
  ]);
  const attributesById = new Map(
    attributes.map((attribute) => [attribute.id, attribute]),
  );

  return {
    attributesById,
    products,
    suppliers,
  };
}

async function loadChannelNames(
  db: AdminFirestore,
  products: readonly Product[],
  tenantId?: string,
): Promise<ReadonlyMap<string, string>> {
  const channelIds = uniqueStrings(
    products.flatMap((product) =>
      product.channelId ? [product.channelId] : [],
    ),
  );

  if (channelIds.length === 0) {
    return new Map();
  }

  const snapshots = await Promise.all(
    channelIds.map((channelId) =>
      db.collection("channels").doc(channelId).get(),
    ),
  );
  const channelNames = new Map<string, string>();

  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }
    const channel = snapshot.data() as Channel | undefined;
    if (tenantId && channel?.tenantId !== tenantId) {
      continue;
    }
    const channelName = channel?.name?.trim();
    if (channelName) {
      channelNames.set(snapshot.id, channelName);
    }
  }

  return channelNames;
}

function attributeOptionsForProduct(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  product: Product;
}): FakturowniaCostMappingSelectorAttribute[] {
  const attributeIds = uniqueStrings([
    ...(input.product.attributes ?? []),
    ...Object.keys(input.product.attributeOptions ?? {}),
  ]);

  return attributeIds.map((attributeId) => {
    const attribute = input.attributesById.get(attributeId);
    const allowedValues =
      input.product.attributeOptions?.[attributeId] ??
      attribute?.options.map((option) => option.value) ??
      [];
    const optionLabels = new Map(
      attribute?.options.map((option) => [option.value, option.label]) ?? [],
    );

    return {
      id: attributeId,
      name: attribute?.name ?? attributeId,
      options: uniqueStrings(allowedValues).map((value) => ({
        label: optionLabels.get(value) ?? value,
        value,
      })),
    };
  });
}

/**
 * Builds a product-agnostic catalog of candidate materials — the deduped union
 * of attribute options used across the candidate products — so the AI can
 * classify an invoice position as a shared material (attributeId, optionValue)
 * without tying it to one product. Bounded to keep the prompt size predictable.
 */
function summarizeCandidateMaterials(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  products: readonly Product[];
}): FakturowniaCostMappingSelectorAttribute[] {
  const byAttribute = new Map<
    string,
    { id: string; name: string; options: Map<string, string> }
  >();

  for (const product of input.products) {
    for (const attribute of attributeOptionsForProduct({
      attributesById: input.attributesById,
      product,
    })) {
      const existing = byAttribute.get(attribute.id) ?? {
        id: attribute.id,
        name: attribute.name,
        options: new Map<string, string>(),
      };
      for (const option of attribute.options) {
        if (!existing.options.has(option.value)) {
          existing.options.set(option.value, option.label);
        }
      }
      byAttribute.set(attribute.id, existing);
    }
  }

  return Array.from(byAttribute.values())
    .slice(0, AI_COST_MATCH_MATERIAL_ATTRIBUTE_LIMIT)
    .map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      options: Array.from(attribute.options.entries())
        .slice(0, AI_COST_MATCH_MATERIAL_OPTION_LIMIT)
        .map(([value, label]) => ({ label, value })),
    }));
}

export async function listFakturowniaCostMappingSelectorProducts(input: {
  tenantId?: string;
}): Promise<FakturowniaCostMappingSelectorProduct[]> {
  const db = firestore();
  const catalog = await loadCostMatchingCatalog(db, input.tenantId);
  const channelNames = await loadChannelNames(
    db,
    catalog.products,
    input.tenantId,
  );

  return catalog.products.map((product) => ({
    attributes: attributeOptionsForProduct({
      attributesById: catalog.attributesById,
      product,
    }),
    ...(product.category?.name ? { categoryName: product.category.name } : {}),
    ...(product.channelId ? { channelId: product.channelId } : {}),
    ...(product.channelId && channelNames.get(product.channelId)
      ? { channelName: channelNames.get(product.channelId) }
      : {}),
    id: product.id,
    name: product.name,
  }));
}

async function loadSupplierCatalog(
  db: AdminFirestore,
  tenantId?: string,
): Promise<Supplier[]> {
  // Load the supplier catalog ONCE per sync (mirrors listActiveCostProducts).
  // The previous per-position NIP query + 100-doc name scan are replaced by
  // in-memory matching against this list, preserving identical semantics.
  let query = db.collection("suppliers") as FirebaseFirestore.Query;
  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  const snapshot = await query.limit(SUPPLIER_CATALOG_LIMIT).get();

  return snapshot.docs
    .map((doc) => {
      const supplier = doc.data() as Supplier;
      return { ...supplier, id: supplier.id ?? doc.id };
    })
    .filter((supplier) => tenantMatches(supplier, tenantId));
}

function listSupplierCandidates(
  suppliers: readonly Supplier[],
  evidence: FakturowniaCostEvidence,
  tenantId?: string,
): Supplier[] {
  const matched = new Map<string, Supplier>();
  const sellerNip = normalizeNip(evidence.supplier.nip);
  const supplierText = evidence.supplier.name
    ? normalizeFakturowniaCostText(evidence.supplier.name)
    : undefined;

  for (const supplier of suppliers) {
    if (!tenantMatches(supplier, tenantId)) {
      continue;
    }

    // Mirror the prior Firestore equality query (`where("nip", "==", sellerNip)`):
    // the stored value must equal the normalized (digits-only) seller NIP.
    if (sellerNip && supplier.nip === sellerNip) {
      matched.set(supplier.id, supplier);
      continue;
    }

    if (supplierText) {
      const nameText = normalizeFakturowniaCostText(
        `${supplier.name} ${supplier.companyName ?? ""}`,
      );
      if (nameText === supplierText) {
        matched.set(supplier.id, supplier);
      }
    }
  }

  return Array.from(matched.values());
}

async function listProductCandidates(
  db: AdminFirestore,
  catalog: CostMatchingCatalog,
  evidence: FakturowniaCostEvidence,
  suppliers: Supplier[],
  tenantId?: string,
): Promise<Product[]> {
  const productIds = new Set(
    suppliers.flatMap((supplier) => supplier.linkedProductsIds ?? []),
  );
  const products = new Map<string, Product>();

  if (productIds.size > 0) {
    const ids = Array.from(productIds).slice(0, 30);
    const snapshots = await Promise.all(
      ids.map((productId) =>
        db
          .collectionGroup("products")
          .where("id", "==", productId)
          .limit(5)
          .get(),
      ),
    );
    snapshots
      .flatMap((snapshot) => snapshot.docs)
      .forEach((doc) => {
        const product = doc.data() as Product;
        if (tenantMatches(product, tenantId)) {
          products.set(product.id ?? doc.id, product);
        }
      });
  }

  if (evidence.position.fakturowniaProductId) {
    let providerQuery = db
      .collectionGroup("products")
      .where(
        "provider.productId",
        "==",
        evidence.position.fakturowniaProductId,
      ) as FirebaseFirestore.Query;
    if (tenantId) {
      providerQuery = providerQuery.where("tenantId", "==", tenantId);
    }
    const snapshot = await providerQuery.limit(20).get();
    snapshot.docs.forEach((doc) => {
      const product = doc.data() as Product;
      if (tenantMatches(product, tenantId)) {
        products.set(product.id ?? doc.id, product);
      }
    });
  }

  const rankedCatalogProducts = rankCostProductCandidates({
    attributesById: catalog.attributesById,
    evidence,
    limit: AI_COST_MATCH_CANDIDATE_LIMIT,
    products: catalog.products,
  });

  rankedCatalogProducts.forEach(({ product }) => {
    if (tenantMatches(product, tenantId)) {
      products.set(product.id, product);
    }
  });

  return Array.from(products.values()).slice(0, AI_COST_MATCH_CANDIDATE_LIMIT);
}

function selectLinkedAttributeOption(input: {
  product: Product;
  supplier?: Supplier;
  attributesById?: ReadonlyMap<string, Attribute>;
}): {
  attributeId?: string;
  attributeName?: string;
  optionLabel?: string;
  optionValue?: string;
  signal?: string;
} {
  for (const link of input.supplier?.linkedAttributeOptions ?? []) {
    if (
      input.product.attributeOptions?.[link.attributeId]?.includes(
        link.optionValue,
      )
    ) {
      const attribute = input.attributesById?.get(link.attributeId);
      const option = attribute?.options.find(
        (candidate) => candidate.value === link.optionValue,
      );

      return {
        attributeId: link.attributeId,
        ...(attribute?.name ? { attributeName: attribute.name } : {}),
        ...(option?.label ? { optionLabel: option.label } : {}),
        optionValue: link.optionValue,
        signal: "supplier_linked_attribute_option",
      };
    }
  }

  return {};
}

function summarizeCandidateProduct(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  product: Product;
}) {
  return {
    attributes: attributeOptionsForProduct(input).map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      options: attribute.options.slice(0, 30),
    })),
    category: input.product.category?.name,
    description: input.product.description?.slice(0, 400),
    id: input.product.id,
    keywords: (input.product.keywords ?? []).slice(0, 20),
    name: input.product.name,
    providerProductId: input.product.provider?.productId,
  };
}

async function buildAiCostMappingCandidate(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  evidence: FakturowniaCostEvidence;
  products: readonly Product[];
  tenantId?: string;
}): Promise<ResolvedAiCostMatch | null> {
  if (input.products.length === 0) {
    return null;
  }

  const { generateText, Output } = await getAiRuntime({
    tenantId: input.tenantId,
  });
  const schema = z.object({
    attributeId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "PREFERRED: exact attribute id from the 'materials' catalog identifying the material, or null.",
      ),
    confidence: z
      .number()
      .min(0)
      .max(100)
      .describe("Match confidence from 0 to 1. Use <0.9 if uncertain."),
    optionValue: z
      .string()
      .nullable()
      .optional()
      .describe(
        "PREFERRED: exact option value from the chosen material attribute, or null.",
      ),
    productId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Exact product id from the 'candidates' list — set ONLY for a genuine single finished product; leave null when you set a material attributeId+optionValue.",
      ),
    reasoning: z
      .string()
      .describe("Short reason for audit review (one or two sentences)."),
  });

  try {
    const model = await getAdminVertexLanguageModel(
      MODELS.GEMINI_3_FLASH_LITE,
    );
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      instructions: [
        "You match supplier expense invoice positions to a Konfi print-shop catalog.",
        "Supplier expense invoices are almost always raw materials (paper stock, lamination film, ink, boards), NOT finished products.",
        "PREFER a material match: choose the (attributeId, optionValue) from the 'materials' catalog that best identifies the material. A material match applies to every product using that option, so leave productId null.",
        "Set productId (from the 'candidates' list) ONLY when the position is unmistakably a single finished catalog product rather than a raw material.",
        "Never tie a raw material to a single product — prefer the shared material classification.",
        "Use only the exact ids/options provided in the prompt. Return confidence at least 0.90 only for a strong match; otherwise return nulls and confidence below 0.90.",
        "Do not invent products, attributes, options, prices, or ids.",
      ].join("\n"),
      prompt: JSON.stringify({
        candidates: input.products
          .slice(0, AI_COST_MATCH_CANDIDATE_LIMIT)
          .map((product) =>
            summarizeCandidateProduct({
              attributesById: input.attributesById,
              product,
            }),
          ),
        materials: summarizeCandidateMaterials({
          attributesById: input.attributesById,
          products: input.products,
        }),
        invoicePosition: {
          code: input.evidence.position.code,
          description: input.evidence.position.description,
          fakturowniaProductId: input.evidence.position.fakturowniaProductId,
          name: input.evidence.position.name ?? input.evidence.name,
          normalizedText: input.evidence.normalizedText,
          quantityUnit: input.evidence.quantityUnit,
        },
        supplier: input.evidence.supplier,
      }),
      // Retry transient 429s with the SDK's exponential backoff instead of
      // failing the position immediately (the real fix is fewer, batched calls).
      maxRetries: 2,
      timeout: 25_000,
    });

    return resolveHighConfidenceAiCostMatch({
      attributesById: input.attributesById,
      match: output,
      products: input.products,
      threshold: AI_COST_MATCH_CONFIDENCE_THRESHOLD,
    });
  } catch (error) {
    console.error(
      "[buildAiCostMappingCandidate] Failed to resolve cost mapping candidate:",
      error,
    );
    return null;
  }
}

// Strips null/undefined from a raw packaging object returned by the AI, so
// only fields with actual values reach Firestore. Returns undefined when no
// field is present (avoids writing an empty object on the mapping).
function cleanPackaging(
  raw:
    | {
        purchaseUnit?: string | null;
        sheetsPerPack?: number | null;
        sheetWidthMm?: number | null;
        sheetHeightMm?: number | null;
        rollWidthMm?: number | null;
        rollLengthM?: number | null;
        thicknessMicron?: number | null;
        manual?: boolean | null;
      }
    | null
    | undefined,
): FakturowniaCostPackaging | undefined {
  if (!raw) {
    return undefined;
  }
  const result: FakturowniaCostPackaging = {};
  if (raw.purchaseUnit != null) result.purchaseUnit = raw.purchaseUnit;
  if (raw.sheetsPerPack != null && Number.isFinite(raw.sheetsPerPack))
    result.sheetsPerPack = raw.sheetsPerPack;
  if (raw.sheetWidthMm != null && Number.isFinite(raw.sheetWidthMm))
    result.sheetWidthMm = raw.sheetWidthMm;
  if (raw.sheetHeightMm != null && Number.isFinite(raw.sheetHeightMm))
    result.sheetHeightMm = raw.sheetHeightMm;
  if (raw.rollWidthMm != null && Number.isFinite(raw.rollWidthMm))
    result.rollWidthMm = raw.rollWidthMm;
  if (raw.rollLengthM != null && Number.isFinite(raw.rollLengthM))
    result.rollLengthM = raw.rollLengthM;
  if (raw.thicknessMicron != null && Number.isFinite(raw.thicknessMicron))
    result.thicknessMicron = raw.thicknessMicron;
  if (raw.manual != null) result.manual = raw.manual;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Single batched Gemini call: matches ALL positions in the batch against the
 * shared candidate pool in one prompt, and also extracts packaging metadata
 * from each position's invoice text.
 *
 * Returns a Map keyed by the position key (evidence.id) with the resolved
 * match + optional packaging. Positions that do not reach the confidence
 * threshold are omitted from the map (the caller treats them as "no AI match",
 * identical to a null from the single-call path).
 */
async function buildAiCostMappingBatch(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  candidates: Product[];
  positions: Array<{ key: string; evidence: FakturowniaCostEvidence }>;
  tenantId?: string;
}): Promise<
  Map<
    string,
    { match: ResolvedAiCostMatch; packaging?: FakturowniaCostPackaging }
  >
> {
  const result = new Map<
    string,
    { match: ResolvedAiCostMatch; packaging?: FakturowniaCostPackaging }
  >();
  if (input.positions.length === 0 || input.candidates.length === 0) {
    return result;
  }

  const { generateText, Output } = await getAiRuntime({
    tenantId: input.tenantId,
  });

  const packagingSchema = z.object({
    purchaseUnit: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Raw purchase unit string from the invoice (e.g. 'ryza', 'rolka', 'm2').",
      ),
    sheetsPerPack: z
      .number()
      .nullable()
      .optional()
      .describe("Number of sheets per pack/ream (e.g. 250 from 'R250')."),
    sheetWidthMm: z
      .number()
      .nullable()
      .optional()
      .describe("Sheet width in mm (e.g. 320 from '320X450MM')."),
    sheetHeightMm: z
      .number()
      .nullable()
      .optional()
      .describe("Sheet height in mm (e.g. 450 from '320X450MM')."),
    rollWidthMm: z
      .number()
      .nullable()
      .optional()
      .describe("Roll width in mm (e.g. 1050 from 'SZER.1050MM')."),
    rollLengthM: z
      .number()
      .nullable()
      .optional()
      .describe("Roll length in metres (e.g. 50 from 'N.50M')."),
    thicknessMicron: z
      .number()
      .nullable()
      .optional()
      .describe("Material thickness in microns (e.g. 240 from '240MICR')."),
  });

  const matchSchema = z.object({
    positionKey: z
      .string()
      .describe("The exact positionKey from the input positions array."),
    productId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Exact product id from the 'candidates' list — set ONLY for a genuine single finished product; leave null when you set a material attributeId+optionValue.",
      ),
    attributeId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "PREFERRED: exact attribute id from the 'materials' catalog identifying the material, or null.",
      ),
    optionValue: z
      .string()
      .nullable()
      .optional()
      .describe(
        "PREFERRED: exact option value from the chosen material attribute, or null.",
      ),
    confidence: z
      .number()
      .min(0)
      .max(100)
      .describe("Match confidence 0-100. Use < 90 if uncertain."),
    reasoning: z
      .string()
      .max(500)
      .describe("One or two sentence audit reason."),
    packaging: packagingSchema.nullable().optional(),
  });

  const schema = z.object({
    matches: z.array(matchSchema),
  });

  // Cap candidates at 40 to keep prompt size predictable; candidates are
  // pre-filtered to the deduped union of all items' candidate lists so the
  // most relevant ones are always included.
  const candidateSummaries = input.candidates.slice(0, 40).map((product) =>
    summarizeCandidateProduct({
      attributesById: input.attributesById,
      product,
    }),
  );

  const positionSummaries = input.positions.map(({ key, evidence }) => ({
    key,
    name: evidence.position.name ?? evidence.name,
    code: evidence.position.code,
    description: evidence.position.description,
    normalizedText: evidence.normalizedText,
    quantityUnit: evidence.quantityUnit,
    supplier: evidence.supplier,
  }));

  try {
    const model = await getAdminVertexLanguageModel(
      MODELS.GEMINI_3_FLASH_LITE,
    );
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      instructions: [
        "You match supplier expense invoice positions to a Konfi print-shop catalog.",
        "Supplier expense invoices are almost always raw materials (paper stock, lamination film, ink, boards), NOT finished products.",
        "For each position in the 'positions' array, return exactly one entry in 'matches' with the same positionKey.",
        "PREFER a material match: choose the (attributeId, optionValue) from the 'materials' catalog that best identifies the material. A material match applies to every product using that option, so leave productId null.",
        "Set productId (from the 'candidates' list) ONLY when the position is unmistakably a single finished catalog product rather than a raw material; never tie a raw material to a single product.",
        "When uncertain or the material could be several options, set confidence below 90 and leave ids null.",
        "Do not invent products, attributes, options, prices, or ids.",
        "",
        "Also extract packaging facts from each position's name/code/description/normalizedText:",
        "- sheetsPerPack: integer after 'R' (e.g. 'R250' → 250).",
        "- sheetWidthMm / sheetHeightMm: dimensions like '320X450MM' → width=320, height=450.",
        "- rollWidthMm: width from 'SZER.NNNmm' or 'SZEROKOSC NNN MM'.",
        "- rollLengthM: length from 'N.NNm' or 'DLUGOSC NNN M'.",
        "- thicknessMicron: micron value from 'NNNmicr' or 'NNN MICRON'.",
        "- purchaseUnit: raw unit word ('ryza', 'rolka', 'm2', 'mb', etc.).",
        "Set packaging fields only when explicitly present in the text; never guess or compute prices.",
        "Return null for packaging when no packaging facts are present.",
      ].join("\n"),
      prompt: JSON.stringify({
        candidates: candidateSummaries,
        materials: summarizeCandidateMaterials({
          attributesById: input.attributesById,
          products: input.candidates,
        }),
        positions: positionSummaries,
      }),
      maxRetries: 2,
      timeout: 60_000,
    });

    for (const match of output?.matches ?? []) {
      const resolved = resolveHighConfidenceAiCostMatch({
        attributesById: input.attributesById,
        match,
        products: input.candidates,
        threshold: AI_COST_MATCH_CONFIDENCE_THRESHOLD,
      });
      if (resolved) {
        const pkg = cleanPackaging(match.packaging);
        result.set(match.positionKey, {
          match: resolved,
          ...(pkg ? { packaging: pkg } : {}),
        });
      }
    }
  } catch (error) {
    console.error(
      "[buildAiCostMappingBatch] Failed to resolve batch cost mapping candidates:",
      error,
    );
    // Caller is responsible for falling back to per-position calls.
    throw error;
  }

  return result;
}

function asCostDecisionMemory(
  data: FirebaseFirestore.DocumentData | undefined,
): FakturowniaCostDecisionMemory | undefined {
  return data as FakturowniaCostDecisionMemory | undefined;
}

function decisionKeyForEvidence(
  evidence: FakturowniaCostEvidence,
  tenantId?: string,
): string {
  return buildFakturowniaCostDecisionKey({
    normalizedText: evidence.normalizedText,
    ...(normalizeNip(evidence.supplier.nip)
      ? { supplierNip: normalizeNip(evidence.supplier.nip) }
      : {}),
    ...(evidence.supplier.name ? { supplierName: evidence.supplier.name } : {}),
    ...(tenantId ? { tenantId } : {}),
  });
}

async function readCostDecisionMemory(input: {
  db: AdminFirestore;
  decisionKey: string;
  tenantId?: string;
}): Promise<FakturowniaCostDecisionMemory | undefined> {
  try {
    const snapshot = await input.db
      .collection(FAKTUROWNIA_COST_DECISIONS_COLLECTION)
      .doc(input.decisionKey)
      .get();
    const decision = asCostDecisionMemory(snapshot.data());
    if (decision && tenantMatches(decision, input.tenantId)) {
      return decision;
    }
    return undefined;
  } catch (error) {
    console.error(
      "[readCostDecisionMemory] Failed to read learned decision, falling back:",
      error,
    );
    return undefined;
  }
}

function candidateFromApprovedDecision(
  decision: FakturowniaCostDecisionMemory,
): CostMappingCandidate {
  return {
    ...(decision.attributeId ? { attributeId: decision.attributeId } : {}),
    ...(decision.attributeName
      ? { attributeName: decision.attributeName }
      : {}),
    confidence: 0.98,
    ...(decision.optionLabel ? { optionLabel: decision.optionLabel } : {}),
    ...(decision.optionValue ? { optionValue: decision.optionValue } : {}),
    ...(decision.productId ? { productId: decision.productId } : {}),
    ...(decision.productName ? { productName: decision.productName } : {}),
    sourceSignals: ["learned_from_approval"],
  };
}

async function buildMappingCandidate(
  db: AdminFirestore,
  catalog: CostMatchingCatalog,
  evidence: FakturowniaCostEvidence,
  tenantId?: string,
): Promise<CostMappingCandidate> {
  // Learning short-circuit: a prior human decision on this same supplier+line
  // skips the supplier/product lookup and the Gemini call entirely.
  const decision = await readCostDecisionMemory({
    db,
    decisionKey: decisionKeyForEvidence(evidence, tenantId),
    ...(tenantId ? { tenantId } : {}),
  });
  if (decision?.decision === "approved") {
    return candidateFromApprovedDecision(decision);
  }
  if (decision?.decision === "rejected") {
    return {
      confidence: 0,
      decision: "rejected",
      sourceSignals: ["learned_from_rejection"],
    };
  }

  const suppliers = listSupplierCandidates(
    catalog.suppliers,
    evidence,
    tenantId,
  );
  const products = await listProductCandidates(
    db,
    catalog,
    evidence,
    suppliers,
    tenantId,
  );
  const supplier = suppliers[0];
  const product =
    products.find((candidate) =>
      supplier?.linkedProductsIds?.includes(candidate.id),
    ) ??
    products.find(
      (candidate) =>
        evidence.position.fakturowniaProductId &&
        candidate.provider?.productId ===
          evidence.position.fakturowniaProductId,
    );
  const sourceSignals: string[] = [];
  let confidence = 0;

  if (supplier) {
    confidence += 0.25;
    sourceSignals.push(
      normalizeNip(evidence.supplier.nip)
        ? "supplier_tax_number_match"
        : "supplier_name_match",
    );
  }

  if (product) {
    const linkedProduct = supplier?.linkedProductsIds?.includes(product.id);
    const providerMatch =
      evidence.position.fakturowniaProductId &&
      product.provider?.productId === evidence.position.fakturowniaProductId;
    confidence += linkedProduct ? 0.35 : providerMatch ? 0.4 : 0;
    if (linkedProduct || providerMatch) {
      sourceSignals.push(
        linkedProduct
          ? "supplier_linked_product"
          : "fakturownia_provider_product_id",
      );
    }
  }

  const attributeLink = product
    ? selectLinkedAttributeOption({
        attributesById: catalog.attributesById,
        product,
        supplier,
      })
    : {};
  if (attributeLink.signal) {
    confidence += 0.15;
    sourceSignals.push(attributeLink.signal);
  }

  const aiCandidate = await buildAiCostMappingCandidate({
    attributesById: catalog.attributesById,
    evidence,
    products,
    ...(tenantId ? { tenantId } : {}),
  });

  if (aiCandidate) {
    return {
      ...(aiCandidate.attributeId
        ? { attributeId: aiCandidate.attributeId }
        : {}),
      ...(aiCandidate.attributeName
        ? { attributeName: aiCandidate.attributeName }
        : {}),
      confidence: aiCandidate.confidence,
      ...(aiCandidate.optionLabel
        ? { optionLabel: aiCandidate.optionLabel }
        : {}),
      ...(aiCandidate.optionValue
        ? { optionValue: aiCandidate.optionValue }
        : {}),
      ...(aiCandidate.product ? { product: aiCandidate.product } : {}),
      ...(aiCandidate.reasoning ? { reasoning: aiCandidate.reasoning } : {}),
      sourceSignals: uniqueStrings([
        ...sourceSignals,
        ...aiCandidate.sourceSignals,
      ]),
      ...(supplier ? { supplier } : {}),
    };
  }

  return {
    ...attributeLink,
    confidence,
    ...(product ? { product } : {}),
    sourceSignals,
    ...(supplier ? { supplier } : {}),
  };
}

// Result type for the pre-AI phase of mapping resolution.
type PreAiResolutionResult =
  | { resolved: true }
  | {
      needsAi: true;
      candidates: Product[];
      existing?: { confidence: number } | null;
    };

/**
 * Non-AI portion of mapping suggestion: decision-memory short-circuit, existing
 * mapping rules, and candidate gathering. Returns { resolved: true } when the
 * mapping was fully handled (written or skipped), or { needsAi: true, candidates }
 * when the caller must supply an AI match and call writeMappingFromAiMatch.
 *
 * Does NOT call Gemini. Safe to run at normal POSITION_SYNC_CONCURRENCY.
 */
async function resolvePendingMappingPreAi(input: {
  catalog: CostMatchingCatalog;
  db: AdminFirestore;
  evidence: FakturowniaCostEvidence;
  member: CostAuditMember;
  tenantId?: string;
}): Promise<PreAiResolutionResult> {
  const mappingRef = input.db
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .doc(buildFakturowniaCostMappingId(input.evidence.id));
  const existing = await mappingRef.get();

  if (existing.exists) {
    const mapping = asCostMapping(existing.data());
    const sourceSignals = mapping?.sourceSignals ?? [];
    if (
      mapping?.status !== "pending" ||
      mapping.productId ||
      sourceSignals.includes("ai_high_confidence_match")
    ) {
      return { resolved: true };
    }

    // Existing pending mapping without a product: try to improve it.
    // Decision memory / heuristic path only here — AI is handled by the batch.
    const decision = await readCostDecisionMemory({
      db: input.db,
      decisionKey: decisionKeyForEvidence(input.evidence, input.tenantId),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    });
    if (decision?.decision === "approved") {
      // Reference decision: update the existing mapping to approved+reference in place.
      if (decision.reference === true) {
        const supplierNip = normalizeNip(input.evidence.supplier.nip);
        const evidenceSupplierName = input.evidence.supplier.name;
        await mappingRef.set(
          {
            attributeId: FieldValue.delete(),
            attributeName: FieldValue.delete(),
            combinationId: FieldValue.delete(),
            optionLabel: FieldValue.delete(),
            optionValue: FieldValue.delete(),
            productId: FieldValue.delete(),
            productName: FieldValue.delete(),
            reference: true,
            sourceSignals: uniqueStrings([
              ...sourceSignals,
              "saved_as_reference",
              "learned_from_approval",
            ]),
            status: "approved" as const,
            ...(input.evidence.invoice.issueDate
              ? { issueDate: input.evidence.invoice.issueDate }
              : {}),
            ...(input.evidence.normalizedText
              ? { normalizedText: input.evidence.normalizedText }
              : {}),
            ...(evidenceSupplierName
              ? { supplierName: evidenceSupplierName }
              : {}),
            ...(supplierNip ? { supplierNip } : {}),
            ...auditTimestamps(input.member),
          },
          { merge: true },
        );
        return { resolved: true };
      }
      const candidate = candidateFromApprovedDecision(decision);
      const candidateProductId = candidate.productId ?? candidate.product?.id;
      const candidateProductName =
        candidate.productName ?? candidate.product?.name;
      const hasProductCandidate = Boolean(candidateProductId);
      const hasAttributeCandidate = Boolean(
        candidate.attributeId && candidate.optionValue,
      );
      if (
        (hasProductCandidate || hasAttributeCandidate) &&
        candidate.confidence > (mapping.confidence ?? 0)
      ) {
        const supplierNip = normalizeNip(input.evidence.supplier.nip);
        await mappingRef.set(
          {
            ...(candidate.attributeId
              ? { attributeId: candidate.attributeId }
              : {}),
            ...(candidate.attributeName
              ? { attributeName: candidate.attributeName }
              : {}),
            confidence: candidate.confidence,
            ...(input.evidence.invoice.issueDate
              ? { issueDate: input.evidence.invoice.issueDate }
              : {}),
            ...(input.evidence.normalizedText
              ? { normalizedText: input.evidence.normalizedText }
              : {}),
            ...(candidate.optionLabel
              ? { optionLabel: candidate.optionLabel }
              : {}),
            ...(candidate.optionValue
              ? { optionValue: candidate.optionValue }
              : {}),
            ...(candidateProductId ? { productId: candidateProductId } : {}),
            ...(candidateProductName
              ? { productName: candidateProductName }
              : {}),
            ...(candidate.reasoning ? { reasoning: candidate.reasoning } : {}),
            sourceSignals: uniqueStrings([
              ...sourceSignals,
              ...candidate.sourceSignals,
            ]),
            ...(candidate.supplier?.id
              ? { supplierId: candidate.supplier.id }
              : {}),
            ...((candidate.supplier?.name ?? candidate.supplier?.companyName)
              ? {
                  supplierName:
                    candidate.supplier?.name ?? candidate.supplier?.companyName,
                }
              : {}),
            ...(supplierNip ? { supplierNip } : {}),
            ...auditTimestamps(input.member),
          },
          { merge: true },
        );
      }
      return { resolved: true };
    }
    if (decision?.decision === "rejected") {
      return { resolved: true };
    }

    // No learned decision: gather candidates so batch AI can process this position.
    const suppliers = listSupplierCandidates(
      input.catalog.suppliers,
      input.evidence,
      input.tenantId,
    );
    const products = await listProductCandidates(
      input.db,
      input.catalog,
      input.evidence,
      suppliers,
      input.tenantId,
    );
    return {
      needsAi: true,
      candidates: products,
      existing: { confidence: mapping?.confidence ?? 0 },
    };
  }

  // No existing mapping: check decision memory first.
  const decision = await readCostDecisionMemory({
    db: input.db,
    decisionKey: decisionKeyForEvidence(input.evidence, input.tenantId),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  if (decision?.decision === "rejected") {
    return { resolved: true };
  }
  if (decision?.decision === "approved") {
    const candidate = candidateFromApprovedDecision(decision);
    const candidateProductId = candidate.productId ?? candidate.product?.id;
    const candidateProductName =
      candidate.productName ?? candidate.product?.name;
    const hasProductCandidate = Boolean(candidateProductId);
    const hasAttributeCandidate = Boolean(
      candidate.attributeId && candidate.optionValue,
    );
    if (!hasProductCandidate && !hasAttributeCandidate) {
      // No product/attribute candidate. If this is a reference decision, auto-file
      // a new mapping as approved+reference so the line is captured for reference.
      if (decision.reference === true) {
        const suppliers = listSupplierCandidates(
          input.catalog.suppliers,
          input.evidence,
          input.tenantId,
        );
        const candidateSupplier = suppliers[0];
        const referenceMapping = buildFakturowniaCostMappingSuggestion({
          aliases: [
            input.evidence.supplier.name,
            input.evidence.position.name,
            input.evidence.position.code,
          ].filter((value): value is string => Boolean(value)),
          confidence: candidate.confidence,
          createdBy: input.member,
          evidence: input.evidence,
          sourceSignals: uniqueStrings([
            ...candidate.sourceSignals,
            "saved_as_reference",
            "learned_from_approval",
          ]),
          ...(candidateSupplier?.id
            ? { supplierId: candidateSupplier.id }
            : {}),
          ...((candidateSupplier?.name ?? candidateSupplier?.companyName)
            ? {
                supplierName:
                  candidateSupplier?.name ?? candidateSupplier?.companyName,
              }
            : {}),
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        });
        await mappingRef.set({
          ...referenceMapping,
          reference: true,
          status: "approved" as const,
          ...createTimestamps(input.member),
        });
        return { resolved: true };
      }
      // Learned decision carries neither a product nor an attribute+option and is
      // not a reference — skip rather than writing a mapping with no actionable cost signal.
      return { resolved: true };
    }
    const suppliers = listSupplierCandidates(
      input.catalog.suppliers,
      input.evidence,
      input.tenantId,
    );
    const candidateSupplier = suppliers[0];
    const mapping = buildFakturowniaCostMappingSuggestion({
      aliases: [
        input.evidence.supplier.name,
        input.evidence.position.name,
        input.evidence.position.code,
      ].filter((value): value is string => Boolean(value)),
      confidence: candidate.confidence,
      createdBy: input.member,
      evidence: input.evidence,
      ...(candidate.attributeId ? { attributeId: candidate.attributeId } : {}),
      ...(candidate.attributeName
        ? { attributeName: candidate.attributeName }
        : {}),
      ...(candidate.optionLabel ? { optionLabel: candidate.optionLabel } : {}),
      ...(candidate.optionValue ? { optionValue: candidate.optionValue } : {}),
      ...(candidateProductId ? { productId: candidateProductId } : {}),
      ...(candidateProductName ? { productName: candidateProductName } : {}),
      ...(candidate.reasoning ? { reasoning: candidate.reasoning } : {}),
      sourceSignals: candidate.sourceSignals,
      ...(candidateSupplier?.id ? { supplierId: candidateSupplier.id } : {}),
      ...((candidateSupplier?.name ?? candidateSupplier?.companyName)
        ? {
            supplierName:
              candidateSupplier?.name ?? candidateSupplier?.companyName,
          }
        : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    });
    await mappingRef.set({ ...mapping, ...createTimestamps(input.member) });
    return { resolved: true };
  }

  // No learned decision: gather candidates so batch AI can process.
  const suppliers = listSupplierCandidates(
    input.catalog.suppliers,
    input.evidence,
    input.tenantId,
  );
  const products = await listProductCandidates(
    input.db,
    input.catalog,
    input.evidence,
    suppliers,
    input.tenantId,
  );
  return { needsAi: true, candidates: products };
}

/**
 * Write the mapping suggestion for a position that went through the batch AI
 * path. `aiResult` is the resolved match + optional packaging from the batch
 * call, or null when the batch produced no high-confidence match (in which case
 * a heuristic-only mapping is written from the supplied candidate).
 */
async function writeMappingFromBatchAi(input: {
  candidates: Product[];
  catalog: CostMatchingCatalog;
  db: AdminFirestore;
  evidence: FakturowniaCostEvidence;
  existing?: { confidence: number } | null;
  member: CostAuditMember;
  aiResult: {
    match: ResolvedAiCostMatch;
    packaging?: FakturowniaCostPackaging;
  } | null;
  tenantId?: string;
}): Promise<{ created: true } | { updated: true } | { skipped: true }> {
  const mappingRef = input.db
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .doc(buildFakturowniaCostMappingId(input.evidence.id));

  const suppliers = listSupplierCandidates(
    input.catalog.suppliers,
    input.evidence,
    input.tenantId,
  );
  const supplier = suppliers[0];
  const aiCandidate = input.aiResult?.match ?? null;
  const packaging = input.aiResult?.packaging;

  let candidate: CostMappingCandidate;
  if (aiCandidate) {
    const sourceSignals: string[] = [];
    if (supplier) {
      sourceSignals.push(
        normalizeNip(input.evidence.supplier.nip)
          ? "supplier_tax_number_match"
          : "supplier_name_match",
      );
    }
    candidate = {
      ...(aiCandidate.attributeId
        ? { attributeId: aiCandidate.attributeId }
        : {}),
      ...(aiCandidate.attributeName
        ? { attributeName: aiCandidate.attributeName }
        : {}),
      confidence: aiCandidate.confidence,
      ...(aiCandidate.optionLabel
        ? { optionLabel: aiCandidate.optionLabel }
        : {}),
      ...(aiCandidate.optionValue
        ? { optionValue: aiCandidate.optionValue }
        : {}),
      ...(aiCandidate.product ? { product: aiCandidate.product } : {}),
      ...(aiCandidate.reasoning ? { reasoning: aiCandidate.reasoning } : {}),
      sourceSignals: uniqueStrings([
        ...sourceSignals,
        ...aiCandidate.sourceSignals,
      ]),
      ...(supplier ? { supplier } : {}),
    };
  } else {
    // No AI match: build heuristic candidate (same as the old non-AI path).
    const product =
      input.candidates.find((c) =>
        supplier?.linkedProductsIds?.includes(c.id),
      ) ??
      input.candidates.find(
        (c) =>
          input.evidence.position.fakturowniaProductId &&
          c.provider?.productId ===
            input.evidence.position.fakturowniaProductId,
      );
    const sourceSignals: string[] = [];
    let confidence = 0;
    if (supplier) {
      confidence += 0.25;
      sourceSignals.push(
        normalizeNip(input.evidence.supplier.nip)
          ? "supplier_tax_number_match"
          : "supplier_name_match",
      );
    }
    if (product) {
      const linkedProduct = supplier?.linkedProductsIds?.includes(product.id);
      const providerMatch =
        input.evidence.position.fakturowniaProductId &&
        product.provider?.productId ===
          input.evidence.position.fakturowniaProductId;
      confidence += linkedProduct ? 0.35 : providerMatch ? 0.4 : 0;
      if (linkedProduct || providerMatch) {
        sourceSignals.push(
          linkedProduct
            ? "supplier_linked_product"
            : "fakturownia_provider_product_id",
        );
      }
    }
    const attributeLink = product
      ? selectLinkedAttributeOption({
          attributesById: input.catalog.attributesById,
          product,
          supplier,
        })
      : {};
    if (attributeLink.signal) {
      confidence += 0.15;
      sourceSignals.push(attributeLink.signal);
    }
    candidate = {
      ...attributeLink,
      confidence,
      ...(product ? { product } : {}),
      sourceSignals,
      ...(supplier ? { supplier } : {}),
    };
  }

  if (candidate.decision === "rejected") {
    return { skipped: true };
  }

  const isExisting = input.existing != null;

  // For existing mappings: skip when the new candidate is not strictly better.
  if (isExisting && candidate.confidence <= input.existing!.confidence) {
    return { skipped: true };
  }

  const candidateProductId = candidate.productId ?? candidate.product?.id;
  const candidateProductName = candidate.productName ?? candidate.product?.name;
  const mapping = buildFakturowniaCostMappingSuggestion({
    aliases: [
      input.evidence.supplier.name,
      input.evidence.position.name,
      input.evidence.position.code,
    ].filter((value): value is string => Boolean(value)),
    confidence: candidate.confidence,
    createdBy: input.member,
    evidence: input.evidence,
    ...(candidate.attributeId ? { attributeId: candidate.attributeId } : {}),
    ...(candidate.attributeName
      ? { attributeName: candidate.attributeName }
      : {}),
    ...(candidate.optionLabel ? { optionLabel: candidate.optionLabel } : {}),
    ...(candidate.optionValue ? { optionValue: candidate.optionValue } : {}),
    ...(packaging ? { packaging } : {}),
    ...(candidateProductId ? { productId: candidateProductId } : {}),
    ...(candidateProductName ? { productName: candidateProductName } : {}),
    ...(candidate.reasoning ? { reasoning: candidate.reasoning } : {}),
    sourceSignals: candidate.sourceSignals,
    ...(candidate.supplier?.id ? { supplierId: candidate.supplier.id } : {}),
    ...((candidate.supplier?.name ?? candidate.supplier?.companyName)
      ? {
          supplierName:
            candidate.supplier?.name ?? candidate.supplier?.companyName,
        }
      : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });

  if (isExisting) {
    // Preserve the original createdAt — use auditTimestamps (updatedAt only), merge.
    // Preserve the original createdAt/createdBy on an existing mapping; merge
    // only overwrites the fields we send, and auditTimestamps sets updated* only.
    const {
      createdAt: _createdAt,
      createdBy: _createdBy,
      ...mappingWithoutCreated
    } = mapping;
    await mappingRef.set(
      { ...mappingWithoutCreated, ...auditTimestamps(input.member) },
      { merge: true },
    );
    return { updated: true };
  }

  await mappingRef.set({ ...mapping, ...createTimestamps(input.member) });
  return { created: true };
}

/**
 * Token-budgeted, supplier-clustered batch AI queue processor.
 *
 * Groups queued positions by supplier (nip || name || "__none"), accumulates
 * items into batches bounded by MAX_BATCH_INPUT_TOKENS and MAX_BATCH_POSITIONS,
 * calls buildAiCostMappingBatch once per batch, then writes each mapping.
 * Falls back to per-position buildAiCostMappingCandidate if the batch call
 * throws, so reliability is preserved.
 */
async function processBatchedAiQueue(
  queue: Array<{
    key: string;
    evidence: FakturowniaCostEvidence;
    candidates: Product[];
    existing?: { confidence: number } | null;
  }>,
  catalog: CostMatchingCatalog,
  db: AdminFirestore,
  member: CostAuditMember,
  tenantId: string | undefined,
): Promise<number> {
  if (queue.length === 0) return 0;

  // Group by supplier identity: nip takes precedence, then name, then sentinel.
  const supplierKey = (evidence: FakturowniaCostEvidence): string => {
    const nip = normalizeNip(evidence.supplier.nip);
    return nip ?? evidence.supplier.name ?? "__none";
  };

  const groups = new Map<string, typeof queue>();
  for (const item of queue) {
    const key = supplierKey(item.evidence);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  let pendingMappingsCreated = 0;

  for (const group of groups.values()) {
    // Split the supplier group into token-bounded batches.
    const batches: Array<typeof group> = [];
    let currentBatch: typeof group = [];
    let currentTokenEstimate = 0;

    for (const item of group) {
      // Estimate prompt contribution for this item (position summary + its
      // candidates deduplicated into the shared pool for this batch).
      const positionJson = JSON.stringify({
        key: item.key,
        name: item.evidence.position.name ?? item.evidence.name,
        code: item.evidence.position.code,
        description: item.evidence.position.description,
        normalizedText: item.evidence.normalizedText,
        quantityUnit: item.evidence.quantityUnit,
        supplier: item.evidence.supplier,
      });
      const itemTokens = Math.ceil(positionJson.length / 4);

      // Compute the marginal token cost of new candidates this item brings.
      const existingCandidateIds = new Set(
        currentBatch.flatMap((b) => b.candidates.map((c) => c.id)),
      );
      const newCandidates = item.candidates.filter(
        (c) => !existingCandidateIds.has(c.id),
      );
      const newCandidateTokens = Math.ceil(
        JSON.stringify(
          newCandidates.slice(0, 40).map((p) =>
            summarizeCandidateProduct({
              attributesById: catalog.attributesById,
              product: p,
            }),
          ),
        ).length / 4,
      );

      const addedTokens = itemTokens + newCandidateTokens;

      if (
        currentBatch.length > 0 &&
        (currentBatch.length >= MAX_BATCH_POSITIONS ||
          currentTokenEstimate + addedTokens > MAX_BATCH_INPUT_TOKENS)
      ) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokenEstimate = 0;
      }

      currentBatch.push(item);
      currentTokenEstimate += addedTokens;
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    for (const batch of batches) {
      // Deduped candidate pool for this batch.
      const poolById = new Map<string, Product>();
      for (const item of batch) {
        for (const candidate of item.candidates) {
          poolById.set(candidate.id, candidate);
        }
      }
      const candidatePool = Array.from(poolById.values());

      let batchResults: Map<
        string,
        { match: ResolvedAiCostMatch; packaging?: FakturowniaCostPackaging }
      >;
      let usedBatchPath = true;

      try {
        batchResults = await buildAiCostMappingBatch({
          attributesById: catalog.attributesById,
          candidates: candidatePool,
          positions: batch.map(({ key, evidence }) => ({ key, evidence })),
          ...(tenantId ? { tenantId } : {}),
        });
      } catch {
        // Batch call failed: fall back to per-position single calls.
        usedBatchPath = false;
        batchResults = new Map();
        for (const item of batch) {
          try {
            const aiCandidate = await buildAiCostMappingCandidate({
              attributesById: catalog.attributesById,
              evidence: item.evidence,
              products: item.candidates,
              ...(tenantId ? { tenantId } : {}),
            });
            if (aiCandidate) {
              batchResults.set(item.key, { match: aiCandidate });
            }
          } catch (fallbackError) {
            console.error(
              "[processBatchedAiQueue] Fallback per-position call failed for key",
              item.key,
              fallbackError,
            );
          }
        }
      }

      if (usedBatchPath) {
        console.info(
          `[processBatchedAiQueue] Batch call returned ${batchResults.size}/${batch.length} matches.`,
        );
      }

      for (const item of batch) {
        const aiResult = batchResults.get(item.key) ?? null;
        try {
          const writeResult = await writeMappingFromBatchAi({
            aiResult,
            candidates: item.candidates,
            catalog,
            db,
            evidence: item.evidence,
            existing: item.existing,
            member,
            ...(tenantId ? { tenantId } : {}),
          });
          if ("created" in writeResult) {
            pendingMappingsCreated++;
          }
        } catch (writeError) {
          console.error(
            "[processBatchedAiQueue] Failed to write mapping for key",
            item.key,
            writeError,
          );
        }
      }
    }
  }

  return pendingMappingsCreated;
}

async function ensurePendingMappingSuggestion(input: {
  catalog: CostMatchingCatalog;
  db: AdminFirestore;
  evidence: FakturowniaCostEvidence;
  member: CostAuditMember;
  tenantId?: string;
}): Promise<boolean> {
  const mappingRef = input.db
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .doc(buildFakturowniaCostMappingId(input.evidence.id));
  const existing = await mappingRef.get();
  if (existing.exists) {
    const mapping = asCostMapping(existing.data());
    const sourceSignals = mapping?.sourceSignals ?? [];
    if (
      mapping?.status !== "pending" ||
      mapping.productId ||
      sourceSignals.includes("ai_high_confidence_match")
    ) {
      return false;
    }

    const candidate = await buildMappingCandidate(
      input.db,
      input.catalog,
      input.evidence,
      input.tenantId,
    );
    const candidateProductId = candidate.productId ?? candidate.product?.id;
    const candidateProductName =
      candidate.productName ?? candidate.product?.name;
    // Accept a product-less material candidate (attributeId + optionValue) as an
    // upgrade too — it surfaces as a shared cost across every product using the
    // option, mirroring the no-existing-mapping branch below.
    const hasCandidateMaterial = Boolean(
      candidate.attributeId && candidate.optionValue,
    );
    if (
      (!candidateProductId && !hasCandidateMaterial) ||
      candidate.confidence <= mapping.confidence
    ) {
      return false;
    }

    const supplierNip = normalizeNip(input.evidence.supplier.nip);
    await mappingRef.set(
      {
        ...(candidate.attributeId
          ? { attributeId: candidate.attributeId }
          : {}),
        ...(candidate.attributeName
          ? { attributeName: candidate.attributeName }
          : {}),
        confidence: candidate.confidence,
        ...(input.evidence.invoice.issueDate
          ? { issueDate: input.evidence.invoice.issueDate }
          : {}),
        ...(input.evidence.normalizedText
          ? { normalizedText: input.evidence.normalizedText }
          : {}),
        ...(candidate.optionLabel
          ? { optionLabel: candidate.optionLabel }
          : {}),
        ...(candidate.optionValue
          ? { optionValue: candidate.optionValue }
          : {}),
        ...(candidateProductId ? { productId: candidateProductId } : {}),
        ...(candidateProductName ? { productName: candidateProductName } : {}),
        ...(candidate.reasoning ? { reasoning: candidate.reasoning } : {}),
        sourceSignals: uniqueStrings([
          ...sourceSignals,
          ...candidate.sourceSignals,
        ]),
        ...(candidate.supplier?.id
          ? { supplierId: candidate.supplier.id }
          : {}),
        ...((candidate.supplier?.name ?? candidate.supplier?.companyName)
          ? {
              supplierName:
                candidate.supplier?.name ?? candidate.supplier?.companyName,
            }
          : {}),
        ...(supplierNip ? { supplierNip } : {}),
        ...auditTimestamps(input.member),
      },
      { merge: true },
    );
    return false;
  }

  const candidate = await buildMappingCandidate(
    input.db,
    input.catalog,
    input.evidence,
    input.tenantId,
  );
  // A learned rejection suppresses the suggestion so the junk line never enters
  // the review queue; evidence is still written by the caller.
  if (candidate.decision === "rejected") {
    return false;
  }

  const candidateProductId = candidate.productId ?? candidate.product?.id;
  const candidateProductName = candidate.productName ?? candidate.product?.name;
  const mapping = buildFakturowniaCostMappingSuggestion({
    aliases: [
      input.evidence.supplier.name,
      input.evidence.position.name,
      input.evidence.position.code,
    ].filter((value): value is string => Boolean(value)),
    confidence: candidate.confidence,
    createdBy: input.member,
    evidence: input.evidence,
    ...(candidate.attributeId ? { attributeId: candidate.attributeId } : {}),
    ...(candidate.attributeName
      ? { attributeName: candidate.attributeName }
      : {}),
    ...(candidate.optionLabel ? { optionLabel: candidate.optionLabel } : {}),
    ...(candidate.optionValue ? { optionValue: candidate.optionValue } : {}),
    ...(candidateProductId ? { productId: candidateProductId } : {}),
    ...(candidateProductName ? { productName: candidateProductName } : {}),
    ...(candidate.reasoning ? { reasoning: candidate.reasoning } : {}),
    sourceSignals: candidate.sourceSignals,
    ...(candidate.supplier?.id ? { supplierId: candidate.supplier.id } : {}),
    ...((candidate.supplier?.name ?? candidate.supplier?.companyName)
      ? {
          supplierName:
            candidate.supplier?.name ?? candidate.supplier?.companyName,
        }
      : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });

  await mappingRef.set({
    ...mapping,
    ...createTimestamps(input.member),
  });

  return true;
}

function syncStateDocId(tenantId?: string): string {
  return tenantId ?? "default";
}

function asCostSyncStateDoc(
  data: FirebaseFirestore.DocumentData | undefined,
): FakturowniaCostSyncStateDoc | undefined {
  return data as FakturowniaCostSyncStateDoc | undefined;
}

async function readCostSyncStateDoc(input: {
  db: AdminFirestore;
  tenantId?: string;
}): Promise<FakturowniaCostSyncStateDoc | undefined> {
  const snapshot = await input.db
    .collection(FAKTUROWNIA_COST_SYNC_STATE_COLLECTION)
    .doc(syncStateDocId(input.tenantId))
    .get();
  const state = asCostSyncStateDoc(snapshot.data());

  return state && tenantMatches(state, input.tenantId) ? state : undefined;
}

export async function getFakturowniaCostSyncState(input: {
  tenantId?: string;
}): Promise<{
  lastSyncedAt?: string;
  result?: SyncFakturowniaCostInvoicesResult;
} | null> {
  const state = await readCostSyncStateDoc({
    db: firestore(),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  if (!state) {
    return null;
  }

  const lastSyncedAt =
    state.lastSyncedAt instanceof Timestamp
      ? state.lastSyncedAt.toDate().toISOString()
      : undefined;

  return {
    ...(lastSyncedAt ? { lastSyncedAt } : {}),
    ...(state.result ? { result: state.result } : {}),
  };
}

export async function getFakturowniaCostSyncProgress(input: {
  tenantId?: string;
}): Promise<FakturowniaCostSyncProgress | null> {
  const snapshot = await firestore()
    .collection(FAKTUROWNIA_COST_SYNC_PROGRESS_COLLECTION)
    .doc(syncStateDocId(input.tenantId))
    .get();
  const doc = snapshot.data() as FakturowniaCostSyncProgressDoc | undefined;
  if (!doc || !tenantMatches(doc, input.tenantId)) {
    return null;
  }

  const startedAt =
    doc.startedAt instanceof Timestamp ? doc.startedAt.toDate() : undefined;
  const updatedAt =
    doc.updatedAt instanceof Timestamp ? doc.updatedAt.toDate() : undefined;
  // Elapsed time is measured against the last write so a crashed/stale run
  // doesn't keep ticking forever in the UI.
  const elapsedMs =
    startedAt && updatedAt
      ? Math.max(0, updatedAt.getTime() - startedAt.getTime())
      : undefined;

  return {
    ...(doc.currentInvoiceNumber
      ? { currentInvoiceNumber: doc.currentInvoiceNumber }
      : {}),
    ...(doc.effectiveDateFrom
      ? { effectiveDateFrom: doc.effectiveDateFrom }
      : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(doc.error ? { error: doc.error } : {}),
    evidenceCreatedOrUpdated: doc.evidenceCreatedOrUpdated ?? 0,
    incremental: Boolean(doc.incremental),
    invoicesScanned: doc.invoicesScanned ?? 0,
    page: doc.page ?? 0,
    pendingMappingsCreated: doc.pendingMappingsCreated ?? 0,
    phase: doc.phase ?? "scanning",
    positionsScanned: doc.positionsScanned ?? 0,
    ...(startedAt ? { startedAt: startedAt.toISOString() } : {}),
    status: doc.status ?? "running",
    ...(doc.truncated ? { truncated: doc.truncated } : {}),
    ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}),
  };
}

export async function syncFakturowniaCostInvoices(
  input: SyncFakturowniaCostInvoicesInput,
): Promise<SyncFakturowniaCostInvoicesResult> {
  const db = firestore();
  const client = await getFakturowniaClient();
  const catalog = await loadCostMatchingCatalog(db, input.tenantId);
  // BulkWriter batches/parallelizes evidence upserts and stale deactivations
  // instead of awaiting each write serially; flushed once at the end.
  const writer = db.bulkWriter();
  writer.onWriteError((error) => {
    console.error(
      "[syncFakturowniaCostInvoices] BulkWriter write failed:",
      error,
    );
    return false;
  });

  // Incremental: when the caller gives no explicit dateFrom, default it to the
  // last successful sync minus an overlap window so late-edited invoices near
  // the previous boundary are re-caught. No prior state => full scan (no date).
  let effectiveDateFrom = input.dateFrom;
  let incremental = false;
  if (!input.dateFrom) {
    const state = await readCostSyncStateDoc({
      db,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    });
    const lastSyncedAtIso =
      state?.lastSyncedAt instanceof Timestamp
        ? state.lastSyncedAt.toDate().toISOString()
        : undefined;
    const derived = deriveIncrementalDateFrom(lastSyncedAtIso);
    if (derived) {
      effectiveDateFrom = derived;
      incremental = true;
    }
  }

  let evidenceCreatedOrUpdated = 0;
  let invoicesScanned = 0;
  let pendingMappingsCreated = 0;
  let positionsScanned = 0;
  let truncated = false;
  let currentPage = 0;
  let currentInvoiceNumber: string | undefined;

  // Live progress: a single doc per tenant the UI polls while the sync runs.
  const progressRef = db
    .collection(FAKTUROWNIA_COST_SYNC_PROGRESS_COLLECTION)
    .doc(syncStateDocId(input.tenantId));
  const progressStartedAt = Timestamp.now();
  let lastProgressWriteMs = 0;

  const writeProgress = async (
    phase: FakturowniaCostSyncPhase,
    status: "running" | "completed" | "failed",
    error?: string,
  ): Promise<void> => {
    try {
      await progressRef.set(
        {
          ...(currentInvoiceNumber ? { currentInvoiceNumber } : {}),
          ...(effectiveDateFrom ? { effectiveDateFrom } : {}),
          ...(error ? { error } : {}),
          evidenceCreatedOrUpdated,
          incremental,
          invoicesScanned,
          page: currentPage,
          pendingMappingsCreated,
          phase,
          positionsScanned,
          startedAt: progressStartedAt,
          status,
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          truncated,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (progressError) {
      // Progress is best-effort telemetry — never let it break the sync.
      console.error(
        "[syncFakturowniaCostInvoices] Failed to write progress:",
        progressError,
      );
    }
  };

  // Throttled mid-scan write so a fast (cache-hit / learned-decision) sync
  // doesn't hammer Firestore with one write per invoice.
  const maybeWriteProgress = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastProgressWriteMs < PROGRESS_THROTTLE_MS) {
      return;
    }
    lastProgressWriteMs = now;
    await writeProgress("scanning", "running");
  };

  try {
    // Establish the running doc up-front (resets counters from any prior run).
    await writeProgress("scanning", "running");

    const staleRollupProductIds = new Set<string>();

    for (let page = 1; page <= MAX_SYNC_PAGES; page++) {
      currentPage = page;
      const invoices = await client.invoicesJson.get({
        queryParameters: {
          includePositions: true,
          income: GetIncomeQueryParameterTypeObject.Zero,
          page,
          perPage: SYNC_PAGE_SIZE,
          ...(effectiveDateFrom
            ? { dateFrom: toDateOnly(effectiveDateFrom) }
            : {}),
          ...(input.dateTo ? { dateTo: toDateOnly(input.dateTo) } : {}),
          ...(effectiveDateFrom || input.dateTo
            ? { period: GetPeriodQueryParameterTypeObject.More }
            : {}),
        },
      });

      if (!invoices?.length) {
        break;
      }

      invoicesScanned += invoices.length;

      // Page-level queue for positions that need the batch AI call.
      // Populated inside the inner per-invoice loop; drained after all invoices
      // on this page have been scanned so candidates can be supplier-clustered
      // and deduplicated across invoices.
      const pageAiQueue: Array<{
        key: string;
        evidence: FakturowniaCostEvidence;
        candidates: Product[];
        existing?: { confidence: number } | null;
      }> = [];

      for (const invoice of invoices) {
        const invoiceId = optionalStringId(invoice.id);
        currentInvoiceNumber = invoice.number ?? invoiceId;
        const activeEvidenceIds = new Set<string>();

        // Dedupe pass: normalize all positions and collect those with a valid
        // evidence id, skipping duplicate ids within the same invoice to preserve
        // the existing Set semantics before dispatching concurrent work.
        type ValidPosition = {
          evidence: FakturowniaCostEvidence;
          positionIndex: number;
        };
        const validPositions: ValidPosition[] = [];
        for (const [positionIndex, position] of (
          invoice.positions ?? []
        ).entries()) {
          positionsScanned++;
          const evidence = normalizeFakturowniaCostEvidence({
            createdBy: input.createdBy,
            invoice,
            position,
            positionIndex,
            tenantId: input.tenantId,
          });

          if (!evidence) {
            continue;
          }

          if (activeEvidenceIds.has(evidence.id)) {
            // Duplicate position within this invoice — skip as before.
            continue;
          }

          activeEvidenceIds.add(evidence.id);
          validPositions.push({ evidence, positionIndex });
        }

        // First pass: write evidence + run the non-AI portion of mapping resolution.
        // Positions that need AI are pushed onto the page-level queue instead of
        // making a Gemini call inline; the batch call happens after this loop.
        const positionResults = await mapWithConcurrency(
          validPositions,
          POSITION_SYNC_CONCURRENCY,
          async ({ evidence }) => {
            const evidenceRef = db
              .collection(FAKTUROWNIA_COST_EVIDENCE_COLLECTION)
              .doc(evidence.id);
            const evidenceSnapshot = await evidenceRef.get();
            // Enqueue on the BulkWriter (not awaited per-doc); the create-vs-update
            // timestamp decision still needs the prior snapshot read above.
            void writer.set(
              evidenceRef,
              {
                ...costEvidenceWriteData(evidence),
                ...(evidenceSnapshot.exists
                  ? auditTimestamps(input.createdBy)
                  : createTimestamps(input.createdBy)),
              },
              { merge: true },
            );

            const preAiResult = await resolvePendingMappingPreAi({
              catalog,
              db,
              evidence,
              member: input.createdBy,
              tenantId: input.tenantId,
            });

            if ("needsAi" in preAiResult) {
              // Push to the page-level AI queue; do NOT call AI here.
              pageAiQueue.push({
                key: evidence.id,
                evidence,
                candidates: preAiResult.candidates,
                existing: preAiResult.existing,
              });
            }

            return { created: true };
          },
        );

        // Aggregate evidence counters (mapping counters are updated after the AI batch below).
        for (const _ of positionResults) {
          evidenceCreatedOrUpdated++;
        }

        // Tombstone evidence for positions that disappeared from this invoice.
        // Conservative: only invoices actually fetched in this date-windowed sync
        // are touched, so unseen invoices are never deactivated.
        if (invoiceId) {
          const affectedProductIds = await deactivateStaleEvidence({
            activeEvidenceIds,
            db,
            invoiceId,
            member: input.createdBy,
            ...(input.tenantId ? { tenantId: input.tenantId } : {}),
            writer,
          });
          affectedProductIds.forEach((productId) =>
            staleRollupProductIds.add(productId),
          );
        }

        await maybeWriteProgress();
      }

      // Second pass: drain the page-level AI queue with supplier-clustered,
      // token-bounded batch calls. Returns the count of new mapping suggestions
      // created so the progress counter stays accurate.
      if (pageAiQueue.length > 0) {
        const batchCreated = await processBatchedAiQueue(
          pageAiQueue,
          catalog,
          db,
          input.createdBy,
          input.tenantId,
        );
        pendingMappingsCreated += batchCreated;
      }

      if (invoices.length < SYNC_PAGE_SIZE) {
        break;
      }

      // Reached the hard page cap with a full final page: more invoices remain
      // unsynced. Flag it and warn so the backlog is not silently dropped.
      if (page === MAX_SYNC_PAGES) {
        truncated = true;
        console.warn(
          "[syncFakturowniaCostInvoices] Hit MAX_SYNC_PAGES; more invoices remain unsynced.",
          {
            effectiveDateFrom,
            invoicesScanned,
            maxSyncPages: MAX_SYNC_PAGES,
            tenantId: input.tenantId,
          },
        );
      }
    }

    // Flush all queued evidence upserts and stale deactivations.
    await writeProgress("finalizing", "running");
    await writer.close();

    if (staleRollupProductIds.size > 0) {
      await Promise.all(
        Array.from(staleRollupProductIds).map((productId) =>
          refreshProductCostRollup({
            db,
            member: input.createdBy,
            productId,
            ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          }),
        ),
      );
    }

    const result: SyncFakturowniaCostInvoicesResult = {
      ...(effectiveDateFrom ? { effectiveDateFrom } : {}),
      evidenceCreatedOrUpdated,
      incremental,
      invoicesScanned,
      pendingMappingsCreated,
      positionsScanned,
      truncated,
    };

    // Persist sync state for the next incremental run (only on success — this
    // function throws on hard errors before reaching here).
    await db
      .collection(FAKTUROWNIA_COST_SYNC_STATE_COLLECTION)
      .doc(syncStateDocId(input.tenantId))
      .set(
        buildFakturowniaCostSyncStateWriteData({
          ...(input.dateTo ? { dateTo: input.dateTo } : {}),
          member: input.createdBy,
          result,
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          truncated,
        }),
        { merge: true },
      );

    await writeProgress("completed", "completed");

    return result;
  } catch (error) {
    await writeProgress(
      "failed",
      "failed",
      error instanceof Error ? error.message : "Sync failed.",
    );
    throw error;
  }
}

async function getEvidenceByIds(
  db: AdminFirestore,
  evidenceIds: string[],
): Promise<Map<string, FakturowniaCostEvidence>> {
  const result = new Map<string, FakturowniaCostEvidence>();
  const refs = Array.from(new Set(evidenceIds)).map((id) =>
    db.collection(FAKTUROWNIA_COST_EVIDENCE_COLLECTION).doc(id),
  );
  for (const chunkRefs of chunk(refs, 300)) {
    const snapshots = await db.getAll(...chunkRefs);
    for (const snapshot of snapshots) {
      const evidence = asCostEvidence(snapshot.data());
      if (evidence) {
        result.set(snapshot.id, evidence);
      }
    }
  }
  return result;
}

function costEntryFromMapping(input: {
  evidence: FakturowniaCostEvidence;
  link?: FakturowniaCostProductLink;
  mapping: FakturowniaCostMapping;
}): ApprovedFakturowniaCostEntry {
  const attributeId = input.link?.attributeId ?? input.mapping.attributeId;
  const attributeName =
    input.link?.attributeName ?? input.mapping.attributeName;
  const combinationId =
    input.link?.combinationId ?? input.mapping.combinationId;
  const optionLabel = input.link?.optionLabel ?? input.mapping.optionLabel;
  const optionValue = input.link?.optionValue ?? input.mapping.optionValue;
  const productLinks = mappingProductLinks(input.mapping);
  const productId = input.link?.productId ?? input.mapping.productId;
  const productName = input.link?.productName ?? input.mapping.productName;

  return {
    ...(attributeId ? { attributeId } : {}),
    ...(attributeName ? { attributeName } : {}),
    ...(combinationId ? { combinationId } : {}),
    confidence: input.mapping.confidence,
    ...(input.evidence.conversion
      ? { conversion: input.evidence.conversion }
      : {}),
    currency: input.evidence.currency,
    evidenceId: input.evidence.id,
    invoice: input.evidence.invoice,
    ...(input.evidence.invoiceKind
      ? { invoiceKind: input.evidence.invoiceKind }
      : {}),
    ...(optionLabel ? { optionLabel } : {}),
    ...(optionValue ? { optionValue } : {}),
    ...(input.mapping.packaging ? { packaging: input.mapping.packaging } : {}),
    position: input.evidence.position,
    ...(productLinks.length > 0 ? { productLinks } : {}),
    ...(productLinks.length > 0
      ? { productIds: productLinks.map((link) => link.productId) }
      : {}),
    ...(productId ? { productId } : {}),
    ...(productName ? { productName } : {}),
    quantity: input.evidence.quantity,
    ...(input.evidence.quantityUnit
      ? { quantityUnit: input.evidence.quantityUnit }
      : {}),
    ...(input.mapping.reasoning ? { reasoning: input.mapping.reasoning } : {}),
    sourceSignals: input.mapping.sourceSignals,
    supplier: {
      ...input.evidence.supplier,
      ...(input.mapping.supplierId
        ? { supplierId: input.mapping.supplierId }
        : {}),
      ...(input.mapping.supplierName
        ? { name: input.mapping.supplierName }
        : {}),
    },
    ...(input.evidence.totalPriceGross !== undefined
      ? { totalPriceGross: input.evidence.totalPriceGross }
      : {}),
    ...(input.evidence.totalPriceNet !== undefined
      ? { totalPriceNet: input.evidence.totalPriceNet }
      : {}),
    ...(input.evidence.unitCostGross !== undefined
      ? { unitCostGross: input.evidence.unitCostGross }
      : {}),
    ...(input.evidence.unitCostNet !== undefined
      ? { unitCostNet: input.evidence.unitCostNet }
      : {}),
  };
}

function quantityUnitForManualCost(unit: FakturowniaCostUnit): string {
  if (unit === "area_m2") {
    return "m2";
  }
  if (unit === "sheet") {
    return "ark";
  }
  if (unit === "metre") {
    return "mb";
  }
  return "szt";
}

function packagingForManualCost(input: {
  packaging?: FakturowniaCostPackaging;
  unit: FakturowniaCostUnit;
}): FakturowniaCostPackaging {
  const purchaseUnit = quantityUnitForManualCost(input.unit);
  return {
    ...cleanPackaging(input.packaging),
    purchaseUnit,
    manual: true,
  };
}

export async function createManualFakturowniaCost(
  input: CreateManualFakturowniaCostInput,
): Promise<{ evidenceId: string; mappingId: string }> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Cost name is required.");
  }
  if (!Number.isFinite(input.unitCostNet) || input.unitCostNet <= 0) {
    throw new Error("Net unit cost must be greater than zero.");
  }
  const productLinks = inputProductLinks(input);
  const primaryLink = primaryProductLink(productLinks);
  if (productLinks.length === 0 && !(input.attributeId && input.optionValue)) {
    throw new Error("Manual costs need a product, or an attribute and option.");
  }

  const db = firestore();
  const idPrefix = input.tenantId ? `${input.tenantId}__manual` : "manual";
  const evidenceId = `${idPrefix}-${randomUUID()}`;
  const mappingId = buildFakturowniaCostMappingId(evidenceId);
  const issueDate = input.issueDate ?? dateOnlyToday();
  const roundedUnitCostNet = roundCost(input.unitCostNet);
  const quantityUnit = quantityUnitForManualCost(input.unit);
  const packaging = packagingForManualCost({
    packaging: input.packaging,
    unit: input.unit,
  });
  const normalizedText = normalizeFakturowniaCostText(
    [
      name,
      input.supplierName,
      input.productName,
      ...productLinks.flatMap((link) => [
        link.productName,
        link.attributeName,
        link.optionLabel,
        link.optionValue,
      ]),
      input.attributeName,
      input.optionLabel,
      input.optionValue,
      "manual cost",
    ]
      .filter(Boolean)
      .join(" "),
  );

  const evidence: FirebaseFirestore.DocumentData = {
    currency: FAKTUROWNIA_COST_BASE_CURRENCY,
    id: evidenceId,
    invoice: {
      id: evidenceId,
      issueDate,
      number: "Manual cost",
    },
    invoiceKind: "regular",
    name,
    normalizedText,
    position: {
      index: 0,
      name,
    },
    quantity: 1,
    quantityUnit,
    priceNet: roundedUnitCostNet,
    source: "manual",
    supplier: input.supplierName ? { name: input.supplierName } : {},
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    totalPriceNet: roundedUnitCostNet,
    unitCostNet: roundedUnitCostNet,
    ...createTimestamps(input.member),
  };

  const mapping: FirebaseFirestore.DocumentData = {
    aliases: [name],
    ...(input.attributeId ? { attributeId: input.attributeId } : {}),
    ...(input.attributeName ? { attributeName: input.attributeName } : {}),
    confidence: 1,
    evidenceId,
    id: mappingId,
    issueDate,
    name: `${name} manual cost`,
    normalizedText,
    ...(input.optionLabel ? { optionLabel: input.optionLabel } : {}),
    ...(input.optionValue ? { optionValue: input.optionValue } : {}),
    packaging,
    ...(productLinks.length > 0 ? productLinkWriteData(productLinks) : {}),
    ...(primaryLink?.attributeId
      ? { attributeId: primaryLink.attributeId }
      : {}),
    ...(primaryLink?.attributeName
      ? { attributeName: primaryLink.attributeName }
      : {}),
    ...(primaryLink?.combinationId
      ? { combinationId: primaryLink.combinationId }
      : {}),
    ...(primaryLink?.optionLabel
      ? { optionLabel: primaryLink.optionLabel }
      : {}),
    ...(primaryLink?.optionValue
      ? { optionValue: primaryLink.optionValue }
      : {}),
    reasoning: "Manually entered cost.",
    sourceSignals: ["manual_cost_entry"],
    status: "approved",
    ...(input.supplierName ? { supplierName: input.supplierName } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    approvedAt: Timestamp.now(),
    approvedBy: input.member,
    ...createTimestamps(input.member),
  };

  await Promise.all([
    db
      .collection(FAKTUROWNIA_COST_EVIDENCE_COLLECTION)
      .doc(evidenceId)
      .set(evidence, { merge: true }),
    db
      .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
      .doc(mappingId)
      .set(mapping, { merge: true }),
  ]);

  await Promise.all(
    productLinks.map((link) =>
      refreshProductCostRollup({
        db,
        member: input.member,
        productId: link.productId,
        ...(link.productName ? { productName: link.productName } : {}),
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      }),
    ),
  );

  await syncFakturowniaCostSemanticIndexBestEffort({
    db,
    mappingId,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });

  return { evidenceId, mappingId };
}

async function listApprovedMappings(input: {
  attributeId?: string;
  limit?: number;
  optionValue?: string;
  productId?: string;
  tenantId?: string;
}): Promise<FakturowniaCostMapping[]> {
  // Push equality filters into Firestore. Equality-only composite filter sets
  // are covered by Firestore's automatic single-field/composite indexing, so no
  // bespoke composite index is required here. The date range is NOT pushed down
  // (that would need a new composite index); callers apply it in JS after the
  // full paginated read below.
  let query = firestore()
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .where("status", "==", "approved") as FirebaseFirestore.Query;
  if (input.tenantId) {
    query = query.where("tenantId", "==", input.tenantId);
  }
  query = query.orderBy("__name__");

  const mappings: FakturowniaCostMapping[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (let page = 0; page < APPROVED_MAPPING_MAX_PAGES; page++) {
    let pageQuery = query.limit(APPROVED_MAPPING_PAGE_SIZE);
    if (cursor) {
      pageQuery = pageQuery.startAfter(cursor);
    }
    const snapshot = await pageQuery.get();
    if (snapshot.empty) {
      break;
    }
    for (const doc of snapshot.docs) {
      const mapping = asCostMapping(doc.data());
      if (mapping && tenantMatches(mapping, input.tenantId)) {
        mappings.push({ ...mapping, id: mapping.id ?? doc.id });
      }
    }
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < APPROVED_MAPPING_PAGE_SIZE) {
      break;
    }
  }

  return mappings.filter(
    (mapping) =>
      mappingMatchesProduct(mapping, input.productId) &&
      mappingMatchesAttributeOption({
        mapping,
        ...(input.attributeId ? { attributeId: input.attributeId } : {}),
        ...(input.optionValue ? { optionValue: input.optionValue } : {}),
        ...(input.productId ? { productId: input.productId } : {}),
      }),
  );
}

export async function getApprovedProductCosts(
  input: ProductCostQueryInput,
): Promise<ApprovedFakturowniaCostEntry[]> {
  const db = firestore();
  const mappings = await listApprovedMappings({
    ...(input.attributeId ? { attributeId: input.attributeId } : {}),
    ...(input.optionValue ? { optionValue: input.optionValue } : {}),
    productId: input.productId,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  const evidenceById = await getEvidenceByIds(
    db,
    mappings.map((mapping) => mapping.evidenceId),
  );

  const entries = mappings.flatMap((mapping) => {
    const evidence = evidenceById.get(mapping.evidenceId);
    if (
      mapping.reference ||
      !evidence ||
      evidence.active === false ||
      !tenantMatches(evidence, input.tenantId) ||
      !stringInRange(mappingIssueDate(mapping, evidence), input)
    ) {
      return [];
    }

    const links = mappingLinksForProduct({
      mapping,
      productId: input.productId,
    }).filter(
      (link) =>
        (!input.attributeId || link.attributeId === input.attributeId) &&
        (!input.optionValue || link.optionValue === input.optionValue),
    );

    if (links.length > 0) {
      return links.map((link) =>
        costEntryFromMapping({ evidence, link, mapping }),
      );
    }

    return [costEntryFromMapping({ evidence, mapping })];
  });

  return entries.slice(0, limitValue(input.limit));
}

export async function listProductCostMappings(
  input: CostMappingListInput,
): Promise<FakturowniaCostMapping[]> {
  // listApprovedMappings paginates the full matching set, so apply the caller's
  // limit here (the AI tool layer expects at most MAX_COST_LIMIT results).
  // Filter out reference-only mappings — they carry no product/attribute cost
  // signal and must not reach the AI tool layer or any cost calculation path.
  return (await listApprovedMappings(input))
    .filter((m) => !m.reference)
    .slice(0, limitValue(input.limit));
}

export async function getApprovedAttributeOptionCosts(
  input: AttributeOptionCostQueryInput,
): Promise<ApprovedFakturowniaCostEntry[]> {
  const mappings = await listApprovedMappings({
    attributeId: input.attributeId,
    optionValue: input.optionValue,
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  const evidenceById = await getEvidenceByIds(
    firestore(),
    mappings.map((mapping) => mapping.evidenceId),
  );

  const entries = mappings.flatMap((mapping) => {
    const evidence = evidenceById.get(mapping.evidenceId);
    if (
      !evidence ||
      evidence.active === false ||
      !tenantMatches(evidence, input.tenantId) ||
      !stringInRange(mappingIssueDate(mapping, evidence), input)
    ) {
      return [];
    }

    const links = mappingLinksForProduct({
      mapping,
      ...(input.productId ? { productId: input.productId } : {}),
    }).filter(
      (link) =>
        link.attributeId === input.attributeId &&
        link.optionValue === input.optionValue,
    );

    if (links.length > 0) {
      return links.map((link) =>
        costEntryFromMapping({ evidence, link, mapping }),
      );
    }

    return [costEntryFromMapping({ evidence, mapping })];
  });

  return entries.slice(0, limitValue(input.limit));
}

export async function searchApprovedCostEvidence(
  input: CostEvidenceSearchInput,
): Promise<ApprovedFakturowniaCostEntry[]> {
  const mappings = (
    await listApprovedMappings({
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    })
  ).filter((mapping) => !mapping.reference);
  const evidenceById = await getEvidenceByIds(
    firestore(),
    mappings.map((mapping) => mapping.evidenceId),
  );
  const normalizedQuery = input.query
    ? normalizeFakturowniaCostText(input.query)
    : undefined;

  const entries = mappings.flatMap((mapping) => {
    const evidence = evidenceById.get(mapping.evidenceId);
    if (
      !evidence ||
      evidence.active === false ||
      !tenantMatches(evidence, input.tenantId)
    ) {
      return [];
    }
    if (!stringInRange(mappingIssueDate(mapping, evidence), input)) {
      return [];
    }
    if (
      normalizedQuery &&
      !normalizeFakturowniaCostText(
        [
          evidence.normalizedText,
          evidence.supplier.name,
          evidence.supplier.nip,
          ...mappingProductLinks(mapping).flatMap((link) => [
            link.productName,
            link.attributeName,
            link.optionValue,
          ]),
          mapping.productName,
          mapping.attributeName,
          mapping.optionValue,
          evidence.invoice.number,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(normalizedQuery)
    ) {
      return [];
    }

    return [costEntryFromMapping({ evidence, mapping })];
  });

  return entries.slice(0, limitValue(input.limit));
}

function compactIndexParts(
  parts: Array<string | number | null | undefined>,
): string {
  return parts
    .filter(
      (part): part is string | number => part !== undefined && part !== null,
    )
    .map(String)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" | ");
}

function semanticSearchTextHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readDistance(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asMaterialGroup(
  data: FirebaseFirestore.DocumentData | undefined,
): FakturowniaMaterialGroup | undefined {
  return data as FakturowniaMaterialGroup | undefined;
}

async function getMaterialGroupIndexTextParts(input: {
  attributeId?: string;
  optionValue?: string;
  tenantId?: string;
}): Promise<string[]> {
  if (!input.attributeId) {
    return [];
  }

  let query = firestore()
    .collection(FAKTUROWNIA_MATERIAL_GROUPS_COLLECTION)
    .where(
      "attributeIds",
      "array-contains",
      input.attributeId,
    ) as FirebaseFirestore.Query;
  if (input.tenantId) {
    query = query.where("tenantId", "==", input.tenantId);
  }

  const snapshot = await query.limit(5).get();
  const parts: string[] = [];
  for (const doc of snapshot.docs) {
    const group = asMaterialGroup(doc.data());
    if (
      !group ||
      group.active === false ||
      !tenantMatches(group, input.tenantId)
    ) {
      continue;
    }
    parts.push(group.name, ...group.attributeIds);
    if (group.valueAliases) {
      const canonical = input.optionValue
        ? (group.valueAliases[input.optionValue] ?? input.optionValue)
        : undefined;
      for (const [variant, value] of Object.entries(group.valueAliases)) {
        if (
          !canonical ||
          value === canonical ||
          variant === input.optionValue
        ) {
          parts.push(variant, value);
        }
      }
    }
  }

  return parts;
}

async function buildFakturowniaCostSemanticSearchText(input: {
  evidence: FakturowniaCostEvidence;
  mapping: FakturowniaCostMapping;
  tenantId?: string;
}): Promise<string> {
  const groupParts = await getMaterialGroupIndexTextParts({
    attributeId: input.mapping.attributeId,
    optionValue: input.mapping.optionValue,
    tenantId: input.tenantId,
  });

  return compactIndexParts([
    "Konfi approved Fakturownia supplier material cost",
    input.evidence.normalizedText,
    input.evidence.position.name,
    input.evidence.position.code,
    input.evidence.position.description,
    input.evidence.position.fakturowniaProductId,
    input.evidence.quantityUnit,
    input.evidence.supplier.name,
    input.evidence.supplier.nip,
    ...mappingProductLinks(input.mapping).flatMap((link) => [
      link.productName,
      link.productId,
      link.attributeName,
      link.attributeId,
      link.optionLabel,
      link.optionValue,
    ]),
    input.mapping.productName,
    input.mapping.attributeName,
    input.mapping.attributeId,
    input.mapping.optionLabel,
    input.mapping.optionValue,
    input.evidence.invoice.number,
    input.evidence.invoice.issueDate,
    ...groupParts,
  ]);
}

async function deleteFakturowniaCostSemanticIndexDoc(input: {
  db: AdminFirestore;
  mappingId: string;
}): Promise<void> {
  await input.db
    .collection(FAKTUROWNIA_COST_SEMANTIC_INDEX_COLLECTION)
    .doc(input.mappingId)
    .delete();
}

async function upsertFakturowniaCostSemanticIndexDoc(input: {
  db: AdminFirestore;
  evidence: FakturowniaCostEvidence;
  mapping: FakturowniaCostMapping;
  mappingId: string;
  tenantId?: string;
}): Promise<"indexed" | "skipped"> {
  const searchText = await buildFakturowniaCostSemanticSearchText({
    evidence: input.evidence,
    mapping: input.mapping,
    tenantId: input.tenantId,
  });
  if (!searchText) {
    await deleteFakturowniaCostSemanticIndexDoc({
      db: input.db,
      mappingId: input.mappingId,
    });
    return "skipped";
  }

  const embedding = await embedGeminiEmbeddingText({
    context: `Fakturownia cost mapping "${input.mappingId}"`,
    text: `task: retrieve approved Konfi supplier material costs | ${searchText}`,
  });
  if (embedding.length !== PRODUCT_SEARCH_EMBEDDING_DIMENSION) {
    throw new Error(
      `Expected ${PRODUCT_SEARCH_EMBEDDING_DIMENSION} embedding dimensions but got ${embedding.length}.`,
    );
  }

  await input.db
    .collection(FAKTUROWNIA_COST_SEMANTIC_INDEX_COLLECTION)
    .doc(input.mappingId)
    .set(
      {
        active: true,
        attributeId: input.mapping.attributeId ?? null,
        attributeName: input.mapping.attributeName ?? null,
        embedding: FieldValue.vector(embedding),
        embeddingDimension: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
        embeddingModel: PRODUCT_SEARCH_EMBEDDING_MODEL,
        evidenceId: input.mapping.evidenceId,
        id: input.mappingId,
        indexedAt: FieldValue.serverTimestamp(),
        issueDate: mappingIssueDate(input.mapping, input.evidence) ?? null,
        mappingId: input.mappingId,
        optionLabel: input.mapping.optionLabel ?? null,
        optionValue: input.mapping.optionValue ?? null,
        productId: input.mapping.productId ?? null,
        productIds: mappingProductLinks(input.mapping).map(
          (link) => link.productId,
        ),
        productLinks: mappingProductLinks(input.mapping),
        productName: input.mapping.productName ?? null,
        searchText,
        searchTextHash: semanticSearchTextHash(searchText),
        supplierName:
          input.mapping.supplierName ?? input.evidence.supplier.name ?? null,
        supplierNip:
          input.mapping.supplierNip ?? input.evidence.supplier.nip ?? null,
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return "indexed";
}

async function syncFakturowniaCostSemanticIndexForMapping(input: {
  db: AdminFirestore;
  mappingId: string;
  tenantId?: string;
}): Promise<"deleted" | "indexed" | "skipped"> {
  const snapshot = await input.db
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .doc(input.mappingId)
    .get();
  const rawMapping = asCostMapping(snapshot.data());
  const mapping = rawMapping
    ? { ...rawMapping, id: input.mappingId }
    : undefined;

  if (
    !snapshot.exists ||
    !mapping ||
    !tenantMatches(mapping, input.tenantId) ||
    mapping.status !== "approved" ||
    mapping.reference === true
  ) {
    await deleteFakturowniaCostSemanticIndexDoc({
      db: input.db,
      mappingId: input.mappingId,
    });
    return "deleted";
  }

  const evidenceSnapshot = await input.db
    .collection(FAKTUROWNIA_COST_EVIDENCE_COLLECTION)
    .doc(mapping.evidenceId)
    .get();
  const evidence = asCostEvidence(evidenceSnapshot.data());
  if (
    !evidenceSnapshot.exists ||
    !evidence ||
    evidence.active === false ||
    !tenantMatches(evidence, input.tenantId)
  ) {
    await deleteFakturowniaCostSemanticIndexDoc({
      db: input.db,
      mappingId: input.mappingId,
    });
    return "deleted";
  }

  if (
    mappingProductLinks(mapping).length === 0 &&
    !(mapping.attributeId && mapping.optionValue)
  ) {
    await deleteFakturowniaCostSemanticIndexDoc({
      db: input.db,
      mappingId: input.mappingId,
    });
    return "skipped";
  }

  return upsertFakturowniaCostSemanticIndexDoc({
    db: input.db,
    evidence,
    mapping,
    mappingId: input.mappingId,
    tenantId: input.tenantId,
  });
}

async function syncFakturowniaCostSemanticIndexBestEffort(input: {
  db: AdminFirestore;
  mappingId: string;
  tenantId?: string;
}): Promise<void> {
  try {
    await syncFakturowniaCostSemanticIndexForMapping(input);
  } catch (error) {
    console.warn("[fakturowniaCostSemanticIndex] Failed to sync index", {
      error,
      mappingId: input.mappingId,
    });
  }
}

async function getCostMappingsByIds(
  db: AdminFirestore,
  mappingIds: string[],
): Promise<Map<string, FakturowniaCostMapping>> {
  if (mappingIds.length === 0) {
    return new Map();
  }

  const refs = mappingIds.map((mappingId) =>
    db.collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION).doc(mappingId),
  );
  const snapshots = await db.getAll(...refs);
  const byId = new Map<string, FakturowniaCostMapping>();
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }
    const mapping = asCostMapping(snapshot.data());
    if (mapping) {
      byId.set(snapshot.id, { ...mapping, id: snapshot.id });
    }
  }
  return byId;
}

async function searchFakturowniaCostSemanticIndex(input: {
  limit: number;
  query: string;
  tenantId?: string;
}): Promise<Array<{ distance: number | null; mappingId: string }>> {
  const embedding = await embedGeminiEmbeddingText({
    context: `Fakturownia cost query "${input.query}"`,
    text: `task: retrieve approved Konfi supplier material costs | query: ${input.query}`,
  });
  if (embedding.length !== PRODUCT_SEARCH_EMBEDDING_DIMENSION) {
    console.warn(
      "[searchFakturowniaCostSemanticIndex] Unexpected query embedding dimension",
      {
        actual: embedding.length,
        expected: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
      },
    );
    return [];
  }

  let query = firestore()
    .collection(FAKTUROWNIA_COST_SEMANTIC_INDEX_COLLECTION)
    .where("active", "==", true) as FirebaseFirestore.Query;
  if (input.tenantId) {
    query = query.where("tenantId", "==", input.tenantId);
  }

  const snapshot = await query
    .findNearest({
      distanceMeasure: "COSINE",
      distanceResultField: COST_SEMANTIC_DISTANCE_FIELD,
      limit: Math.min(
        Math.max(input.limit * COST_SEMANTIC_SEARCH_POOL_MULTIPLIER, 10),
        1000,
      ),
      queryVector: embedding,
      vectorField: "embedding",
    })
    .get();

  return snapshot.docs.flatMap((doc) => {
    const data = doc.data();
    if (
      data.embeddingModel !== PRODUCT_SEARCH_EMBEDDING_MODEL ||
      data.embeddingDimension !== PRODUCT_SEARCH_EMBEDDING_DIMENSION
    ) {
      return [];
    }
    const mappingId = readString(data.mappingId) ?? doc.id;
    return [
      {
        distance: readDistance(data[COST_SEMANTIC_DISTANCE_FIELD]),
        mappingId,
      },
    ];
  });
}

function materialCostSearchResult(input: {
  entries: SemanticMaterialCostMatch[];
  query: string;
}): SemanticMaterialCostSearchResult {
  const rollup = computeProductCostRollup({
    baseCurrency: FAKTUROWNIA_COST_BASE_CURRENCY,
    entries: input.entries,
    productId: "material-search",
  });

  return {
    baseCurrency: FAKTUROWNIA_COST_BASE_CURRENCY,
    matches: input.entries,
    ...(input.entries.length === 0
      ? {
          noResultReason:
            "No approved indexed Fakturownia cost matched this query. Only admin-approved non-reference cost mappings are included.",
        }
      : {}),
    query: input.query,
    summary: rollup.overall,
    totalReturned: input.entries.length,
  };
}

export async function searchMaterialCostsByQuery(
  input: SemanticMaterialCostSearchInput,
): Promise<SemanticMaterialCostSearchResult> {
  const query = input.query.trim();
  const limit = limitValue(input.limit);
  const db = firestore();

  let hits: Array<{ distance: number | null; mappingId: string }> = [];
  try {
    hits = await searchFakturowniaCostSemanticIndex({
      limit,
      query,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    });
  } catch (error) {
    console.warn(
      "[searchMaterialCostsByQuery] Falling back to normalized evidence search",
      { error },
    );
  }

  if (hits.length === 0) {
    const fallback = await searchApprovedCostEvidence({
      ...(input.dateFrom ? { dateFrom: input.dateFrom } : {}),
      ...(input.dateTo ? { dateTo: input.dateTo } : {}),
      limit,
      ...(input.productId ? { productId: input.productId } : {}),
      query,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    });
    return materialCostSearchResult({
      entries: fallback.map((entry) => ({ ...entry, distance: null })),
      query,
    });
  }

  const mappingIds = [...new Set(hits.map((hit) => hit.mappingId))];
  const distanceByMappingId = new Map(
    hits.map((hit) => [hit.mappingId, hit.distance] as const),
  );
  const mappingsById = await getCostMappingsByIds(db, mappingIds);
  const evidenceById = await getEvidenceByIds(
    db,
    [...mappingsById.values()].map((mapping) => mapping.evidenceId),
  );

  const entries: SemanticMaterialCostMatch[] = [];
  for (const mappingId of mappingIds) {
    const mapping = mappingsById.get(mappingId);
    if (
      !mapping ||
      mapping.status !== "approved" ||
      mapping.reference === true ||
      !tenantMatches(mapping, input.tenantId)
    ) {
      continue;
    }
    if (!mappingMatchesProduct(mapping, input.productId)) {
      continue;
    }
    const evidence = evidenceById.get(mapping.evidenceId);
    if (
      !evidence ||
      evidence.active === false ||
      !tenantMatches(evidence, input.tenantId) ||
      !stringInRange(mappingIssueDate(mapping, evidence), input)
    ) {
      continue;
    }

    const links = mappingLinksForProduct({
      mapping,
      ...(input.productId ? { productId: input.productId } : {}),
    });
    const matchingEntries =
      links.length > 0
        ? links.map((link) => costEntryFromMapping({ evidence, link, mapping }))
        : [costEntryFromMapping({ evidence, mapping })];
    entries.push(
      ...matchingEntries.map((entry) => ({
        ...entry,
        distance: distanceByMappingId.get(mappingId) ?? null,
      })),
    );
    if (entries.length >= limit) {
      break;
    }
  }

  return materialCostSearchResult({ entries, query });
}

export async function backfillFakturowniaCostSemanticIndex(
  input: {
    force?: boolean;
    limit?: number;
    tenantId?: string;
  } = {},
): Promise<FakturowniaCostSemanticIndexBackfillResult> {
  const db = firestore();
  const mappings = (
    await listApprovedMappings(
      input.tenantId
        ? {
            tenantId: input.tenantId,
          }
        : {},
    )
  )
    .filter((mapping) => !mapping.reference)
    .slice(0, limitValue(input.limit ?? COST_SEMANTIC_SEARCH_FALLBACK_POOL));
  const result: FakturowniaCostSemanticIndexBackfillResult = {
    deleted: 0,
    failed: 0,
    indexed: 0,
    scanned: mappings.length,
    skipped: 0,
  };

  for (const mapping of mappings) {
    const mappingId = mapping.id;
    if (!mappingId) {
      result.skipped++;
      continue;
    }
    try {
      const status = await syncFakturowniaCostSemanticIndexForMapping({
        db,
        mappingId,
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      });
      if (status === "indexed") result.indexed++;
      if (status === "deleted") result.deleted++;
      if (status === "skipped") result.skipped++;
    } catch (error) {
      console.warn("[fakturowniaCostSemanticIndex] Backfill failed", {
        error,
        mappingId,
      });
      result.failed++;
    }
  }

  return result;
}

export async function listFakturowniaCostReviewData(input: {
  approvedLimit?: number;
  pendingLimit?: number;
  tenantId?: string;
}): Promise<CostReviewData> {
  const db = firestore();
  // Two separate ordered queries so pending and approved each get their own
  // budget and a deterministic newest-first window. Required composite indexes
  // (collection `fakturowniaCostMappings`):
  //   - status ASC, updatedAt DESC
  //   - tenantId ASC, status ASC, updatedAt DESC (tenant-scoped variant)
  // Create both in the Firebase console (there is no firestore.indexes.json).
  const listByStatus = async (
    status: FakturowniaCostMapping["status"],
    limit: number,
  ): Promise<FakturowniaCostMapping[]> => {
    let query = db
      .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
      .where("status", "==", status) as FirebaseFirestore.Query;
    if (input.tenantId) {
      query = query.where("tenantId", "==", input.tenantId);
    }
    const snapshot = await query
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();
    return snapshot.docs
      .map((doc) => asCostMapping(doc.data()))
      .filter((mapping): mapping is FakturowniaCostMapping =>
        Boolean(mapping && tenantMatches(mapping, input.tenantId)),
      );
  };

  const [pendingMappings, approvedMappings] = await Promise.all([
    listByStatus("pending", input.pendingLimit ?? DEFAULT_REVIEW_LIMIT),
    listByStatus("approved", input.approvedLimit ?? DEFAULT_REVIEW_LIMIT),
  ]);
  const evidenceById = await getEvidenceByIds(
    db,
    [...pendingMappings, ...approvedMappings].map(
      (mapping) => mapping.evidenceId,
    ),
  );

  return {
    approved: approvedMappings.map((mapping) => ({
      evidence: evidenceById.get(mapping.evidenceId),
      mapping,
    })),
    pending: pendingMappings.map((mapping) => ({
      evidence: evidenceById.get(mapping.evidenceId),
      mapping,
    })),
  };
}

export async function updateFakturowniaCostMappingStatus(input: {
  attributeId?: string;
  attributeName?: string;
  combinationId?: string;
  mappingId: string;
  member: CostAuditMember;
  optionLabel?: string;
  optionValue?: string;
  productLinks?: FakturowniaCostProductLink[];
  productId?: string;
  productName?: string;
  /** When true, approve without a product/attribute — saved as reference only. */
  reference?: boolean;
  status: "approved" | "rejected";
  tenantId?: string;
}): Promise<void> {
  const db = firestore();
  const ref = db
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .doc(input.mappingId);
  let recordedMapping: FakturowniaCostMapping | undefined;
  let recordedProductLinks: FakturowniaCostProductLink[] = [];
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new Error("Cost mapping not found.");
    }

    const mapping = asCostMapping(snapshot.data());
    if (!tenantMatches(mapping, input.tenantId)) {
      throw new Error("Cost mapping is outside the active tenant.");
    }

    const incomingLinks = inputProductLinks(input);
    const hasIncomingLinks =
      input.productLinks !== undefined || Boolean(input.productId?.trim());
    const nextProductLinks = hasIncomingLinks
      ? incomingLinks
      : mappingProductLinks(mapping);
    const primaryLink = primaryProductLink(nextProductLinks);
    const fallbackMapping = hasIncomingLinks ? undefined : mapping;
    const effectiveAttributeId =
      input.attributeId ??
      primaryLink?.attributeId ??
      fallbackMapping?.attributeId;
    const effectiveAttributeName =
      input.attributeName ??
      primaryLink?.attributeName ??
      fallbackMapping?.attributeName;
    const effectiveCombinationId =
      input.combinationId ??
      primaryLink?.combinationId ??
      fallbackMapping?.combinationId;
    const effectiveOptionLabel =
      input.optionLabel ??
      primaryLink?.optionLabel ??
      fallbackMapping?.optionLabel;
    const effectiveOptionValue =
      input.optionValue ??
      primaryLink?.optionValue ??
      fallbackMapping?.optionValue;
    if (
      input.status === "approved" &&
      !input.reference &&
      nextProductLinks.length === 0 &&
      !(effectiveAttributeId && effectiveOptionValue)
    ) {
      throw new Error(
        "Only mappings with a product candidate, or an attribute + option, can be approved.",
      );
    }

    // Reference mappings carry no product/attribute — clear any existing fields
    // from prior suggestions so they cannot leak into rollups.
    const isReference = input.status === "approved" && input.reference === true;
    const existingSourceSignals: string[] = mapping?.sourceSignals ?? [];
    transaction.update(ref, {
      ...(isReference
        ? {
            attributeId: FieldValue.delete(),
            attributeName: FieldValue.delete(),
            combinationId: FieldValue.delete(),
            optionLabel: FieldValue.delete(),
            optionValue: FieldValue.delete(),
            productId: FieldValue.delete(),
            productIds: FieldValue.delete(),
            productLinks: FieldValue.delete(),
            productName: FieldValue.delete(),
          }
        : {
            ...(effectiveAttributeId
              ? { attributeId: effectiveAttributeId }
              : { attributeId: FieldValue.delete() }),
            ...(effectiveAttributeName
              ? { attributeName: effectiveAttributeName }
              : { attributeName: FieldValue.delete() }),
            ...(effectiveCombinationId
              ? { combinationId: effectiveCombinationId }
              : { combinationId: FieldValue.delete() }),
            ...(effectiveOptionLabel
              ? { optionLabel: effectiveOptionLabel }
              : { optionLabel: FieldValue.delete() }),
            ...(effectiveOptionValue
              ? { optionValue: effectiveOptionValue }
              : { optionValue: FieldValue.delete() }),
            ...productLinkWriteData(nextProductLinks),
          }),
      ...(isReference
        ? {
            reference: true,
            sourceSignals: uniqueStrings([
              ...existingSourceSignals,
              "saved_as_reference",
            ]),
          }
        : { reference: FieldValue.delete() }),
      status: input.status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.member,
      ...(input.status === "approved"
        ? {
            approvedAt: Timestamp.now(),
            approvedBy: input.member,
          }
        : {
            rejectedAt: Timestamp.now(),
            rejectedBy: input.member,
          }),
    });
    recordedMapping = mapping;
    recordedProductLinks = nextProductLinks;
  });

  // Persist the decision for the learning loop outside the transaction; it is
  // fine if this is eventually consistent. Skip older mappings missing the
  // denormalized matching text.
  await recordCostDecisionMemory({
    db,
    input,
    mapping: recordedMapping,
  });

  // Maintain the per-product cost rollup so cost/margin reads don't recompute
  // from raw entries. Runs for BOTH approve and reject (a rejection that flips a
  // previously-approved entry must update the rollup too). Isolated below so a
  // rollup failure can never break the approve/reject action.
  const affectedIds = collectAffectedProductIds(
    recordedMapping,
    recordedProductLinks,
  );
  await Promise.all(
    affectedIds.map((productId) => {
      const link = recordedProductLinks.find(
        (candidate) => candidate.productId === productId,
      );
      return refreshProductCostRollup({
        db,
        member: input.member,
        productId,
        ...(link?.productName ? { productName: link.productName } : {}),
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      });
    }),
  );

  await syncFakturowniaCostSemanticIndexBestEffort({
    db,
    mappingId: input.mappingId,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
}

/**
 * Persists human-entered (or cleared) packaging on a cost mapping, independent
 * of its approval status, then refreshes the product cost rollup when the
 * mapping is product-attached. Material (product-less) mappings need no refresh
 * because their cost is read live from approved mappings.
 */
export async function setFakturowniaCostMappingPackaging(input: {
  mappingId: string;
  member: CostAuditMember;
  packaging: FakturowniaCostPackaging | null; // null clears packaging
  tenantId?: string;
}): Promise<void> {
  const db = firestore();
  const ref = db
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .doc(input.mappingId);
  let recordedMapping: FakturowniaCostMapping | undefined;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new Error("Cost mapping not found.");
    }

    const mapping = asCostMapping(snapshot.data());
    if (!tenantMatches(mapping, input.tenantId)) {
      throw new Error("Cost mapping is outside the active tenant.");
    }

    const cleaned = input.packaging
      ? cleanPackaging(input.packaging)
      : undefined;
    transaction.update(ref, {
      ...(cleaned !== undefined
        ? { packaging: cleaned }
        : { packaging: FieldValue.delete() }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.member,
    });
    recordedMapping = mapping;
  });

  const productLinks = mappingProductLinks(recordedMapping);
  if (productLinks.length > 0) {
    try {
      await Promise.all(
        productLinks.map((link) =>
          refreshProductCostRollup({
            db,
            member: input.member,
            productId: link.productId,
            ...(link.productName ? { productName: link.productName } : {}),
            ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          }),
        ),
      );
    } catch (error) {
      console.error(
        "[setFakturowniaCostMappingPackaging] Failed to refresh product cost rollup:",
        {
          productIds: productLinks.map((link) => link.productId),
          tenantId: input.tenantId,
        },
        error,
      );
    }
  }
}

/**
 * Reverts a previously-approved cost mapping back to "pending" so it leaves the
 * product cost rollup and returns to the review queue for a fresh decision.
 *
 * Unlike a rejection, this records NO decision memory: the existing mapping doc
 * (keyed deterministically by evidence id) survives, so the next sync skips it
 * — it neither auto-suppresses the line nor re-learns the prior approval. The
 * mapping simply reappears under "Pending review" with its product pre-filled.
 */
export async function unapproveFakturowniaCostMapping(input: {
  mappingId: string;
  member: CostAuditMember;
  tenantId?: string;
}): Promise<void> {
  const db = firestore();
  const ref = db
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .doc(input.mappingId);
  let recordedMapping: FakturowniaCostMapping | undefined;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new Error("Cost mapping not found.");
    }

    const mapping = asCostMapping(snapshot.data());
    if (!tenantMatches(mapping, input.tenantId)) {
      throw new Error("Cost mapping is outside the active tenant.");
    }
    if (mapping?.status !== "approved") {
      throw new Error("Only approved cost mappings can be removed.");
    }

    transaction.update(ref, {
      approvedAt: FieldValue.delete(),
      approvedBy: FieldValue.delete(),
      reference: FieldValue.delete(),
      status: "pending",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.member,
    });
    recordedMapping = mapping;
  });

  // Recompute the product rollup so the now-pending entry no longer contributes
  // to the cost average. Isolated so a rollup failure can't break the action.
  await Promise.all(
    mappingProductLinks(recordedMapping).map((link) =>
      refreshProductCostRollup({
        db,
        member: input.member,
        productId: link.productId,
        ...(link.productName ? { productName: link.productName } : {}),
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      }),
    ),
  );

  await syncFakturowniaCostSemanticIndexBestEffort({
    db,
    mappingId: input.mappingId,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
}

function asProductCostRollup(
  data: FirebaseFirestore.DocumentData | undefined,
): FakturowniaProductCostRollup | undefined {
  return data as FakturowniaProductCostRollup | undefined;
}

/**
 * Recomputes and upserts a product's cost rollup from its currently-approved
 * entries. Wrapped so failures are logged and swallowed — rollup maintenance
 * must never break the approve/reject action that triggered it.
 */
async function refreshProductCostRollup(input: {
  db: AdminFirestore;
  member: CostAuditMember;
  productId: string;
  productName?: string;
  tenantId?: string;
}): Promise<void> {
  try {
    const entries = await getApprovedProductCosts({
      productId: input.productId,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    });
    const productName =
      input.productName ??
      entries.find((entry) => entry.productName)?.productName;
    const computed = computeProductCostRollup({
      baseCurrency: FAKTUROWNIA_COST_BASE_CURRENCY,
      entries,
      productId: input.productId,
      ...(productName ? { productName } : {}),
    });

    await input.db
      .collection(FAKTUROWNIA_PRODUCT_COST_ROLLUPS_COLLECTION)
      .doc(buildProductCostRollupId(input.productId, input.tenantId))
      .set(
        {
          ...computed,
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          ...createTimestamps(input.member),
        },
        { merge: true },
      );
  } catch (error) {
    console.error(
      "[refreshProductCostRollup] Failed to maintain product cost rollup:",
      { productId: input.productId, tenantId: input.tenantId },
      error,
    );
  }
}

export async function getFakturowniaProductCostRollup(input: {
  productId: string;
  tenantId?: string;
}): Promise<FakturowniaProductCostRollup | null> {
  const snapshot = await firestore()
    .collection(FAKTUROWNIA_PRODUCT_COST_ROLLUPS_COLLECTION)
    .doc(buildProductCostRollupId(input.productId, input.tenantId))
    .get();
  const rollup = asProductCostRollup(snapshot.data());
  if (!rollup || !tenantMatches(rollup, input.tenantId)) {
    return null;
  }
  return rollup;
}

function rollupHasCostData(
  rollup: FakturowniaProductCostRollup | null,
): boolean {
  if (!rollup) {
    return false;
  }
  if (rollup.overall.sampleCount > 0) {
    return true;
  }
  return Object.values(rollup.byAttributeOption ?? {}).some(
    (bucket) => bucket.sampleCount > 0,
  );
}

/**
 * Reads a product's cost rollup, self-healing a stale or missing doc. The
 * approval-time {@link refreshProductCostRollup} swallows errors, so a rollup
 * can be left empty even though approved cost entries exist for the product.
 * When the stored rollup has no data but approved entries are present, this
 * recomputes from those entries and persists the corrected rollup, so cost
 * reads never silently show zero when invoice-backed cost data exists.
 */
export async function ensureProductCostRollup(input: {
  member: CostAuditMember;
  productId: string;
  tenantId?: string;
}): Promise<FakturowniaProductCostRollup | null> {
  const tenantArg = input.tenantId ? { tenantId: input.tenantId } : {};
  const stored = await getFakturowniaProductCostRollup({
    productId: input.productId,
    ...tenantArg,
  });
  if (rollupHasCostData(stored)) {
    return stored;
  }

  // Stored rollup is missing or empty. Only rebuild when approved entries
  // actually exist, so products that genuinely have no cost don't trigger a
  // pointless write on every read.
  const entries = await getApprovedProductCosts({
    productId: input.productId,
    ...tenantArg,
    limit: MAX_COST_LIMIT,
  });
  if (entries.length === 0) {
    return stored;
  }

  await refreshProductCostRollup({
    db: firestore(),
    member: input.member,
    productId: input.productId,
    ...tenantArg,
  });
  const healed = await getFakturowniaProductCostRollup({
    productId: input.productId,
    ...tenantArg,
  });
  console.warn("[cost] self-healed stale product cost rollup", {
    productId: input.productId,
    tenantId: input.tenantId ?? null,
    approvedEntries: entries.length,
    healedSampleCount: healed?.overall.sampleCount ?? null,
  });
  return healed;
}

export async function getFakturowniaProductCostRollups(input: {
  productIds: string[];
  tenantId?: string;
}): Promise<Map<string, FakturowniaProductCostRollup>> {
  const db = firestore();
  const uniqueIds = Array.from(
    new Set(input.productIds.filter((productId) => productId.length > 0)),
  );
  const result = new Map<string, FakturowniaProductCostRollup>();
  await Promise.all(
    uniqueIds.map(async (productId) => {
      const snapshot = await db
        .collection(FAKTUROWNIA_PRODUCT_COST_ROLLUPS_COLLECTION)
        .doc(buildProductCostRollupId(productId, input.tenantId))
        .get();
      const rollup = asProductCostRollup(snapshot.data());
      if (rollup && tenantMatches(rollup, input.tenantId)) {
        result.set(productId, rollup);
      }
    }),
  );
  return result;
}

async function recordCostDecisionMemory(args: {
  db: AdminFirestore;
  input: {
    attributeId?: string;
    attributeName?: string;
    member: CostAuditMember;
    optionLabel?: string;
    optionValue?: string;
    productLinks?: FakturowniaCostProductLink[];
    productId?: string;
    productName?: string;
    /** When true, the approval was "save as reference" — persisted so future auto-filing works. */
    reference?: boolean;
    status: "approved" | "rejected";
    tenantId?: string;
  };
  mapping: FakturowniaCostMapping | undefined;
}): Promise<void> {
  const { db, input, mapping } = args;
  const normalizedText = mapping?.normalizedText;
  if (!normalizedText) {
    return;
  }

  const supplierNip = mapping?.supplierNip;
  const supplierName = mapping?.supplierName;
  const decisionKey = buildFakturowniaCostDecisionKey({
    normalizedText,
    ...(supplierNip ? { supplierNip } : {}),
    ...(supplierName ? { supplierName } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });

  const isReference = input.status === "approved" && input.reference === true;
  const hasIncomingLinks =
    input.productLinks !== undefined || Boolean(input.productId?.trim());
  const productLinks = hasIncomingLinks
    ? inputProductLinks(input)
    : mappingProductLinks(mapping);
  const primaryLink = primaryProductLink(productLinks);
  const fallbackMapping = hasIncomingLinks ? undefined : mapping;
  const attributeId =
    input.attributeId ??
    primaryLink?.attributeId ??
    fallbackMapping?.attributeId;
  const attributeName =
    input.attributeName ??
    primaryLink?.attributeName ??
    fallbackMapping?.attributeName;
  const optionLabel =
    input.optionLabel ??
    primaryLink?.optionLabel ??
    fallbackMapping?.optionLabel;
  const optionValue =
    input.optionValue ??
    primaryLink?.optionValue ??
    fallbackMapping?.optionValue;
  const productId =
    primaryLink?.productId ?? input.productId ?? fallbackMapping?.productId;
  const productName =
    primaryLink?.productName ??
    input.productName ??
    fallbackMapping?.productName;

  await db
    .collection(FAKTUROWNIA_COST_DECISIONS_COLLECTION)
    .doc(decisionKey)
    .set(
      {
        decision: input.status,
        decisionKey,
        normalizedText,
        ...(isReference
          ? {
              attributeId: FieldValue.delete(),
              attributeName: FieldValue.delete(),
              optionLabel: FieldValue.delete(),
              optionValue: FieldValue.delete(),
              productId: FieldValue.delete(),
              productIds: FieldValue.delete(),
              productLinks: FieldValue.delete(),
              productName: FieldValue.delete(),
              reference: true,
            }
          : { reference: FieldValue.delete() }),
        ...(!isReference && input.status === "approved" && attributeId
          ? { attributeId }
          : {}),
        ...(!isReference && input.status === "approved" && attributeName
          ? { attributeName }
          : {}),
        ...(!isReference && input.status === "approved" && optionLabel
          ? { optionLabel }
          : {}),
        ...(!isReference && input.status === "approved" && optionValue
          ? { optionValue }
          : {}),
        ...(!isReference && input.status === "approved" && productId
          ? { productId }
          : {}),
        ...(!isReference &&
        input.status === "approved" &&
        productLinks.length > 0
          ? {
              productIds: uniqueStrings(
                productLinks.map((link) => link.productId),
              ),
              productLinks,
            }
          : {}),
        ...(!isReference &&
        input.status === "approved" &&
        productLinks.length === 0
          ? {
              productId: FieldValue.delete(),
              productIds: FieldValue.delete(),
              productLinks: FieldValue.delete(),
              productName: FieldValue.delete(),
            }
          : {}),
        ...(!isReference && input.status === "approved" && productName
          ? { productName }
          : {}),
        ...(supplierName ? { supplierName } : {}),
        ...(supplierNip ? { supplierNip } : {}),
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        ...createTimestamps(input.member),
      },
      { merge: true },
    );
}

export async function fetchFakturowniaCostInvoicePreview(input: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<Invoice[]> {
  const client = await getFakturowniaClient();
  return (
    (await client.invoicesJson.get({
      queryParameters: {
        includePositions: true,
        income: GetIncomeQueryParameterTypeObject.Zero,
        page: 1,
        perPage: 10,
        ...(input.dateFrom ? { dateFrom: toDateOnly(input.dateFrom) } : {}),
        ...(input.dateTo ? { dateTo: toDateOnly(input.dateTo) } : {}),
        ...(input.dateFrom || input.dateTo
          ? { period: GetPeriodQueryParameterTypeObject.More }
          : {}),
      },
    })) ?? []
  );
}

interface SellerDetails {
  city?: string;
  country?: string;
  currency?: string;
  email?: string;
  name?: string;
  nip?: string;
  phone?: string;
  postCode?: string;
  street?: string;
}

function trimmed(value: string | null | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

// Re-fetches the full Fakturownia invoice so we can capture seller contact and
// address fields that the lightweight cost-evidence record does not retain.
// Best-effort: a fetch failure degrades to evidence-only data.
async function fetchInvoiceSellerDetails(
  invoiceId: string,
): Promise<SellerDetails> {
  try {
    const client = await getFakturowniaClient();
    const invoice = await client.invoices.byId(invoiceId).get();
    if (!invoice) {
      return {};
    }
    const city = trimmed(invoice.sellerCity) ?? trimmed(invoice.buyerCity);
    const country =
      trimmed(invoice.sellerCountry) ?? trimmed(invoice.buyerCountry);
    const email = trimmed(invoice.sellerEmail) ?? trimmed(invoice.buyerEmail);
    const name = trimmed(invoice.sellerName) ?? trimmed(invoice.buyerName);
    const nip = trimmed(invoice.sellerTaxNo) ?? trimmed(invoice.buyerTaxNo);
    const phone = trimmed(invoice.sellerPhone) ?? trimmed(invoice.buyerPhone);
    const postCode =
      trimmed(invoice.sellerPostCode) ?? trimmed(invoice.buyerPostCode);
    const street =
      trimmed(invoice.sellerStreet) ?? trimmed(invoice.buyerStreet);
    return {
      ...(city ? { city } : {}),
      ...(country ? { country } : {}),
      ...(trimmed(invoice.currency)
        ? { currency: trimmed(invoice.currency) }
        : {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      ...(nip ? { nip } : {}),
      ...(phone ? { phone } : {}),
      ...(postCode ? { postCode } : {}),
      ...(street ? { street } : {}),
    };
  } catch (error) {
    console.error(
      "[importSupplierFromCostInvoice] Failed to fetch invoice seller details:",
      error,
    );
    return {};
  }
}

function buildSupplierAddresses(
  name: string,
  details: SellerDetails,
): Address[] {
  if (!details.street && !details.city && !details.postCode) {
    return [];
  }
  return [
    {
      active: true,
      name,
      type: "BILLING",
      ...(details.city ? { city: details.city } : {}),
      ...(details.country ? { country: details.country } : {}),
      ...(details.street ? { street: details.street } : {}),
      ...(details.postCode ? { zip: details.postCode } : {}),
    },
  ];
}

// Dedup lookup. NIP is the stable identity; fall back to an exact name match.
// A single equality clause keeps this on auto-created single-field indexes; the
// tenant scope is applied in memory to avoid requiring a composite index.
async function findExistingSupplier(input: {
  db: AdminFirestore;
  name?: string;
  nip?: string;
  tenantId?: string;
}): Promise<{ id: string; name: string } | undefined> {
  let query: FirebaseFirestore.Query;
  if (input.nip) {
    query = input.db
      .collection(SUPPLIERS_COLLECTION)
      .where("nip", "==", input.nip);
  } else if (input.name) {
    query = input.db
      .collection(SUPPLIERS_COLLECTION)
      .where("name", "==", input.name);
  } else {
    return undefined;
  }

  const snapshot = await query.limit(10).get();
  const match = snapshot.docs.find((doc) =>
    tenantMatches(doc.data(), input.tenantId),
  );
  if (!match) {
    return undefined;
  }
  const data = match.data() as Supplier;
  return { id: match.id, name: data.name ?? input.name ?? "" };
}

// Best-effort denormalization so the just-imported supplier shows as linked on
// the originating mapping without waiting for the next sync's matching pass.
async function linkMappingSupplier(input: {
  db: AdminFirestore;
  mappingId: string;
  member: CostAuditMember;
  supplierId: string;
  supplierName: string;
  supplierNip?: string;
  tenantId?: string;
}): Promise<void> {
  const ref = input.db
    .collection(FAKTUROWNIA_COST_MAPPINGS_COLLECTION)
    .doc(input.mappingId);
  try {
    await input.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        return;
      }
      const mapping = asCostMapping(snapshot.data());
      if (!tenantMatches(mapping, input.tenantId)) {
        return;
      }
      transaction.update(ref, {
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        ...(input.supplierNip ? { supplierNip: input.supplierNip } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: input.member,
      });
    });
  } catch (error) {
    console.error(
      "[importSupplierFromCostInvoice] Failed to link mapping supplier:",
      error,
    );
  }
}

export interface CostInvoiceSupplierDraft {
  name?: string;
  companyName?: string;
  nip?: string;
  email?: string;
  phone?: string;
  currency?: string;
  addresses: Address[];
  existingSupplier?: { id: string; name: string };
}

export async function getCostInvoiceSupplierDraft(input: {
  evidenceId: string;
  tenantId?: string;
}): Promise<CostInvoiceSupplierDraft> {
  const db = firestore();

  const evidenceSnapshot = await db
    .collection(FAKTUROWNIA_COST_EVIDENCE_COLLECTION)
    .doc(input.evidenceId)
    .get();
  const evidence = asCostEvidence(evidenceSnapshot.data());
  if (!evidence || !tenantMatches(evidence, input.tenantId)) {
    throw new Error("Cost evidence not found.");
  }

  const sellerDetails = await fetchInvoiceSellerDetails(evidence.invoice.id);
  const evidenceName = trimmed(evidence.supplier.name);
  const name = evidenceName ?? sellerDetails.name;
  const normalizedNip =
    normalizeNip(evidence.supplier.nip) ??
    (sellerDetails.nip ? normalizeNip(sellerDetails.nip) : undefined);
  const addresses = buildSupplierAddresses(name ?? "", sellerDetails);

  const existingSupplier = await findExistingSupplier({
    db,
    ...(name ? { name } : {}),
    ...(normalizedNip ? { nip: normalizedNip } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });

  return {
    ...(name ? { name } : {}),
    ...(name ? { companyName: name } : {}),
    ...(normalizedNip ? { nip: normalizedNip } : {}),
    ...(sellerDetails.email ? { email: sellerDetails.email } : {}),
    ...(sellerDetails.phone ? { phone: sellerDetails.phone } : {}),
    ...(sellerDetails.currency ? { currency: sellerDetails.currency } : {}),
    addresses,
    ...(existingSupplier ? { existingSupplier } : {}),
  };
}

export async function linkCostMappingSupplierByIdentity(input: {
  mappingId: string;
  name?: string;
  nip?: string;
  member: CostAuditMember;
  tenantId?: string;
}): Promise<{ linked: boolean; supplierId?: string; supplierName?: string }> {
  const db = firestore();
  const normalizedNip = input.nip ? normalizeNip(input.nip) : undefined;
  const existing = await findExistingSupplier({
    db,
    ...(input.name ? { name: input.name } : {}),
    ...(normalizedNip ? { nip: normalizedNip } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  if (!existing) {
    return { linked: false };
  }
  await linkMappingSupplier({
    db,
    mappingId: input.mappingId,
    member: input.member,
    supplierId: existing.id,
    supplierName: existing.name,
    ...(normalizedNip ? { supplierNip: normalizedNip } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  return { linked: true, supplierId: existing.id, supplierName: existing.name };
}

export interface ImportSupplierFromCostResult {
  created: boolean;
  supplierId: string;
  supplierName: string;
}

/**
 * Creates a Supplier in our system from a cost invoice's seller data, enriched
 * with the full invoice's address/contact fields. Deduplicates by NIP (or exact
 * name) so re-importing is a no-op, and links the originating mapping to the
 * resulting supplier.
 */
export async function importSupplierFromCostInvoice(input: {
  evidenceId: string;
  mappingId?: string;
  member: CostAuditMember;
  tenantId?: string;
}): Promise<ImportSupplierFromCostResult> {
  const db = firestore();

  const evidenceSnapshot = await db
    .collection(FAKTUROWNIA_COST_EVIDENCE_COLLECTION)
    .doc(input.evidenceId)
    .get();
  const evidence = asCostEvidence(evidenceSnapshot.data());
  if (!evidence || !tenantMatches(evidence, input.tenantId)) {
    throw new Error("Cost evidence not found.");
  }

  const evidenceName = trimmed(evidence.supplier.name);
  const normalizedNip = normalizeNip(evidence.supplier.nip);

  const existing = await findExistingSupplier({
    db,
    ...(evidenceName ? { name: evidenceName } : {}),
    ...(normalizedNip ? { nip: normalizedNip } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  if (existing) {
    if (input.mappingId) {
      await linkMappingSupplier({
        db,
        mappingId: input.mappingId,
        member: input.member,
        supplierId: existing.id,
        supplierName: existing.name,
        ...(normalizedNip ? { supplierNip: normalizedNip } : {}),
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      });
    }
    return {
      created: false,
      supplierId: existing.id,
      supplierName: existing.name,
    };
  }

  const sellerDetails = await fetchInvoiceSellerDetails(evidence.invoice.id);
  const name = evidenceName ?? sellerDetails.name;
  const supplierNip =
    normalizedNip ??
    (sellerDetails.nip ? normalizeNip(sellerDetails.nip) : undefined);
  if (!name) {
    throw new Error("Cost invoice has no supplier name to import.");
  }

  const supplierRef = db.collection(SUPPLIERS_COLLECTION).doc();
  const now = Timestamp.now() as unknown as Supplier["createdAt"];
  const addresses = buildSupplierAddresses(name, sellerDetails);
  const supplier: Supplier = {
    active: true,
    companyName: name,
    createdAt: now,
    createdBy: input.member,
    id: supplierRef.id,
    isPreferred: false,
    keywords: generateKeywords(name),
    linkedProductsIds: [],
    name,
    specialNotes: "",
    updatedAt: now,
    updatedBy: input.member,
    ...(addresses.length ? { addresses } : {}),
    ...(sellerDetails.currency ? { currency: sellerDetails.currency } : {}),
    ...(sellerDetails.email ? { email: sellerDetails.email } : {}),
    ...(supplierNip ? { nip: supplierNip } : {}),
    ...(sellerDetails.phone ? { phone: sellerDetails.phone } : {}),
    ...(trimmed(evidence.supplier.clientId)
      ? { supplierCode: trimmed(evidence.supplier.clientId) }
      : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  };

  await supplierRef.set(supplier);

  if (input.mappingId) {
    await linkMappingSupplier({
      db,
      mappingId: input.mappingId,
      member: input.member,
      supplierId: supplierRef.id,
      supplierName: name,
      ...(supplierNip ? { supplierNip } : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    });
  }

  return { created: true, supplierId: supplierRef.id, supplierName: name };
}
