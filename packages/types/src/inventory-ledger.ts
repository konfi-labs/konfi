import type { Base } from "./base";

export enum InventoryLedgerSubjectType {
  ATTRIBUTE = "ATTRIBUTE",
  PRODUCT = "PRODUCT",
}

export enum InventoryMovementType {
  RESERVATION_CONSUMED = "RESERVATION_CONSUMED",
  RESERVATION_CREATED = "RESERVATION_CREATED",
  RESERVATION_RELEASED = "RESERVATION_RELEASED",
  STOCK_ADJUSTED = "STOCK_ADJUSTED",
  STOCK_RECEIVED = "STOCK_RECEIVED",
  STOCK_REMOVED = "STOCK_REMOVED",
  STOCK_RETURNED = "STOCK_RETURNED",
  TRANSFERRED_IN = "TRANSFERRED_IN",
  TRANSFERRED_OUT = "TRANSFERRED_OUT",
}

export enum InventoryReservationSource {
  CART = "CART",
  IMPORT = "IMPORT",
  MANUAL = "MANUAL",
  ORDER = "ORDER",
}

export enum InventoryReservationStatus {
  ACTIVE = "ACTIVE",
  CANCELED = "CANCELED",
  CONSUMED = "CONSUMED",
  EXPIRED = "EXPIRED",
  RELEASED = "RELEASED",
}

export interface InventoryLedgerTarget {
  attributeId?: string;
  attributeOptionValue?: string;
  channelId: string;
  productId?: string;
  subjectType: InventoryLedgerSubjectType;
  warehouseId: string;
}

export type InventoryLedgerMetadataValue = boolean | null | number | string;

export type InventoryLedgerMetadata = Record<
  string,
  InventoryLedgerMetadataValue
>;

export interface InventoryReservation extends Base, InventoryLedgerTarget {
  cartId?: string;
  consumedQuantity: number;
  expiresAt?: unknown;
  idempotencyKey?: string;
  metadata?: InventoryLedgerMetadata;
  orderId?: string;
  orderItemId?: string;
  quantity: number;
  releasedQuantity: number;
  reservedQuantity: number;
  source: InventoryReservationSource;
  status: InventoryReservationStatus;
}

export interface InventoryMovement extends Base, InventoryLedgerTarget {
  allocatedDelta: number;
  availableDelta: number;
  idempotencyKey?: string;
  metadata?: InventoryLedgerMetadata;
  movementType: InventoryMovementType;
  orderId?: string;
  orderItemId?: string;
  quantity: number;
  reason?: string;
  reservationId?: string;
  resultingAllocated?: number;
  resultingAvailable?: number;
  resultingTotal?: number;
  totalDelta: number;
}

export type InventoryReservationCreateForm = Omit<
  InventoryReservation,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export type InventoryMovementCreateForm = Omit<
  InventoryMovement,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;
