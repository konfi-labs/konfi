import {
  OrderStatus,
  type Order,
  type OrderFileStatusId,
  type OrderItem,
  type OrderWorkflowStatusId,
  type OrderWorkflowStatusesSettings,
  type PrintingMethodId,
  type RulePreset,
} from "@konfi/types";
import { FieldPath, type QueryConstraint, where } from "firebase/firestore";
import {
  calculateQuantityForMultipleSizes,
  getEnabledOrderFileStatusDefinitions,
  getEnabledOrderWorkflowStatusDefinitions,
  getOrderPrintingMethodSignals,
  isMatrixLikePriceType,
  type OrderPrintingMethodItem,
  type OrderItemStatusChange,
} from "@konfi/utils";

export const PRODUCTION_ORDERS_PAGE_SIZE = 50;
export const FIRESTORE_IN_FILTER_CHUNK_SIZE = 10;

export type ProductionGroupingMode = "flat" | "printType" | "material";

export const PRODUCTION_GROUPING_MODES: ProductionGroupingMode[] = [
  "flat",
  "printType",
  "material",
];

export type ProductionOrderGroup = "ready" | "pendingFiles";

export type ProductionItemDropStatus =
  | "notStarted"
  | "inProgress"
  | "fulfilled"
  | "pickedUp"
  | "delivered";

export interface ProductionPrintTypeCompletionGroup {
  completedCount: number;
  completedItemIds: string[];
  complete: boolean;
  itemIds: string[];
  methodId: PrintingMethodId;
  totalCount: number;
}

export const PRODUCTION_ORDER_GROUPS: ProductionOrderGroup[] = [
  "ready",
  "pendingFiles",
];

export type ProductionSectionKey =
  `${ProductionOrderGroup}:${OrderWorkflowStatusId}`;

export interface ProductionSectionQuerySpec {
  fileStatusIds: OrderFileStatusId[];
  group: ProductionOrderGroup;
  key: ProductionSectionKey;
  statusId: OrderWorkflowStatusId;
}

export interface ProductionOrderItemConfigurationPart {
  name: string | null;
  value: string;
}

type DateLike =
  | Date
  | {
      seconds?: number;
      toDate?: () => Date;
    }
  | string
  | null
  | undefined;

type SortableProductionOrder = Pick<Order, "channelId" | "id"> & {
  createdAt?: DateLike;
  deadline?: DateLike;
  deadlineString?: string;
};

function getSortableOrderKey(order: Pick<Order, "channelId" | "id">) {
  return `${order.channelId}:${order.id}`;
}

function toFiniteMillis(value: DateLike): number | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }

  if (typeof value === "string") {
    const millis = Date.parse(value);
    return Number.isFinite(millis) ? millis : null;
  }

  if (typeof value.toDate === "function") {
    const millis = value.toDate().getTime();
    return Number.isFinite(millis) ? millis : null;
  }

  if (typeof value.seconds === "number") {
    const millis = value.seconds * 1000;
    return Number.isFinite(millis) ? millis : null;
  }

  return null;
}

function getProductionOrderDeadlineMillis(order: SortableProductionOrder) {
  return (
    toFiniteMillis(order.deadline) ??
    toFiniteMillis(order.deadlineString) ??
    Number.POSITIVE_INFINITY
  );
}

export type ProductionOrdersSortKey =
  | "createdAt"
  | "deadline"
  | "number"
  | "totalPrice";

export interface ProductionOrdersSort {
  direction: "asc" | "desc";
  key: ProductionOrdersSortKey;
}

export function normalizeProductionGroupingMode(
  value: string | null | undefined,
): ProductionGroupingMode {
  return PRODUCTION_GROUPING_MODES.includes(value as ProductionGroupingMode)
    ? (value as ProductionGroupingMode)
    : "flat";
}

type SortableProductionOrderWithExtras = SortableProductionOrder & {
  number?: number | null | string;
  totalPrice?: number | null;
};

export function sortProductionOrders<
  TOrder extends SortableProductionOrderWithExtras,
