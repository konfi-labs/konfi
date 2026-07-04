import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { getFakturowniaClient } from "@/lib/fakturownia/client";
import {
  searchCustomersIndex,
  searchOrdersIndex,
  searchProductsIndex,
} from "@konfi/meilisearch";
import {
  getApprovedAttributeOptionCosts,
  getApprovedProductCosts,
  listProductCostMappings,
  searchApprovedCostEvidence,
  searchMaterialCostsByQuery,
} from "@/lib/fakturownia/cost-intelligence";
import type {
  Attribute,
  Category,
  Channel,
  Customer,
  DynamicPricingConfig,
  DynamicPricingPreset,
  NestedMember,
  Order,
  Product,
  ProductType,
} from "@konfi/types";
import type { Invoice } from "@konfi/fakturownia/client/models";
import { Firestore as AdminFirestore } from "firebase-admin/firestore";
import {
  businessRecordMatchesQuery,
  firestoreCollectionPathForBusinessResource,
  getBusinessResourceDescriptor,
} from "./business-resources";
import type { ToolLayerReaders } from "./types";
import type {
  BusinessRecord,
  BusinessResourceName,
  FirestoreQueryOrderByClause,
  FirestoreQueryWhereClause,
  McpDraftRecord,
  ProductPriceTable,
  ProductPriceTableRow,
} from "./types";

function getAdminFirestore(): AdminFirestore {
  return getAdminDb();
}

const CHANNEL_LIST_CACHE_TTL_MS = 60 * 1000;
const channelListCache = new WeakMap<
  AdminFirestore,
  Map<
    string,
    {
      channels: Channel[];
      expiresAtMs: number;
    }
  >
>();

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim())));
}

function isTenantVisible(
  data: { tenantId?: string | null } | undefined,
  tenantId?: string,
): boolean {
  return !tenantId || data?.tenantId === tenantId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function serializePlainRecord(value: unknown): Record<string, unknown> {
  const serialized = JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (
        item &&
        typeof item === "object" &&
        "year" in item &&
        "month" in item &&
        "day" in item
      ) {
        const dateOnly = item as {
          day: unknown;
          month: unknown;
          year: unknown;
        };

        if (
          typeof dateOnly.day === "number" &&
          typeof dateOnly.month === "number" &&
          typeof dateOnly.year === "number"
        ) {
          return `${dateOnly.year}-${String(dateOnly.month).padStart(2, "0")}-${String(dateOnly.day).padStart(2, "0")}`;
        }
      }

      return item;
    }),
  ) as unknown;

  return isRecord(serialized) ? serialized : {};
}

function toMcpDraftRecord(
  runId: string,
  data: Record<string, unknown>,
): McpDraftRecord {
  const result = isRecord(data.result) ? data.result : {};
  const createdBy = toNestedMember(data.createdBy);

  return {
    ...(typeof data.channelId === "string"
      ? { channelId: data.channelId }
      : {}),
    ...(createdBy ? { createdBy } : {}),
    result,
    runId,
    ...(typeof data.source === "string" ? { source: data.source } : {}),
    ...(typeof data.status === "string" ? { status: data.status } : {}),
    ...(typeof data.summary === "string" ? { summary: data.summary } : {}),
    ...(typeof data.taskType === "string" ? { taskType: data.taskType } : {}),
    ...(typeof data.tenantId === "string" ? { tenantId: data.tenantId } : {}),
    ...(typeof data.workflowStatus === "string"
      ? { workflowStatus: data.workflowStatus }
      : {}),
  };
}

function toNestedMember(value: unknown): NestedMember | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = value.id;
  const name = value.name;

  return typeof id === "string" && typeof name === "string"
    ? { id, name }
    : undefined;
}

function recordIdFromData(
  fallbackId: string,
  data: Record<string, unknown>,
): string {
  const id = data.id;

  if (typeof id === "string" && id.trim()) {
    return id.trim();
  }

  if (typeof id === "number" && Number.isFinite(id)) {
    return String(id);
  }

  return fallbackId;
}

