import "server-only";

import { createHash, createSign } from "node:crypto";
import { getVertexConfig } from "@/lib/ai/server-vertex-config";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type { Attribute, Product } from "@konfi/types";
import { isPurchasable } from "@konfi/utils";
import {
  FieldValue,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from "firebase-admin/firestore";

export const PRODUCT_SEARCH_EMBEDDING_MODEL = "gemini-embedding-2";
export const PRODUCT_SEARCH_EMBEDDING_DIMENSION = 768;

const PRODUCT_SEARCH_INDEX_COLLECTION = "productsIndex";
const PRODUCT_SEARCH_EMBEDDING_FIELD = "embedding";
const PRODUCT_SEARCH_DISTANCE_FIELD = "distance";
const PRODUCT_SEARCH_EMBEDDING_REQUEST_CONCURRENCY = 4;
const PRODUCT_SEARCH_WRITE_BATCH_LIMIT = 400;
const PRODUCT_SEARCH_ATTRIBUTES_CACHE_TTL_MS = 60_000;
const VERTEX_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const VERTEX_CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";
const VERTEX_ACCESS_TOKEN_EXPIRY_SKEW_MS = 60_000;

export interface ProductSearchIndexBackfillResult {
  totalProducts: number;
  indexableProducts: number;
  indexed: number;
  skipped: number;
  deleted: number;
  embeddingModel: string;
  embeddingDimension: number;
}

export interface SemanticProductSearchHit {
  indexDocId: string;
  productId: string;
  sourceChannelId: string;
  channelId: string;
  distance: number | null;
}

export interface ProductSemanticSearchIndexSyncResult {
  indexed: number;
  deleted: number;
  skipped: number;
  embeddingModel: string;
  embeddingDimension: number;
}

interface IndexedProductCandidate {
  indexDocId: string;
  product: Product;
  channelId: string;
  sourceChannelId: string;
  searchText: string;
  searchTextHash: string;
}

interface ProductSearchIndexDocument {
  id: string;
  productId: string;
  channelId: string;
  sourceChannelId: string;
  productPath: string;
  name: string;
  categoryName: string;
  searchText: string;
  searchTextHash: string;
  embeddingModel: string;
  embeddingDimension: number;
  active: boolean;
  published: boolean;
  indexedAt: FieldValue;
  updatedAt: FieldValue;
  embedding: FieldValue;
}

interface VertexAccessTokenCache {
  token: string;
  expiresAt: number;
}

let cachedVertexAccessToken: VertexAccessTokenCache | null = null;
let cachedProductSearchAttributes: {
  attributes: Attribute[];
  expiresAt: number;
} | null = null;

export function clearProductSearchAttributeCache() {
  cachedProductSearchAttributes = null;
}

function getDb() {
  return getAdminDb();
}

function toBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const bodyText = await response.text();
  if (!bodyText) return null;

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

function formatUnknownForError(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function getVertexAccessToken(): Promise<string> {
  const now = Date.now();
  if (
    cachedVertexAccessToken &&
    cachedVertexAccessToken.expiresAt - VERTEX_ACCESS_TOKEN_EXPIRY_SKEW_MS > now
  ) {
    return cachedVertexAccessToken.token;
  }

  const { clientEmail, privateKey } = getVertexConfig();
  const issuedAt = Math.floor(now / 1000);
  const expiresInSeconds = 3600;
  const unsignedJwt = [
    toBase64UrlJson({ alg: "RS256", typ: "JWT" }),
    toBase64UrlJson({
      aud: VERTEX_OAUTH_TOKEN_URL,
      exp: issuedAt + expiresInSeconds,
      iat: issuedAt,
      iss: clientEmail,
      scope: VERTEX_CLOUD_PLATFORM_SCOPE,
    }),
  ].join(".");
  const signature = createSign("RSA-SHA256")
    .update(unsignedJwt)
    .sign(privateKey, "base64url");
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await fetch(VERTEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Failed to mint Vertex AI access token: HTTP ${response.status} ${response.statusText} · ${formatUnknownForError(responseBody)}`,
    );
  }

  if (!isObjectRecord(responseBody)) {
    throw new Error("Vertex AI access token response was not an object.");
  }

  const token = responseBody.access_token;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Vertex AI access token response did not include a token.");
  }

  const expiresIn = responseBody.expires_in;
  cachedVertexAccessToken = {
    token,
    expiresAt:
      now +
      (typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? expiresIn
        : expiresInSeconds) *
        1000,
  };

  return token;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNonEmptyStrings(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(
      values.map(normalizeSearchText).filter((value) => value.length > 0),
    ),
  );
}

function hashSearchText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function encodeIndexIdPart(value: string): string {
  return encodeURIComponent(value).replace(/\./g, "%2E");
}

function trimId(id: string): string {
  return id.trim();
}

export function getProductSearchIndexDocumentId({
  sourceChannelId,
  productId,
}: {
  sourceChannelId: string;
  productId: string;
}): string {
  return `${encodeIndexIdPart(sourceChannelId)}__${encodeIndexIdPart(productId)}`;
}

function getAttributeSearchParts(
  product: Product,
  attributes: readonly Attribute[],
): string[] {
  const attributeMap = new Map(
    attributes.map((attribute) => [attribute.id, attribute]),
  );
  const parts: string[] = [];

  for (const attributeId of product.attributes ?? []) {
    const attribute = attributeMap.get(attributeId);
    if (!attribute) continue;

    parts.push(attribute.name, ...(attribute.keywords ?? []));

    const selectedOptionValues = product.attributeOptions?.[attributeId] ?? [];
    for (const optionValue of selectedOptionValues) {
      const option = attribute.options.find(
        (item) => item.value === optionValue,
      );
      if (!option) continue;
      parts.push(option.label, option.value);
    }
  }

  return parts;
}

export function buildProductSemanticSearchText({
  product,
  attributes,
}: {
  product: Product;
  attributes: readonly Attribute[];
}): string {
  const parts = uniqueNonEmptyStrings([
    product.name,
    product.description,
    product.category?.name,
    product.productType?.name,
    product.seo?.title,
    product.seo?.description,
    product.specialNotes,
    ...(product.keywords ?? []),
    ...getAttributeSearchParts(product, attributes),
  ]);

  return parts.join("\n");
}

function getIndexCollection(
  channelId: string,
): CollectionReference<DocumentData> {
  return getDb().collection(
    `channels/${channelId}/${PRODUCT_SEARCH_INDEX_COLLECTION}`,
  );
}

function resolveAffectedChannelIds({
  sourceChannelId,
  product,
  previousLinkedChannelIds = [],
}: {
  sourceChannelId: string;
  product?: Product | null;
  previousLinkedChannelIds?: readonly string[];
}): string[] {
  const channelIds = [
    sourceChannelId,
    ...previousLinkedChannelIds,
    ...(product?.linkedChannels ?? []),
  ];
  const resolvedChannelIds = new Set<string>();
  let emptyChannelIds = 0;

  for (const channelId of channelIds) {
    const trimmedChannelId = trimId(channelId);
    if (trimmedChannelId.length === 0) {
      emptyChannelIds += 1;
      continue;
    }

    resolvedChannelIds.add(trimmedChannelId);
  }

  if (emptyChannelIds > 0) {
    console.warn("[semanticProductIndex] Ignoring empty channel IDs", {
      productId: product?.id,
      emptyChannelIds,
    });
  }

  return Array.from(resolvedChannelIds);
}

function productFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  fallbackChannelId: string,
): { product: Product; sourceChannelId: string } {
  const data = snapshot.data() as Product;
  const sourceChannelId =
    snapshot.ref.parent.parent?.id ?? data.channelId ?? fallbackChannelId;

  return {
    product: {
      ...data,
      id: data.id || snapshot.id,
      channelId: data.channelId ?? sourceChannelId,
    },
    sourceChannelId,
  };
}

async function fetchAttributes({
  useCache = true,
}: {
  useCache?: boolean;
} = {}): Promise<Attribute[]> {
  // Per-product admin syncs use a short-lived cache to avoid reading all
  // attributes for every write; manual backfills opt out so they always see the
  // freshest attribute metadata for a full rebuild.
  const now = Date.now();
  if (
    useCache &&
    cachedProductSearchAttributes &&
    cachedProductSearchAttributes.expiresAt > now
  ) {
    return cachedProductSearchAttributes.attributes;
  }

  const snapshot = await getDb().collection("attributes").get();
  const attributes = snapshot.docs.map((doc) => ({
    ...(doc.data() as Attribute),
    id: (doc.data() as Attribute).id || doc.id,
  }));

  if (useCache) {
    cachedProductSearchAttributes = {
      attributes,
      expiresAt: now + PRODUCT_SEARCH_ATTRIBUTES_CACHE_TTL_MS,
    };
  }

  return attributes;
}

async function fetchIndexableProducts({
  channelId,
}: {
  channelId: string;
}): Promise<Array<{ product: Product; sourceChannelId: string }>> {
  const firestore = getDb();
  const ownSnapshot = await firestore
    .collection(`channels/${channelId}/products`)
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .limit(999)
    .get();
  const linkedSnapshot = await firestore
    .collectionGroup("products")
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .where("linkedChannels", "array-contains", channelId)
    .limit(999)
    .get();

  const byIndexDocId = new Map<
    string,
    { product: Product; sourceChannelId: string }
  >();

  for (const snapshot of [...ownSnapshot.docs, ...linkedSnapshot.docs]) {
    const item = productFromSnapshot(snapshot, channelId);
    if (!isPurchasable(item.product)) continue;

    byIndexDocId.set(
      getProductSearchIndexDocumentId({
        sourceChannelId: item.sourceChannelId,
        productId: item.product.id,
      }),
      item,
    );
  }

  return Array.from(byIndexDocId.values());
}

async function fetchProductById({
  channelId,
  productId,
}: {
  channelId: string;
  productId: string;
}): Promise<Product | null> {
  const snapshot = await getDb()
    .collection(`channels/${channelId}/products`)
    .doc(productId)
    .get();

  if (!snapshot.exists) return null;

  const data = snapshot.data() as Product;
  if (!data) {
    console.warn("[semanticProductIndex] Product document had no data", {
      channelId,
      productId,
    });
    return null;
  }

  return {
    ...data,
    id: data.id || snapshot.id,
    channelId: data.channelId ?? channelId,
  };
}

function buildCandidates({
  channelId,
  products,
  attributes,
}: {
  channelId: string;
  products: readonly { product: Product; sourceChannelId: string }[];
  attributes: readonly Attribute[];
}): IndexedProductCandidate[] {
  return products
    .map(({ product, sourceChannelId }) => {
      const searchText = buildProductSemanticSearchText({
        product,
        attributes,
      });
      return {
        indexDocId: getProductSearchIndexDocumentId({
          sourceChannelId,
          productId: product.id,
        }),
        product,
        channelId,
        sourceChannelId,
        searchText,
        searchTextHash: hashSearchText(searchText),
      };
    })
    .filter((candidate) => candidate.searchText.length > 0);
}

function shouldReindexCandidate({
  candidate,
  existingData,
  force,
}: {
  candidate: IndexedProductCandidate;
  existingData: DocumentData | undefined;
  force: boolean;
}): boolean {
  if (force || !existingData) return true;

  return !(
    existingData.searchTextHash === candidate.searchTextHash &&
    existingData.embeddingModel === PRODUCT_SEARCH_EMBEDDING_MODEL &&
    existingData.embeddingDimension === PRODUCT_SEARCH_EMBEDDING_DIMENSION
  );
}

async function commitAndResetBatch(batch: WriteBatch, writes: number) {
  if (writes > 0) {
    await batch.commit();
  }
}

async function deleteProductSearchIndexDocument({
  channelId,
  sourceChannelId,
  productId,
}: {
  channelId: string;
  sourceChannelId: string;
  productId: string;
}): Promise<void> {
  await getIndexCollection(channelId)
    .doc(getProductSearchIndexDocumentId({ sourceChannelId, productId }))
    .delete();
}

function createIndexDocument({
  candidate,
  embedding,
}: {
  candidate: IndexedProductCandidate;
  embedding: number[];
}): ProductSearchIndexDocument {
  return {
    id: candidate.indexDocId,
    productId: candidate.product.id,
    channelId: candidate.channelId,
    sourceChannelId: candidate.sourceChannelId,
    productPath: `channels/${candidate.sourceChannelId}/products/${candidate.product.id}`,
    name: candidate.product.name,
    categoryName: candidate.product.category?.name ?? "",
    searchText: candidate.searchText,
    searchTextHash: candidate.searchTextHash,
    embeddingModel: PRODUCT_SEARCH_EMBEDDING_MODEL,
    embeddingDimension: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
    active: candidate.product.active === true,
    published: candidate.product.availability?.published === true,
    indexedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    embedding: FieldValue.vector(embedding),
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getVertexEmbeddingEndpointHosts(location: string): string[] {
  const hosts = new Set<string>();

  if (["global", "us", "eu"].includes(location)) {
    hosts.add(`aiplatform.${location}.rep.googleapis.com`);
  } else {
    hosts.add(`${location}-aiplatform.googleapis.com`);
  }

  hosts.add("aiplatform.googleapis.com");

  return Array.from(hosts);
}

function getVertexEmbeddingEndpoints(): string[] {
  const { project, location } = getVertexConfig();
  const modelPath = `projects/${project}/locations/${location}/publishers/google/models/${PRODUCT_SEARCH_EMBEDDING_MODEL}`;

  return getVertexEmbeddingEndpointHosts(location).map(
    (host) => `https://${host}/v1/${modelPath}:embedContent`,
  );
}

function readNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;

  const numbers: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    numbers.push(item);
  }

  return numbers;
}

