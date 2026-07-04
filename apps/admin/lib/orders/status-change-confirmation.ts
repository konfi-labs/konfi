import { OrderFilesStatus, OrderStatus } from "@konfi/types";
import type { NestedMember, Order } from "@konfi/types";

export const RECENT_ORDER_IN_PROGRESS_WARNING_WINDOW_MINUTES = 30;

const RECENT_ORDER_IN_PROGRESS_WARNING_WINDOW_MS =
  RECENT_ORDER_IN_PROGRESS_WARNING_WINDOW_MINUTES * 60 * 1000;

type StatusConfirmationOrder = Pick<
  Order,
  "createdAt" | "filesStatus" | "isFromStore"
>;

type StatusActorSelectionOrder = Pick<
  Order,
  "createdBy" | "isFromStore" | "updatedBy"
>;

export function isSystemOrderActor(
  actor:
    | (Pick<NestedMember, "id"> & Partial<Pick<NestedMember, "name">>)
    | null
    | undefined,
): boolean {
  return actor?.id === "system";
}

export function shouldRequireStatusActorSelection(
  order: StatusActorSelectionOrder,
): boolean {
  return (
    !!order.isFromStore &&
    isSystemOrderActor(order.createdBy) &&
    isSystemOrderActor(order.updatedBy)
  );
}

export function shouldRequireStatusEmailConfirmation(
  order: Pick<StatusConfirmationOrder, "isFromStore">,
  nextStatus?: string,
): boolean {
  return (
    !!order.isFromStore &&
    (nextStatus === OrderStatus.READY || nextStatus === OrderStatus.DELAYED)
  );
}

export function shouldWarnOrderMayBeIncomplete(
  order: Pick<StatusConfirmationOrder, "createdAt" | "filesStatus">,
  nextStatus?: string,
  now: Date = new Date(),
): boolean {
  if (nextStatus !== OrderStatus.IN_PROGRESS) {
    return false;
  }

  // The files status can be flipped to FILES_ARE_READY a few minutes before the
  // underlying preparation work is actually finished, so very recent orders
  // should still require confirmation before moving to IN_PROGRESS.
  if (order.filesStatus !== OrderFilesStatus.FILES_ARE_READY) {
    return false;
  }

  const createdAt = order.createdAt.toDate().getTime();
  const ageMs = Math.max(0, now.getTime() - createdAt);

  return ageMs < RECENT_ORDER_IN_PROGRESS_WARNING_WINDOW_MS;
}

export function getOrderAgeInMinutes(
  order: Pick<StatusConfirmationOrder, "createdAt">,
  now: Date = new Date(),
): number {
  const createdAt = order.createdAt.toDate().getTime();
  const ageMs = Math.max(0, now.getTime() - createdAt);

  return Math.max(1, Math.floor(ageMs / (60 * 1000)));
}
