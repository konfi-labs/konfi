import { getAdminDb, getFirebaseAdminApp } from "@/lib/firebase/serverApp";
import { getAdminVertexLanguageModel } from "@/lib/ai/vertex-language-model.server";
import { getAuthenticatedAdminUid } from "@/actions/auth-utils";
import { MODELS } from "@konfi/firebase";
import type { Product, Price, ProductPrice } from "@konfi/types";
import { Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { buildPageCountPriceDocumentId } from "@konfi/utils";

/**
 * Get Firestore instance
 */
export function getDb() {
  return getAdminDb();
}

export async function getAuthenticatedAdminMember(): Promise<{
  id: string;
  name: string;
}> {
  const uid = await getAuthenticatedAdminUid();

  try {
    const user = await getAuth(getFirebaseAdminApp()).getUser(uid);

    return {
      id: uid,
      name: user.displayName || user.email || "Admin",
    };
  } catch (error) {
    console.error("Error loading authenticated admin member:", error);

    return {
      id: uid,
      name: "Admin",
    };
  }
}

export async function replaceProductPriceSubcollection(options: {
  channelId: string;
  groupedPrices: Array<{
    calculatedCombination: string;
    pageCount?: number;
    prices: Price[];
  }>;
  productId: string;
  subcollectionName?:
    | "pageCountPrices"
    | "pageCountSegmentStepPrices"
    | "pageCountStepPrices"
    | "prices";
}) {
  const {
    channelId,
    groupedPrices,
    productId,
    subcollectionName = "prices",
  } = options;
  const db = getDb();
  const productPricesCollection = db.collection(
    `channels/${channelId}/products/${productId}/${subcollectionName}`,
  );
  const existingPriceDocuments = await productPricesCollection.listDocuments();
  const batchSize = 400;

  for (
    let index = 0;
    index < existingPriceDocuments.length;
    index += batchSize
  ) {
    const batch = db.batch();

    for (const documentRef of existingPriceDocuments.slice(
      index,
      index + batchSize,
    )) {
      batch.delete(documentRef);
    }

    await batch.commit();
  }

  for (let index = 0; index < groupedPrices.length; index += batchSize) {
    const batch = db.batch();

    for (const groupedPrice of groupedPrices.slice(index, index + batchSize)) {
      const documentId =
        (subcollectionName === "pageCountPrices" ||
          subcollectionName === "pageCountSegmentStepPrices") &&
        typeof groupedPrice.pageCount === "number"
          ? buildPageCountPriceDocumentId(
              groupedPrice.pageCount,
              groupedPrice.calculatedCombination,
            )
          : groupedPrice.calculatedCombination;
      batch.set(productPricesCollection.doc(documentId), {
        channelId,
        calculatedCombination: groupedPrice.calculatedCombination,
        id: documentId,
        pageCount: groupedPrice.pageCount,
        prices: groupedPrice.prices,
        productId,
      });
    }

    await batch.commit();
  }
}

export async function readProductPriceSubcollection<
  T extends ProductPrice,
>(options: {
  channelId: string;
  productId: string;
  subcollectionName:
    | "pageCountPrices"
    | "pageCountSegmentStepPrices"
    | "pageCountStepPrices"
    | "prices";
}): Promise<T[]> {
  const { channelId, productId, subcollectionName } = options;
  const snapshot = await getDb()
    .collection(
      `channels/${channelId}/products/${productId}/${subcollectionName}`,
    )
    .orderBy("id", "desc")
    .get();

  return snapshot.docs.map(
    (doc) => serializeFirestoreDeep({ id: doc.id, ...doc.data() }) as T,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively serialize Firestore admin Timestamp instances to plain values
 * to satisfy Next.js Server→Client boundaries.
 * - Timestamps become number (milliseconds since epoch)
 * - Arrays and objects are traversed deeply
 */
export function serializeFirestoreDeep(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreDeep(item));
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeFirestoreDeep(val);
    }
    return result;
  }

  return value;
}

/**
 * Get Vertex AI model for product data extraction
 */
export async function getVertexModel() {
  return getAdminVertexLanguageModel(MODELS.GEMINI_3_FLASH);
}

export async function getVertexHighPrecisionModel() {
  return getAdminVertexLanguageModel(MODELS.GEMINI_3_PRO);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function removeUndefinedDeep(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const cleaned: unknown[] = [];
    for (const item of value) {
      const next = removeUndefinedDeep(item);
      if (next !== undefined) {
        cleaned.push(next);
      }
    }
    return cleaned;
  }

  if (isPlainObject(value)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const next = removeUndefinedDeep(val);
      if (next !== undefined) {
        cleaned[key] = next;
      }
    }
    return cleaned;
  }

  return value;
}