function extractEmbedContentValues(responseBody: unknown): number[] | null {
  if (!isObjectRecord(responseBody)) return null;

  const embedding = responseBody.embedding;
  if (!isObjectRecord(embedding)) return null;

  return readNumberArray(embedding.values);
}

function getVertexRestErrorSummary({
  response,
  responseBody,
}: {
  response: Response;
  responseBody: unknown;
}): string {
  const data = isObjectRecord(responseBody) ? responseBody : null;
  const dataError = data && isObjectRecord(data.error) ? data.error : null;
  const status =
    dataError && typeof dataError.status === "string" ? dataError.status : null;
  const message =
    dataError && typeof dataError.message === "string"
      ? dataError.message
      : response.statusText;

  return [
    `HTTP ${response.status}`,
    status,
    message,
    formatUnknownForError(responseBody),
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" · ");
}

function getApiErrorSummary(error: unknown): string {
  if (!isObjectRecord(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const statusCode =
    typeof error.statusCode === "number" ? `HTTP ${error.statusCode}` : null;
  const responseBody =
    typeof error.responseBody === "string" ? error.responseBody : null;
  const data = isObjectRecord(error.data) ? error.data : null;
  const dataError = data && isObjectRecord(data.error) ? data.error : null;
  const status =
    dataError && typeof dataError.status === "string" ? dataError.status : null;
  const message =
    dataError && typeof dataError.message === "string"
      ? dataError.message
      : error instanceof Error
        ? error.message
        : null;

  return [statusCode, status, message, responseBody]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" · ");
}

async function embedProductSearchCandidate({
  candidate,
}: {
  candidate: IndexedProductCandidate;
}): Promise<number[]> {
  const title = normalizeSearchText(candidate.product.name) || "none";
  const searchDocument = `title: ${title} | text: ${candidate.searchText}`;

  try {
    return await embedProductSearchText({
      text: searchDocument,
      context: `product "${candidate.product.name}" (${candidate.product.id})`,
    });
  } catch (error) {
    throw new Error(
      `Failed to embed product "${candidate.product.name}" (${candidate.product.id}) with ${PRODUCT_SEARCH_EMBEDDING_MODEL}: ${getApiErrorSummary(error)}`,
      { cause: error },
    );
  }
}

async function embedProductSearchText({
  text,
  context,
}: {
  text: string;
  context: string;
}): Promise<number[]> {
  const accessToken = await getVertexAccessToken();
  const endpoints = getVertexEmbeddingEndpoints();
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
          embedContentConfig: {
            outputDimensionality: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
          },
        }),
      });
      const responseBody = await readJsonResponse(response);

      if (response.ok) {
        const embedding = extractEmbedContentValues(responseBody);
        if (!embedding) {
          throw new Error(
            `Vertex AI embedContent response did not include embedding values for ${context}: ${formatUnknownForError(responseBody)}`,
          );
        }

        return embedding;
      }

      lastError = new Error(
        `${endpoint} failed for ${context}: ${getVertexRestErrorSummary({
          response,
          responseBody,
        })}`,
      );

      if (![400, 404].includes(response.status)) break;
    } catch (error) {
      lastError = new Error(
        `${endpoint} failed for ${context}: ${getApiErrorSummary(error)}`,
        { cause: error },
      );
    }
  }

  throw lastError ?? new Error(`Vertex AI embedContent failed for ${context}.`);
}

