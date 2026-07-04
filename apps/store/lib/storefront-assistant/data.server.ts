import "server-only";

import {
  getAdminDb,
  getAppForServer,
  getStoreRuntimeConfigForRequest,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { getStoreVertexClient } from "@/lib/ai/server-vertex";
import {
  estimateAiUsageTextTokens,
  runMeteredAiText,
} from "@/lib/ai/usage-metering";
import {
  readRuntimeString,
  type StoreRuntimeConfig,
} from "@/lib/runtime-config";
import { searchStorefrontProducts } from "@/lib/search/product-search.server";
import { getPageContent } from "@konfi/firebase";
import { Locale, Product, dbPageContent } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  isPurchasable,
  STORE_CONTACT,
  T_STORE_ABOUT_US,
  T_STORE_CONTACT,
  T_STORE_COOPERATION,
  T_STORE_FAQ,
  T_STORE_GENERAL_CONDITIONS_OF_SALE,
  T_STORE_REASONS_FOR_REJECTIONS,
  T_STORE_REGULATIONS,
} from "@konfi/utils";
import {
  StorefrontAssistantContact,
  StorefrontAssistantPageContent,
  StorefrontAssistantPageRoute,
  StorefrontAssistantProduct,
} from "./types";
import { MODELS } from "@konfi/firebase";
import { Output, embed, generateText } from "ai";
import { z } from "zod";

const MAX_PAGE_CONTENT_LENGTH = 2400;
const PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT = 20;
const PRODUCT_SEARCH_INDEX_COLLECTION = "productsIndex";
const PRODUCT_SEARCH_EMBEDDING_FIELD = "embedding";
const PRODUCT_SEARCH_DISTANCE_FIELD = "distance";
const PRODUCT_SEARCH_EMBEDDING_MODEL = "gemini-embedding-2";
const PRODUCT_SEARCH_EMBEDDING_DIMENSION = 768;
const PAGE_CONTENT_IDS: Record<StorefrontAssistantPageRoute, string> = {
  "about-us": T_STORE_ABOUT_US,
  cooperation: T_STORE_COOPERATION,
  "help/contact": T_STORE_CONTACT,
  "help/faq": T_STORE_FAQ,
  "help/general-conditions-of-sale": T_STORE_GENERAL_CONDITIONS_OF_SALE,
  "help/reasons-for-rejections": T_STORE_REASONS_FOR_REJECTIONS,
  "help/regulations": T_STORE_REGULATIONS,
};

interface PublicStorefrontProductCandidate {
  key: string;
  product: Product;
  publicProduct: StorefrontAssistantProduct;
  sourceChannelId: string;
}

function getPublicStorefrontContact(
  locale: Locale,
  runtimeConfig?: StoreRuntimeConfig | null,
): StorefrontAssistantContact {
  return {
    companyName:
      readRuntimeString(
        runtimeConfig?.legal,
        "legalCompanyName",
        "legalName",
        "companyName",
        "name",
      ) ?? process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME,
    streetAddress:
      readRuntimeString(runtimeConfig?.legal, "streetAddress", "street") ??
      process.env.NEXT_PUBLIC_COMPANY_STREET_ADDRESS,
    postalCode:
      readRuntimeString(runtimeConfig?.legal, "postalCode", "zip") ??
      process.env.NEXT_PUBLIC_COMPANY_POSTAL_CODE,
    city:
      readRuntimeString(runtimeConfig?.legal, "city", "addressLocality") ??
      process.env.NEXT_PUBLIC_COMPANY_CITY,
    phone:
      readRuntimeString(runtimeConfig?.contact, "phoneNumber", "phone") ??
      process.env.NEXT_PUBLIC_COMPANY_PHONE_NUMBER,
    email:
      readRuntimeString(
        runtimeConfig?.contact,
        "contactMail",
        "email",
        "mail",
      ) ??
      process.env.NEXT_PUBLIC_CONTACT_MAIL ??
      process.env.NEXT_PUBLIC_COMPANY_MAIL,
    contactUrl: `/${locale}${STORE_CONTACT}`,
  };
}

