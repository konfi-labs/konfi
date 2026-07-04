"use server";

import {
  getAuthenticatedAdminMember,
  requireTenantAdminAuthContext,
  requireTenantAdminChannelAccess,
} from "@/actions/auth-utils";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  type AttributeStock,
  type Base,
  type InventoryMovement,
  InventoryLedgerSubjectType,
  InventoryMovementType,
  type Order,
  type Stock,
} from "@konfi/types";
import { getAttributeStockId, getInventoryMovementDelta } from "@konfi/utils";
import { Timestamp } from "firebase-admin/firestore";
import { processOrderStockReservation } from "@/lib/stock/order-stock-service";
import {
  isStockReservationError,
  type StockReservationError,
} from "@/lib/stock/stock-management-admin";

function normalizeTotalStock(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Stock total must be a finite number");
  }

  const normalized = Math.floor(value);
  if (normalized < 0) {
    throw new Error("Stock total cannot be negative");
  }

  return normalized;
}

function nowTimestamp(): Stock["updatedAt"] & Base["createdAt"] {
  return Timestamp.now() as unknown as Stock["updatedAt"] & Base["createdAt"];
}

function createMovementName(params: {
  attributeId?: string;
  attributeOptionValue?: string;
  productId?: string;
}) {
  if (params.productId) {
    return `${InventoryMovementType.STOCK_ADJUSTED} ${params.productId}`;
  }

  return `${InventoryMovementType.STOCK_ADJUSTED} ${params.attributeId}:${params.attributeOptionValue}`;
}

export type AdminOrderStockResult =
  | { ok: true }
  | {
      available: number;
      code: StockReservationError["code"] | "STOCK_CHECK_FAILED";
      message: string;
      ok: false;
      requested: number;
      target?: StockReservationError["target"];
    };

function toAdminOrderStockResult(error: unknown): AdminOrderStockResult {
  if (isStockReservationError(error)) {
    return {
      available: error.available,
      code: error.code,
      message: error.message,
      ok: false,
      requested: error.requested,
      target: error.target,
    };
  }

  return {
    available: 0,
    code: "STOCK_CHECK_FAILED",
    message:
      error instanceof Error ? error.message : "Stock validation failed",
    ok: false,
    requested: 0,
  };
}

export async function setAdminProductStock(params: {
  channelId: string;
  productId: string;
  totalStock: number;
  warehouseId: string;
}) {
  const [authorizedChannelId, actor, { tenantContext }] = await Promise.all([
    requireTenantAdminChannelAccess(params.channelId),
    getAuthenticatedAdminMember(),
    requireTenantAdminAuthContext(),
  ]);
  const totalStock = normalizeTotalStock(params.totalStock);
  const db = getAdminDb();
  const stockRef = db.doc(
    `channels/${authorizedChannelId}/warehouses/${params.warehouseId}/stock/${params.productId}`,
  );
  const movementRef = stockRef.parent.parent
    ?.collection("inventoryMovements")
    .doc();

  if (!movementRef) {
    throw new Error("Warehouse reference could not be resolved");
  }

  await db.runTransaction(async (transaction) => {
    const stockDoc = await transaction.get(stockRef);
    const existingStock = stockDoc.exists
      ? (stockDoc.data() as Stock)
      : undefined;
    const existingTotal = existingStock?.total ?? 0;
    const existingAllocated = existingStock?.allocated ?? 0;
    const totalDelta = totalStock - existingTotal;
    const timestamp = nowTimestamp();

    if (!stockDoc.exists) {
      transaction.set(stockRef, {
        active: true,
        allocated: 0,
        createdAt: timestamp,
        createdBy: actor,
        id: params.productId,
        name: `Stock for ${params.productId}`,
        total: totalStock,
        updatedAt: timestamp,
        updatedBy: actor,
        ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
      } satisfies Stock & { tenantId?: string });
    } else {
      transaction.update(stockRef, {
        total: totalStock,
        updatedAt: timestamp,
        updatedBy: actor,
      });
    }

    if (totalDelta === 0) {
      return;
    }

    const delta = getInventoryMovementDelta(
      InventoryMovementType.STOCK_ADJUSTED,
      totalDelta,
    );
    const movement: InventoryMovement = {
      ...delta,
      active: true,
      channelId: authorizedChannelId,
      createdAt: timestamp,
      createdBy: actor,
      id: movementRef.id,
      movementType: InventoryMovementType.STOCK_ADJUSTED,
      name: createMovementName({ productId: params.productId }),
      productId: params.productId,
      quantity: totalDelta,
      resultingAllocated: existingAllocated,
      resultingAvailable: totalStock - existingAllocated,
      resultingTotal: totalStock,
      subjectType: InventoryLedgerSubjectType.PRODUCT,
      updatedAt: timestamp,
      updatedBy: actor,
      warehouseId: params.warehouseId,
      ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
    };

    transaction.set(movementRef, movement);
  });
}

