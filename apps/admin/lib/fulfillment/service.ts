import "server-only";

import {
  AdminAuthError,
  requireAdminAuth,
  requireTenantAdminAuth,
} from "@/actions/auth-utils";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { processOrderStockDeductionForUpdate } from "@/lib/stock/order-stock-service";
import type {
  Attribute,
  Channel,
  FulfillmentRequest,
  FulfillmentRequestStatus,
  NestedMember,
  Order,
  Product,
  ProductionCooperationOrderItemPayload,
  ProductionCooperationProductAttributePayload,
  TenantCooperation,
  Warehouse,
} from "@konfi/types";
import {
  FulfillmentRequestStatus as FulfillmentStatus,
  hasProductionCooperationPaidPlans,
  hasTenantCooperationProductSharingAccess,
} from "@konfi/types";
import { applyOrderItemStatusChange } from "@konfi/utils";
import { Timestamp } from "firebase-admin/firestore";
import type {
  AssignOrderItemWarehouseData,
  AcceptFulfillmentRequestData,
  CleanupFulfillmentRequestsResponse,
  CreateManualFulfillmentRequestData,
  FulfillmentMutationResponse,
  OrderCreatedFulfillmentData,
  OrderCreatedFulfillmentResponse,
  RejectFulfillmentRequestData,
  UpdateItemStatusData,
} from "./types";
import { FulfillmentApiError, createSystemMember } from "./types";

type AdminTimestamp = Timestamp;

type StoredFulfillmentRequest = Omit<
  FulfillmentRequest,
  | "requestedAt"
  | "createdAt"
  | "updatedAt"
  | "acceptedAt"
  | "rejectedAt"
  | "cancelledAt"
  | "status"
> & {
  requestedAt: AdminTimestamp;
  createdAt: AdminTimestamp;
  updatedAt: AdminTimestamp;
  acceptedAt?: AdminTimestamp;
  rejectedAt?: AdminTimestamp;
  cancelledAt?: AdminTimestamp;
  status: FulfillmentRequestStatus;
};

const SYSTEM_MEMBER = createSystemMember();
const TTL_SECONDS = 2 * 24 * 60 * 60;
const tenantCooperationsCollection = "tenantCooperations";
const attributesCollection = "attributes";
const DIRECT_ASSIGNMENT_SOURCE = "DIRECT";

interface FulfillmentServiceOptions {
  skipTenantAuth?: boolean;
}

interface FulfillmentTenantScope {
  sourceTenantId?: string;
  targetTenantId?: string;
  cooperationId?: string;
}

function normalizeTenantId(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" || trimmed === "default" ? undefined : trimmed;
}

function assertTenantOverrideMatches(params: {
  fieldName: string;
  provided?: string;
  actual?: string;
}) {
  if (!params.provided) {
    return;
  }

  if (params.provided !== params.actual) {
    throw new FulfillmentApiError(
      `${params.fieldName} does not match the stored document tenant`,
      403,
    );
  }
}

async function requireTenantAdminForFulfillment(
  tenantId?: string,
  options?: FulfillmentServiceOptions,
) {
  if (options?.skipTenantAuth) {
    return;
  }

  if (tenantId) {
    await requireTenantAdminAuth(tenantId);
    return;
  }

  await requireAdminAuth();
}

function makeRequestId(
  orderId: string,
  itemId: string,
  warehouseId: string,
): string {
  return `${orderId}_${itemId}_${warehouseId}`;
}

function getFulfillmentRequestPath(
  warehouseId: string,
  requestId: string,
): string {
  return `warehouses/${warehouseId}/fulfillmentRequests/${requestId}`;
}

function getStoredOrderPath(channelId: string, orderId: string): string {
  return `channels/${channelId}/orders/${orderId}`;
}

async function getChannel(channelId: string): Promise<Channel | null> {
  const snapshot = await getAdminDb().doc(`channels/${channelId}`).get();
  return snapshot.exists ? (snapshot.data() as Channel) : null;
}

async function getProduct(
  channelId: string,
  productId: string,
): Promise<Product | null> {
  const snapshot = await getAdminDb()
    .doc(`channels/${channelId}/products/${productId}`)
    .get();

  return snapshot.exists ? (snapshot.data() as Product) : null;
}

async function getAttributesByIds(
  attributeIds: string[],
): Promise<Attribute[]> {
  const uniqueAttributeIds = [...new Set(attributeIds)].filter(
    (attributeId) => attributeId.trim() !== "",
  );

  if (uniqueAttributeIds.length === 0) {
    return [];
  }

  const snapshots = await Promise.all(
    uniqueAttributeIds.map((attributeId) =>
      getAdminDb().doc(`${attributesCollection}/${attributeId}`).get(),
    ),
  );

  return snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => snapshot.data() as Attribute);
}

async function getWarehouse(warehouseId: string): Promise<Warehouse | null> {
  const snapshot = await getAdminDb().doc(`warehouses/${warehouseId}`).get();
  return snapshot.exists ? (snapshot.data() as Warehouse) : null;
}

async function getOrder(channelId: string, orderId: string): Promise<Order> {
  const snapshot = await getAdminDb()
    .doc(getStoredOrderPath(channelId, orderId))
    .get();

  if (!snapshot.exists) {
    throw new FulfillmentApiError(`Order ${orderId} not found`, 404);
  }

  return snapshot.data() as Order;
}