function toBusinessRecord(input: {
  channelId?: string;
  data: Record<string, unknown>;
  fallbackId: string;
  path?: string;
  resource: BusinessResourceName;
}): BusinessRecord {
  const id = recordIdFromData(input.fallbackId, input.data);

  return {
    ...(input.channelId ? { channelId: input.channelId } : {}),
    data: {
      ...input.data,
      id,
    },
    id,
    ...(input.path ? { path: input.path } : {}),
    resource: input.resource,
  };
}

function filterBusinessRecords(input: {
  limit: number;
  query?: string;
  records: BusinessRecord[];
  resource: BusinessResourceName;
}): BusinessRecord[] {
  const descriptor = getBusinessResourceDescriptor(input.resource);

  return input.records
    .filter((record) =>
      businessRecordMatchesQuery(descriptor, record, input.query),
    )
    .slice(0, input.limit);
}

async function listActiveChannels(
  firestore: AdminFirestore,
  tenantId?: string,
): Promise<Channel[]> {
  const nowMs = Date.now();
  const cacheKey = tenantId ?? "__dedicated__";
  const cachedByTenant = channelListCache.get(firestore);
  const cached = cachedByTenant?.get(cacheKey);

  if (cached && cached.expiresAtMs > nowMs) {
    return cached.channels;
  }

  let query = firestore.collection("channels") as FirebaseFirestore.Query;
  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snapshot = await query.get();
  const channels = snapshot.docs
    .map(
      (doc) =>
        ({
          ...doc.data(),
          id: doc.id,
        }) as Channel,
    )
    .filter(
      (channel) =>
        channel.active !== false &&
        isTenantVisible(channel as { tenantId?: string | null }, tenantId),
    );

  const nextCachedByTenant = cachedByTenant ?? new Map();
  nextCachedByTenant.set(cacheKey, {
    channels,
    expiresAtMs: nowMs + CHANNEL_LIST_CACHE_TTL_MS,
  });
  channelListCache.set(firestore, nextCachedByTenant);

  return channels;
}

async function listFirestoreBusinessRecords(
  firestore: AdminFirestore,
  input: {
    channelId?: string;
    limit: number;
    query?: string;
    resource: BusinessResourceName;
    tenantId?: string;
  },
): Promise<BusinessRecord[]> {
  const path = firestoreCollectionPathForBusinessResource(input.resource, {
    channelId: input.channelId,
  });
  const fetchLimit = input.query
    ? Math.min(Math.max(input.limit * 5, 25), 100)
    : input.limit;
  let firestoreQuery = firestore.collection(path) as FirebaseFirestore.Query;
  if (input.tenantId) {
    firestoreQuery = firestoreQuery.where("tenantId", "==", input.tenantId);
  }

  const snapshot = await firestoreQuery.limit(fetchLimit).get();
  const records = snapshot.docs.map((doc) =>
    toBusinessRecord({
      channelId: input.channelId,
      data: doc.data(),
      fallbackId: doc.id,
      path: doc.ref.path,
      resource: input.resource,
    }),
  );

  return filterBusinessRecords({
    limit: input.limit,
    query: input.query,
    records,
    resource: input.resource,
  });
}

async function getFirestoreBusinessRecord(
  firestore: AdminFirestore,
  input: {
    channelId?: string;
    recordId: string;
    resource: BusinessResourceName;
    tenantId?: string;
  },
): Promise<BusinessRecord | null> {
  const path = firestoreCollectionPathForBusinessResource(input.resource, {
    channelId: input.channelId,
  });
  const snapshot = await firestore.collection(path).doc(input.recordId).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  if (!isTenantVisible(data, input.tenantId)) {
    return null;
  }

  return toBusinessRecord({
    channelId: input.channelId,
    data,
    fallbackId: snapshot.id,
    path: snapshot.ref.path,
    resource: input.resource,
  });
}