export async function setAdminAttributeStock(params: {
  attributeId: string;
  channelId: string;
  optionValue: string;
  totalStock: number;
  warehouseId: string;
}) {
  const [authorizedChannelId, actor, { tenantContext }] = await Promise.all([
    requireTenantAdminChannelAccess(params.channelId),
    getAuthenticatedAdminMember(),
    requireTenantAdminAuthContext(),
  ]);
  const totalStock = normalizeTotalStock(params.totalStock);
  const db = getAdminDb();
  const stockId = getAttributeStockId(params.attributeId, params.optionValue);
  const stockRef = db.doc(
    `channels/${authorizedChannelId}/warehouses/${params.warehouseId}/attributeStock/${stockId}`,
  );
  const movementRef = stockRef.parent.parent
    ?.collection("inventoryMovements")
    .doc();

  if (!movementRef) {
    throw new Error("Warehouse reference could not be resolved");
  }

  await db.runTransaction(async (transaction) => {
    const stockDoc = await transaction.get(stockRef);
    const existingStock = stockDoc.exists
      ? (stockDoc.data() as AttributeStock)
      : undefined;
    const existingTotal = existingStock?.total ?? 0;
    const existingAllocated = existingStock?.allocated ?? 0;
    const totalDelta = totalStock - existingTotal;
    const timestamp = nowTimestamp();

    if (!stockDoc.exists) {
      transaction.set(stockRef, {
        active: true,
        allocated: 0,
        attributeId: params.attributeId,
        attributeOptionValue: params.optionValue,
        createdAt: timestamp,
        createdBy: actor,
        id: stockId,
        name: `Stock for ${params.attributeId}:${params.optionValue}`,
        total: totalStock,
        updatedAt: timestamp,
        updatedBy: actor,
        ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
      } satisfies AttributeStock & { tenantId?: string });
    } else {
      transaction.update(stockRef, {
        total: totalStock,
        updatedAt: timestamp,
        updatedBy: actor,
      });
    }

    if (totalDelta === 0) {
      return;
    }

    const delta = getInventoryMovementDelta(
      InventoryMovementType.STOCK_ADJUSTED,
      totalDelta,
    );
    const movement: InventoryMovement = {
      ...delta,
      active: true,
      attributeId: params.attributeId,
      attributeOptionValue: params.optionValue,
      channelId: authorizedChannelId,
      createdAt: timestamp,
      createdBy: actor,
      id: movementRef.id,
      movementType: InventoryMovementType.STOCK_ADJUSTED,
      name: createMovementName({
        attributeId: params.attributeId,
        attributeOptionValue: params.optionValue,
      }),
      quantity: totalDelta,
      resultingAllocated: existingAllocated,
      resultingAvailable: totalStock - existingAllocated,
      resultingTotal: totalStock,
      subjectType: InventoryLedgerSubjectType.ATTRIBUTE,
      updatedAt: timestamp,
      updatedBy: actor,
      warehouseId: params.warehouseId,
      ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
    };

    transaction.set(movementRef, movement);
  });
}

export async function processAdminOrderCreatedStock(params: {
  channelId: string;
  orderId: string;
}): Promise<AdminOrderStockResult> {
  const authorizedChannelId = await requireTenantAdminChannelAccess(
    params.channelId,
  );
  const orderSnapshot = await getAdminDb()
    .doc(`channels/${authorizedChannelId}/orders/${params.orderId}`)
    .get();

  if (!orderSnapshot.exists) {
    throw new Error("Order not found");
  }

  try {
    await processOrderStockReservation({
      channelId: authorizedChannelId,
      order: {
        id: orderSnapshot.id,
        ...orderSnapshot.data(),
      } as Order,
      orderId: orderSnapshot.id,
    });
    return { ok: true };
  } catch (error) {
    return toAdminOrderStockResult(error);
  }
}