function buildProductAttributePayload(
  attribute: Attribute,
): ProductionCooperationProductAttributePayload {
  return {
    id: attribute.id,
    name: attribute.name,
    options: attribute.options.map((option) => ({
      color: option.color,
      customFormat: option.customFormat,
      formatHeight: option.formatHeight,
      formatWidth: option.formatWidth,
      label: option.label,
      pages: option.pages,
      value: option.value,
    })),
    required: attribute.required,
    type: attribute.type,
  };
}

function buildSelectedAttributePayload(params: {
  attributes: Attribute[];
  combination?: string | null;
  product?: Product | null;
}): NonNullable<
  ProductionCooperationOrderItemPayload["configuration"]
>["selectedAttributes"] {
  if (!params.product?.attributes || !params.combination) {
    return undefined;
  }

  const selectedValues = params.combination.split("-");

  return params.product.attributes
    .map((attributeId, index) => {
      const optionValue = selectedValues[index]?.trim();
      if (!optionValue) {
        return undefined;
      }

      const attribute = params.attributes.find(
        (candidate) => candidate.id === attributeId,
      );
      const option = attribute?.options.find(
        (candidate) => candidate.value === optionValue,
      );

      return {
        attributeId,
        attributeName: attribute?.name,
        optionLabel: option?.label,
        optionValue,
        required: attribute?.required,
      };
    })
    .filter((selection): selection is NonNullable<typeof selection> =>
      Boolean(selection),
    );
}

async function buildOrderItemSnapshot(params: {
  item: Order["items"][number];
  product?: Product | null;
}): Promise<ProductionCooperationOrderItemPayload> {
  const { item, product } = params;
  const attributeIds = product?.attributes ?? item.product?.attributes ?? [];
  const attributes = await getAttributesByIds(attributeIds);
  const selectedAttributes = buildSelectedAttributePayload({
    attributes,
    combination: item.combination,
    product,
  });
  const productName = item.product?.name || item.name;

  return {
    configuration: {
      advancedAttributeSelections: item.advancedAttributeSelections,
      calculatedCombination: item.calculatedCombination ?? null,
      combination: item.combination ?? null,
      customFormat: item.customFormat,
      customSizes: item.customSizes,
      pageCount: item.pageCount ?? null,
      preview: item.preview,
      selectedAttributes:
        selectedAttributes && selectedAttributes.length > 0
          ? selectedAttributes
          : undefined,
      volume: item.volume,
    },
    description: item.description,
    height: item.height,
    id: item.id,
    name: productName,
    product: {
      attributeIds,
      attributes: attributes.map(buildProductAttributePayload),
      channelId: product?.channelId ?? item.product?.channelId,
      id: product?.id ?? item.product?.id,
      name: product?.name ?? item.product?.name,
      requiredAttributeIds: attributes
        .filter((attribute) => attribute.required)
        .map((attribute) => attribute.id),
    },
    productId: product?.id ?? item.product?.id,
    productName,
    quantity: item.quantity,
    unit: item.unit,
    width: item.width,
  };
}

function isSameDatabaseCooperationCandidate(
  cooperation: TenantCooperation,
  params: {
    sourceTenantId: string;
    targetTenantId: string;
    warehouseId: string;
  },
): boolean {
  return (
    cooperation.active === true &&
    cooperation.status === "ACTIVE" &&
    cooperation.transport === "SAME_DATABASE" &&
    cooperation.sourceTenantId === params.sourceTenantId &&
    cooperation.targetTenantId === params.targetTenantId &&
    (!cooperation.targetWarehouseIds ||
      cooperation.targetWarehouseIds.length === 0 ||
      cooperation.targetWarehouseIds.includes(params.warehouseId))
  );
}

function assertSameDatabaseCooperationPaidPlans(
  cooperation: TenantCooperation,
) {
  if (!hasProductionCooperationPaidPlans(cooperation)) {
    throw new FulfillmentApiError(
      "Same-database tenant cooperation requires paid source and target plans",
      403,
    );
  }
}

function assertSameDatabaseCooperationProductSharingAccess(
  cooperation: TenantCooperation,
  productId: string,
) {
  if (!hasTenantCooperationProductSharingAccess(cooperation, productId)) {
    throw new FulfillmentApiError(
      "Same-database tenant cooperation does not allow access to this product",
      403,
    );
  }
}