function compactContent(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function encodeIndexIdPart(value: string) {
  return encodeURIComponent(value).replace(/\./g, "%2E");
}

function getProductSearchIndexDocumentId({
  productId,
  sourceChannelId,
}: {
  productId: string;
  sourceChannelId: string;
}) {
  return `${encodeIndexIdPart(sourceChannelId)}__${encodeIndexIdPart(productId)}`;
}

function includesSearchText(value: string | undefined, query: string): boolean {
  return Boolean(value?.toLocaleLowerCase().includes(query));
}

function matchesProductText(
  product: StorefrontAssistantProduct,
  query: string,
): boolean {
  return (
    includesSearchText(product.name, query) ||
    includesSearchText(product.category, query) ||
    includesSearchText(product.description, query) ||
    includesSearchText(product.url, query)
  );
}

function getGenericBusinessCardPriority(
  product: StorefrontAssistantProduct,
  query: string,
): number {
  const isGenericBusinessCardQuery =
    (query.includes("wizytówki") || query.includes("wizytowki")) &&
    !query.includes("standard") &&
    !query.includes("premium") &&
    !query.includes("ozdob");

  if (!isGenericBusinessCardQuery) return 0;

  const name = product.name.toLocaleLowerCase();
  const url = product.url.toLocaleLowerCase();

  if (name.includes("standard") || url.includes("standard")) return 3;
  if (name.includes("premium") || url.includes("premium")) return 2;
  if (name.includes("ozdob") || url.includes("ozdob")) return 1;

  return 0;
}

function toPublicProduct(
  product: Product,
  locale: Locale,
): StorefrontAssistantProduct {
  const slug = product.seo?.slug || product.id;

  return {
    name: product.name,
    description: product.seo?.description || product.description,
    category: product.category?.name,
    url: `/${locale}/products/${slug}`,
  };
}

function toPublicProductCandidate({
  locale,
  product,
  sourceChannelId,
}: {
  locale: Locale;
  product: Product;
  sourceChannelId: string;
}): PublicStorefrontProductCandidate {
  return {
    key: getProductSearchIndexDocumentId({
      productId: product.id,
      sourceChannelId,
    }),
    product,
    publicProduct: toPublicProduct(product, locale),
    sourceChannelId,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function getPublicStorefrontProductCandidates(
  locale: Locale,
  channelId: string,
): Promise<PublicStorefrontProductCandidate[]> {
  if (!channelId) {
    return [];
  }

  const targetChannelId = channelId;
  const directSnapshot = await getAdminDb()
    .collection(`channels/${targetChannelId}/products`)
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .limit(999)
    .get();
  const linkedSnapshot = await getAdminDb()
    .collectionGroup("products")
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .where("linkedChannels", "array-contains", channelId)
    .limit(999)
    .get();

  return [...directSnapshot.docs, ...linkedSnapshot.docs]
    .map((doc) => {
      const product = doc.data() as Product;
      const sourceChannelId =
        doc.ref.parent.parent?.id ?? product.channelId ?? targetChannelId;

      return {
        product: {
          ...product,
          id: product.id || doc.id,
          channelId: product.channelId ?? sourceChannelId,
        },
        sourceChannelId,
      };
    })
    .filter(({ product }) => isPurchasable(product))
    .map(({ product, sourceChannelId }) =>
      toPublicProductCandidate({ locale, product, sourceChannelId }),
    );
}

async function generateProductSearchQueries(query: string): Promise<string[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  try {
    const vertex = await getStoreVertexClient();
    const schema = z.object({
      queries: z
        .array(z.string().min(1).max(120))
        .min(1)
        .max(4)
        .describe("Short catalog search phrases."),
    });
    const aiPrompt = [
      "Convert the customer storefront message into concise product catalog search queries.",
      "Return only phrases that should be useful for product search.",
      "If the user asks for a generic product family, include likely default product variants when useful.",
      "Examples:",
      'Customer: "wizytówki" -> ["wizytówki standardowe", "wizytówki premium", "wizytówki"]',
      'Customer: "500 ulotek A5 dwustronnie" -> ["ulotki A5 dwustronne", "ulotki"]',
      `Customer: ${trimmedQuery}`,
    ].join("\n");
    const tenantContext = await getTenantContextForRequest();
    const { output } = await runMeteredAiText({
      estimatedTotalTokens: estimateAiUsageTextTokens(aiPrompt),
      metering: {
        context: tenantContext,
        firestore: getAdminDb(),
        model: MODELS.GEMINI_3_FLASH_LITE,
        provider: "google-vertex",
        source: "storefront-assistant",
      },
      run: () =>
        generateText({
          model: vertex(MODELS.GEMINI_3_FLASH_LITE),
          output: Output.object({ schema }),
          prompt: aiPrompt,
          temperature: 0,
        }),
    });

    return Array.from(
      new Set([
        ...output.queries.map((item) => item.trim()).filter(Boolean),
        trimmedQuery,
      ]),
    ).slice(0, 5);
  } catch (error) {
    console.warn("[storefrontAssistant] Product query generation failed", {
      error,
    });
    return [trimmedQuery];
  }
}

async function searchSemanticPublicStorefrontProductKeys({
  channelId,
  limit,
  queries,
}: {
  channelId: string;
  limit: number;
  queries: readonly string[];
}): Promise<string[]> {
  if (!channelId) {
    return [];
  }

  try {
    const vertex = await getStoreVertexClient();
    const keys: string[] = [];

    for (const query of queries) {
      const { embedding } = await embed({
        model: vertex.embeddingModel(PRODUCT_SEARCH_EMBEDDING_MODEL),
        value: `task: search result | query: ${query.trim()}`,
        maxRetries: 1,
      });

      if (embedding.length !== PRODUCT_SEARCH_EMBEDDING_DIMENSION) {
        console.warn(
          "[storefrontAssistant] Semantic query embedding mismatch",
          {
            actual: embedding.length,
            expected: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
          },
        );
        continue;
      }

      const snapshot = await getAdminDb()
        .collection(`channels/${channelId}/${PRODUCT_SEARCH_INDEX_COLLECTION}`)
        .findNearest({
          vectorField: PRODUCT_SEARCH_EMBEDDING_FIELD,
          queryVector: embedding,
          limit: Math.min(Math.max(limit, 1), 40),
          distanceMeasure: "COSINE",
          distanceResultField: PRODUCT_SEARCH_DISTANCE_FIELD,
        })
        .get();

      for (const doc of snapshot.docs) {
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
          continue;
        }

        keys.push(
          getProductSearchIndexDocumentId({ productId, sourceChannelId }),
        );
      }
    }

    return Array.from(new Set(keys));
  } catch (error) {
    console.warn("[storefrontAssistant] Semantic product search unavailable", {
      error,
      channelId,
    });
    return [];
  }
}

async function searchIndexedPublicProductIds({
  channelId,
  queries,
  tenantContext,
}: {
  channelId: string;
  queries: readonly string[];
  tenantContext: TenantContext;
}): Promise<string[]> {
  if (!channelId) return [];
  const targetChannelId = channelId;
  const { firestore } = await getAppForServer();

  const results = await Promise.allSettled(
    queries.map((query) =>
      searchStorefrontProducts({
        channelId: targetChannelId,
        firestore,
        limit: PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT,
        query,
        tenantContext,
      }),
    ),
  );

  return Array.from(
    new Set(
      results.flatMap((result) =>
        result.status === "fulfilled"
          ? result.value.map((product) => product.id)
          : [],
      ),
    ),
  );
}

async function selectPublicStorefrontProducts({
  candidates,
  limit,
  query,
  searchQueries,
}: {
  candidates: readonly PublicStorefrontProductCandidate[];
  limit: number;
  query: string;
  searchQueries: readonly string[];
}): Promise<StorefrontAssistantProduct[]> {
  if (candidates.length <= limit) {
    return candidates.map((candidate) => candidate.publicProduct);
  }

  try {
    const vertex = await getStoreVertexClient();
    const candidateIds = new Set(candidates.map((candidate) => candidate.key));
    const schema = z.object({
      productIds: z
        .array(z.string())
        .max(limit)
        .describe("IDs of the best matching products from the candidates."),
    });
    const aiPrompt = [
      "Pick the best public storefront products for the customer's request.",
      "Use only candidate IDs from the list. Prefer direct, common products over adjacent accessories when the request is generic.",
      "If none of the candidates clearly match the request, return an empty productIds array. Do not select loosely related products just to fill the limit.",
      `Customer request: ${query}`,
      `Search queries used: ${JSON.stringify(searchQueries)}`,
      `Candidates: ${JSON.stringify(
        candidates.map((candidate) => ({
          id: candidate.key,
          name: candidate.publicProduct.name,
          category: candidate.publicProduct.category,
          description: candidate.publicProduct.description,
          url: candidate.publicProduct.url,
        })),
      )}`,
    ].join("\n");
    const tenantContext = await getTenantContextForRequest();
    const { output } = await runMeteredAiText({
      estimatedTotalTokens: estimateAiUsageTextTokens(aiPrompt),
      metering: {
        context: tenantContext,
        firestore: getAdminDb(),
        model: MODELS.GEMINI_3_FLASH_LITE,
        provider: "google-vertex",
        source: "storefront-assistant",
      },
      run: () =>
        generateText({
          model: vertex(MODELS.GEMINI_3_FLASH_LITE),
          output: Output.object({ schema }),
          prompt: aiPrompt,
          temperature: 0,
        }),
    });

    const selectedIds = output.productIds.filter((id) => candidateIds.has(id));
    if (selectedIds.length === 0) {
      return candidates
        .slice(0, limit)
        .map((candidate) => candidate.publicProduct);
    }

    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.key, candidate]),
    );

    return selectedIds
      .map((id) => candidatesById.get(id)?.publicProduct)
      .filter((product): product is StorefrontAssistantProduct =>
        Boolean(product),
      );
  } catch (error) {
    console.warn("[storefrontAssistant] Product candidate selection failed", {
      error,
    });
    return candidates
      .slice(0, limit)
      .map((candidate) => candidate.publicProduct);
  }
}

