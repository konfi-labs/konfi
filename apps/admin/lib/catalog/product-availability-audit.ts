import type { Product } from "@konfi/types";
import {
  classifyProductAvailability,
  type ProductAvailabilityStatus,
} from "@konfi/utils";
import type { Firestore } from "firebase-admin/firestore";

const CHANNELS_QUERY_LIMIT = 1000;

export interface AvailabilityAuditEntry {
  productId: string;
  productName: string;
  sourceChannelId: string;
  status: ProductAvailabilityStatus;
}

export interface ChannelAvailabilityAudit {
  channelId: string;
  channelName: string;
  entries: AvailabilityAuditEntry[];
}

export function collectAtRiskEntries(
  items: Array<{ product: Product; sourceChannelId: string }>,
  now?: Date,
): AvailabilityAuditEntry[] {
  const seen = new Set<string>();
  const entries: AvailabilityAuditEntry[] = [];

  for (const { product, sourceChannelId } of items) {
    const dedupeKey = `${sourceChannelId}::${product.id}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const status = classifyProductAvailability(product, { now });

    if (!status.isExpired && !status.isExpiringSoon) {
      continue;
    }

    entries.push({
      productId: product.id,
      productName: product.name,
      sourceChannelId,
      status,
    });
  }

  return entries;
}

export async function auditChannelAvailability(params: {
  firestore: Firestore;
  channelId: string;
  channelName?: string;
  now?: Date;
  tenantId?: string;
}): Promise<ChannelAvailabilityAudit> {
  const { firestore, channelId, now, tenantId } = params;
  const channelName = params.channelName ?? channelId;

  const linkedQuery = firestore
    .collectionGroup("products")
    .where("active", "==", true)
    .where("linkedChannels", "array-contains", channelId);
  const scopedLinkedQuery = tenantId
    ? linkedQuery.where("tenantId", "==", tenantId)
    : linkedQuery;

  const [directSnapshot, linkedSnapshot] = await Promise.all([
    firestore
      .collection("channels")
      .doc(channelId)
      .collection("products")
      .where("active", "==", true)
      .get(),
    scopedLinkedQuery.get(),
  ]);

  const items: Array<{ product: Product; sourceChannelId: string }> = [];

  for (const doc of directSnapshot.docs) {
    const data = doc.data() as Product;
    const product: Product = { ...data, id: data.id || doc.id };
    items.push({ product, sourceChannelId: channelId });
  }

  for (const doc of linkedSnapshot.docs) {
    const sourceChannelId = doc.ref.parent?.parent?.id;
    if (!sourceChannelId) {
      continue;
    }
    const data = doc.data() as Product;
    const product: Product = { ...data, id: data.id || doc.id };
    items.push({ product, sourceChannelId });
  }

  const entries = collectAtRiskEntries(items, now);

  return { channelId, channelName, entries };
}

export async function auditAllChannels(params: {
  firestore: Firestore;
  now?: Date;
  tenantId?: string;
}): Promise<ChannelAvailabilityAudit[]> {
  const { firestore, now, tenantId } = params;

  const channelsCollection = firestore.collection("channels");
  const channelsQuery = tenantId
    ? channelsCollection.where("tenantId", "==", tenantId)
    : channelsCollection;
  const snapshot = await channelsQuery.limit(CHANNELS_QUERY_LIMIT).get();

  const activeChannelDocs = snapshot.docs.filter(
    (doc) => doc.data().active === true,
  );

  const audits = await Promise.all(
    activeChannelDocs.map((doc) => {
      const data = doc.data();
      return auditChannelAvailability({
        firestore,
        channelId: doc.id,
        channelName: data.name,
        now,
        tenantId,
      });
    }),
  );

  return audits;
}