async function getActiveTenantCooperation(params: {
  cooperationId?: string;
  productId: string;
  sourceTenantId?: string;
  targetTenantId?: string;
  warehouseId: string;
}): Promise<TenantCooperation | null> {
  if (!params.sourceTenantId || !params.targetTenantId) {
    return null;
  }

  const sourceTenantId = params.sourceTenantId;
  const targetTenantId = params.targetTenantId;

  if (sourceTenantId === targetTenantId) {
    return null;
  }

  if (params.cooperationId) {
    const snapshot = await getAdminDb()
      .doc(`${tenantCooperationsCollection}/${params.cooperationId}`)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const cooperation = {
      ...snapshot.data(),
      id: snapshot.id,
    } as TenantCooperation;

    const candidateMatches = isSameDatabaseCooperationCandidate(cooperation, {
      sourceTenantId,
      targetTenantId,
      warehouseId: params.warehouseId,
    });

    if (!candidateMatches) {
      return null;
    }

    assertSameDatabaseCooperationPaidPlans(cooperation);
    assertSameDatabaseCooperationProductSharingAccess(
      cooperation,
      params.productId,
    );

    return cooperation;
  }

  const snapshot = await getAdminDb()
    .collection(tenantCooperationsCollection)
    .where("sourceTenantId", "==", sourceTenantId)
    .where("targetTenantId", "==", targetTenantId)
    .where("status", "==", "ACTIVE")
    .where("transport", "==", "SAME_DATABASE")
    .get();

  const matchingCooperations = snapshot.docs
    .map(
      (documentSnapshot) =>
        ({
          ...documentSnapshot.data(),
          id: documentSnapshot.id,
        }) as TenantCooperation,
    )
    .filter((candidate) =>
      isSameDatabaseCooperationCandidate(candidate, {
        sourceTenantId,
        targetTenantId,
        warehouseId: params.warehouseId,
      }),
    );

  const cooperation = matchingCooperations.find(
    (candidate) =>
      hasProductionCooperationPaidPlans(candidate) &&
      hasTenantCooperationProductSharingAccess(candidate, params.productId),
  );

  if (cooperation) {
    return cooperation;
  }

  const paidCooperation = matchingCooperations.find((candidate) =>
    hasProductionCooperationPaidPlans(candidate),
  );

  if (paidCooperation) {
    assertSameDatabaseCooperationProductSharingAccess(
      paidCooperation,
      params.productId,
    );
  }

  const matchingCooperation = matchingCooperations[0];
  if (matchingCooperation) {
    assertSameDatabaseCooperationPaidPlans(matchingCooperation);
  }

  return null;
}

async function resolveFulfillmentTenantScope(params: {
  order: Order;
  productId: string;
  warehouse: Warehouse;
  warehouseId: string;
  sourceTenantId?: string;
  targetTenantId?: string;
  cooperationId?: string;
}): Promise<FulfillmentTenantScope> {
  const orderTenantId = normalizeTenantId(params.order.tenantId);
  const warehouseTenantId = normalizeTenantId(params.warehouse.tenantId);
  const sourceTenantId =
    normalizeTenantId(params.sourceTenantId) ?? orderTenantId;
  const targetTenantId =
    normalizeTenantId(params.targetTenantId) ?? warehouseTenantId;

  assertTenantOverrideMatches({
    fieldName: "sourceTenantId",
    provided: normalizeTenantId(params.sourceTenantId),
    actual: orderTenantId,
  });
  assertTenantOverrideMatches({
    fieldName: "targetTenantId",
    provided: normalizeTenantId(params.targetTenantId),
    actual: warehouseTenantId,
  });

  if (sourceTenantId && targetTenantId && sourceTenantId !== targetTenantId) {
    const cooperation = await getActiveTenantCooperation({
      cooperationId: params.cooperationId,
      productId: params.productId,
      sourceTenantId,
      targetTenantId,
      warehouseId: params.warehouseId,
    });

    if (!cooperation) {
      throw new FulfillmentApiError(
        "Active same-database tenant cooperation is required",
        403,
      );
    }

    return {
      sourceTenantId,
      targetTenantId,
      cooperationId: cooperation.id,
    };
  }

  return {
    sourceTenantId,
    targetTenantId,
  };
}

function buildStoredFulfillmentRequest(params: {
  requestId: string;
  order: Order;
  itemId: string;
  warehouseId: string;
  productId: string;
  productName: string;
  orderItemSnapshot?: ProductionCooperationOrderItemPayload;
  quantity: number;
  unit: Order["items"][number]["unit"];
  actor: NestedMember;
  sourceTenantId?: string;
  targetTenantId?: string;
  cooperationId?: string;
}): StoredFulfillmentRequest {
  const now = Timestamp.now();

  return {
    id: params.requestId,
    name: `${params.order.number} - ${params.productName}`,
    orderId: params.order.id,
    orderNumber: params.order.number,
    channelId: params.order.channelId,
    itemId: params.itemId,
    productId: params.productId,
    productName: params.productName,
    orderItemSnapshot: params.orderItemSnapshot,
    quantity: params.quantity,
    unit: params.unit,
    message: params.order.specialNotes || undefined,
    requestedAt: now,
    status: FulfillmentStatus.PENDING,
    targetWarehouseId: params.warehouseId,
    tenantId: params.targetTenantId,
    sourceTenantId: params.sourceTenantId,
    targetTenantId: params.targetTenantId,
    cooperationId: params.cooperationId,
    url: `/orders/${params.order.id}?channelId=${params.order.channelId}`,
    active: true,
    createdAt: now,
    createdBy: params.actor,
    updatedAt: now,
    updatedBy: params.actor,
    keywords: [],
  };
}

function asStoredFulfillmentRequest(data: unknown): StoredFulfillmentRequest {
  return data as StoredFulfillmentRequest;
}

function getFulfillmentRequestTargetTenantId(
  fulfillmentRequest: StoredFulfillmentRequest,
): string | undefined {
  return (
    normalizeTenantId(fulfillmentRequest.targetTenantId) ??
    normalizeTenantId(fulfillmentRequest.tenantId)
  );
}

function isDirectFulfillmentAssignment(
  assignment: Order["items"][number]["fulfillmentAssignment"] | undefined,
): boolean {
  return assignment?.assignmentSource === DIRECT_ASSIGNMENT_SOURCE;
}