export async function searchPublicStorefrontProducts({
  limit = 5,
  locale,
  query,
}: {
  limit?: number;
  locale: Locale;
  query: string;
}): Promise<StorefrontAssistantProduct[]> {
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    return [];
  }

  const channelId = runtimeConfig.channelId;
  const candidates = await getPublicStorefrontProductCandidates(
    locale,
    channelId,
  );
  const searchQuery = query.trim().toLocaleLowerCase();

  if (!searchQuery) {
    return candidates
      .slice(0, limit)
      .map((candidate) => candidate.publicProduct);
  }

  const searchQueries = await generateProductSearchQueries(query);
  const [semanticKeys, indexedProductIds] = await Promise.all([
    searchSemanticPublicStorefrontProductKeys({
      channelId,
      limit: PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT,
      queries: searchQueries,
    }),
    searchIndexedPublicProductIds({
      channelId,
      queries: searchQueries,
      tenantContext: runtimeConfig.tenantContext,
    }),
  ]);
  const candidatesByKey = new Map(
    candidates.map((candidate) => [candidate.key, candidate]),
  );
  const candidatesByProductId = new Map<
    string,
    PublicStorefrontProductCandidate[]
  >();

  for (const candidate of candidates) {
    const existing = candidatesByProductId.get(candidate.product.id) ?? [];
    existing.push(candidate);
    candidatesByProductId.set(candidate.product.id, existing);
  }

  const semanticProducts = semanticKeys
    .map((key) => candidatesByKey.get(key))
    .filter((candidate): candidate is PublicStorefrontProductCandidate =>
      Boolean(candidate),
    );
  const indexedProducts = indexedProductIds.flatMap(
    (id) => candidatesByProductId.get(id) ?? [],
  );
  const lexicalProducts = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      priority: getGenericBusinessCardPriority(
        candidate.publicProduct,
        searchQuery,
      ),
    }))
    .filter(
      (item) =>
        item.priority > 0 ||
        searchQueries.some((itemQuery) =>
          matchesProductText(
            item.candidate.publicProduct,
            itemQuery.toLocaleLowerCase(),
          ),
        ),
    )
    .toSorted(
      (left, right) =>
        right.priority - left.priority || left.index - right.index,
    )
    .map((item) => item.candidate);
  const shortlistedCandidates = Array.from(
    new Map(
      [...semanticProducts, ...indexedProducts, ...lexicalProducts].map(
        (candidate) => [candidate.key, candidate],
      ),
    ).values(),
  ).slice(0, PRODUCT_SEARCH_CANDIDATE_POOL_LIMIT);

  return selectPublicStorefrontProducts({
    candidates: shortlistedCandidates,
    limit,
    query,
    searchQueries,
  });
}

