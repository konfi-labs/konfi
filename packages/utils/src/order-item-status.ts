import { Order } from "@konfi/types";

export interface OrderItemStatusCollections {
  fulfilledItems?: string[];
  inProgressItems?: string[];
  pickedUpItems?: string[];
  deliveredItems?: string[];
}

export interface OrderItemStatusChange {
  itemId: string;
  fulfilled?: boolean;
  inProgress?: boolean;
  pickedUp?: boolean;
  delivered?: boolean;
}

export interface OrderItemStatusCollectionsResult {
  fulfilledItems: string[];
  inProgressItems: string[];
  pickedUpItems: string[];
  deliveredItems: string[];
}

export type OrderItemHandoffStatus = "pickedUp" | "delivered";

const normalizeItems = (items?: string[]) => [...new Set(items ?? [])];

const hasChange = ({
  fulfilled,
  inProgress,
  pickedUp,
  delivered,
}: OrderItemStatusChange) =>
  fulfilled !== undefined ||
  inProgress !== undefined ||
  pickedUp !== undefined ||
  delivered !== undefined;

export function applyOrderItemStatusChange(
  collections: OrderItemStatusCollections,
  change: OrderItemStatusChange,
): OrderItemStatusCollectionsResult {
  const { itemId, fulfilled, inProgress, pickedUp, delivered } = change;

  if (!hasChange(change)) {
    throw new Error("At least one item status change must be provided.");
  }

  const fulfilledItems = new Set(normalizeItems(collections.fulfilledItems));
  const inProgressItems = new Set(normalizeItems(collections.inProgressItems));
  const pickedUpItems = new Set(normalizeItems(collections.pickedUpItems));
  const deliveredItems = new Set(normalizeItems(collections.deliveredItems));

  if (fulfilled === true) {
    fulfilledItems.add(itemId);
    inProgressItems.delete(itemId);
  }

  if (fulfilled === false) {
    fulfilledItems.delete(itemId);
    pickedUpItems.delete(itemId);
    deliveredItems.delete(itemId);
  }

  if (inProgress === true) {
    inProgressItems.add(itemId);
    fulfilledItems.delete(itemId);
    pickedUpItems.delete(itemId);
    deliveredItems.delete(itemId);
  }

  if (inProgress === false) {
    inProgressItems.delete(itemId);
  }

  const isFulfilledAfterChange = fulfilledItems.has(itemId);

  if ((pickedUp === true || delivered === true) && !isFulfilledAfterChange) {
    throw new Error(
      "Only fulfilled items can be marked as picked up or delivered.",
    );
  }

  if (pickedUp === true) {
    pickedUpItems.add(itemId);
    deliveredItems.delete(itemId);
  }

  if (pickedUp === false) {
    pickedUpItems.delete(itemId);
  }

  if (delivered === true) {
    deliveredItems.add(itemId);
    pickedUpItems.delete(itemId);
  }

  if (delivered === false) {
    deliveredItems.delete(itemId);
  }

  return {
    fulfilledItems: [...fulfilledItems],
    inProgressItems: [...inProgressItems],
    pickedUpItems: [...pickedUpItems],
    deliveredItems: [...deliveredItems],
  };
}

export function resolveOrderItemHandoffStatus(
  order: Pick<Order, "pickedUpItems" | "deliveredItems">,
  itemId: string,
): OrderItemHandoffStatus | null {
  if (order.deliveredItems?.includes(itemId)) {
    return "delivered";
  }

  if (order.pickedUpItems?.includes(itemId)) {
    return "pickedUp";
  }

  return null;
}