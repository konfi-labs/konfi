import "server-only";

import { productsSuggestionFlow } from "@/lib/ai/product-suggestion/flow";
import type { ProductWithAttributes } from "@/lib/ai/product-suggestion/types";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  getProductSearchIndexDocumentId,
  searchSemanticProductIndex,
} from "@/lib/product-search/semantic-product-index";
import { MODELS } from "@konfi/firebase";
import { searchProductsIndex } from "@konfi/meilisearch";
import type { Attribute, FormattedOrderItem, Product } from "@konfi/types";
import { getAttributes, isPurchasable } from "@konfi/utils";
import { Firestore as AdminFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import {
  normalizeProductSearchQueries,
  PRODUCT_SEARCH_QUERY_LIMIT,
  rankProductSearchResults,
  scoreProductSearchMatch,
} from "./product-discovery-ranking";

const PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT = 20;
const PRODUCT_SEARCH_FULL_CATALOG_FALLBACK_LIMIT = 150;
const PRODUCT_SEARCH_QUERY_CATALOG_TERM_LIMIT = 200;

interface AiUsageContext {
  channelId?: string | undefined;
  tenantId?: string | null | undefined;
}

export {
  normalizeProductSearchQueries,
  rankProductSearchResults,
  scoreProductSearchMatch,
} from "./product-discovery-ranking";

function getAdminFirestore(): AdminFirestore {
  return getAdminDb();
}

async function getAiRuntime(context: AiUsageContext = {}) {
  const runtime = await import("ai");

  return {
    ...runtime,
    generateText: createMeteredAdminGenerateText({
      channelId: context.channelId,
      generateText: runtime.generateText,
      model: MODELS.GEMINI_3_FLASH_LITE,
      provider: "google-vertex",
      source: "agent",
      tenantId: context.tenantId,
    }),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

function buildProductSearchCatalogTerms(
  products: readonly Product[],
): string[] {
  return uniqueStrings([
    ...products.map((product) => product.name),
    ...products.map((product) => product.category?.name ?? ""),
    ...products.map((product) => product.seo?.title ?? ""),
    ...products.flatMap((product) => product.keywords ?? []),
  ]).slice(0, PRODUCT_SEARCH_QUERY_CATALOG_TERM_LIMIT);
}

export async function suggestProductSearchQueries({
  channelId,
  products,
  query,
  tenantId,
}: {
  channelId?: string;
  products: readonly Product[];
  query: string;
  tenantId?: string;
}): Promise<string[]> {
  const fallbackQueries = normalizeProductSearchQueries({ query });
  if (fallbackQueries.length === 0) {
    return [];
  }

  const catalogTerms = buildProductSearchCatalogTerms(products);
  if (catalogTerms.length === 0) {
    return fallbackQueries;
  }

  const { generateText, Output } = await getAiRuntime({ channelId, tenantId });
  const { getAdminVertexLanguageModel } = await import(
    "@/lib/ai/vertex-language-model.server"
  );
  const model = await getAdminVertexLanguageModel(MODELS.GEMINI_3_FLASH_LITE);
  const schema = z.object({
    queries: z
      .array(z.string())
      .max(PRODUCT_SEARCH_QUERY_LIMIT)
      .describe(
        "Short catalog search queries ordered from most to least useful.",
      ),
  });

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      instructions: [
        "Generate search queries for finding matching products in a catalog.",
        "Use the customer's request and the available catalog terms.",
        "Return short queries that are likely to retrieve the right sellable product candidates.",
        "If the customer uses an action or vague wording, choose plausible catalog noun phrases from the provided catalog terms.",
        "Preserve requested product type, size, quantity, paper, sidedness, color, finishing, and urgency constraints where they affect product choice.",
        "For requests with multiple products or multiple sizes, do not collapse the request into a query that can only match one requested item.",
        "Do not output product IDs. Do not invent products that are not supported by the catalog terms.",
      ].join("\n"),
      prompt: JSON.stringify({
        customerRequest: query,
        catalogTerms,
      }),
      maxRetries: 0,
      timeout: 20_000,
    });

    return normalizeProductSearchQueries({
      generatedQueries: output.queries,
      query,
    });
  } catch (error) {
    console.error(
      "[suggestProductSearchQueries] Failed to generate product search queries:",
      error,
    );
    return fallbackQueries;
  }
}

function productFromSnapshot(
  snapshot: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  fallbackChannelId?: string,
): Product {
  const product = snapshot.data() as Product;
  const sourceChannelId = snapshot.ref.parent.parent?.id;

  return {
    ...product,
    channelId: product.channelId ?? sourceChannelId ?? fallbackChannelId,
    id: product.id || snapshot.id,
  };
}

