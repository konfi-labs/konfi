import "server-only";

import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { getAdminVertexLanguageModel } from "@/lib/ai/vertex-language-model.server";
import { getAdminDb, channelId } from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import { NestedMember } from "@konfi/types";
import { NoOutputGeneratedError, Output, generateText } from "ai";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  isSeoDraftGroundedInProduct,
  normalizeSeoDraft,
  sortSeoSuggestions,
} from "./seo-suggestions.utils";
import { ProductSeoSuggestion, StoredProductSeoSuggestion } from "./types";

const seoSuggestionsSubcollection = "seoSuggestions";
const seoSuggestionBatchSize = 4;
const seoSuggestionConcurrency = 2;
const firestoreBatchOperationLimit = 450;
const storeProductPageSize = 200;
const monthlySeoAutomationMember: NestedMember = {
  id: "instructions:monthly-seo-suggestions",
  name: "Monthly SEO automation",
};

const localizedTextSchema = z.object({
  en: z.string().min(1),
  pl: z.string().min(1),
});

const seoSuggestionGenerationSchema = z.object({
  productId: z.string().min(1),
  research: localizedTextSchema,
  suggestedSeo: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
  }),
});

const seoSuggestionBatchSchema = z.object({
  suggestions: z.array(seoSuggestionGenerationSchema),
});

const adminTimestampSchema = z.custom<Timestamp>((value) => {
  return (
    value instanceof Timestamp ||
    (typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof value.toDate === "function")
  );
});

const storedSeoSuggestionSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  currentSeo: z.object({
    title: z.string(),
    description: z.string(),
  }),
  suggestedSeo: z.object({
    title: z.string(),
    description: z.string(),
  }),
  research: z.record(z.string(), z.string()),
  appliedAt: adminTimestampSchema.optional(),
  appliedBy: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(),
});

const storeProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  category: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      slug: z.string().optional(),
    })
    .optional(),
  keywords: z.array(z.string()).optional(),
  specialNotes: z.string().optional(),
  active: z.boolean().optional(),
});

type StoreProductSummary = z.infer<typeof storeProductSchema>;

function getAdminFirestore() {
  return getAdminDb();
}

function getSeoSuggestionsCollection(changeId: string) {
  return getAdminFirestore()
    .collection("whatsNewFeed")
    .doc(changeId)
    .collection(seoSuggestionsSubcollection);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
) {
  if (items.length === 0) {
    return [] as R[];
  }

  const results = Array.from({ length: items.length }) as R[];
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const currentIndex = nextIndex++;
    if (currentIndex >= items.length) {
      return;
    }

    results[currentIndex] = await worker(items[currentIndex]);
    await runNext();
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runNext(),
    ),
  );

  return results;
}

function mapStoredSeoSuggestionToApi(
  suggestion: StoredProductSeoSuggestion,
): ProductSeoSuggestion {
  return {
    ...suggestion,
    appliedAt: suggestion.appliedAt?.toDate().toISOString(),
  };
}