function isOrderItemAssignmentClosed(order: Order, itemId: string): boolean {
  return (
    order.fulfilledItems?.includes(itemId) === true ||
    order.pickedUpItems?.includes(itemId) === true ||
    order.deliveredItems?.includes(itemId) === true
  );
}

function assertDirectWarehouseAssignmentCanChange(
  order: Order,
  orderItem: Order["items"][number],
) {
  if (isOrderItemAssignmentClosed(order, orderItem.id)) {
    throw new FulfillmentApiError(
      "Cannot change warehouse assignment after item fulfillment has started",
      409,
    );
  }

  if (
    orderItem.warehouseId &&
    !isDirectFulfillmentAssignment(orderItem.fulfillmentAssignment)
  ) {
    throw new FulfillmentApiError(
      "Only direct warehouse assignments can be changed manually",
      409,
    );
  }
}

function resolveSameTenantWarehouseScope(params: {
  order: Order;
  warehouse: Warehouse;
}): FulfillmentTenantScope {
  const sourceTenantId = normalizeTenantId(params.order.tenantId);
  const targetTenantId = normalizeTenantId(params.warehouse.tenantId);

  if (sourceTenantId !== targetTenantId) {
    throw new FulfillmentApiError(
      "Direct warehouse assignment is only allowed for same-tenant warehouses",
      403,
    );
  }

  return {
    sourceTenantId,
    targetTenantId,
  };
}

function clearOrderItemWarehouseAssignment(
  orderItem: Order["items"][number],
): Order["items"][number] {
  const {
    fulfillmentAssignment: _fulfillmentAssignment,
    warehouseId: _warehouseId,
    ...rest
  } = orderItem;

  return rest;
}

async function getStoredFulfillmentRequest(params: {
  warehouseId: string;
  requestId: string;
}): Promise<StoredFulfillmentRequest> {
  const requestSnapshot = await getAdminDb()
    .doc(getFulfillmentRequestPath(params.warehouseId, params.requestId))
    .get();

  if (!requestSnapshot.exists) {
    throw new FulfillmentApiError("Fulfillment request not found", 404);
  }

  return asStoredFulfillmentRequest(requestSnapshot.data());
}

async function requireFulfillmentRequestTargetAuth(
  fulfillmentRequest: StoredFulfillmentRequest,
  dataTargetTenantId?: string,
  options?: FulfillmentServiceOptions,
) {
  const targetTenantId =
    getFulfillmentRequestTargetTenantId(fulfillmentRequest);
  assertTenantOverrideMatches({
    fieldName: "targetTenantId",
    provided: normalizeTenantId(dataTargetTenantId),
    actual: targetTenantId,
  });

  await requireTenantAdminForFulfillment(targetTenantId, options);
}

async function requireOrderItemStatusAuth(params: {
  order: Order;
  itemId: string;
  options?: FulfillmentServiceOptions;
}) {
  if (params.options?.skipTenantAuth) {
    return;
  }

  const orderItem = params.order.items.find(
    (item) => item.id === params.itemId,
  );
  const targetTenantId = normalizeTenantId(
    orderItem?.fulfillmentAssignment?.targetTenantId,
  );

  if (targetTenantId) {
    try {
      await requireTenantAdminAuth(targetTenantId);
      return;
    } catch (error) {
      if (!(error instanceof AdminAuthError)) {
        throw error;
      }
    }
  }

  await requireTenantAdminForFulfillment(
    normalizeTenantId(params.order.tenantId),
    params.options,
  );
}

export async function processOrderCreatedFulfillment(
  data: OrderCreatedFulfillmentData,
  options?: FulfillmentServiceOptions,
): Promise<OrderCreatedFulfillmentResponse> {
  const order = await getOrder(data.channelId, data.orderId);
  await requireTenantAdminForFulfillment(
    normalizeTenantId(order.tenantId),
    options,
  );

  const channel = await getChannel(data.channelId);
  const orderChannelWarehouseIds = new Set(channel?.warehouses ?? []);
  let createdCount = 0;
  let skippedCount = 0;

  for (const item of order.items) {
    const productId = item.product?.id;
    const productName = item.product?.name || item.name;
    const productChannelId = item.product?.channelId;

    if (!productId || !productChannelId) {
      skippedCount++;
      continue;
    }

    const product = await getProduct(productChannelId, productId);
    const orderItemSnapshot = await buildOrderItemSnapshot({
      item,
      product,
    });
    const warehouseIdsToNotify = new Set(
      (product?.linkedWarehouses ?? []).filter(
        (warehouseId): warehouseId is string =>
          typeof warehouseId === "string" && warehouseId.trim() !== "",
      ),
    );

    if (warehouseIdsToNotify.size === 0) {
      skippedCount++;
      continue;
    }

    for (const warehouseId of warehouseIdsToNotify) {
      if (orderChannelWarehouseIds.has(warehouseId)) {
        skippedCount++;
        continue;
      }

      const warehouse = await getWarehouse(warehouseId);
      if (!warehouse) {
        skippedCount++;
        continue;
      }

      let tenantScope: FulfillmentTenantScope;
      try {
        tenantScope = await resolveFulfillmentTenantScope({
          order,
          productId,
          warehouse,
          warehouseId,
        });
      } catch (error) {
        if (error instanceof FulfillmentApiError && error.statusCode === 403) {
          skippedCount++;
          continue;
        }

        throw error;
      }

      const requestId = makeRequestId(order.id, item.id, warehouseId);
      const requestRef = getAdminDb().doc(
        `warehouses/${warehouseId}/fulfillmentRequests/${requestId}`,
      );

      const created = await getAdminDb().runTransaction(async (transaction) => {
        const existingSnapshot = await transaction.get(requestRef);

        if (existingSnapshot.exists) {
          return false;
        }

        transaction.set(
          requestRef,
          buildStoredFulfillmentRequest({
            requestId,
            order,
            itemId: item.id,
            warehouseId,
            productId,
            productName,
            orderItemSnapshot,
            quantity: item.quantity,
            unit: item.unit,
            actor: SYSTEM_MEMBER,
            ...tenantScope,
          }),
        );

        return true;
      });

      if (created) {
        createdCount++;
      } else {
        skippedCount++;
      }
    }
  }

  return {
    success: true,
    message:
      createdCount > 0
        ? "Fulfillment requests processed successfully"
        : "No fulfillment requests required",
    createdCount,
    skippedCount,
  };
}

