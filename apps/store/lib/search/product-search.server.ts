import "server-only";

import { genericSearch } from "@konfi/meilisearch";
import type { Product } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  collection,
  collectionGroup,
  getDocs,
  limit as firestoreLimit,
  query as firestoreQuery,
  where as firestoreWhere,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  and,
  arrayContains,
  documentMatches,
  equal,
  execute,
  score,
  type BooleanExpression,
  type PipelineResult,
} from "firebase/firestore/pipelines";

export type StorefrontSearchBackend = "firestore" | "meilisearch";

export interface StorefrontProductSearchResult {
  channelId: string;
  id: string;
  images: string[];
  name: string;
  slug: string;
}

type SearchBackendEnvironment = Record<string, string | undefined>;
type ProductSearchAvailability = Partial<Product["availability"]>;
type ProductSearchDocument = Omit<
  Partial<Product>,
  "availability" | "seo" | "spec"
> & {
  _firestore_id?: string;
  availability?: ProductSearchAvailability;
  seo?: Partial<Product["seo"]>;
  spec?: Partial<Product["spec"]>;
};

const DEFAULT_RESULT_LIMIT = 10;
const MAX_CANDIDATE_LIMIT = 60;
const FALLBACK_CANDIDATE_LIMIT = 150;

function firstNonBlank(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
}

function hasMeilisearchConfig(env: SearchBackendEnvironment): boolean {
  return Boolean(firstNonBlank(env.MEILISEARCH_HOST));
}

export function resolveStorefrontSearchBackend(
  tenantContext: TenantContext,
  env: SearchBackendEnvironment = process.env,
): StorefrontSearchBackend {
  const configured = firstNonBlank(
    env.KONFI_STOREFRONT_SEARCH_BACKEND,
    env.KONFI_SEARCH_BACKEND,
  )?.toLowerCase();

  if (!configured || configured === "auto") {
    if (tenantContext.deploymentMode === "saas") {
      return "firestore";
    }

    return hasMeilisearchConfig(env) ? "meilisearch" : "firestore";
  }

  if (configured === "firestore" || configured === "meilisearch") {
    return configured;
  }

  throw new Error(
    `Invalid search backend "${configured}". Expected "auto", "firestore", or "meilisearch".`,
  );
}

function getSaasTenantId(tenantContext: TenantContext): string | undefined {
  if (tenantContext.deploymentMode !== "saas") {
    return undefined;
  }

  const tenantId = tenantContext.tenantId?.trim();

  if (tenantId) {
    return tenantId;
  }

  if (tenantContext.requireTenantId) {
    throw new Error("Missing tenantId for storefront product search.");
  }
}

function getCandidateLimit(limit: number): number {
  return Math.min(Math.max(limit * 3, 20), MAX_CANDIDATE_LIMIT);
}

function quoteMeiliFilterValue(value: string): string {
  return JSON.stringify(value);
}

function shouldUseFirestorePipeline(tenantContext: TenantContext): boolean {
  return tenantContext.deploymentMode === "saas";
}

export function createMeilisearchProductFilters(input: {
  channelId: string;
  recommendedOnly: boolean;
  tenantId?: string;
}): string[] {
  return [
    `channelId = ${quoteMeiliFilterValue(input.channelId)}`,
    ...(input.recommendedOnly ? ["recommended = true"] : []),
    ...(input.tenantId
      ? [`tenantId = ${quoteMeiliFilterValue(input.tenantId)}`]
      : []),
  ];
}

function normalizeProductDocument(
  value: unknown,
): ProductSearchDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as ProductSearchDocument;
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const seconds = record.seconds ?? record._seconds;
    const nanoseconds = record.nanoseconds ?? record._nanoseconds;

    if (typeof seconds === "number") {
      const date = new Date(
        seconds * 1000 +
          (typeof nanoseconds === "number"
            ? Math.floor(nanoseconds / 1_000_000)
            : 0),
      );

      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  return null;
}

function isPublishedSearchDocument(
  document: ProductSearchDocument,
  now: Date,
): boolean {
  const availability = document.availability;

  if (!document.active || !availability?.published) {
    return false;
  }

  if (availability.availableForPurchase === false) {
    return false;
  }

  const publicationDate = readDate(
    availability.publication ?? availability.publicationString,
  );
  if (!publicationDate || publicationDate > now) {
    return false;
  }

  const expirationDate = readDate(
    availability.expiration ?? availability.expirationString,
  );
  return !expirationDate || expirationDate >= now;
}

