export const ALLEGRO_ORDER_FULFILLMENT_STATUSES = [
  "NEW",
  "PROCESSING",
  "READY_FOR_SHIPMENT",
  "READY_FOR_PICKUP",
  "SENT",
  "PICKED_UP",
  "CANCELLED",
  "SUSPENDED",
] as const;

export const ALLEGRO_READONLY_ORDER_FULFILLMENT_STATUSES = [
  "RETURNED",
] as const;

export type AllegroOrderFulfillmentStatus =
  (typeof ALLEGRO_ORDER_FULFILLMENT_STATUSES)[number];
export type AllegroReadonlyOrderFulfillmentStatus =
  (typeof ALLEGRO_READONLY_ORDER_FULFILLMENT_STATUSES)[number];

export interface AllegroOrderFulfillmentUpdate {
  id: string;
  revision?: string;
  status: AllegroOrderFulfillmentStatus;
}

export interface AllegroOrderFulfillmentResult {
  id: string;
  ok: boolean;
  status?: AllegroOrderFulfillmentStatus;
  error?: string;
}

export interface AllegroOrderFulfillmentUpdateRequest {
  updates: AllegroOrderFulfillmentUpdate[];
}

export interface AllegroOrderFulfillmentUpdateResponse {
  results: AllegroOrderFulfillmentResult[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAllegroOrderFulfillmentStatus(
  value: unknown,
): value is AllegroOrderFulfillmentStatus {
  return (
    typeof value === "string" &&
    ALLEGRO_ORDER_FULFILLMENT_STATUSES.includes(
      value as AllegroOrderFulfillmentStatus,
    )
  );
}

export function isAllegroReadonlyOrderFulfillmentStatus(
  value: unknown,
): value is AllegroReadonlyOrderFulfillmentStatus {
  return (
    typeof value === "string" &&
    ALLEGRO_READONLY_ORDER_FULFILLMENT_STATUSES.includes(
      value as AllegroReadonlyOrderFulfillmentStatus,
    )
  );
}

export function isAllegroOrderFulfillmentUpdate(
  value: unknown,
): value is AllegroOrderFulfillmentUpdate {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    (value.revision === undefined || typeof value.revision === "string") &&
    isAllegroOrderFulfillmentStatus(value.status)
  );
}

export function isAllegroOrderFulfillmentUpdateRequest(
  value: unknown,
): value is AllegroOrderFulfillmentUpdateRequest {
  return (
    isObject(value) &&
    Array.isArray(value.updates) &&
    value.updates.length > 0 &&
    value.updates.every(isAllegroOrderFulfillmentUpdate)
  );
}

export function shouldAutoMoveImportedAllegroOrderToProcessing(order: {
  externalSource?: {
    externallyFulfilled?: boolean;
    fulfillmentProvider?: "SELLER" | "ALLEGRO";
    externalFulfillmentStatus?: string;
  } | null;
  fulfillment?: {
    provider?: { id?: string };
    status?: string;
  };
}): boolean {
  const fulfillmentProvider =
    order.fulfillment?.provider?.id ??
    order.externalSource?.fulfillmentProvider;
  const fulfillmentStatus =
    order.fulfillment?.status ??
    order.externalSource?.externalFulfillmentStatus;

  return (
    fulfillmentProvider !== "ALLEGRO" &&
    order.externalSource?.externallyFulfilled !== true &&
    (!fulfillmentStatus || fulfillmentStatus === "NEW")
  );
}