export async function createManualFulfillmentRequest(
  data: CreateManualFulfillmentRequestData,
  actor: NestedMember,
  options?: FulfillmentServiceOptions,
): Promise<FulfillmentMutationResponse> {
  const order = await getOrder(data.channelId, data.orderId);
  const orderItem = order.items.find((item) => item.id === data.itemId);

  if (!orderItem) {
    throw new FulfillmentApiError(
      `Item ${data.itemId} not found in order ${data.orderId}`,
      404,
    );
  }

  const productId = orderItem.product?.id;
  if (!productId) {
    throw new FulfillmentApiError(
      "Order item must have a valid product ID",
      400,
    );
  }

  const productName = orderItem.product?.name || orderItem.name;
  const product = orderItem.product?.channelId
    ? await getProduct(orderItem.product.channelId, productId)
    : null;
  const orderItemSnapshot = await buildOrderItemSnapshot({
    item: orderItem,
    product,
  });
  const warehouse = await getWarehouse(data.warehouseId);
  if (!warehouse) {
    throw new FulfillmentApiError(
      `Warehouse ${data.warehouseId} not found`,
      404,
    );
  }

  const tenantScope = await resolveFulfillmentTenantScope({
    order,
    productId,
    warehouse,
    warehouseId: data.warehouseId,
    sourceTenantId: data.sourceTenantId,
    targetTenantId: data.targetTenantId,
    cooperationId: data.cooperationId,
  });

  await requireTenantAdminForFulfillment(tenantScope.sourceTenantId, options);

  const requestId = makeRequestId(data.orderId, data.itemId, data.warehouseId);
  const requestRef = getAdminDb().doc(
    `warehouses/${data.warehouseId}/fulfillmentRequests/${requestId}`,
  );

  const created = await getAdminDb().runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(requestRef);

    if (existingSnapshot.exists) {
      return false;
    }

    transaction.set(
      requestRef,
      buildStoredFulfillmentRequest({
        requestId,
        order,
        itemId: data.itemId,
        warehouseId: data.warehouseId,
        productId,
        productName,
        orderItemSnapshot,
        quantity: orderItem.quantity,
        unit: orderItem.unit,
        actor,
        ...tenantScope,
      }),
    );

    return true;
  });

  return {
    success: true,
    message: created
      ? "Fulfillment request created successfully"
      : "Fulfillment request already exists",
    created,
    requestId,
  };
}