export async function embedGeminiEmbeddingText({
  context,
  text,
}: {
  context: string;
  text: string;
}): Promise<number[]> {
  return embedProductSearchText({ context, text });
}

export async function backfillProductSemanticSearchIndex({
  channelId,
  force = false,
}: {
  channelId: string;
  force?: boolean;
}): Promise<ProductSearchIndexBackfillResult> {
  const [attributes, products, existingSnapshot] = await Promise.all([
    fetchAttributes({ useCache: false }),
    fetchIndexableProducts({ channelId }),
    getIndexCollection(channelId).get(),
  ]);
  const indexCollection = getIndexCollection(channelId);
  const candidates = buildCandidates({ channelId, products, attributes });
  const candidateIds = new Set(
    candidates.map((candidate) => candidate.indexDocId),
  );
  const existingById = new Map(
    existingSnapshot.docs.map((doc) => [doc.id, doc.data()]),
  );
  const candidatesToIndex = candidates.filter((candidate) =>
    shouldReindexCandidate({
      candidate,
      existingData: existingById.get(candidate.indexDocId),
      force,
    }),
  );

  let indexed = 0;
  let deleted = 0;
  let batch = getDb().batch();
  let writes = 0;

  for (const existingDoc of existingSnapshot.docs) {
    if (candidateIds.has(existingDoc.id)) continue;

    batch.delete(existingDoc.ref);
    deleted += 1;
    writes += 1;

    if (writes >= PRODUCT_SEARCH_WRITE_BATCH_LIMIT) {
      await commitAndResetBatch(batch, writes);
      batch = getDb().batch();
      writes = 0;
    }
  }

  for (
    let index = 0;
    index < candidatesToIndex.length;
    index += PRODUCT_SEARCH_EMBEDDING_REQUEST_CONCURRENCY
  ) {
    const chunk = candidatesToIndex.slice(
      index,
      index + PRODUCT_SEARCH_EMBEDDING_REQUEST_CONCURRENCY,
    );
    // Gemini Embedding 2 uses embedContent and returns one embedding per
    // request, so keep one product per request and limit parallelism here.
    const embeddings = await Promise.all(
      chunk.map((candidate) => embedProductSearchCandidate({ candidate })),
    );

    for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex++) {
      const candidate = chunk[chunkIndex];
      const embedding = embeddings[chunkIndex];
      if (
        !embedding ||
        embedding.length !== PRODUCT_SEARCH_EMBEDDING_DIMENSION
      ) {
        throw new Error(
          `Unexpected product embedding dimension for ${candidate.product.id}: ${embedding?.length ?? 0}`,
        );
      }

      batch.set(
        indexCollection.doc(candidate.indexDocId),
        createIndexDocument({ candidate, embedding }),
        { merge: true },
      );
      indexed += 1;
      writes += 1;

      if (writes >= PRODUCT_SEARCH_WRITE_BATCH_LIMIT) {
        await commitAndResetBatch(batch, writes);
        batch = getDb().batch();
        writes = 0;
      }
    }
  }

  await commitAndResetBatch(batch, writes);

  return {
    totalProducts: products.length,
    indexableProducts: candidates.length,
    indexed,
    skipped: candidates.length - candidatesToIndex.length,
    deleted,
    embeddingModel: PRODUCT_SEARCH_EMBEDDING_MODEL,
    embeddingDimension: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
  };
}

