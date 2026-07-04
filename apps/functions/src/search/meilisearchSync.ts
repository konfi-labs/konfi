import type { DocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

const firestoreDatabaseId = defineString("FIRESTORE_DATABASE_ID");
const meilisearchHost = defineString("MEILISEARCH_HOST");
const meilisearchSyncRegion = defineString("MEILISEARCH_SYNC_REGION");
const meilisearchApiKey = defineSecret("MEILISEARCH_API_KEY");

type SearchIndexName = "customers" | "orders" | "products";

interface SyncInput {
  after?: DocumentSnapshot;
  before?: DocumentSnapshot;
  channelId?: string;
  documentId: string;
  indexName: SearchIndexName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeHost(host: string): string {
  const normalized = host.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("Missing MEILISEARCH_HOST for Firestore sync.");
  }

  return normalized;
}

function getApiKey(): string {
  const apiKey = meilisearchApiKey.value().trim();

  if (!apiKey) {
    throw new Error("Missing MEILISEARCH_API_KEY for Firestore sync.");
  }

  return apiKey;
}

function toPlainRecord(data: Record<string, unknown>): Record<string, unknown> {
  const parsed: unknown = JSON.parse(JSON.stringify(data));
  return isRecord(parsed) ? parsed : {};
}

async function requestMeilisearch(path: string, init: RequestInit) {
  const response = await fetch(
    `${normalizeHost(meilisearchHost.value())}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      redirect: "manual",
    },
  );

  if (!response.ok) {
    const location = response.headers.get("location");
    const redirectHint = location ? ` Redirect location: ${location}` : "";
    throw new Error(
      `Meilisearch ${init.method ?? "GET"} ${path} failed: ${
        response.status
      } ${await response.text()}${redirectHint}`,
    );
  }
}

async function resolveTenantId(
  snapshot: DocumentSnapshot,
  channelId: string | undefined,
  data: Record<string, unknown>,
): Promise<string | undefined> {
  if (typeof data.tenantId === "string" && data.tenantId.trim()) {
    return data.tenantId.trim();
  }

  if (!channelId) {
    return;
  }

  const channelSnapshot = await snapshot.ref.firestore
    .doc(`channels/${channelId}`)
    .get();
  const channelData = channelSnapshot.data();
  const tenantId = channelData?.tenantId;

  return typeof tenantId === "string" && tenantId.trim()
    ? tenantId.trim()
    : undefined;
}

async function upsertDocument(input: SyncInput, snapshot: DocumentSnapshot) {
  const rawData = snapshot.data();

  if (!rawData) {
    logger.warn("Skipping Meilisearch sync for empty Firestore snapshot", {
      documentId: input.documentId,
      indexName: input.indexName,
    });
    return;
  }

  const data = toPlainRecord(rawData as Record<string, unknown>);
  const tenantId = await resolveTenantId(snapshot, input.channelId, data);
  const document = {
    ...data,
    _firestore_id: input.documentId,
    ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(tenantId ? { tenantId } : {}),
  };

  await requestMeilisearch(
    `/indexes/${encodeURIComponent(
      input.indexName,
    )}/documents?primaryKey=_firestore_id`,
    {
      method: "POST",
      body: JSON.stringify([document]),
    },
  );
}

async function deleteDocument(input: SyncInput) {
  await requestMeilisearch(
    `/indexes/${encodeURIComponent(input.indexName)}/documents/${encodeURIComponent(
      input.documentId,
    )}`,
    {
      method: "DELETE",
    },
  );
}

async function syncDocument(input: SyncInput) {
  if (input.after?.exists) {
    await upsertDocument(input, input.after);
    logger.info("Synced Firestore document to Meilisearch", {
      documentId: input.documentId,
      indexName: input.indexName,
    });
    return;
  }

  if (input.before?.exists) {
    await deleteDocument(input);
    logger.info("Deleted Firestore document from Meilisearch", {
      documentId: input.documentId,
      indexName: input.indexName,
    });
  }
}

const triggerOptions = {
  database: firestoreDatabaseId,
  region: meilisearchSyncRegion,
  retry: true,
  secrets: [meilisearchApiKey],
};

export const syncCustomersToMeilisearch = onDocumentWritten(
  {
    ...triggerOptions,
    document: "customers/{customerId}",
  },
  async (event) => {
    await syncDocument({
      after: event.data?.after,
      before: event.data?.before,
      documentId: event.params.customerId,
      indexName: "customers",
    });
  },
);

export const syncProductsToMeilisearch = onDocumentWritten(
  {
    ...triggerOptions,
    document: "channels/{channelId}/products/{productId}",
  },
  async (event) => {
    await syncDocument({
      after: event.data?.after,
      before: event.data?.before,
      channelId: event.params.channelId,
      documentId: event.params.productId,
      indexName: "products",
    });
  },
);

export const syncOrdersToMeilisearch = onDocumentWritten(
  {
    ...triggerOptions,
    document: "channels/{channelId}/orders/{orderId}",
  },
  async (event) => {
    await syncDocument({
      after: event.data?.after,
      before: event.data?.before,
      channelId: event.params.channelId,
      documentId: event.params.orderId,
      indexName: "orders",
    });
  },
);