export async function assignOrderItemWarehouse(
  data: AssignOrderItemWarehouseData,
  actor: NestedMember,
  options?: FulfillmentServiceOptions,
): Promise<FulfillmentMutationResponse> {
  const initialOrder = await getOrder(data.channelId, data.orderId);
  await requireTenantAdminForFulfillment(
    normalizeTenantId(initialOrder.tenantId),
    options,
  );

  const selectedWarehouse = data.warehouseId
    ? await getWarehouse(data.warehouseId)
    : null;

  if (data.warehouseId && !selectedWarehouse) {
    throw new FulfillmentApiError(
      `Warehouse ${data.warehouseId} not found`,
      404,
    );
  }

  const tenantScope = selectedWarehouse
    ? resolveSameTenantWarehouseScope({
        order: initialOrder,
        warehouse: selectedWarehouse,
      })
    : {
        sourceTenantId: normalizeTenantId(initialOrder.tenantId),
        targetTenantId: normalizeTenantId(initialOrder.tenantId),
      };
  const orderRef = getAdminDb().doc(
    getStoredOrderPath(data.channelId, data.orderId),
  );
  const requestId = data.warehouseId
    ? makeRequestId(data.orderId, data.itemId, data.warehouseId)
    : undefined;

  await getAdminDb().runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists) {
      throw new FulfillmentApiError(`Order ${data.orderId} not found`, 404);
    }

    const order = orderSnapshot.data() as Order;
    const itemIndex = order.items.findIndex((item) => item.id === data.itemId);

    if (itemIndex === -1) {
      throw new FulfillmentApiError(
        `Item ${data.itemId} not found in order ${data.orderId}`,
        404,
      );
    }

    const orderItem = order.items[itemIndex];
    assertDirectWarehouseAssignmentCanChange(order, orderItem);
    const now = Timestamp.now();
    const previousWarehouseId = orderItem.warehouseId;
    const previousRequestId =
      previousWarehouseId &&
      isDirectFulfillmentAssignment(orderItem.fulfillmentAssignment)
        ? (orderItem.fulfillmentAssignment?.requestId ??
          makeRequestId(data.orderId, data.itemId, previousWarehouseId))
        : undefined;
    const previousRequestRef =
      previousWarehouseId &&
      previousRequestId &&
      previousWarehouseId !== data.warehouseId
        ? getAdminDb().doc(
            getFulfillmentRequestPath(previousWarehouseId, previousRequestId),
          )
        : null;
    const previousRequestSnapshot = previousRequestRef
      ? await transaction.get(previousRequestRef)
      : null;
    const pendingRequestsQuery = data.warehouseId
      ? getAdminDb()
          .collectionGroup("fulfillmentRequests")
          .where("channelId", "==", data.channelId)
          .where("orderId", "==", data.orderId)
          .where("itemId", "==", data.itemId)
          .where("status", "==", FulfillmentStatus.PENDING)
      : null;
    const pendingRequestsSnapshot = pendingRequestsQuery
      ? await transaction.get(pendingRequestsQuery)
      : null;
    const assignedRequestPath = data.warehouseId
      ? getFulfillmentRequestPath(data.warehouseId, requestId!)
      : null;
    const updatedItems = [...order.items];

    if (!data.warehouseId) {
      updatedItems[itemIndex] = clearOrderItemWarehouseAssignment(orderItem);
    } else {
      const productId = orderItem.product?.id ?? orderItem.id;
      const productName = orderItem.product?.name || orderItem.name;
      const product = orderItem.product?.channelId
        ? await getProduct(orderItem.product.channelId, productId)
        : null;
      const orderItemSnapshot = await buildOrderItemSnapshot({
        item: orderItem,
        product,
      });
      const requestRef = getAdminDb().doc(
        getFulfillmentRequestPath(data.warehouseId, requestId!),
      );

      updatedItems[itemIndex] = {
        ...orderItem,
        warehouseId: data.warehouseId,
        fulfillmentAssignment: {
          requestId: requestId!,
          warehouseId: data.warehouseId,
          assignmentSource: DIRECT_ASSIGNMENT_SOURCE,
          sourceTenantId: tenantScope.sourceTenantId,
          targetTenantId: tenantScope.targetTenantId,
          acceptedAt: now,
          acceptedBy: actor,
        },
      };

      transaction.set(requestRef, {
        ...buildStoredFulfillmentRequest({
          requestId: requestId!,
          order,
          itemId: data.itemId,
          warehouseId: data.warehouseId,
          productId,
          productName,
          orderItemSnapshot,
          quantity: orderItem.quantity,
          unit: orderItem.unit,
          actor,
          ...tenantScope,
        }),
        acceptedAt: now,
        acceptedBy: actor,
        assignmentSource: DIRECT_ASSIGNMENT_SOURCE,
        status: FulfillmentStatus.ACCEPTED,
        updatedAt: now,
        updatedBy: actor,
      });
    }

    transaction.update(orderRef, {
      items: updatedItems,
    });

    if (previousRequestRef && previousRequestSnapshot?.exists) {
      transaction.update(previousRequestRef, {
        cancelledAt: now,
        cancelledBy: actor,
        cancelReason: data.warehouseId
          ? "Manual warehouse assignment changed"
          : "Manual warehouse assignment cleared",
        status: FulfillmentStatus.CANCELLED,
        updatedAt: now,
        updatedBy: actor,
      });
    }

    if (pendingRequestsSnapshot && assignedRequestPath) {
      pendingRequestsSnapshot.docs.forEach((pendingSnapshot) => {
        if (pendingSnapshot.ref.path === assignedRequestPath) {
          return;
        }

        transaction.update(pendingSnapshot.ref, {
          cancelledAt: now,
          cancelledBy: actor,
          cancelReason: "Manual warehouse assignment replaced this request",
          status: FulfillmentStatus.CANCELLED,
          updatedAt: now,
          updatedBy: actor,
        });
      });
    }
  });

  return {
    success: true,
    assigned: Boolean(data.warehouseId),
    message: data.warehouseId
      ? "Warehouse assigned successfully"
      : "Warehouse assignment cleared successfully",
    requestId,
  };
}