export async function loadActivePublishedCatalogProducts({
  channelId,
  firestore = getAdminFirestore(),
  tenantId,
}: {
  channelId: string;
  firestore?: AdminFirestore;
  tenantId?: string;
}): Promise<Product[]> {
  const productsRef = firestore.collection(`channels/${channelId}/products`);
  let productsQuery = productsRef
    .where("active", "==", true)
    .where("availability.published", "==", true);
  if (tenantId) {
    productsQuery = productsQuery.where("tenantId", "==", tenantId);
  }

  const productsSnapshot = await productsQuery.limit(999).get();

  let linkedQuery = firestore
    .collectionGroup("products")
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .where("linkedChannels", "array-contains", channelId);
  if (tenantId) {
    linkedQuery = linkedQuery.where("tenantId", "==", tenantId);
  }

  const linkedSnapshot = await linkedQuery.limit(999).get();

  return Array.from(
    new Map(
      [...productsSnapshot.docs, ...linkedSnapshot.docs].map((snapshot) => {
        const product = productFromSnapshot(snapshot, channelId);
        return [`${product.channelId ?? channelId}:${product.id}`, product];
      }),
    ).values(),
  );
}

export interface ProductCandidateSelectionResult {
  fullTextMatched: boolean;
  indexedMatched: boolean;
  products: Product[];
  usedFullCatalogFallback: boolean;
}

export function selectProductSearchCandidates({
  indexedProductIds,
  limit = PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT,
  products,
  query,
}: {
  indexedProductIds?: readonly string[];
  limit?: number;
  products: readonly Product[];
  query: string;
}): ProductCandidateSelectionResult {
  const searchableProducts = products.filter((product) =>
    isPurchasable(product),
  );
  const rankedProducts = rankProductSearchResults(query, searchableProducts);
  const fullTextProducts = rankedProducts.filter(
    (product) => scoreProductSearchMatch(query, product) > 0,
  );
  const indexedIdSet = new Set(indexedProductIds ?? []);
  const indexedProducts = rankedProducts.filter((product) =>
    indexedIdSet.has(product.id),
  );
  const usedFullCatalogFallback =
    indexedProducts.length === 0 &&
    fullTextProducts.length === 0 &&
    searchableProducts.length <= PRODUCT_SEARCH_FULL_CATALOG_FALLBACK_LIMIT;
  const mergedProducts = usedFullCatalogFallback
    ? rankedProducts
    : Array.from(
        new Map(
          [...indexedProducts, ...fullTextProducts].map((product) => [
            product.id,
            product,
          ]),
        ).values(),
      );

  return {
    fullTextMatched: fullTextProducts.length > 0,
    indexedMatched: indexedProducts.length > 0,
    products: mergedProducts.slice(0, limit),
    usedFullCatalogFallback,
  };
}

export interface ProductDiscoveryResult {
  catalogCandidateCount: number;
  fullTextMatched: boolean;
  generatedSearchQueries: string[];
  indexedMatched: boolean;
  products: Product[];
  purchasableProductCount: number;
  totalProductCount: number;
  usedFullCatalogFallback: boolean;
}

export async function discoverProductCandidates({
  channelId,
  firestore,
  limit = PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT,
  query,
  tenantId,
  useAiQueryExpansion = false,
}: {
  channelId: string;
  firestore?: AdminFirestore;
  limit?: number;
  query: string;
  tenantId?: string;
  useAiQueryExpansion?: boolean;
}): Promise<ProductDiscoveryResult> {
  const allProducts = await loadActivePublishedCatalogProducts({
    channelId,
    firestore,
    ...(tenantId ? { tenantId } : {}),
  });
  const searchableProducts = allProducts.filter((product) =>
    isPurchasable(product),
  );
  const generatedSearchQueries = useAiQueryExpansion
    ? await suggestProductSearchQueries({
        channelId,
        products: searchableProducts,
        query,
        ...(tenantId ? { tenantId } : {}),
      })
    : normalizeProductSearchQueries({ query });
  const rankQuery = generatedSearchQueries.join(" ");
  const productsBySemanticIndexId = new Map<string, Product>(
    searchableProducts.map((product) => [
      getProductSearchIndexDocumentId({
        sourceChannelId: product.channelId ?? channelId,
        productId: product.id,
      }),
      product,
    ]),
  );
  const semanticHits = (
    await Promise.all(
      generatedSearchQueries.map((searchQuery) =>
        searchSemanticProductIndex({
          channelId,
          query: searchQuery,
          limit: PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT,
        }).catch(() => []),
      ),
    )
  ).flat();
  const semanticProductIds = semanticHits
    .map((hit) => productsBySemanticIndexId.get(hit.indexDocId)?.id)
    .filter((productId): productId is string => Boolean(productId));
  const meilisearchProductIds = (
    await Promise.all(
      generatedSearchQueries.map((searchQuery) =>
        searchProductsIndex(searchQuery, channelId, undefined, tenantId).catch(
          () => [] as string[],
        ),
      ),
    )
  ).flat();
  const candidateSelection = selectProductSearchCandidates({
    indexedProductIds: [...semanticProductIds, ...meilisearchProductIds],
    limit,
    products: searchableProducts,
    query: rankQuery || query,
  });

  return {
    catalogCandidateCount: candidateSelection.products.length,
    fullTextMatched: candidateSelection.fullTextMatched,
    generatedSearchQueries,
    indexedMatched: candidateSelection.indexedMatched,
    products: candidateSelection.products,
    purchasableProductCount: searchableProducts.length,
    totalProductCount: allProducts.length,
    usedFullCatalogFallback: candidateSelection.usedFullCatalogFallback,
  };
}