function toSearchResult(input: {
  document: ProductSearchDocument;
  fallbackChannelId: string;
  fallbackId?: string;
  now: Date;
}): StorefrontProductSearchResult | null {
  if (!isPublishedSearchDocument(input.document, input.now)) {
    return null;
  }

  const id =
    firstNonBlank(input.document["_firestore_id"], input.document.id) ??
    input.fallbackId;
  const name = input.document.name?.trim();

  if (!id || !name) {
    return null;
  }

  const channelId = firstNonBlank(
    input.document.channelId,
    input.fallbackChannelId,
  );

  if (!channelId) {
    return null;
  }

  return {
    channelId,
    id,
    images: Array.isArray(input.document.spec?.images)
      ? input.document.spec.images.filter(
          (image): image is string => typeof image === "string",
        )
      : [],
    name,
    slug: firstNonBlank(input.document.seo?.slug, id) ?? id,
  };
}

function dedupeSearchResults(
  results: readonly StorefrontProductSearchResult[],
): StorefrontProductSearchResult[] {
  return Array.from(
    new Map(
      results.map((result) => [`${result.channelId}:${result.id}`, result]),
    ).values(),
  );
}

function normalizeSearchValue(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function getSearchDocumentText(document: ProductSearchDocument): string {
  return [
    document.name,
    document.description,
    document.category?.name,
    document.productType?.name,
    document.seo?.title,
    document.seo?.description,
    document.seo?.slug,
    ...(Array.isArray(document.keywords) ? document.keywords : []),
  ]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeSearchValue)
    .join(" ");
}

export function searchDocumentMatchesQuery(
  document: ProductSearchDocument,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchValue(query.trim());

  if (!normalizedQuery) {
    return true;
  }

  const searchText = getSearchDocumentText(document);
  const terms = normalizedQuery
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  return (
    searchText.includes(normalizedQuery) ||
    terms.every((term) => searchText.includes(term))
  );
}

function getSearchDocumentScore(
  document: ProductSearchDocument,
  query: string,
): number {
  const normalizedQuery = normalizeSearchValue(query.trim());

  if (!normalizedQuery) {
    return 0;
  }

  const normalizedName = normalizeSearchValue(document.name ?? "");
  const normalizedSlug = normalizeSearchValue(document.seo?.slug ?? "");
  const searchText = getSearchDocumentText(document);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return [
    normalizedName === normalizedQuery ? 100 : 0,
    normalizedName.includes(normalizedQuery) ? 60 : 0,
    normalizedSlug.includes(normalizedQuery) ? 40 : 0,
    terms.reduce(
      (score, term) => score + (normalizedName.includes(term) ? 12 : 0),
      0,
    ),
    terms.reduce(
      (score, term) => score + (searchText.includes(term) ? 4 : 0),
      0,
    ),
  ].reduce((total, score) => total + score, 0);
}