async function queryFirestoreBusinessRecords(
  firestore: AdminFirestore,
  input: {
    channelId?: string;
    limit: number;
    offset: number;
    orderBy: FirestoreQueryOrderByClause[];
    resource: BusinessResourceName;
    tenantId?: string;
    where: FirestoreQueryWhereClause[];
  },
): Promise<{
  collectionPath: string;
  records: BusinessRecord[];
}> {
  const path = firestoreCollectionPathForBusinessResource(input.resource, {
    channelId: input.channelId,
  });
  let firestoreQuery = firestore.collection(path) as FirebaseFirestore.Query;

  if (input.tenantId) {
    firestoreQuery = firestoreQuery.where("tenantId", "==", input.tenantId);
  }

  for (const clause of input.where) {
    firestoreQuery = firestoreQuery.where(
      clause.field,
      clause.op,
      clause.value,
    );
  }

  for (const clause of input.orderBy) {
    firestoreQuery = firestoreQuery.orderBy(clause.field, clause.direction);
  }

  if (input.offset > 0) {
    firestoreQuery = firestoreQuery.offset(input.offset);
  }

  const snapshot = await firestoreQuery.limit(input.limit).get();
  const records = snapshot.docs
    .map((doc) =>
      toBusinessRecord({
        channelId: input.channelId,
        data: doc.data(),
        fallbackId: doc.id,
        path: doc.ref.path,
        resource: input.resource,
      }),
    )
    .filter((record) => isTenantVisible(record.data, input.tenantId));

  return {
    collectionPath: path,
    records,
  };
}

function invoiceRecord(invoice: Invoice): BusinessRecord | null {
  const data = serializePlainRecord(invoice);
  const id = recordIdFromData("", data);

  if (!id) {
    return null;
  }

  return {
    data,
    id,
    resource: "fakturowniaInvoices",
  };
}

async function listFakturowniaInvoiceRecords(input: {
  limit: number;
  query?: string;
}): Promise<BusinessRecord[]> {
  const client = await getFakturowniaClient();
  const perPage = input.query
    ? Math.min(Math.max(input.limit * 2, 25), 50)
    : input.limit;
  const invoices = await client.invoicesJson.get({
    queryParameters: {
      ...(input.query ? { number: input.query } : {}),
      page: 1,
      perPage,
    },
  });
  const records = (invoices ?? []).flatMap((invoice) => {
    const record = invoiceRecord(invoice);
    return record ? [record] : [];
  });

  if (!input.query) {
    return records.slice(0, input.limit);
  }

  const filtered = filterBusinessRecords({
    limit: input.limit,
    query: input.query,
    records,
    resource: "fakturowniaInvoices",
  });

  if (filtered.length > 0) {
    return filtered;
  }

  const recentInvoices = await client.invoicesJson.get({
    queryParameters: {
      page: 1,
      perPage,
    },
  });
  const recentRecords = (recentInvoices ?? []).flatMap((invoice) => {
    const record = invoiceRecord(invoice);
    return record ? [record] : [];
  });

  return filterBusinessRecords({
    limit: input.limit,
    query: input.query,
    records: recentRecords,
    resource: "fakturowniaInvoices",
  });
}

async function getFakturowniaInvoiceRecord(
  recordId: string,
): Promise<BusinessRecord | null> {
  const client = await getFakturowniaClient();
  const invoice = await client.invoices.byId(recordId).get();

  return invoice ? invoiceRecord(invoice) : null;
}