function toContentText(content: dbPageContent["content"]) {
  return compactContent(content.map((item) => item.value).join("\n")).slice(
    0,
    MAX_PAGE_CONTENT_LENGTH,
  );
}

export async function getPublicStorePageContent({
  locale,
  route,
}: {
  locale: Locale;
  route: StorefrontAssistantPageRoute;
}): Promise<StorefrontAssistantPageContent> {
  const runtimeConfig = await getStoreRuntimeConfigForRequest();
  const channelId = runtimeConfig?.channelId;
  const hasChannel = Boolean(channelId);
  const fallbackContact =
    route === "help/contact"
      ? getPublicStorefrontContact(locale, runtimeConfig)
      : undefined;

  if (!hasChannel || !channelId) {
    return {
      contact: fallbackContact,
      content: "",
      route,
      url: `/${locale}/${route}`,
    };
  }

  const getFirestore = (await import("firebase/firestore")).getFirestore;
  const { firebaseServerApp } = await getAppForServer();
  const firestore = getFirestore(firebaseServerApp);
  const pageContent = await getPageContent(
    firestore,
    PAGE_CONTENT_IDS[route],
    locale,
    channelId,
  );

  return {
    contact: fallbackContact,
    content: toContentText(pageContent?.content ?? []),
    route,
    url: `/${locale}/${route}`,
  };
}