async function upsertProductSearchIndexDocument({
  channelId,
  sourceChannelId,
  product,
  attributes,
}: {
  channelId: string;
  sourceChannelId: string;
  product: Product;
  attributes: readonly Attribute[];
}): Promise<"indexed" | "skipped" | "deleted"> {
  const candidate = buildCandidates({
    channelId,
    attributes,
    products: [{ product, sourceChannelId }],
  })[0];

  if (!candidate) {
    await deleteProductSearchIndexDocument({
      channelId,
      sourceChannelId,
      productId: product.id,
    });
    return "deleted";
  }

  const indexDocument = getIndexCollection(channelId).doc(candidate.indexDocId);
  const existingDocument = await indexDocument.get();
  if (
    existingDocument.exists &&
    !shouldReindexCandidate({
      candidate,
      existingData: existingDocument.data(),
      force: false,
    })
  ) {
    return "skipped";
  }

  const embedding = await embedProductSearchCandidate({ candidate });
  if (embedding.length !== PRODUCT_SEARCH_EMBEDDING_DIMENSION) {
    throw new Error(
      `Expected ${PRODUCT_SEARCH_EMBEDDING_DIMENSION} dimensions but got ${embedding.length} for product "${product.name}" (${product.id}) in channel ${channelId}`,
    );
  }

  await indexDocument.set(createIndexDocument({ candidate, embedding }), {
    merge: true,
  });
  return "indexed";
}