>(orders: readonly TOrder[], sort: ProductionOrdersSort): TOrder[] {
  const { direction, key } = sort;
  const multiplier = direction === "asc" ? 1 : -1;

  return orders.toSorted((left, right) => {
    let primaryDifference = 0;

    if (key === "deadline") {
      const leftMillis = getProductionOrderDeadlineMillis(left);
      const rightMillis = getProductionOrderDeadlineMillis(right);
      const leftInfinite = leftMillis === Number.POSITIVE_INFINITY;
      const rightInfinite = rightMillis === Number.POSITIVE_INFINITY;

      if (leftInfinite && rightInfinite) {
        primaryDifference = 0;
      } else if (leftInfinite) {
        primaryDifference = 1;
      } else if (rightInfinite) {
        primaryDifference = -1;
      } else {
        primaryDifference = multiplier * (leftMillis - rightMillis);
      }
    } else if (key === "createdAt") {
      const leftMillis = toFiniteMillis(left.createdAt);
      const rightMillis = toFiniteMillis(right.createdAt);

      if (leftMillis === null && rightMillis === null) {
        primaryDifference = 0;
      } else if (leftMillis === null) {
        primaryDifference = 1;
      } else if (rightMillis === null) {
        primaryDifference = -1;
      } else {
        primaryDifference = multiplier * (leftMillis - rightMillis);
      }
    } else if (key === "number") {
      const leftNum =
        left.number !== null && left.number !== undefined
          ? Number(left.number)
          : Number.NaN;
      const rightNum =
        right.number !== null && right.number !== undefined
          ? Number(right.number)
          : Number.NaN;
      const leftValid = Number.isFinite(leftNum);
      const rightValid = Number.isFinite(rightNum);

      if (leftValid && rightValid) {
        primaryDifference = multiplier * (leftNum - rightNum);
      } else if (leftValid) {
        primaryDifference = -1;
      } else if (rightValid) {
        primaryDifference = 1;
      } else {
        const leftStr = String(left.number ?? "");
        const rightStr = String(right.number ?? "");
        primaryDifference = multiplier * leftStr.localeCompare(rightStr);
      }
    } else if (key === "totalPrice") {
      const leftPrice = left.totalPrice;
      const rightPrice = right.totalPrice;
      const leftValid =
        typeof leftPrice === "number" && Number.isFinite(leftPrice);
      const rightValid =
        typeof rightPrice === "number" && Number.isFinite(rightPrice);

      if (leftValid && rightValid) {
        primaryDifference = multiplier * (leftPrice - rightPrice);
      } else if (leftValid) {
        primaryDifference = -1;
      } else if (rightValid) {
        primaryDifference = 1;
      }
    }

    if (primaryDifference !== 0) {
      return primaryDifference;
    }

    if (key !== "createdAt") {
      const createdAtDifference =
        (toFiniteMillis(right.createdAt) ?? 0) -
        (toFiniteMillis(left.createdAt) ?? 0);

      if (createdAtDifference !== 0) {
        return createdAtDifference;
      }
    }

    return getSortableOrderKey(left).localeCompare(getSortableOrderKey(right));
  });
}

export function sortProductionOrdersByDeadline<
  TOrder extends SortableProductionOrderWithExtras,
>(orders: readonly TOrder[]): TOrder[] {
  return sortProductionOrders(orders, { direction: "asc", key: "deadline" });
}

export function getProductionOrderPrintingMethodIds(
  order: {
    items: readonly OrderPrintingMethodItem[];
    printingMethods?: readonly PrintingMethodId[] | null;
  },
  availableMethodIds: readonly PrintingMethodId[],
): PrintingMethodId[] {
  const orderMethodFallback = getSingleOrderPrintingMethodFallback(
    order,
    availableMethodIds,
  );
  const itemMethods = order.items.flatMap((item) => {
    const itemMethodIds = getProductionOrderItemPrintingMethodIds(
      item,
      availableMethodIds,
    );

    return itemMethodIds.length > 0
      ? itemMethodIds
      : orderMethodFallback
        ? [orderMethodFallback]
        : [];
  });

  if (itemMethods.length > 0) {
    return Array.from(new Set(itemMethods));
  }

  const directMethods = order.printingMethods ?? [];
  const validDirectMethods = directMethods.filter((methodId) =>
    availableMethodIds.includes(methodId),
  );

  if (validDirectMethods.length > 0) {
    return Array.from(new Set(validDirectMethods));
  }

  return Array.from(
    new Set(
      getOrderPrintingMethodSignals(order.items, availableMethodIds)
        .flatMap((signal) => [
          signal.resolvedVolumePrintType,
          ...signal.availableVolumePrintTypes,
        ])
        .filter((methodId): methodId is PrintingMethodId => !!methodId),
    ),
  );
}