async function getStoreChannelProducts() {
  if (!channelId) {
    console.error(
      "Store channel is not configured. Skipping monthly SEO suggestions.",
    );
    return [];
  }

  const firestore = getAdminFirestore();
  const products: StoreProductSummary[] = [];
  let cursor: string | undefined;

  while (true) {
    let productQuery = firestore
      .collection(`channels/${channelId}/products`)
      .where("active", "==", true)
      .orderBy(FieldPath.documentId())
      .limit(storeProductPageSize);

    if (cursor) {
      productQuery = productQuery.startAfter(cursor);
    }

    const snapshot = await productQuery.get();
    if (snapshot.empty) {
      break;
    }

    products.push(
      ...snapshot.docs
        .map((doc) =>
          storeProductSchema.safeParse({
            ...doc.data(),
            id: doc.id,
          }),
        )
        .filter((result) => result.success)
        .map((result) => result.data),
    );

    if (snapshot.size < storeProductPageSize) {
      break;
    }

    cursor = snapshot.docs[snapshot.docs.length - 1]?.id;
  }

  return products.toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function generateSeoSuggestionsChunk(
  products: StoreProductSummary[],
  marketResearch: string | undefined,
) {
  try {
    return await generateSeoSuggestionsChunkAttempt(products, marketResearch);
  } catch (error) {
    console.error(
      "Failed to generate monthly SEO suggestions with market context, retrying with product-only context:",
      {
        productIds: products.map((product) => product.id),
        error:
          error instanceof Error || NoOutputGeneratedError.isInstance(error)
            ? error.message
            : String(error),
      },
    );
  }

  try {
    return await generateSeoSuggestionsChunkAttempt(products, undefined);
  } catch (error) {
    console.error("Skipping monthly SEO suggestions chunk after retry:", {
      productIds: products.map((product) => product.id),
      error:
        error instanceof Error || NoOutputGeneratedError.isInstance(error)
          ? error.message
          : String(error),
    });
    return [];
  }
}

async function generateSeoSuggestionsChunkAttempt(
  products: StoreProductSummary[],
  marketResearch: string | undefined,
) {
  const aiModel = await getAdminVertexLanguageModel(MODELS.GEMINI_3_FLASH);
  const meteredGenerateText = createMeteredAdminGenerateText({
    channelId,
    generateText,
    model: MODELS.GEMINI_3_FLASH,
    provider: "google-vertex",
    source: "admin-action",
  });
  const productsJson = JSON.stringify(
    products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category?.name ?? "",
      currentSeo: normalizeSeoDraft(product.seo, product.name),
      keywords: product.keywords ?? [],
      specialNotes: product.specialNotes ?? "",
    })),
    null,
    2,
  );

  const { output } = await meteredGenerateText({
    model: aiModel,
    instructions: [
      "You create monthly SEO improvement suggestions for print shop products in Poland.",
      "Treat the provided products as the complete list of products that exist.",
      "Do not invent new products, product categories, bundles, kits, express variants, or seasonal services.",
      "Ignore seasonal or market opportunities that do not fit the provided product facts.",
      "For every provided product return:",
      "- a short research summary in English and Polish",
      "- a suggested SEO title and description in Polish for the base store SEO field",
      "Suggested SEO must describe only the provided product itself.",
      "Use the product name, category, keywords, or description as grounding facts.",
      "If no market opportunity fits a product, improve its evergreen SEO using only product facts.",
      "Keep research concise and practical.",
      "Keep titles and descriptions specific to the product intent.",
      'Return JSON in the shape: {"suggestions":[{"productId":"...","research":{"en":"...","pl":"..."},"suggestedSeo":{"title":"...","description":"..."}}]}',
      "Return valid JSON only.",
    ].join(" "),
    prompt: [
      marketResearch
        ? `Monthly market research context:\n${marketResearch}`
        : "No external market research was available.",
      `Products:\n${productsJson}`,
    ].join("\n\n"),
    output: Output.object({ schema: seoSuggestionBatchSchema }),
  });

  return output.suggestions;
}

async function replaceSeoSuggestions(
  changeId: string,
  suggestions: StoredProductSeoSuggestion[],
) {
  const firestore = getAdminFirestore();
  const collection = getSeoSuggestionsCollection(changeId);
  const existingDocs = await collection.get();
  const operations = [
    ...existingDocs.docs.map((doc) => ({
      type: "delete" as const,
      ref: doc.ref,
    })),
    ...suggestions.map((suggestion) => ({
      type: "set" as const,
      ref: collection.doc(suggestion.productId),
      data: suggestion,
    })),
  ];

  for (const operationChunk of chunkArray(
    operations,
    firestoreBatchOperationLimit,
  )) {
    const batch = firestore.batch();

    operationChunk.forEach((operation) => {
      if (operation.type === "delete") {
        batch.delete(operation.ref);
        return;
      }

      batch.set(operation.ref, operation.data);
    });

    await batch.commit();
  }
}