export function buildProductSuggestionInputs({
  attributes,
  products,
}: {
  attributes: readonly Attribute[];
  products: readonly Product[];
}): ProductWithAttributes[] {
  const productsWithAttributes: ProductWithAttributes[] = [];

  for (const product of products) {
    const productAttributes = getAttributes(
      attributes as Attribute[],
      product.attributes ?? [],
      product.attributeOptions ?? {},
    );

    if (!productAttributes) continue;

    productsWithAttributes.push({
      productId: product.id,
      productName: product.name,
      attributesWithOptions: productAttributes.map((attribute) => ({
        attributeName: attribute.name,
        options: attribute.options.map((option) => option.label),
      })),
    });
  }

  return productsWithAttributes;
}

export interface SuggestedOrderItemsResult {
  catalogCandidateCount: number;
  count: number;
  fullTextMatched: boolean;
  indexedMatched: boolean;
  items: FormattedOrderItem[];
  notes: string[];
  totalAvailable: number;
  usedFullCatalogFallback: boolean;
}

export async function suggestOrderItemsFromCatalog({
  attributes,
  channelId,
  limit = PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT,
  query,
  tenantId,
}: {
  attributes: readonly Attribute[];
  channelId: string;
  limit?: number;
  query: string;
  tenantId?: string;
}): Promise<SuggestedOrderItemsResult> {
  if (attributes.length === 0) {
    return {
      catalogCandidateCount: 0,
      count: 0,
      fullTextMatched: false,
      indexedMatched: false,
      items: [],
      notes: ["No attributes found for the channel."],
      totalAvailable: 0,
      usedFullCatalogFallback: false,
    };
  }

  const discovery = await discoverProductCandidates({
    channelId,
    limit,
    query,
    ...(tenantId ? { tenantId } : {}),
    useAiQueryExpansion: true,
  });

  if (discovery.products.length === 0) {
    return {
      catalogCandidateCount: 0,
      count: 0,
      fullTextMatched: discovery.fullTextMatched,
      indexedMatched: discovery.indexedMatched,
      items: [],
      notes: ["No product candidates found for the query."],
      totalAvailable: discovery.purchasableProductCount,
      usedFullCatalogFallback: discovery.usedFullCatalogFallback,
    };
  }

  const productNamesWithAttributes = buildProductSuggestionInputs({
    attributes,
    products: discovery.products,
  });

  if (productNamesWithAttributes.length === 0) {
    return {
      catalogCandidateCount: 0,
      count: 0,
      fullTextMatched: discovery.fullTextMatched,
      indexedMatched: discovery.indexedMatched,
      items: [],
      notes: ["No configurable purchasable product candidates found."],
      totalAvailable: discovery.purchasableProductCount,
      usedFullCatalogFallback: discovery.usedFullCatalogFallback,
    };
  }

  const items = await productsSuggestionFlow({
    channelId,
    question: query,
    productNamesWithAttributes,
    ...(tenantId ? { tenantId } : {}),
  });

  return {
    catalogCandidateCount: productNamesWithAttributes.length,
    count: items.length,
    fullTextMatched: discovery.fullTextMatched,
    indexedMatched: discovery.indexedMatched,
    items,
    notes: items.length > 0 ? [] : ["No matching order items were suggested."],
    totalAvailable: discovery.purchasableProductCount,
    usedFullCatalogFallback: discovery.usedFullCatalogFallback,
  };
}