/**
 * Refreshes the semantic product index after an admin product create/update/link
 * change, or removes stale entries after a delete/unpublish/unlink change.
 *
 * `previousLinkedChannelIds` should contain linked channel IDs from before the
 * product write so index entries for channels that were unlinked can be deleted.
 * The returned counters describe how many index documents were written, skipped,
 * or removed for the source channel and affected linked channels.
 */
export async function syncProductSemanticSearchIndexForProductWrite({
  channelId,
  productId,
  previousLinkedChannelIds = [],
}: {
  channelId: string;
  productId: string;
  previousLinkedChannelIds?: readonly string[];
}): Promise<ProductSemanticSearchIndexSyncResult> {
  const sourceChannelId = trimId(channelId);
  const trimmedProductId = trimId(productId);
  const product = await fetchProductById({
    channelId: sourceChannelId,
    productId: trimmedProductId,
  });
  const activeChannelIds = resolveAffectedChannelIds({
    sourceChannelId,
    product,
  });
  const allAffectedChannelIds = resolveAffectedChannelIds({
    sourceChannelId,
    product,
    previousLinkedChannelIds,
  });
  const shouldIndex = product ? isPurchasable(product) : false;
  const attributes = shouldIndex ? await fetchAttributes() : [];
  const result: ProductSemanticSearchIndexSyncResult = {
    indexed: 0,
    deleted: 0,
    skipped: 0,
    embeddingModel: PRODUCT_SEARCH_EMBEDDING_MODEL,
    embeddingDimension: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
  };

  for (const targetChannelId of allAffectedChannelIds) {
    if (
      !product ||
      !shouldIndex ||
      !activeChannelIds.includes(targetChannelId)
    ) {
      await deleteProductSearchIndexDocument({
        channelId: targetChannelId,
        sourceChannelId,
        productId: trimmedProductId,
      });
      result.deleted += 1;
      continue;
    }

    const action = await upsertProductSearchIndexDocument({
      channelId: targetChannelId,
      sourceChannelId,
      product,
      attributes,
    });

    result[action] += 1;
  }

  return result;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readDistance(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function searchSemanticProductIndex({
  channelId,
  query,
  limit = 40,
}: {
  channelId: string;
  query: string;
  limit?: number;
}): Promise<SemanticProductSearchHit[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  try {
    const embedding = await embedProductSearchText({
      text: `task: search result | query: ${trimmedQuery}`,
      context: `query "${trimmedQuery}"`,
    });

    if (embedding.length !== PRODUCT_SEARCH_EMBEDDING_DIMENSION) {
      console.warn(
        "[searchSemanticProductIndex] Unexpected query embedding dimension",
        {
          expected: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
          actual: embedding.length,
        },
      );
      return [];
    }

    const snapshot = await getIndexCollection(channelId)
      .findNearest({
        vectorField: PRODUCT_SEARCH_EMBEDDING_FIELD,
        queryVector: embedding,
        limit: Math.min(Math.max(1, Math.floor(limit)), 1000),
        distanceMeasure: "COSINE",
        distanceResultField: PRODUCT_SEARCH_DISTANCE_FIELD,
      })
      .get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const productId = readString(data.productId);
        const sourceChannelId = readString(data.sourceChannelId);
        const indexedChannelId = readString(data.channelId);

        if (
          !productId ||
          !sourceChannelId ||
          indexedChannelId !== channelId ||
          data.embeddingModel !== PRODUCT_SEARCH_EMBEDDING_MODEL ||
          data.embeddingDimension !== PRODUCT_SEARCH_EMBEDDING_DIMENSION
        ) {
          return null;
        }

        return {
          indexDocId: doc.id,
          productId,
          sourceChannelId,
          channelId: indexedChannelId,
          distance: readDistance(data[PRODUCT_SEARCH_DISTANCE_FIELD]),
        } satisfies SemanticProductSearchHit;
      })
      .filter((hit): hit is SemanticProductSearchHit => hit !== null);
  } catch (error) {
    console.warn(
      "[searchSemanticProductIndex] Falling back without semantic hits",
      {
        error,
        channelId,
      },
    );
    return [];
  }
}
