import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import type { Attribute, Category, Order, Product } from "@konfi/types";
import { isPurchasable } from "@konfi/utils";
import type {
  DocumentSnapshot,
  Firestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { StoreMcpToolError } from "./errors";
import type { PublicProductRecord, StoreMcpReaders } from "./types";

const MAX_PRODUCT_FETCH_LIMIT = 999;
const MAX_ORDER_FETCH_LIMIT = 100;

type ProductSnapshot =
  | DocumentSnapshot<FirebaseFirestore.DocumentData>
  | QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

function getStoreChannelId(): string {
  const channelId = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID?.trim();

  if (!channelId) {
    throw new StoreMcpToolError(
      "store_channel_missing",
      "NEXT_PUBLIC_STORE_CHANNEL_ID is not configured for the store MCP.",
      { status: 500 },
    );
  }

  return channelId;
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function uniqueValues(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim())));
}

function productSearchText(product: Product): string {
  return [
    product.name,
    product.description,
    product.category?.name,
    product.seo?.slug,
    product.seo?.title,
    product.seo?.description,
    ...(product.keywords ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
}

function productMatchesQuery(product: Product, query: string): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return true;
  }

  const searchText = productSearchText(product);
  return normalizedQuery
    .split(/\s+/u)
    .every((token) => searchText.includes(token));
}

function productRecordFromSnapshot(
  snapshot: ProductSnapshot,
  targetChannelId: string,
): PublicProductRecord | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) {
    return null;
  }

  const sourceChannelId =
    snapshot.ref.parent.parent?.id ??
    (typeof data.channelId === "string" ? data.channelId : undefined) ??
    targetChannelId;
  const product = {
    ...data,
    channelId:
      typeof data.channelId === "string" ? data.channelId : sourceChannelId,
    id: typeof data.id === "string" && data.id.trim() ? data.id : snapshot.id,
  } as Product;

  if (!isPurchasable(product)) {
    return null;
  }

  return {
    product,
    sourceChannelId,
    targetChannelId,
  };
}

function dedupeProductRecords(
  records: readonly PublicProductRecord[],
): PublicProductRecord[] {
  return Array.from(
    new Map(
      records.map((record) => [
        `${record.sourceChannelId}:${record.product.id}`,
        record,
      ]),
    ).values(),
  );
}

function comparePublicProducts(
  left: PublicProductRecord,
  right: PublicProductRecord,
): number {
  const recommendedOrder =
    Number(right.product.recommended) - Number(left.product.recommended);

  return (
    recommendedOrder || left.product.name.localeCompare(right.product.name)
  );
}

async function listPublicProductRecords(input: {
  firestore: Firestore;
  limit: number;
  query?: string;
  targetChannelId: string;
}): Promise<PublicProductRecord[]> {
  const fetchLimit = input.query
    ? Math.min(Math.max(input.limit * 5, 25), MAX_PRODUCT_FETCH_LIMIT)
    : Math.min(input.limit, MAX_PRODUCT_FETCH_LIMIT);
  const [directSnapshot, linkedSnapshot] = await Promise.all([
    input.firestore
      .collection(`channels/${input.targetChannelId}/products`)
      .where("active", "==", true)
      .where("availability.published", "==", true)
      .limit(fetchLimit)
      .get(),
    input.firestore
      .collectionGroup("products")
      .where("active", "==", true)
      .where("availability.published", "==", true)
      .where("linkedChannels", "array-contains", input.targetChannelId)
      .limit(fetchLimit)
      .get(),
  ]);

  const records = dedupeProductRecords(
    [...directSnapshot.docs, ...linkedSnapshot.docs].flatMap((snapshot) => {
      const record = productRecordFromSnapshot(snapshot, input.targetChannelId);

      return record ? [record] : [];
    }),
  );

  return records
    .filter((record) =>
      input.query ? productMatchesQuery(record.product, input.query) : true,
    )
    .toSorted(comparePublicProducts)
    .slice(0, input.limit);
}

async function findDirectProductById(input: {
  firestore: Firestore;
  productId: string;
  targetChannelId: string;
}): Promise<PublicProductRecord | null> {
  const snapshot = await input.firestore
    .collection(`channels/${input.targetChannelId}/products`)
    .doc(input.productId)
    .get();
  const directRecord = productRecordFromSnapshot(
    snapshot,
    input.targetChannelId,
  );

  if (directRecord) {
    return directRecord;
  }

  const byFieldSnapshot = await input.firestore
    .collection(`channels/${input.targetChannelId}/products`)
    .where("id", "==", input.productId)
    .limit(1)
    .get();

  return byFieldSnapshot.empty
    ? null
    : productRecordFromSnapshot(byFieldSnapshot.docs[0], input.targetChannelId);
}

async function findLinkedProductById(input: {
  firestore: Firestore;
  productId: string;
  targetChannelId: string;
}): Promise<PublicProductRecord | null> {
  const snapshot = await input.firestore
    .collectionGroup("products")
    .where("id", "==", input.productId)
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .where("linkedChannels", "array-contains", input.targetChannelId)
    .limit(1)
    .get();

  return snapshot.empty
    ? null
    : productRecordFromSnapshot(snapshot.docs[0], input.targetChannelId);
}

