import {
  type OrderChangeOperation,
  OrderChangeImpactArea,
  OrderChangeOperationType,
  OrderChangeRequestStatus,
} from "@konfi/types";

export interface OrderChangeRequestSummary {
  hasCustomerVisibleChanges: boolean;
  impactAreas: OrderChangeImpactArea[];
  operationCount: number;
  requiresReview: boolean;
}

const TERMINAL_ORDER_CHANGE_STATUSES = new Set<OrderChangeRequestStatus>([
  OrderChangeRequestStatus.APPLIED,
  OrderChangeRequestStatus.CANCELED,
  OrderChangeRequestStatus.REJECTED,
]);

const ORDER_CHANGE_STATUS_TRANSITIONS: Record<
  OrderChangeRequestStatus,
  readonly OrderChangeRequestStatus[]
> = {
  [OrderChangeRequestStatus.APPLIED]: [],
  [OrderChangeRequestStatus.APPROVED]: [
    OrderChangeRequestStatus.APPLIED,
    OrderChangeRequestStatus.CANCELED,
  ],
  [OrderChangeRequestStatus.CANCELED]: [],
  [OrderChangeRequestStatus.DRAFT]: [
    OrderChangeRequestStatus.CANCELED,
    OrderChangeRequestStatus.PENDING_REVIEW,
  ],
  [OrderChangeRequestStatus.PENDING_REVIEW]: [
    OrderChangeRequestStatus.APPROVED,
    OrderChangeRequestStatus.CANCELED,
    OrderChangeRequestStatus.REJECTED,
  ],
  [OrderChangeRequestStatus.REJECTED]: [],
};

const CUSTOMER_VISIBLE_IMPACT_AREAS = new Set<OrderChangeImpactArea>([
  OrderChangeImpactArea.BILLING,
  OrderChangeImpactArea.CUSTOMER,
  OrderChangeImpactArea.DEADLINE,
  OrderChangeImpactArea.ITEMS,
  OrderChangeImpactArea.PAYMENT,
  OrderChangeImpactArea.PRICING,
  OrderChangeImpactArea.SHIPPING,
  OrderChangeImpactArea.STATUS,
]);

const REVIEW_REQUIRED_IMPACT_AREAS = new Set<OrderChangeImpactArea>([
  OrderChangeImpactArea.BILLING,
  OrderChangeImpactArea.CUSTOMER,
  OrderChangeImpactArea.ITEMS,
  OrderChangeImpactArea.PAYMENT,
  OrderChangeImpactArea.PRICING,
  OrderChangeImpactArea.SHIPPING,
]);

function getRootPathSegment(operation: Pick<OrderChangeOperation, "path">) {
  const root = operation.path[0];
  return typeof root === "string" ? root : "";
}

export function getOrderChangeImpactArea(
  operation: Pick<OrderChangeOperation, "impactArea" | "path">,
): OrderChangeImpactArea {
  if (operation.impactArea) {
    return operation.impactArea;
  }

  switch (getRootPathSegment(operation)) {
    case "billing":
    case "invoice":
    case "invoiceNotes":
      return OrderChangeImpactArea.BILLING;
    case "contact":
    case "customer":
    case "email":
      return OrderChangeImpactArea.CUSTOMER;
    case "deadline":
    case "deadlineString":
    case "exactTime":
      return OrderChangeImpactArea.DEADLINE;
    case "filesStatus":
      return OrderChangeImpactArea.FILES;
    case "carriedOutBy":
    case "deliveredItems":
    case "fulfilledItems":
    case "inProgressItems":
    case "pickedUpItems":
    case "printingMethods":
    case "tracking":
      return OrderChangeImpactArea.FULFILLMENT;
    case "items":
      return OrderChangeImpactArea.ITEMS;
    case "paymentDocumentId":
    case "paymentStatus":
    case "paymentType":
    case "proformaDocumentId":
      return OrderChangeImpactArea.PAYMENT;
    case "appliedPromotionCodes":
    case "shippingPrice":
    case "storeCreditRedemption":
    case "totalPrice":
    case "totalPriceDiscount":
      return OrderChangeImpactArea.PRICING;
    case "anonymousPackageLabelAddress":
    case "anonymousPackageShipping":
    case "designatedPickupAreaId":
    case "shipping":
    case "shippingOption":
      return OrderChangeImpactArea.SHIPPING;
    case "active":
    case "status":
      return OrderChangeImpactArea.STATUS;
    default:
      return OrderChangeImpactArea.METADATA;
  }
}

export function getOrderChangeImpactAreas(
  operations: readonly OrderChangeOperation[],
): OrderChangeImpactArea[] {
  return [
    ...new Set(
      operations.map((operation) => getOrderChangeImpactArea(operation)),
    ),
  ];
}

export function isTerminalOrderChangeStatus(
  status: OrderChangeRequestStatus,
): boolean {
  return TERMINAL_ORDER_CHANGE_STATUSES.has(status);
}

export function canTransitionOrderChangeStatus(
  currentStatus: OrderChangeRequestStatus,
  nextStatus: OrderChangeRequestStatus,
): boolean {
  return ORDER_CHANGE_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}

export function normalizeOrderChangeOperation(
  operation: OrderChangeOperation,
): OrderChangeOperation {
  return {
    ...operation,
    impactArea: getOrderChangeImpactArea(operation),
  };
}

export function normalizeOrderChangeOperations(
  operations: readonly OrderChangeOperation[],
): OrderChangeOperation[] {
  return operations
    .filter((operation) => operation.path.length > 0)
    .map((operation) => normalizeOrderChangeOperation(operation));
}

export function summarizeOrderChangeRequest(
  operations: readonly OrderChangeOperation[],
): OrderChangeRequestSummary {
  const normalizedOperations = normalizeOrderChangeOperations(operations);
  const impactAreas = getOrderChangeImpactAreas(normalizedOperations);

  return {
    hasCustomerVisibleChanges: impactAreas.some((impactArea) =>
      CUSTOMER_VISIBLE_IMPACT_AREAS.has(impactArea),
    ),
    impactAreas,
    operationCount: normalizedOperations.length,
    requiresReview: impactAreas.some((impactArea) =>
      REVIEW_REQUIRED_IMPACT_AREAS.has(impactArea),
    ),
  };
}

export function createOrderChangeIdempotencyKey({
  orderId,
  operations,
  source,
}: {
  operations: readonly OrderChangeOperation[];
  orderId: string;
  source: string;
}): string {
  const normalizedPaths: string[] = [];

  for (const operation of normalizeOrderChangeOperations(operations)) {
    const path = `${operation.operationType}:${operation.path.join(".")}`;
    const insertIndex = normalizedPaths.findIndex(
      (candidate) => candidate > path,
    );

    if (insertIndex === -1) {
      normalizedPaths.push(path);
    } else {
      normalizedPaths.splice(insertIndex, 0, path);
    }
  }

  return [orderId, source, ...normalizedPaths].join(":");
}

export function isNoopOrderChangeOperation(
  operation: Pick<OrderChangeOperation, "after" | "before" | "operationType">,
): boolean {
  return (
    operation.operationType === OrderChangeOperationType.SET &&
    Object.is(operation.before, operation.after)
  );
}