export function getProductionOrderItemPrintingMethodIds(
  item: OrderPrintingMethodItem,
  availableMethodIds: readonly PrintingMethodId[],
): PrintingMethodId[] {
  const itemMethods = (item.printingMethods ?? []).filter((methodId) =>
    availableMethodIds.includes(methodId),
  );

  if (itemMethods.length > 0) {
    return Array.from(new Set(itemMethods));
  }

  const [signal] = getOrderPrintingMethodSignals([item], availableMethodIds);

  if (!signal) {
    return [];
  }

  if (signal.resolvedVolumePrintType) {
    return [signal.resolvedVolumePrintType];
  }

  const availableVolumePrintTypes = Array.from(
    new Set(
      signal.availableVolumePrintTypes.filter(
        (methodId): methodId is PrintingMethodId => !!methodId,
      ),
    ),
  );

  return availableVolumePrintTypes.length === 1
    ? availableVolumePrintTypes
    : [];
}

export function orderMatchesProductionPrintingMethodFilter(
  order: {
    items: readonly OrderPrintingMethodItem[];
    printingMethods?: readonly PrintingMethodId[] | null;
  },
  selectedMethodIds: readonly PrintingMethodId[],
  availableMethodIds: readonly PrintingMethodId[],
): boolean {
  if (
    selectedMethodIds.length === 0 ||
    selectedMethodIds.length >= availableMethodIds.length
  ) {
    return true;
  }

  const selectedMethodSet = new Set(selectedMethodIds);

  return getProductionOrderPrintingMethodIds(order, availableMethodIds).some(
    (methodId) => selectedMethodSet.has(methodId),
  );
}

export function orderItemMatchesProductionPrintingMethodFilter(
  item: OrderPrintingMethodItem,
  order: {
    printingMethods?: readonly PrintingMethodId[] | null;
  },
  selectedMethodIds: readonly PrintingMethodId[],
  availableMethodIds: readonly PrintingMethodId[],
): boolean {
  if (
    selectedMethodIds.length === 0 ||
    selectedMethodIds.length >= availableMethodIds.length
  ) {
    return true;
  }

  const selectedMethodSet = new Set(selectedMethodIds);
  const itemMethodIds = getProductionOrderItemPrintingMethodIds(
    item,
    availableMethodIds,
  );

  if (itemMethodIds.length > 0) {
    return itemMethodIds.some((methodId) => selectedMethodSet.has(methodId));
  }

  const orderMethodIds = Array.from(
    new Set(
      (order.printingMethods ?? []).filter((methodId) =>
        availableMethodIds.includes(methodId),
      ),
    ),
  );

  return (
    orderMethodIds.length === 1 && selectedMethodSet.has(orderMethodIds[0])
  );
}

export function isProductionWorkflowStatus(status: {
  canceled: boolean;
  countsAsActive: boolean;
  fulfilled: boolean;
  id: OrderWorkflowStatusId;
  isDraft: boolean;
  isTerminal: boolean;
  readyForPickup: boolean;
}) {
  return (
    !status.isDraft &&
    !status.isTerminal &&
    !status.fulfilled &&
    !status.canceled &&
    (status.countsAsActive || status.readyForPickup)
  );
}

