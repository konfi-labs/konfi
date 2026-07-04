import "server-only";

import type { ExternalPriceConfiguration } from "@konfi/types";
import {
  type DocumentReference,
  type Firestore,
  FieldValue,
  type WriteBatch,
} from "firebase-admin/firestore";
import { normalizeExternalPriceConfigurations } from "@/lib/external-products/price-configuration-normalization";

/**
 * Maximum number of price configurations stored per subcollection chunk document.
 * Each configuration is typically 500–1500 bytes; 200 per chunk keeps each
 * document well under Firestore's 1 MB limit.
 */
const CHUNK_SIZE = 200;

const APPLIED_SUBCOLLECTION = "priceConfigChunks";
const PENDING_SUBCOLLECTION = "pendingPriceConfigChunks";

interface ChunkDocument {
  chunkIndex: number;
  configurations: ExternalPriceConfiguration[];
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function writeChunkedConfigurations(
  docRef: DocumentReference,
  subcollection: string,
  configurations: ExternalPriceConfiguration[],
  db: Firestore,
): Promise<void> {
  const normalizedConfigurations =
    normalizeExternalPriceConfigurations(configurations);

  // Delete existing chunks first
  await deleteSubcollection(docRef, subcollection, db);

  if (normalizedConfigurations.length === 0) {
    return;
  }

  const chunks = chunkArray(normalizedConfigurations, CHUNK_SIZE);

  // Firestore batched write limit is 500 operations; each chunk is 1 set
  // operation. We batch up to 400 at a time to stay safe.
  const BATCH_LIMIT = 400;

  for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_LIMIT) {
    const batch = db.batch();
    const batchEnd = Math.min(batchStart + BATCH_LIMIT, chunks.length);

    for (let i = batchStart; i < batchEnd; i++) {
      const chunkDoc: ChunkDocument = {
        chunkIndex: i,
        configurations: chunks[i],
      };
      const chunkRef = docRef
        .collection(subcollection)
        .doc(`chunk_${i}`);
      batch.set(chunkRef, chunkDoc);
    }

    await batch.commit();
  }
}

async function deleteSubcollection(
  docRef: DocumentReference,
  subcollection: string,
  db: Firestore,
): Promise<void> {
  const snapshot = await docRef
    .collection(subcollection)
    .select()
    .get();

  if (snapshot.empty) {
    return;
  }

  const BATCH_LIMIT = 400;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const batchEnd = Math.min(i + BATCH_LIMIT, docs.length);

    for (let j = i; j < batchEnd; j++) {
      batch.delete(docs[j].ref);
    }

    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

async function readChunkedConfigurations(
  docRef: DocumentReference,
  subcollection: string,
): Promise<ExternalPriceConfiguration[]> {
  const snapshot = await docRef
    .collection(subcollection)
    .orderBy("chunkIndex", "asc")
    .get();

  if (snapshot.empty) {
    return [];
  }

  const configurations: ExternalPriceConfiguration[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as ChunkDocument;
    configurations.push(...(data.configurations ?? []));
  }

  return normalizeExternalPriceConfigurations(configurations);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write applied price configurations to subcollection chunks and update
 * the count on the parent document. Removes any existing chunks first.
 */
export async function writePriceConfigurations(options: {
  docRef: DocumentReference;
  configurations: ExternalPriceConfiguration[];
  db: Firestore;
  batch?: WriteBatch;
}): Promise<Record<string, unknown>> {
  const { docRef, configurations, db } = options;
  await writeChunkedConfigurations(docRef, APPLIED_SUBCOLLECTION, configurations, db);

  return {
    priceConfigurations: FieldValue.delete(),
    priceConfigurationsCount: configurations.length,
  };
}

/**
 * Write pending price configurations to subcollection chunks and update
 * the count on the parent document.
 */
export async function writePendingPriceConfigurations(options: {
  docRef: DocumentReference;
  configurations: ExternalPriceConfiguration[];
  db: Firestore;
}): Promise<Record<string, unknown>> {
  const { docRef, configurations, db } = options;
  await writeChunkedConfigurations(docRef, PENDING_SUBCOLLECTION, configurations, db);

  return {
    pendingPriceConfigurations: FieldValue.delete(),
    pendingPriceConfigurationsCount: configurations.length,
  };
}

/**
 * Delete applied price configuration chunks.
 */
export async function deletePriceConfigurations(options: {
  docRef: DocumentReference;
  db: Firestore;
}): Promise<Record<string, unknown>> {
  const { docRef, db } = options;
  await deleteSubcollection(docRef, APPLIED_SUBCOLLECTION, db);

  return {
    priceConfigurations: FieldValue.delete(),
    priceConfigurationsCount: 0,
  };
}

/**
 * Delete pending price configuration chunks.
 */
export async function deletePendingPriceConfigurations(options: {
  docRef: DocumentReference;
  db: Firestore;
}): Promise<Record<string, unknown>> {
  const { docRef, db } = options;
  await deleteSubcollection(docRef, PENDING_SUBCOLLECTION, db);

  return {
    pendingPriceConfigurations: FieldValue.delete(),
    pendingPriceConfigurationsCount: 0,
  };
}

/**
 * Read applied price configurations from subcollection chunks.
 * Falls back to inline field on the document for backward compatibility.
 */
export async function readPriceConfigurations(options: {
  docRef: DocumentReference;
  externalProduct: { priceConfigurations?: ExternalPriceConfiguration[]; };
}): Promise<ExternalPriceConfiguration[]> {
  const { docRef, externalProduct } = options;

  const chunked = await readChunkedConfigurations(docRef, APPLIED_SUBCOLLECTION);

  if (chunked.length > 0) {
    return chunked;
  }

  // Backward compatibility: fall back to inline field
  return normalizeExternalPriceConfigurations(
    externalProduct.priceConfigurations ?? [],
  );
}

/**
 * Read pending price configurations from subcollection chunks.
 * Falls back to inline field on the document for backward compatibility.
 */
export async function readPendingPriceConfigurations(options: {
  docRef: DocumentReference;
  externalProduct: { pendingPriceConfigurations?: ExternalPriceConfiguration[]; };
}): Promise<ExternalPriceConfiguration[]> {
  const { docRef, externalProduct } = options;

  const chunked = await readChunkedConfigurations(docRef, PENDING_SUBCOLLECTION);

  if (chunked.length > 0) {
    return chunked;
  }

  // Backward compatibility: fall back to inline field
  return normalizeExternalPriceConfigurations(
    externalProduct.pendingPriceConfigurations ?? [],
  );
}

/**
 * Move pending price configurations to applied.
 * Reads from pending subcollection, writes to applied subcollection,
 * then deletes the pending subcollection.
 */
export async function movePendingToApplied(options: {
  docRef: DocumentReference;
  externalProduct: { pendingPriceConfigurations?: ExternalPriceConfiguration[]; };
  db: Firestore;
}): Promise<{
  updateFields: Record<string, unknown>;
  appliedCount: number;
}> {
  const { docRef, externalProduct, db } = options;

  const pending = await readPendingPriceConfigurations({
    docRef,
    externalProduct,
  });

  if (pending.length === 0) {
    return { updateFields: {}, appliedCount: 0 };
  }

  const appliedFields = await writePriceConfigurations({
    docRef,
    configurations: pending,
    db,
  });

  const deletedPendingFields = await deletePendingPriceConfigurations({
    docRef,
    db,
  });

  return {
    updateFields: {
      ...appliedFields,
      ...deletedPendingFields,
    },
    appliedCount: pending.length,
  };
}