export async function generateMonthlySeoSuggestions(
  changeId: string,
  marketResearch: string | undefined,
) {
  const products = await getStoreChannelProducts();

  if (products.length === 0) {
    await replaceSeoSuggestions(changeId, []);
    return 0;
  }

  const generatedChunks = await runWithConcurrency(
    chunkArray(products, seoSuggestionBatchSize),
    async (chunk) => generateSeoSuggestionsChunk(chunk, marketResearch),
    seoSuggestionConcurrency,
  );

  const productById = new Map(products.map((product) => [product.id, product]));
  const generatedByProductId = new Map(
    generatedChunks
      .flat()
      .filter((suggestion) => {
        const product = productById.get(suggestion.productId);

        if (!product) {
          return false;
        }

        return isSeoDraftGroundedInProduct(suggestion.suggestedSeo, {
          name: product.name,
          category: product.category?.name,
          keywords: product.keywords,
        });
      })
      .map((suggestion) => [suggestion.productId, suggestion]),
  );

  const storedSuggestions = products.flatMap((product) => {
    const generated = generatedByProductId.get(product.id);

    if (!generated) {
      return [];
    }

    return [
      {
        productId: product.id,
        productName: product.name,
        currentSeo: normalizeSeoDraft(product.seo, product.name),
        suggestedSeo: normalizeSeoDraft(generated.suggestedSeo, product.name),
        research: generated.research,
      } satisfies StoredProductSeoSuggestion,
    ];
  });

  await replaceSeoSuggestions(changeId, storedSuggestions);

  return storedSuggestions.length;
}

export async function generateAndApplyMonthlySeoSuggestions(
  changeId: string,
  marketResearch: string | undefined,
) {
  const generatedCount = await generateMonthlySeoSuggestions(
    changeId,
    marketResearch,
  );

  if (generatedCount === 0) {
    return {
      generatedCount,
      appliedCount: 0,
      failedProducts: [],
    };
  }

  const applyResult = await applyAllMonthlySeoSuggestions(
    changeId,
    monthlySeoAutomationMember,
  );

  return {
    generatedCount,
    ...applyResult,
  };
}

export async function listMonthlySeoSuggestions(changeId: string) {
  const snapshot = await getSeoSuggestionsCollection(changeId).get();

  const suggestions = snapshot.docs
    .map((doc) => storedSeoSuggestionSchema.safeParse(doc.data()))
    .filter((result) => result.success)
    .map((result) => mapStoredSeoSuggestionToApi(result.data));

  return sortSeoSuggestions(suggestions);
}

async function getSuggestionForProduct(changeId: string, productId: string) {
  const doc = await getSeoSuggestionsCollection(changeId).doc(productId).get();

  if (!doc.exists) {
    throw new Error("SEO suggestion not found.");
  }

  const parsed = storedSeoSuggestionSchema.safeParse(doc.data());
  if (!parsed.success) {
    throw new Error("Invalid SEO suggestion payload.");
  }

  return {
    ref: doc.ref,
    suggestion: parsed.data,
  };
}

export async function applyMonthlySeoSuggestion(
  changeId: string,
  productId: string,
  appliedBy: NestedMember,
) {
  if (!channelId) {
    throw new Error("Store channel is not configured.");
  }

  const firestore = getAdminFirestore();
  const { ref, suggestion } = await getSuggestionForProduct(
    changeId,
    productId,
  );
  const productRef = firestore.doc(
    `channels/${channelId}/products/${productId}`,
  );
  const productDoc = await productRef.get();

  if (!productDoc.exists) {
    throw new Error("Product not found.");
  }

  const appliedAt = Timestamp.now();

  await productRef.set(
    {
      seo: {
        title: suggestion.suggestedSeo.title,
        description: suggestion.suggestedSeo.description,
      },
      updatedAt: appliedAt,
      updatedBy: appliedBy,
    },
    { merge: true },
  );

  await ref.set(
    {
      appliedAt,
      appliedBy,
    },
    { merge: true },
  );

  return {
    productId,
    productName: suggestion.productName,
  };
}

export async function applyAllMonthlySeoSuggestions(
  changeId: string,
  appliedBy: NestedMember,
) {
  const suggestions = await listMonthlySeoSuggestions(changeId);
  const pendingSuggestions = suggestions.filter(
    (suggestion) => !suggestion.appliedAt,
  );

  const results = await runWithConcurrency(
    pendingSuggestions,
    async (suggestion) => {
      try {
        await applyMonthlySeoSuggestion(
          changeId,
          suggestion.productId,
          appliedBy,
        );
        return {
          success: true,
          error: null,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    seoSuggestionConcurrency,
  );

  return {
    appliedCount: results.filter((result) => result.success).length,
    failedProducts: results
      .filter((result) => !result.success && result.error)
      .map((result) => result.error as string),
  };
}