async function getDynamicPricingAttributes(
  firestore: AdminFirestore,
  attributeIds: string[],
  tenantId?: string,
): Promise<Attribute[]> {
  const snapshots = await Promise.all(
    uniqueValues(attributeIds).map((attributeId) =>
      firestore.doc(`/attributes/${attributeId}`).get(),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.exists && isTenantVisible(snapshot.data(), tenantId)
      ? [snapshot.data() as Attribute]
      : [],
  );
}

async function getDynamicPricingPresetsByIds(
  firestore: AdminFirestore,
  channelId: string,
  presetIds: string[],
  tenantId?: string,
): Promise<DynamicPricingPreset[]> {
  const snapshots = await Promise.all(
    uniqueValues(presetIds).map((presetId) =>
      firestore
        .doc(`/channels/${channelId}/dynamicPricingPresets/${presetId}`)
        .get(),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.exists && isTenantVisible(snapshot.data(), tenantId)
      ? [snapshot.data() as DynamicPricingPreset]
      : [],
  );
}

async function getProductDynamicPricing(
  firestore: AdminFirestore,
  channelId: string,
  productId: string,
  tenantId?: string,
): Promise<DynamicPricingConfig | null> {
  const snapshot = await firestore
    .doc(`/channels/${channelId}/products/${productId}/dynamicPricing/config`)
    .get();

  if (!snapshot.exists || !isTenantVisible(snapshot.data(), tenantId)) {
    return null;
  }

  return snapshot.data() as DynamicPricingConfig;
}

async function listProductPriceRows(
  firestore: AdminFirestore,
  input: {
    channelId: string;
    limit: number;
    offset: number;
    productId: string;
    table: ProductPriceTable;
    tenantId?: string;
  },
): Promise<ProductPriceTableRow[]> {
  let rowsQuery = firestore.collection(
    `channels/${input.channelId}/products/${input.productId}/${input.table}`,
  ) as FirebaseFirestore.Query;

  if (input.tenantId) {
    rowsQuery = rowsQuery.where("tenantId", "==", input.tenantId);
  }

  rowsQuery = rowsQuery.orderBy("id", "desc");

  if (input.offset > 0) {
    rowsQuery = rowsQuery.offset(input.offset);
  }

  const snapshot = await rowsQuery.limit(input.limit).get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as ProductPriceTableRow;

      return {
        ...data,
        id: data.id || doc.id,
      };
    })
    .filter((row) =>
      isTenantVisible(
        row as ProductPriceTableRow & { tenantId?: string | null },
        input.tenantId,
      ),
    );
}

async function getOrder(
  firestore: AdminFirestore,
  channelId: string,
  orderId: string,
  tenantId?: string,
): Promise<Order | null> {
  const ordersRef = firestore.collection(`channels/${channelId}/orders`);
  const directSnapshot = await ordersRef.doc(orderId).get();

  if (directSnapshot.exists) {
    const directOrder = orderFromSnapshot(directSnapshot, channelId);
    return isTenantVisible(directOrder, tenantId) ? directOrder : null;
  }

  let orderQuery = ordersRef.where("id", "==", orderId).limit(1);
  if (tenantId) {
    orderQuery = orderQuery.where("tenantId", "==", tenantId);
  }

  const querySnapshot = await orderQuery.get();
  return querySnapshot.empty
    ? null
    : orderFromSnapshot(querySnapshot.docs[0], channelId);
}

async function getOrderByNumber(
  firestore: AdminFirestore,
  channelId: string,
  orderNumber: number,
  tenantId?: string,
): Promise<Order | null> {
  const ordersRef = firestore.collection(`channels/${channelId}/orders`);
  let orderQuery = ordersRef
    .where("number", "==", orderNumber)
    .where("active", "==", true) as FirebaseFirestore.Query;

  if (tenantId) {
    orderQuery = orderQuery.where("tenantId", "==", tenantId);
  }

  const querySnapshot = await orderQuery.limit(1).get();

  return querySnapshot.empty
    ? null
    : orderFromSnapshot(querySnapshot.docs[0], channelId);
}