async function findProductBySlug(input: {
  firestore: Firestore;
  slug: string;
  targetChannelId: string;
}): Promise<PublicProductRecord | null> {
  const directSnapshot = await input.firestore
    .collection(`channels/${input.targetChannelId}/products`)
    .where("seo.slug", "==", input.slug)
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .limit(1)
    .get();
  const directRecord = directSnapshot.empty
    ? null
    : productRecordFromSnapshot(directSnapshot.docs[0], input.targetChannelId);

  if (directRecord) {
    return directRecord;
  }

  const linkedSnapshot = await input.firestore
    .collectionGroup("products")
    .where("seo.slug", "==", input.slug)
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .where("linkedChannels", "array-contains", input.targetChannelId)
    .limit(1)
    .get();

  return linkedSnapshot.empty
    ? null
    : productRecordFromSnapshot(linkedSnapshot.docs[0], input.targetChannelId);
}

function orderCustomerId(order: Order): string | null {
  if (typeof order.customer === "string") {
    return order.customer;
  }

  if (typeof order.customer?.id === "string" && order.customer.id.trim()) {
    return order.customer.id;
  }

  const customerId = (order as { customerId?: unknown }).customerId;
  return typeof customerId === "string" && customerId.trim()
    ? customerId
    : null;
}

export function isOrderVisibleToCustomer(
  order: Order,
  customerId: string,
): boolean {
  return order.active !== false && orderCustomerId(order) === customerId;
}

function orderFromSnapshot(
  snapshot: DocumentSnapshot<FirebaseFirestore.DocumentData>,
): Order | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) {
    return null;
  }

  return {
    ...data,
    id: typeof data.id === "string" && data.id.trim() ? data.id : snapshot.id,
  } as Order;
}

function dedupeOrders(orders: readonly Order[]): Order[] {
  return Array.from(new Map(orders.map((order) => [order.id, order])).values());
}

export function createFirestoreStoreMcpReaders(
  firestore: Firestore = getAdminDb(),
): StoreMcpReaders {
  return {
    getCustomerOrder: async ({ customerId, orderId }) => {
      const channelId = getStoreChannelId();
      const directSnapshot = await firestore
        .doc(`channels/${channelId}/orders/${orderId}`)
        .get();
      const directOrder = orderFromSnapshot(directSnapshot);

      if (directOrder) {
        return isOrderVisibleToCustomer(directOrder, customerId)
          ? directOrder
          : null;
      }

      const querySnapshot = await firestore
        .collection(`channels/${channelId}/orders`)
        .where("id", "==", orderId)
        .limit(1)
        .get();
      const order = querySnapshot.empty
        ? null
        : orderFromSnapshot(querySnapshot.docs[0]);

      return order && isOrderVisibleToCustomer(order, customerId)
        ? order
        : null;
    },
    getProduct: async ({ productId, slug }) => {
      const channelId = getStoreChannelId();

      if (productId) {
        const directRecord = await findDirectProductById({
          firestore,
          productId,
          targetChannelId: channelId,
        });

        if (directRecord) {
          return directRecord;
        }

        const linkedRecord = await findLinkedProductById({
          firestore,
          productId,
          targetChannelId: channelId,
        });

        if (linkedRecord) {
          return linkedRecord;
        }
      }

      if (slug) {
        return findProductBySlug({
          firestore,
          slug,
          targetChannelId: channelId,
        });
      }

      return null;
    },
    listAttributes: async (attributeIds) => {
      const snapshots = await Promise.all(
        uniqueValues(attributeIds).map((attributeId) =>
          firestore.doc(`attributes/${attributeId}`).get(),
        ),
      );

      return snapshots.flatMap((snapshot) => {
        if (!snapshot.exists) {
          return [];
        }

        const data = snapshot.data();
        return data
          ? [
              {
                ...data,
                id:
                  typeof data.id === "string" && data.id.trim()
                    ? data.id
                    : snapshot.id,
              } as Attribute,
            ]
          : [];
      });
    },
    listCategories: async ({ limit }) => {
      const channelId = getStoreChannelId();
      const snapshot = await firestore
        .collection(`channels/${channelId}/categories`)
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();

        return {
          ...data,
          id: typeof data.id === "string" && data.id.trim() ? data.id : doc.id,
        } as Category;
      });
    },
    listCustomerOrders: async ({ customerId, limit }) => {
      const channelId = getStoreChannelId();
      const ordersRef = firestore.collection(`channels/${channelId}/orders`);
      const fetchLimit = Math.min(limit, MAX_ORDER_FETCH_LIMIT);
      const snapshots = await Promise.all([
        ordersRef
          .where("customer.id", "==", customerId)
          .limit(fetchLimit)
          .get(),
        ordersRef.where("customer", "==", customerId).limit(fetchLimit).get(),
        ordersRef.where("customerId", "==", customerId).limit(fetchLimit).get(),
      ]);
      const orders = snapshots.flatMap((snapshot) =>
        snapshot.docs.flatMap((doc) => {
          const order = orderFromSnapshot(doc);

          return order && isOrderVisibleToCustomer(order, customerId)
            ? [order]
            : [];
        }),
      );

      return dedupeOrders(orders).slice(0, limit);
    },
    searchProducts: async ({ limit, query }) =>
      listPublicProductRecords({
        firestore,
        limit,
        query,
        targetChannelId: getStoreChannelId(),
      }),
  };
}