export async function acceptFulfillmentRequest(
  data: AcceptFulfillmentRequestData,
  actor: NestedMember,
  options?: FulfillmentServiceOptions,
): Promise<FulfillmentMutationResponse> {
  const requestRef = getAdminDb().doc(
    `warehouses/${data.warehouseId}/fulfillmentRequests/${data.requestId}`,
  );
  const initialRequest = await getStoredFulfillmentRequest(data);
  const authorizedTargetTenantId =
    getFulfillmentRequestTargetTenantId(initialRequest);

  await requireFulfillmentRequestTargetAuth(
    initialRequest,
    data.targetTenantId,
    options,
  );

  await getAdminDb().runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);

    if (!requestSnapshot.exists) {
      throw new FulfillmentApiError("Fulfillment request not found", 404);
    }

    const fulfillmentRequest = asStoredFulfillmentRequest(
      requestSnapshot.data(),
    );
    const currentTargetTenantId =
      getFulfillmentRequestTargetTenantId(fulfillmentRequest);
    if (currentTargetTenantId !== authorizedTargetTenantId) {
      throw new FulfillmentApiError(
        "Fulfillment request target tenant changed",
        409,
      );
    }

    if (fulfillmentRequest.status !== FulfillmentStatus.PENDING) {
      throw new FulfillmentApiError(
        `Request already ${fulfillmentRequest.status.toLowerCase()}`,
        409,
      );
    }

    const orderRef = getAdminDb().doc(
      getStoredOrderPath(
        fulfillmentRequest.channelId,
        fulfillmentRequest.orderId,
      ),
    );
    const pendingRequestsQuery = getAdminDb()
      .collectionGroup("fulfillmentRequests")
      .where("channelId", "==", fulfillmentRequest.channelId)
      .where("orderId", "==", fulfillmentRequest.orderId)
      .where("itemId", "==", fulfillmentRequest.itemId)
      .where("status", "==", FulfillmentStatus.PENDING);

    const [orderSnapshot, pendingRequestsSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(pendingRequestsQuery),
    ]);
    const now = Timestamp.now();

    transaction.update(requestRef, {
      assignmentSource: "FULFILLMENT_REQUEST",
      status: FulfillmentStatus.ACCEPTED,
      acceptedAt: now,
      acceptedBy: actor,
      updatedAt: now,
      updatedBy: actor,
    });

    if (orderSnapshot.exists) {
      const order = orderSnapshot.data() as Order;
      const itemIndex = order.items.findIndex(
        (item) => item.id === fulfillmentRequest.itemId,
      );

      if (itemIndex !== -1) {
        const updatedItems = [...order.items];
        updatedItems[itemIndex] = {
          ...updatedItems[itemIndex],
          warehouseId: data.warehouseId,
          fulfillmentAssignment: {
            requestId: data.requestId,
            warehouseId: data.warehouseId,
            assignmentSource: "FULFILLMENT_REQUEST",
            sourceTenantId: fulfillmentRequest.sourceTenantId,
            targetTenantId: currentTargetTenantId,
            cooperationId: fulfillmentRequest.cooperationId,
            acceptedAt: now,
            acceptedBy: actor,
          },
        };

        transaction.update(orderRef, {
          items: updatedItems,
        });
      }
    }

    pendingRequestsSnapshot.docs.forEach((pendingSnapshot) => {
      if (pendingSnapshot.ref.path === requestRef.path) {
        return;
      }

      transaction.update(pendingSnapshot.ref, {
        status: FulfillmentStatus.CANCELLED,
        cancelledAt: now,
        cancelledBy: actor,
        cancelReason: "Another warehouse accepted this request",
        updatedAt: now,
        updatedBy: actor,
      });
    });
  });

  return {
    success: true,
    message: "Fulfillment request accepted successfully",
  };
}

export async function rejectFulfillmentRequest(
  data: RejectFulfillmentRequestData,
  actor: NestedMember,
  options?: FulfillmentServiceOptions,
): Promise<FulfillmentMutationResponse> {
  const requestRef = getAdminDb().doc(
    `warehouses/${data.warehouseId}/fulfillmentRequests/${data.requestId}`,
  );
  const initialRequest = await getStoredFulfillmentRequest(data);
  const authorizedTargetTenantId =
    getFulfillmentRequestTargetTenantId(initialRequest);

  await requireFulfillmentRequestTargetAuth(
    initialRequest,
    data.targetTenantId,
    options,
  );

  await getAdminDb().runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);

    if (!requestSnapshot.exists) {
      throw new FulfillmentApiError("Fulfillment request not found", 404);
    }

    const fulfillmentRequest = asStoredFulfillmentRequest(
      requestSnapshot.data(),
    );
    const currentTargetTenantId =
      getFulfillmentRequestTargetTenantId(fulfillmentRequest);
    if (currentTargetTenantId !== authorizedTargetTenantId) {
      throw new FulfillmentApiError(
        "Fulfillment request target tenant changed",
        409,
      );
    }

    if (fulfillmentRequest.status !== FulfillmentStatus.PENDING) {
      throw new FulfillmentApiError(
        `Request already ${fulfillmentRequest.status.toLowerCase()}`,
        409,
      );
    }

    const now = Timestamp.now();
    transaction.update(requestRef, {
      status: FulfillmentStatus.REJECTED,
      rejectedAt: now,
      rejectedBy: actor,
      rejectionReason: data.reason,
      updatedAt: now,
      updatedBy: actor,
    });
  });

  return {
    success: true,
    message: "Fulfillment request rejected successfully",
  };
}

