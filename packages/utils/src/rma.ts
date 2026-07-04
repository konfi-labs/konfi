import type {
  Complaint,
  NestedMember,
  Order,
  RmaRequest,
  RmaRequestItem,
} from "@konfi/types";
import {
  RmaRequestStatus,
  RmaRequestType,
  RmaResolutionType,
} from "@konfi/types";

export const RMA_REQUESTS_COLLECTION = "rmaRequests";
export const RMA_RESOLUTION_EVENTS_COLLECTION = "resolutionEvents";

export interface CreateRmaFromComplaintOptions {
  actor: NestedMember;
  complaint: Complaint;
  order: Pick<Order, "currency" | "customer" | "items">;
  now: RmaRequest["createdAt"];
  type?: RmaRequestType;
}

export interface CreateRmaFromOrderOptions {
  actor: NestedMember;
  channelId: string;
  customerId?: string;
  description: string;
  items: RmaRequestItem[];
  now: RmaRequest["createdAt"];
  order: Pick<Order, "currency" | "customer" | "id">;
  type?: RmaRequestType;
}

function getCustomerId(order: Pick<Order, "customer">): string | undefined {
  return typeof order.customer === "string"
    ? order.customer
    : order.customer.id || undefined;
}

function getItemQuantity(
  order: Pick<Order, "items">,
  orderItemId: string,
): number {
  return order.items.find((item) => item.id === orderItemId)?.quantity ?? 1;
}

function normalizeRmaItems(
  complaint: Complaint,
  order: Pick<Order, "items">,
): RmaRequestItem[] {
  return complaint.orderItemIds.map((orderItemId) => ({
    orderItemId,
    quantity: Math.max(1, Math.round(getItemQuantity(order, orderItemId))),
    reason: complaint.description,
  }));
}

export function createRmaRequestFromComplaint({
  actor,
  complaint,
  order,
  now,
  type = RmaRequestType.CLAIM,
}: CreateRmaFromComplaintOptions): Omit<RmaRequest, "id" | "tenantId"> {
  return {
    active: true,
    channelId: complaint.channelId,
    complaintId: complaint.id,
    createdAt: now,
    createdBy: actor,
    currency: order.currency,
    customerId: getCustomerId(order),
    description: complaint.description,
    items: normalizeRmaItems(complaint, order),
    orderId: complaint.orderId,
    resolution: {
      type: RmaResolutionType.REMAKE,
    },
    status: RmaRequestStatus.NEW,
    type,
    updatedAt: now,
    updatedBy: actor,
  };
}

export function createRmaRequestFromOrder({
  actor,
  channelId,
  customerId,
  description,
  items,
  now,
  order,
  type = RmaRequestType.CLAIM,
}: CreateRmaFromOrderOptions): Omit<RmaRequest, "id" | "tenantId"> {
  return {
    active: true,
    channelId,
    createdAt: now,
    createdBy: actor,
    currency: order.currency,
    customerId: customerId ?? getCustomerId(order),
    description,
    items,
    orderId: order.id,
    status: RmaRequestStatus.NEW,
    type,
    updatedAt: now,
    updatedBy: actor,
  };
}

export function getRmaRefundAmount(
  rmaRequest: Pick<RmaRequest, "items" | "resolution">,
): number {
  if (
    rmaRequest.resolution?.type !== RmaResolutionType.CREDIT &&
    rmaRequest.resolution?.type !== RmaResolutionType.REFUND
  ) {
    return 0;
  }

  if (typeof rmaRequest.resolution.amount === "number") {
    return Math.max(0, Math.round(rmaRequest.resolution.amount));
  }

  return rmaRequest.items.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.refundAmount ?? 0)),
    0,
  );
}

export function canTransitionRmaStatus(
  from: RmaRequestStatus,
  to: RmaRequestStatus,
): boolean {
  if (from === to) {
    return true;
  }

  if (
    from === RmaRequestStatus.COMPLETED ||
    from === RmaRequestStatus.CANCELED
  ) {
    return false;
  }

  if (to === RmaRequestStatus.NEW) {
    return false;
  }

  if (to === RmaRequestStatus.CANCELED) {
    return true;
  }

  const allowed: Record<RmaRequestStatus, readonly RmaRequestStatus[]> = {
    [RmaRequestStatus.NEW]: [
      RmaRequestStatus.UNDER_REVIEW,
      RmaRequestStatus.APPROVED,
      RmaRequestStatus.REJECTED,
    ],
    [RmaRequestStatus.UNDER_REVIEW]: [
      RmaRequestStatus.APPROVED,
      RmaRequestStatus.REJECTED,
    ],
    [RmaRequestStatus.APPROVED]: [RmaRequestStatus.COMPLETED],
    [RmaRequestStatus.REJECTED]: [],
    [RmaRequestStatus.COMPLETED]: [],
    [RmaRequestStatus.CANCELED]: [],
  };

  return allowed[from].includes(to);
}

export function getNextRmaRequestStatuses(
  from: RmaRequestStatus,
): RmaRequestStatus[] {
  return Object.values(RmaRequestStatus).filter((status) =>
    canTransitionRmaStatus(from, status),
  );
}

export function isRmaRequestStatus(value: unknown): value is RmaRequestStatus {
  return (
    typeof value === "string" &&
    Object.values(RmaRequestStatus).includes(value as RmaRequestStatus)
  );
}

export function isRmaResolutionType(
  value: unknown,
): value is RmaResolutionType {
  return (
    typeof value === "string" &&
    Object.values(RmaResolutionType).includes(value as RmaResolutionType)
  );
}

export function rmaResolutionRequiresAmount(type: RmaResolutionType): boolean {
  return type === RmaResolutionType.CREDIT || type === RmaResolutionType.REFUND;
}

export function normalizeRmaResolutionAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function getResolvedRmaRequestStatus(
  type: RmaResolutionType,
): RmaRequestStatus {
  return type === RmaResolutionType.REJECT
    ? RmaRequestStatus.REJECTED
    : RmaRequestStatus.COMPLETED;
}