function orderFromSnapshot(
  snapshot: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  fallbackChannelId?: string,
): Order {
  const data = snapshot.data() as Order;
  const sourceChannelId = snapshot.ref.parent.parent?.id;

  return {
    ...data,
    channelId: data.channelId ?? sourceChannelId ?? fallbackChannelId,
    id: data.id || snapshot.id,
  };
}

async function listOrders(
  firestore: AdminFirestore,
  input: {
    channelId: string;
    limit: number;
    offset: number;
    tenantId?: string;
  },
): Promise<Order[]> {
  let ordersQuery = firestore
    .collection(`channels/${input.channelId}/orders`)
    .where("active", "==", true) as FirebaseFirestore.Query;

  if (input.tenantId) {
    ordersQuery = ordersQuery.where("tenantId", "==", input.tenantId);
  }

  ordersQuery = ordersQuery.orderBy("createdAt", "desc");

  if (input.offset > 0) {
    ordersQuery = ordersQuery.offset(input.offset);
  }

  const snapshot = await ordersQuery.limit(input.limit).get();

  return snapshot.docs
    .map((doc) => orderFromSnapshot(doc, input.channelId))
    .filter(
      (order) =>
        order.active === true &&
        isTenantVisible(order as { tenantId?: string | null }, input.tenantId),
    );
}

async function getProduct(
  firestore: AdminFirestore,
  channelId: string,
  productId: string,
  tenantId?: string,
): Promise<Product | null> {
  const directSnapshot = await firestore
    .doc(`/channels/${channelId}/products/${productId}`)
    .get();

  if (directSnapshot.exists) {
    const product = productFromSnapshot(directSnapshot, channelId);
    return isTenantVisible(product, tenantId) ? product : null;
  }

  let linkedQuery = firestore
    .collectionGroup("products")
    .where("id", "==", productId)
    .where("linkedChannels", "array-contains", channelId);

  if (tenantId) {
    linkedQuery = linkedQuery.where("tenantId", "==", tenantId);
  }

  const linkedSnapshot = await linkedQuery.limit(1).get();

  return linkedSnapshot.empty
    ? null
    : productFromSnapshot(linkedSnapshot.docs[0]);
}

function productFromSnapshot(
  snapshot: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  fallbackChannelId?: string,
): Product {
  const data = snapshot.data() as Product;
  const sourceChannelId = snapshot.ref.parent.parent?.id;

  return {
    ...data,
    channelId: data.channelId ?? sourceChannelId ?? fallbackChannelId,
    id: data.id || snapshot.id,
  };
}

function isAvailableProduct(product: Product, tenantId?: string): boolean {
  return (
    product.active !== false &&
    product.availability?.availableForPurchase !== false &&
    isTenantVisible(product, tenantId)
  );
}

function compareProductsByName(left: Product, right: Product): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function dedupeProducts(products: readonly Product[]): Product[] {
  return Array.from(
    new Map(
      products.map((product) => [
        `${product.channelId ?? ""}:${product.id}`,
        product,
      ]),
    ).values(),
  );
}

async function listProducts(
  firestore: AdminFirestore,
  input: {
    channelId: string;
    limit: number;
    offset: number;
    tenantId?: string;
  },
): Promise<Product[]> {
  const fetchLimit = Math.min(input.offset + input.limit, 500);
  let directQuery = firestore
    .collection(`channels/${input.channelId}/products`)
    .where("active", "==", true) as FirebaseFirestore.Query;
  let linkedQuery = firestore
    .collectionGroup("products")
    .where("active", "==", true)
    .where(
      "linkedChannels",
      "array-contains",
      input.channelId,
    ) as FirebaseFirestore.Query;

  if (input.tenantId) {
    directQuery = directQuery.where("tenantId", "==", input.tenantId);
    linkedQuery = linkedQuery.where("tenantId", "==", input.tenantId);
  }

  const [directSnapshot, linkedSnapshot] = await Promise.all([
    directQuery.limit(fetchLimit).get(),
    linkedQuery.limit(fetchLimit).get(),
  ]);
  const products = dedupeProducts(
    [...directSnapshot.docs, ...linkedSnapshot.docs]
      .map((doc) => productFromSnapshot(doc, input.channelId))
      .filter((product) => isAvailableProduct(product, input.tenantId)),
  ).toSorted(compareProductsByName);

  return products.slice(input.offset, input.offset + input.limit);
}

