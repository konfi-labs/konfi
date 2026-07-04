import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import type { Order, OrderItem } from "@konfi/types";
import {
  assertStockReservationAvailableForOrder,
  processStockDeduction,
  processStockRelease,
  processStockReservation,
} from "./hybrid-stock-management";

async function getMainWarehouse(channelId: string): Promise<string> {
  const channelDoc = await getAdminDb().doc(`channels/${channelId}`).get();

  if (!channelDoc.exists) {
    throw new Error(`Channel ${channelId} not found`);
  }

  const warehouses = channelDoc.data()?.warehouses;

  if (!Array.isArray(warehouses) || warehouses.length === 0) {
    throw new Error(`No warehouses found for channel ${channelId}`);
  }

  const warehouseId = warehouses.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim() !== "",
  );

  if (!warehouseId) {
    throw new Error(`No warehouse ID found for channel ${channelId}`);
  }

  return warehouseId;
}

async function groupItemsByWarehouse(
  channelId: string,
  items: OrderItem[],
): Promise<Map<string, OrderItem[]>> {
  const itemsByWarehouse = new Map<string, OrderItem[]>();
  const needsMainWarehouse = items.some((item) => !item.warehouseId);
  const mainWarehouseId = needsMainWarehouse
    ? await getMainWarehouse(channelId)
    : "";

  for (const item of items) {
    const warehouseId = item.warehouseId || mainWarehouseId;

    if (!warehouseId) {
      throw new Error("Warehouse ID not found");
    }

    const warehouseItems = itemsByWarehouse.get(warehouseId) ?? [];
    warehouseItems.push(item);
    itemsByWarehouse.set(warehouseId, warehouseItems);
  }

  return itemsByWarehouse;
}

export async function processOrderStockReservation(params: {
  channelId: string;
  order: Order;
  orderId: string;
}): Promise<void> {
  const itemsByWarehouse = await groupItemsByWarehouse(
    params.channelId,
    params.order.items,
  );

  await Promise.all(
    Array.from(itemsByWarehouse.entries()).map(([warehouseId, items]) =>
      processStockReservation(
        params.channelId,
        warehouseId,
        items,
        params.orderId,
      ),
    ),
  );
}

export async function assertOrderStockReservationAvailable(params: {
  channelId: string;
  items: OrderItem[];
  orderId?: string;
}): Promise<void> {
  const itemsByWarehouse = await groupItemsByWarehouse(
    params.channelId,
    params.items,
  );

  await Promise.all(
    Array.from(itemsByWarehouse.entries()).map(([warehouseId, items]) =>
      assertStockReservationAvailableForOrder(
        params.channelId,
        warehouseId,
        items,
        params.orderId,
      ),
    ),
  );
}

export async function processOrderStockDeductionForUpdate(params: {
  after: Order;
  before: Order;
  channelId: string;
  orderId: string;
}): Promise<void> {
  const beforeFulfilled = new Set(params.before.fulfilledItems ?? []);
  const afterFulfilled = new Set(params.after.fulfilledItems ?? []);
  const newlyFulfilled = Array.from(afterFulfilled).filter(
    (itemId) => !beforeFulfilled.has(itemId),
  );

  if (newlyFulfilled.length === 0) {
    return;
  }

  const fulfilledItems = newlyFulfilled.map((itemId) => {
    const item = params.after.items.find(
      (candidate) => candidate.id === itemId,
    );

    if (!item) {
      throw new Error(`Item ${itemId} not found in order ${params.orderId}`);
    }

    return item;
  });
  const itemsByWarehouse = await groupItemsByWarehouse(
    params.channelId,
    fulfilledItems,
  );

  await Promise.all(
    Array.from(itemsByWarehouse.entries()).map(([warehouseId, items]) =>
      processStockDeduction(
        params.channelId,
        warehouseId,
        items,
        params.orderId,
      ),
    ),
  );
}

export async function processOrderStockReleaseForDeleted(params: {
  channelId: string;
  order: Order;
  orderId: string;
}): Promise<void> {
  const fulfilledItems = new Set(params.order.fulfilledItems ?? []);
  const itemsToRelease = params.order.items.filter(
    (item) => !fulfilledItems.has(item.id),
  );

  if (itemsToRelease.length === 0) {
    return;
  }

  const itemsByWarehouse = await groupItemsByWarehouse(
    params.channelId,
    itemsToRelease,
  );

  await Promise.all(
    Array.from(itemsByWarehouse.entries()).map(([warehouseId, items]) =>
      processStockRelease(params.channelId, warehouseId, items, params.orderId),
    ),
  );
}