export async function updateFulfillmentItemStatus(
  data: UpdateItemStatusData,
  actor: NestedMember,
  options?: FulfillmentServiceOptions,
): Promise<FulfillmentMutationResponse> {
  const orderRef = getAdminDb().doc(
    getStoredOrderPath(data.channelId, data.orderId),
  );
  const initialOrder = await getOrder(data.channelId, data.orderId);
  await requireOrderItemStatusAuth({
    order: initialOrder,
    itemId: data.itemId,
    options,
  });
  let stockDeduction:
    | {
        after: Order;
        before: Order;
      }
    | undefined;

  await getAdminDb().runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists) {
      throw new FulfillmentApiError("Order not found", 404);
    }

    const order = orderSnapshot.data() as Order;
    const orderItem = order.items.find((item) => item.id === data.itemId);

    if (!orderItem) {
      throw new FulfillmentApiError(
        `Item ${data.itemId} not found in order ${data.orderId}`,
        404,
      );
    }

    const updatedCollections = applyOrderItemStatusChange(order, {
      itemId: data.itemId,
      fulfilled: data.fulfilled,
      inProgress: data.inProgress,
      pickedUp: data.pickedUp,
      delivered: data.delivered,
    });
    stockDeduction =
      data.fulfilled === true
        ? {
            after: {
              ...order,
              fulfilledItems: updatedCollections.fulfilledItems,
            },
            before: order,
          }
        : undefined;

    transaction.update(orderRef, {
      fulfilledItems: updatedCollections.fulfilledItems,
      inProgressItems: updatedCollections.inProgressItems,
      pickedUpItems: updatedCollections.pickedUpItems,
      deliveredItems: updatedCollections.deliveredItems,
    });

    if (data.fulfilled === true && orderItem.warehouseId) {
      const fulfillmentRequestId =
        orderItem.fulfillmentAssignment?.requestId ??
        makeRequestId(data.orderId, data.itemId, orderItem.warehouseId);
      const fulfillmentRequestRef = getAdminDb().doc(
        `warehouses/${orderItem.warehouseId}/fulfillmentRequests/${fulfillmentRequestId}`,
      );
      const fulfillmentRequestSnapshot = await transaction.get(
        fulfillmentRequestRef,
      );

      if (fulfillmentRequestSnapshot.exists) {
        const fulfillmentRequest = asStoredFulfillmentRequest(
          fulfillmentRequestSnapshot.data(),
        );

        if (fulfillmentRequest.status === FulfillmentStatus.ACCEPTED) {
          transaction.update(fulfillmentRequestRef, {
            status: FulfillmentStatus.FULFILLED,
            updatedAt: Timestamp.now(),
            updatedBy: actor,
          });
        }
      }
    }
  });

  if (stockDeduction) {
    try {
      await processOrderStockDeductionForUpdate({
        after: stockDeduction.after,
        before: stockDeduction.before,
        channelId: data.channelId,
        orderId: data.orderId,
      });
    } catch (error) {
      console.error("Failed to process stock deduction for fulfilled item", {
        channelId: data.channelId,
        error,
        itemId: data.itemId,
        orderId: data.orderId,
      });
    }
  }

  return {
    success: true,
    message: "Item status updated successfully",
  };
}

export async function cleanupExpiredFulfillmentRequests(): Promise<CleanupFulfillmentRequestsResponse> {
  const db = getAdminDb();
  const now = Timestamp.now();
  const expiryThreshold = new Timestamp(now.seconds - TTL_SECONDS, 0);
  const errors: string[] = [];
  let cancelledCount = 0;
  let syncedCount = 0;

  try {
    const expiredPendingSnapshot = await db
      .collectionGroup("fulfillmentRequests")
      .where("status", "==", FulfillmentStatus.PENDING)
      .where("requestedAt", "<=", expiryThreshold)
      .get();

    if (!expiredPendingSnapshot.empty) {
      const batch = db.batch();

      expiredPendingSnapshot.docs.forEach((snapshot) => {
        batch.update(snapshot.ref, {
          status: FulfillmentStatus.CANCELLED,
          cancelReason: "Request expired (TTL: 2 days)",
          cancelledAt: now,
          cancelledBy: SYSTEM_MEMBER,
          updatedAt: now,
          updatedBy: SYSTEM_MEMBER,
        });
      });

      await batch.commit();
      cancelledCount = expiredPendingSnapshot.size;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Cancel PENDING: ${message}`);
  }

  try {
    const acceptedRequestsSnapshot = await db
      .collectionGroup("fulfillmentRequests")
      .where("status", "==", FulfillmentStatus.ACCEPTED)
      .get();

    await Promise.all(
      acceptedRequestsSnapshot.docs.map(async (snapshot) => {
        const request = snapshot.data() as Partial<StoredFulfillmentRequest>;
        if (
          typeof request.channelId !== "string" ||
          typeof request.orderId !== "string" ||
          typeof request.itemId !== "string"
        ) {
          return;
        }

        try {
          const orderSnapshot = await db
            .doc(getStoredOrderPath(request.channelId, request.orderId))
            .get();

          if (!orderSnapshot.exists) {
            await snapshot.ref.update({
              status: FulfillmentStatus.CANCELLED,
              cancelReason: "Order no longer exists",
              cancelledAt: now,
              cancelledBy: SYSTEM_MEMBER,
              updatedAt: now,
              updatedBy: SYSTEM_MEMBER,
            });
            syncedCount++;
            return;
          }

          const order = orderSnapshot.data() as Order;
          if ((order.fulfilledItems ?? []).includes(request.itemId)) {
            await snapshot.ref.update({
              status: FulfillmentStatus.FULFILLED,
              updatedAt: now,
              updatedBy: SYSTEM_MEMBER,
            });
            syncedCount++;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          errors.push(`Sync ACCEPTED ${snapshot.id}: ${message}`);
        }
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Sync ACCEPTED: ${message}`);
  }

  return {
    success: errors.length === 0,
    message:
      errors.length === 0
        ? "Fulfillment request cleanup completed successfully"
        : "Fulfillment request cleanup completed with errors",
    cancelledCount,
    syncedCount,
    errors,
  };
}