export function createFirestoreToolLayerReaders(
  firestore: AdminFirestore = getAdminFirestore(),
  options: {
    tenantId?: string;
  } = {},
): ToolLayerReaders {
  const tenantId = options.tenantId;

  return {
    getAttributeOptionCosts: async (input) =>
      getApprovedAttributeOptionCosts({
        ...input,
        tenantId,
      }),
    getBusinessRecord: async ({ channelId, recordId, resource }) => {
      const descriptor = getBusinessResourceDescriptor(resource);

      if (descriptor.source === "fakturownia") {
        if (tenantId) {
          return null;
        }

        return getFakturowniaInvoiceRecord(recordId);
      }

      return getFirestoreBusinessRecord(firestore, {
        channelId,
        recordId,
        resource,
        tenantId,
      });
    },
    getDraftRecord: async ({ runId }) => {
      const snapshot = await firestore.collection("agents").doc(runId).get();

      if (!snapshot.exists || !isTenantVisible(snapshot.data(), tenantId)) {
        return null;
      }

      return toMcpDraftRecord(snapshot.id, snapshot.data() ?? {});
    },
    listChannels: async () => {
      return listActiveChannels(firestore, tenantId);
    },
    listBusinessRecords: async ({ channelId, limit, query, resource }) => {
      const descriptor = getBusinessResourceDescriptor(resource);

      if (descriptor.source === "fakturownia") {
        if (tenantId) {
          return [];
        }

        return listFakturowniaInvoiceRecords({ limit, query });
      }

      return listFirestoreBusinessRecords(firestore, {
        channelId,
        limit,
        query,
        resource,
        tenantId,
      });
    },
    queryBusinessRecords: async ({
      channelId,
      limit,
      offset,
      orderBy,
      resource,
      where,
    }) => {
      const descriptor = getBusinessResourceDescriptor(resource);

      if (descriptor.source !== "firestore") {
        throw new Error(`${resource} is not backed by Firestore.`);
      }

      return queryFirestoreBusinessRecords(firestore, {
        channelId,
        limit,
        offset,
        orderBy,
        resource,
        tenantId,
        where,
      });
    },
    listAttributes: async () => {
      let query = firestore
        .collection("attributes")
        .where("active", "==", true);
      if (tenantId) {
        query = query.where("tenantId", "==", tenantId);
      }

      const snapshot = await query.limit(300).get();

      return snapshot.docs.map(
        (doc) =>
          ({
            ...doc.data(),
            id: doc.id,
          }) as Attribute,
      );
    },
    listCategories: async ({ channelId }) => {
      let query = firestore.collection(
        `channels/${channelId}/categories`,
      ) as FirebaseFirestore.Query;
      if (tenantId) {
        query = query.where("tenantId", "==", tenantId);
      }

      const snapshot = await query.limit(300).get();

      return snapshot.docs.map(
        (doc) =>
          ({
            ...doc.data(),
            id: doc.id,
          }) as Category,
      );
    },
    getCustomer: async (customerId) => {
      const snapshot = await firestore.doc(`/customers/${customerId}`).get();
      if (!snapshot.exists || !isTenantVisible(snapshot.data(), tenantId)) {
        return null;
      }

      return snapshot.data() as Customer;
    },
    getCustomerOrders: async ({ channelId, customerId, limit }) => {
      const ordersRef = firestore.collection(`channels/${channelId}/orders`);
      let ordersQuery = ordersRef
        .where("customerId", "==", customerId)
        .limit(limit);
      if (tenantId) {
        ordersQuery = ordersQuery.where("tenantId", "==", tenantId);
      }

      const snapshot = await ordersQuery.get();
      const docs = snapshot.empty
        ? (
            await (
              tenantId
                ? ordersRef
                    .where("customer.id", "==", customerId)
                    .where("tenantId", "==", tenantId)
                : ordersRef.where("customer.id", "==", customerId)
            )
              .limit(limit)
              .get()
          ).docs
        : snapshot.docs;

      return docs
        .map((doc) => doc.data() as Order)
        .filter((order) => order.active);
    },
    getDynamicPricingAttributes: (attributeIds) =>
      getDynamicPricingAttributes(firestore, attributeIds, tenantId),
    getDynamicPricingPresetsByIds: ({ channelId, presetIds }) =>
      getDynamicPricingPresetsByIds(firestore, channelId, presetIds, tenantId),
    getOrder: ({ channelId, orderId }) =>
      getOrder(firestore, channelId, orderId, tenantId),
    getOrderByNumber: ({ channelId, orderNumber }) =>
      getOrderByNumber(firestore, channelId, orderNumber, tenantId),
    getProduct: ({ channelId, productId }) =>
      getProduct(firestore, channelId, productId, tenantId),
    getProductCosts: async (input) =>
      getApprovedProductCosts({
        ...input,
        tenantId,
      }),
    getProductDynamicPricing: ({ channelId, productId }) =>
      getProductDynamicPricing(firestore, channelId, productId, tenantId),
    listProductPriceRows: (input) =>
      listProductPriceRows(firestore, { ...input, tenantId }),
    listOrdersByIds: async ({ channelId, orderIds }) => {
      const orders = await Promise.all(
        uniqueValues(orderIds).map((orderId) =>
          getOrder(firestore, channelId, orderId, tenantId),
        ),
      );

      return orders.filter((order): order is Order => Boolean(order));
    },
    listOrders: ({ channelId, limit, offset }) =>
      listOrders(firestore, { channelId, limit, offset, tenantId }),
    listProducts: ({ channelId, limit, offset }) =>
      listProducts(firestore, { channelId, limit, offset, tenantId }),
    listProductCostMappings: async (input) =>
      listProductCostMappings({
        ...input,
        tenantId,
      }),
    listProductsByIds: async ({ channelId, productIds }) => {
      const products = await Promise.all(
        uniqueValues(productIds).map((productId) =>
          getProduct(firestore, channelId, productId, tenantId),
        ),
      );

      return products.filter((product): product is Product => Boolean(product));
    },
    listProductTypes: async () => {
      let query = firestore
        .collection("productTypes")
        .where("active", "==", true);
      if (tenantId) {
        query = query.where("tenantId", "==", tenantId);
      }

      const snapshot = await query.limit(300).get();

      return snapshot.docs.map(
        (doc) =>
          ({
            ...doc.data(),
            id: doc.id,
          }) as ProductType,
      );
    },
    searchCustomers: ({ limit, query }) =>
      searchCustomersIndex(query, 0, limit, undefined, tenantId),
    searchOrders: async ({ channelId, limit, page, query }) => {
      const result = await searchOrdersIndex(
        query,
        channelId,
        page,
        limit,
        [],
        undefined,
        tenantId,
      );
      return {
        orderIds: result.results,
        totalHits: result.totalHits,
      };
    },
    searchProducts: async ({ channelId, limit, query }) =>
      (await searchProductsIndex(query, channelId, undefined, tenantId)).slice(
        0,
        limit,
      ),
    searchCostEvidence: async (input) =>
      searchApprovedCostEvidence({
        ...input,
        tenantId,
      }),
    searchMaterialCostsByQuery: async (input) =>
      searchMaterialCostsByQuery({
        ...input,
        tenantId,
      }),
  };
}