export function getDefaultProductionVisibleStatusIds(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusId[] {
  return getEnabledOrderWorkflowStatusDefinitions(settings)
    .filter(isProductionWorkflowStatus)
    .map((status) => status.id);
}

export function normalizeProductionVisibleStatusIds(
  requestedStatusIds: readonly string[] | null | undefined,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusId[] {
  const activeStatusDefinitions =
    getEnabledOrderWorkflowStatusDefinitions(settings);
  const activeStatusIds = new Set(
    activeStatusDefinitions.map((status) => status.id),
  );
  const defaultStatusIds = getDefaultProductionVisibleStatusIds(settings);
  const source =
    requestedStatusIds && requestedStatusIds.length > 0
      ? requestedStatusIds
      : defaultStatusIds;
  const requestedSet = new Set(
    source.filter((statusId) => activeStatusIds.has(statusId)),
  );
  const normalized = activeStatusDefinitions
    .filter((status) => requestedSet.has(status.id))
    .map((status) => status.id);

  return normalized.length > 0 ? normalized : defaultStatusIds;
}

export function getProductionFileStatusIds(
  group: ProductionOrderGroup,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderFileStatusId[] {
  const fileStatuses = getEnabledOrderFileStatusDefinitions(settings);
  const matchingStatuses = fileStatuses.filter((status) =>
    group === "ready" ? status.allowsProduction : !status.allowsProduction,
  );

  return matchingStatuses.map((status) => status.id);
}

export function getProductionGroupForOrder(
  order: Pick<Order, "filesStatus">,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): ProductionOrderGroup | null {
  if (
    getProductionFileStatusIds("ready", settings).includes(order.filesStatus)
  ) {
    return "ready";
  }

  if (
    getProductionFileStatusIds("pendingFiles", settings).includes(
      order.filesStatus,
    )
  ) {
    return "pendingFiles";
  }

  return null;
}

export function chunkForFirestoreIn<T>(
  values: readonly T[],
  chunkSize = FIRESTORE_IN_FILTER_CHUNK_SIZE,
): T[][] {
  if (chunkSize < 1) {
    throw new Error("Firestore chunk size must be at least 1.");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

export function getProductionSectionKey(
  group: ProductionOrderGroup,
  statusId: OrderWorkflowStatusId,
): ProductionSectionKey {
  return `${group}:${statusId}`;
}

export function getProductionSectionQuerySpecs(
  visibleStatusIds: readonly string[],
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): ProductionSectionQuerySpec[] {
  const normalizedStatusIds = normalizeProductionVisibleStatusIds(
    visibleStatusIds,
    settings,
  );

  return PRODUCTION_ORDER_GROUPS.flatMap((group) => {
    const fileStatusIds = getProductionFileStatusIds(group, settings);

    if (fileStatusIds.length === 0) {
      return [];
    }

    return normalizedStatusIds.map((statusId) => ({
      fileStatusIds,
      group,
      key: getProductionSectionKey(group, statusId),
      statusId,
    }));
  });
}

export function chunkProductionSectionFileStatuses(
  spec: Pick<ProductionSectionQuerySpec, "fileStatusIds">,
): OrderFileStatusId[][] {
  return chunkForFirestoreIn(spec.fileStatusIds);
}

export const FIRESTORE_MAX_DISJUNCTIONS = 30;

export interface SectionPresetPlan {
  /** When true the section's statusId is outside the preset's statuses — render empty without querying. */
  skipSection: boolean;
  /** filesStatus chunks sized so chunk.length × methodCount ≤ FIRESTORE_MAX_DISJUNCTIONS. */
  fileStatusChunks: OrderFileStatusId[][];
  /** Constraints to append (printingMethods clause only — never status-in). */
  extraConstraints: QueryConstraint[];
}

/**
 * Returns a budget-aware query plan for a single production-board section when
 * an order-rule preset is active.  The plan keeps the product of all
 * disjunction counts within FIRESTORE_MAX_DISJUNCTIONS (30).
 *
 * - No preset (or preset without structured fields) → identity behavior.
 * - Preset with statusIds that does NOT include spec.statusId → skipSection.
 * - Preset with printingMethodIds → chunk fileStatusIds with a size that
 *   satisfies chunk.length × methodCount ≤ 30; append printingMethods clause.
 *   A status-in clause is never emitted because section queries already pin
 *   status with where("status", "==", spec.statusId).
 */
export function planSectionPresetConstraints(
  spec: Pick<ProductionSectionQuerySpec, "fileStatusIds" | "statusId">,
  preset: Pick<RulePreset, "statusIds" | "printingMethodIds"> | undefined,
): SectionPresetPlan {
  // No preset or preset without structured fields — identity behavior.
  if (!preset?.statusIds) {
    return {
      extraConstraints: [],
      fileStatusChunks: chunkForFirestoreIn(spec.fileStatusIds),
      skipSection: false,
    };
  }

  // If the preset constrains statuses and this section's status is not included,
  // skip the section entirely — no Firestore query needed.
  if (
    preset.statusIds.length > 0 &&
    !preset.statusIds.includes(spec.statusId)
  ) {
    return {
      extraConstraints: [],
      fileStatusChunks: [],
      skipSection: true,
    };
  }

  const methodIds = preset.printingMethodIds ?? [];
  // A single-method preset contributes 1 to the product (array-contains is not
  // counted as a disjunction by Firestore), but we treat it as 1 to be safe.
  const methodCount = methodIds.length > 1 ? methodIds.length : 1;
  const maxFileStatuses = Math.max(
    1,
    Math.floor(FIRESTORE_MAX_DISJUNCTIONS / methodCount),
  );
  const fileStatusChunks = chunkForFirestoreIn(
    spec.fileStatusIds,
    maxFileStatuses,
  );

  const extraConstraints: QueryConstraint[] = [];

  if (methodIds.length === 1) {
    extraConstraints.push(
      where(new FieldPath("printingMethods"), "array-contains", methodIds[0]),
    );
  } else if (methodIds.length > 1) {
    extraConstraints.push(
      where(new FieldPath("printingMethods"), "array-contains-any", methodIds),
    );
  }

  return {
    extraConstraints,
    fileStatusChunks,
    skipSection: false,
  };
}

export function getOrderItemProductionStatus(
  order: Pick<
    Order,
    "deliveredItems" | "fulfilledItems" | "inProgressItems" | "pickedUpItems"
  >,
  itemId: string,
): ProductionItemDropStatus {
  if (order.deliveredItems?.includes(itemId)) {
    return "delivered";
  }

  if (order.pickedUpItems?.includes(itemId)) {
    return "pickedUp";
  }

  if (order.fulfilledItems?.includes(itemId)) {
    return "fulfilled";
  }

  if (order.inProgressItems?.includes(itemId)) {
    return "inProgress";
  }

  return "notStarted";
}

function isCompletedProductionItemStatus(status: ProductionItemDropStatus) {
  return (
    status === "fulfilled" || status === "pickedUp" || status === "delivered"
  );
}

function isCompletedProductionOrderStatus(status: string | undefined) {
  return status === OrderStatus.READY || status === OrderStatus.FULFILLED;
}

function getSingleOrderPrintingMethodFallback(
  order: { printingMethods?: readonly PrintingMethodId[] | null },
  availableMethodIds: readonly PrintingMethodId[],
): PrintingMethodId | null {
  const validDirectMethods = Array.from(
    new Set(
      (order.printingMethods ?? []).filter((methodId) =>
        availableMethodIds.includes(methodId),
      ),
    ),
  );

  return validDirectMethods.length === 1 ? validDirectMethods[0] : null;
}

export function getProductionPrintTypeCompletionGroups(
  order: Pick<
    Order,
    | "deliveredItems"
    | "fulfilledItems"
    | "inProgressItems"
    | "items"
    | "pickedUpItems"
    | "printingMethods"
  > & { status?: string },
  availableMethodIds: readonly PrintingMethodId[],
): ProductionPrintTypeCompletionGroup[] {
  const groups = new Map<
    PrintingMethodId,
    {
      completedItemIds: Set<string>;
      itemIds: Set<string>;
      methodId: PrintingMethodId;
    }
  >();
  const orderMethodFallback = getSingleOrderPrintingMethodFallback(
    order,
    availableMethodIds,
  );

  for (const item of order.items) {
    const itemId = item.id;

    if (!itemId) {
      continue;
    }

    const itemMethodIds = getProductionOrderItemPrintingMethodIds(
      item,
      availableMethodIds,
    );
    const methodIds =
      itemMethodIds.length > 0
        ? itemMethodIds
        : orderMethodFallback
          ? [orderMethodFallback]
          : [];

    if (methodIds.length === 0) {
      continue;
    }

    const itemCompleted =
      isCompletedProductionOrderStatus(order.status) ||
      isCompletedProductionItemStatus(
        getOrderItemProductionStatus(order, itemId),
      );

    for (const methodId of methodIds) {
      const existing =
        groups.get(methodId) ??
        ({
          completedItemIds: new Set<string>(),
          itemIds: new Set<string>(),
          methodId,
        } satisfies {
          completedItemIds: Set<string>;
          itemIds: Set<string>;
          methodId: PrintingMethodId;
        });

      existing.itemIds.add(itemId);

      if (itemCompleted) {
        existing.completedItemIds.add(itemId);
      }

      groups.set(methodId, existing);
    }
  }

  const methodOrder = new Map(
    availableMethodIds.map((methodId, index) => [methodId, index]),
  );

  return Array.from(groups.values())
    .map((group) => {
      const itemIds = Array.from(group.itemIds);
      const completedItemIds = Array.from(group.completedItemIds);

      return {
        completedCount: completedItemIds.length,
        completedItemIds,
        complete:
          itemIds.length > 0 && completedItemIds.length === itemIds.length,
        itemIds,
        methodId: group.methodId,
        totalCount: itemIds.length,
      };
    })
    .toSorted(
      (left, right) =>
        (methodOrder.get(left.methodId) ?? Number.MAX_SAFE_INTEGER) -
          (methodOrder.get(right.methodId) ?? Number.MAX_SAFE_INTEGER) ||
        left.methodId.localeCompare(right.methodId),
    );
}

export function getOrderItemStatusChangeForDrop(
  itemId: string,
  status: ProductionItemDropStatus,
): OrderItemStatusChange {
  switch (status) {
    case "notStarted":
      return {
        delivered: false,
        fulfilled: false,
        inProgress: false,
        itemId,
        pickedUp: false,
      };
    case "inProgress":
      return {
        inProgress: true,
        itemId,
      };
    case "fulfilled":
      return {
        delivered: false,
        fulfilled: true,
        itemId,
        pickedUp: false,
      };
    case "pickedUp":
      return {
        fulfilled: true,
        itemId,
        pickedUp: true,
      };
    case "delivered":
      return {
        delivered: true,
        fulfilled: true,
        itemId,
      };
  }
}

export function getProductionOrderItemDisplayQuantity(
  item: Pick<
    OrderItem,
    "customSizes" | "height" | "product" | "quantity" | "volume" | "width"
  >,
): number {
  if (item.customSizes && item.customSizes.length > 0) {
    try {
      return calculateQuantityForMultipleSizes(
        item.customSizes,
        item.product?.designSpec?.includeBleed
          ? item.product.designSpec.bleed
          : undefined,
      );
    } catch {
      // Fall back to stored quantity/volume when legacy custom-size data is incomplete.
    }
  }

  if (item.product?.priceType !== undefined) {
    return isMatrixLikePriceType(item.product.priceType)
      ? (item.volume ?? 0)
      : item.quantity;
  }

  return typeof item.volume === "number" ? item.volume : item.quantity;
}

export function getProductionOrderItemTotalVolume(
  item: Pick<OrderItem, "quantity" | "volume">,
): number | null {
  if (
    typeof item.volume !== "number" ||
    !Number.isFinite(item.volume) ||
    item.volume <= 0 ||
    typeof item.quantity !== "number" ||
    !Number.isFinite(item.quantity) ||
    item.quantity <= 1
  ) {
    return null;
  }

  return item.volume * item.quantity;
}

export function getProductionOrderItemDisplayName(
  item: Pick<OrderItem, "name" | "product">,
): string {
  const itemName = item.name?.trim();
  const productName = item.product?.name?.trim();

  return itemName || productName || "-";
}

export function getProductionOrderItemOriginalProductName(
  item: Pick<OrderItem, "name" | "product">,
): string | null {
  const itemName = item.name?.trim();
  const productName = item.product?.name?.trim();

  return itemName && productName && itemName !== productName
    ? productName
    : null;
}

export function getProductionOrderItemConfigurationParts(
  description: string | null | undefined,
): ProductionOrderItemConfigurationPart[] {
  if (!description) {
    return [];
  }

  return description
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf(":");

      if (separatorIndex <= 0) {
        return {
          name: null,
          value: part,
        };
      }

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();

      if (!name || !value) {
        return {
          name: null,
          value: part,
        };
      }

      return {
        name,
        value,
      };
    });
}

export function getProductionOrderQuickFilterText(order: Order): string {
  const customer =
    typeof order.customer === "string"
      ? order.customer
      : [order.customer.name, order.customer.email].filter(Boolean).join(" ");
  const contact = [
    order.contact?.name,
    order.contact?.email,
    order.contact?.phone,
  ]
    .filter(Boolean)
    .join(" ");
  const items = order.items
    .map((item) =>
      [
        item.name,
        item.product?.name,
        item.description,
        item.calculatedCombination,
        item.combination,
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");

  return [
    order.number,
    customer,
    contact,
    order.email,
    order.specialNotes,
    order.paymentDocumentId,
    order.proformaDocumentId,
    order.externalSource?.externalBuyerLogin,
    order.externalSource?.externalOrderId,
    items,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();
}
