import {
  type AttributeStockOperation,
  type InventoryLedgerTarget,
  InventoryLedgerSubjectType,
  type InventoryMovement,
  InventoryMovementType,
  type InventoryReservation,
  InventoryReservationStatus,
  type StockOperation,
} from "@konfi/types";
import { toMillis } from "./timestamp-values";

export interface InventoryQuantitySnapshot {
  allocated: number;
  total: number;
}

export interface InventoryAvailability extends InventoryQuantitySnapshot {
  available: number;
}

export interface InventoryMovementDelta {
  allocatedDelta: number;
  availableDelta: number;
  totalDelta: number;
}

export function getInventoryAvailability(
  snapshot: InventoryQuantitySnapshot,
): InventoryAvailability {
  return {
    ...snapshot,
    available: snapshot.total - snapshot.allocated,
  };
}

export function getInventoryReservationRemainingQuantity(
  reservation: Pick<
    InventoryReservation,
    "consumedQuantity" | "releasedQuantity" | "reservedQuantity"
  >,
): number {
  return Math.max(
    0,
    reservation.reservedQuantity -
      reservation.releasedQuantity -
      reservation.consumedQuantity,
  );
}

export function isInventoryReservationExpired(
  reservation: Pick<InventoryReservation, "expiresAt">,
  now = new Date(),
): boolean {
  const expiresAt = toMillis(reservation.expiresAt);
  return expiresAt !== undefined && expiresAt <= now.getTime();
}

export function isInventoryReservationActive(
  reservation: Pick<
    InventoryReservation,
    | "consumedQuantity"
    | "expiresAt"
    | "releasedQuantity"
    | "reservedQuantity"
    | "status"
  >,
  now = new Date(),
): boolean {
  return (
    reservation.status === InventoryReservationStatus.ACTIVE &&
    getInventoryReservationRemainingQuantity(reservation) > 0 &&
    !isInventoryReservationExpired(reservation, now)
  );
}

export function getActiveInventoryReservationQuantity(
  reservations: readonly Pick<
    InventoryReservation,
    | "consumedQuantity"
    | "expiresAt"
    | "releasedQuantity"
    | "reservedQuantity"
    | "status"
  >[],
  now = new Date(),
): number {
  return reservations.reduce(
    (total, reservation) =>
      isInventoryReservationActive(reservation, now)
        ? total + getInventoryReservationRemainingQuantity(reservation)
        : total,
    0,
  );
}

export function getProjectedInventoryAvailability({
  now,
  reservations,
  snapshot,
}: {
  now?: Date;
  reservations: readonly Pick<
    InventoryReservation,
    | "consumedQuantity"
    | "expiresAt"
    | "releasedQuantity"
    | "reservedQuantity"
    | "status"
  >[];
  snapshot: InventoryQuantitySnapshot;
}): InventoryAvailability {
  const activeReservedQuantity = getActiveInventoryReservationQuantity(
    reservations,
    now,
  );

  return getInventoryAvailability({
    allocated: snapshot.allocated + activeReservedQuantity,
    total: snapshot.total,
  });
}

function createDelta(
  totalDelta: number,
  allocatedDelta: number,
): InventoryMovementDelta {
  return {
    allocatedDelta,
    availableDelta: totalDelta - allocatedDelta,
    totalDelta,
  };
}

export function getInventoryMovementDelta(
  movementType: InventoryMovementType,
  quantity: number,
): InventoryMovementDelta {
  const magnitude = Math.abs(quantity);

  switch (movementType) {
    case InventoryMovementType.RESERVATION_CREATED:
      return createDelta(0, magnitude);
    case InventoryMovementType.RESERVATION_RELEASED:
      return createDelta(0, -magnitude);
    case InventoryMovementType.RESERVATION_CONSUMED:
      return createDelta(-magnitude, -magnitude);
    case InventoryMovementType.STOCK_RECEIVED:
    case InventoryMovementType.STOCK_RETURNED:
    case InventoryMovementType.TRANSFERRED_IN:
      return createDelta(magnitude, 0);
    case InventoryMovementType.STOCK_REMOVED:
    case InventoryMovementType.TRANSFERRED_OUT:
      return createDelta(-magnitude, 0);
    case InventoryMovementType.STOCK_ADJUSTED:
      return createDelta(quantity, 0);
  }

  throw new Error(`Unsupported inventory movement type: ${movementType}`);
}

export function applyInventoryMovementDelta(
  snapshot: InventoryQuantitySnapshot,
  movement: Pick<InventoryMovement, "allocatedDelta" | "totalDelta">,
): InventoryAvailability {
  return getInventoryAvailability({
    allocated: snapshot.allocated + movement.allocatedDelta,
    total: snapshot.total + movement.totalDelta,
  });
}

export function isValidInventoryMovementQuantity(
  movementType: InventoryMovementType,
  quantity: number,
): boolean {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) {
    return false;
  }

  return movementType === InventoryMovementType.STOCK_ADJUSTED
    ? quantity !== 0
    : quantity > 0;
}

export function getInventoryTargetFromStockOperation(
  operation: StockOperation,
): InventoryLedgerTarget {
  return {
    channelId: operation.channelId,
    productId: operation.productId,
    subjectType: InventoryLedgerSubjectType.PRODUCT,
    warehouseId: operation.warehouseId,
  };
}

export function getInventoryTargetFromAttributeStockOperation(
  operation: AttributeStockOperation,
): InventoryLedgerTarget {
  return {
    attributeId: operation.attributeId,
    attributeOptionValue: operation.attributeOptionValue,
    channelId: operation.channelId,
    subjectType: InventoryLedgerSubjectType.ATTRIBUTE,
    warehouseId: operation.warehouseId,
  };
}