function createPipelineCondition(
  conditions: readonly BooleanExpression[],
): BooleanExpression {
  if (conditions.length === 0) {
    throw new Error("At least one Firestore search condition is required.");
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  const [first, second, ...rest] = conditions;
  return and(first, second, ...rest);
}

function createPublicProductPipelineConditions(
  tenantId: string | undefined,
): BooleanExpression[] {
  return [
    equal("active", true),
    equal("availability.published", true),
    equal("availability.availableForPurchase", true),
    ...(tenantId ? [equal("tenantId", tenantId)] : []),
  ];
}

function createPublicProductQueryConstraints(
  tenantId: string | undefined,
): QueryConstraint[] {
  return [
    firestoreWhere("active", "==", true),
    firestoreWhere("availability.published", "==", true),
    firestoreWhere("availability.availableForPurchase", "==", true),
    ...(tenantId ? [firestoreWhere("tenantId", "==", tenantId)] : []),
  ];
}

function getSnapshotSourceChannelId(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  fallbackChannelId: string,
): string {
  return snapshot.ref.parent.parent?.id ?? fallbackChannelId;
}

function getPipelineSourceChannelId(
  result: PipelineResult,
  fallbackChannelId: string,
): string {
  return result.ref?.parent.parent?.id ?? fallbackChannelId;
}

async function searchFirestorePipeline(input: {
  channelId: string;
  firestore: Firestore;
  includeLinkedProducts: boolean;
  limit: number;
  query: string;
  tenantId?: string;
}): Promise<StorefrontProductSearchResult[]> {
  const publicConditions = createPublicProductPipelineConditions(
    input.tenantId,
  );
  const conditions = input.includeLinkedProducts
    ? [arrayContains("linkedChannels", input.channelId), ...publicConditions]
    : publicConditions;
  const source = input.includeLinkedProducts
    ? input.firestore.pipeline().collectionGroup("products")
    : input.firestore
        .pipeline()
        .collection(`channels/${input.channelId}/products`);
  const pipeline = source
    .search({
      query: documentMatches(input.query),
      sort: [score().descending()],
    })
    .where(createPipelineCondition(conditions))
    .limit(input.limit);
  const snapshot = await execute(pipeline);
  const now = new Date();

  return snapshot.results.flatMap((result) => {
    const document = normalizeProductDocument(result.data());

    if (!document) {
      return [];
    }

    const searchResult = toSearchResult({
      document,
      fallbackChannelId: getPipelineSourceChannelId(result, input.channelId),
      fallbackId: result.id,
      now,
    });

    return searchResult ? [searchResult] : [];
  });
}

async function searchFirestoreRecommendedProducts(input: {
  channelId: string;
  firestore: Firestore;
  limit: number;
  tenantId?: string;
}): Promise<StorefrontProductSearchResult[]> {
  const publicConstraints = createPublicProductQueryConstraints(input.tenantId);
  const candidateLimit = input.limit;
  const [directSnapshot, linkedSnapshot] = await Promise.all([
    getDocs(
      firestoreQuery(
        collection(input.firestore, `channels/${input.channelId}/products`),
        firestoreWhere("recommended", "==", true),
        ...publicConstraints,
        firestoreLimit(candidateLimit),
      ),
    ),
    getDocs(
      firestoreQuery(
        collectionGroup(input.firestore, "products"),
        firestoreWhere("recommended", "==", true),
        firestoreWhere("linkedChannels", "array-contains", input.channelId),
        ...publicConstraints,
        firestoreLimit(candidateLimit),
      ),
    ),
  ]);
  const now = new Date();

  return [...directSnapshot.docs, ...linkedSnapshot.docs].flatMap(
    (snapshot) => {
      const document = normalizeProductDocument(snapshot.data());

      if (!document) {
        return [];
      }

      const searchResult = toSearchResult({
        document,
        fallbackChannelId: getSnapshotSourceChannelId(
          snapshot,
          input.channelId,
        ),
        fallbackId: snapshot.id,
        now,
      });

      return searchResult ? [searchResult] : [];
    },
  );
}

async function searchFirestoreCandidateProducts(input: {
  channelId: string;
  firestore: Firestore;
  limit: number;
  query: string;
  tenantId?: string;
}): Promise<StorefrontProductSearchResult[]> {
  const publicConstraints = createPublicProductQueryConstraints(input.tenantId);
  const candidateLimit = Math.max(
    getCandidateLimit(input.limit),
    FALLBACK_CANDIDATE_LIMIT,
  );
  const candidateQueries = [
    firestoreQuery(
      collection(input.firestore, `channels/${input.channelId}/products`),
      ...publicConstraints,
      firestoreLimit(candidateLimit),
    ),
    firestoreQuery(
      collectionGroup(input.firestore, "products"),
      firestoreWhere("linkedChannels", "array-contains", input.channelId),
      ...publicConstraints,
      firestoreLimit(candidateLimit),
    ),
  ];
  const snapshots = await Promise.allSettled(candidateQueries.map(getDocs));
  const now = new Date();

  return dedupeSearchResults(
    snapshots.flatMap((snapshot) => {
      if (snapshot.status === "rejected") {
        console.warn(
          "Failed to fetch storefront search candidates:",
          snapshot.reason,
        );
        return [];
      }

      return snapshot.value.docs.flatMap((candidate) => {
        const document = normalizeProductDocument(candidate.data());

        if (!document || !searchDocumentMatchesQuery(document, input.query)) {
          return [];
        }

        const searchResult = toSearchResult({
          document,
          fallbackChannelId: getSnapshotSourceChannelId(
            candidate,
            input.channelId,
          ),
          fallbackId: candidate.id,
          now,
        });

        return searchResult ? [searchResult] : [];
      });
    }),
  )
    .sort((left, right) => {
      const leftScore = getSearchDocumentScore(
        {
          id: left.id,
          name: left.name,
          seo: { slug: left.slug },
        },
        input.query,
      );
      const rightScore = getSearchDocumentScore(
        {
          id: right.id,
          name: right.name,
          seo: { slug: right.slug },
        },
        input.query,
      );

      return rightScore - leftScore || left.name.localeCompare(right.name);
    })
    .slice(0, input.limit);
}

async function searchFirestoreProducts(input: {
  channelId: string;
  firestore: Firestore;
  limit: number;
  query: string;
  tenantContext: TenantContext;
}): Promise<StorefrontProductSearchResult[]> {
  const tenantId = getSaasTenantId(input.tenantContext);
  const candidateLimit = getCandidateLimit(input.limit);

  if (!input.query.trim()) {
    return dedupeSearchResults(
      await searchFirestoreRecommendedProducts({
        channelId: input.channelId,
        firestore: input.firestore,
        limit: candidateLimit,
        tenantId,
      }),
    ).slice(0, input.limit);
  }

  if (!shouldUseFirestorePipeline(input.tenantContext)) {
    return await searchFirestoreCandidateProducts({
      channelId: input.channelId,
      firestore: input.firestore,
      limit: input.limit,
      query: input.query,
      tenantId,
    });
  }

  try {
    const [directResults, linkedResults] = await Promise.all([
      searchFirestorePipeline({
        channelId: input.channelId,
        firestore: input.firestore,
        includeLinkedProducts: false,
        limit: candidateLimit,
        query: input.query,
        tenantId,
      }),
      searchFirestorePipeline({
        channelId: input.channelId,
        firestore: input.firestore,
        includeLinkedProducts: true,
        limit: candidateLimit,
        query: input.query,
        tenantId,
      }),
    ]);
    const pipelineResults = dedupeSearchResults([
      ...directResults,
      ...linkedResults,
    ]).slice(0, input.limit);

    if (pipelineResults.length > 0) {
      return pipelineResults;
    }
  } catch (error) {
    console.warn("Firestore product search pipeline failed:", error);
  }

  return await searchFirestoreCandidateProducts({
    channelId: input.channelId,
    firestore: input.firestore,
    limit: input.limit,
    query: input.query,
    tenantId,
  });
}

async function searchMeilisearchProducts(input: {
  channelId: string;
  limit: number;
  query: string;
  tenantContext: TenantContext;
}): Promise<StorefrontProductSearchResult[]> {
  const tenantId = getSaasTenantId(input.tenantContext);
  const filters = createMeilisearchProductFilters({
    channelId: input.channelId,
    recommendedOnly: !input.query.trim(),
    tenantId,
  });
  const response = await genericSearch<ProductSearchDocument>(
    "products",
    input.query,
    {
      attributesToRetrieve: [
        "_firestore_id",
        "name",
        "channelId",
        "seo.slug",
        "spec.images",
        "active",
        "availability",
      ],
      filter: filters,
      limit: getCandidateLimit(input.limit),
    },
  );

  if (!Array.isArray(response)) {
    console.warn("Invalid response from genericSearch:", response);
    return [];
  }

  const now = new Date();

  return dedupeSearchResults(
    response.flatMap((document) => {
      const searchResult = toSearchResult({
        document,
        fallbackChannelId: input.channelId,
        now,
      });

      return searchResult ? [searchResult] : [];
    }),
  ).slice(0, input.limit);
}

export async function searchStorefrontProducts(input: {
  channelId: string;
  firestore: Firestore;
  limit?: number;
  query: string;
  tenantContext: TenantContext;
}): Promise<StorefrontProductSearchResult[]> {
  const limit = input.limit ?? DEFAULT_RESULT_LIMIT;
  const backend = resolveStorefrontSearchBackend(input.tenantContext);

  if (backend === "firestore") {
    return searchFirestoreProducts({
      ...input,
      limit,
    });
  }

  return searchMeilisearchProducts({
    channelId: input.channelId,
    limit,
    query: input.query,
    tenantContext: input.tenantContext,
  });
}
