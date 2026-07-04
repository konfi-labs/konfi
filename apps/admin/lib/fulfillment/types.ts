import type { NestedMember } from "@konfi/types";

export class FulfillmentApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = "FulfillmentApiError";
    this.statusCode = statusCode;
  }
}

export interface AcceptFulfillmentRequestData {
  warehouseId: string;
  requestId: string;
  targetTenantId?: string;
}

export interface RejectFulfillmentRequestData {
  warehouseId: string;
  requestId: string;
  reason?: string;
  targetTenantId?: string;
}

export interface CreateManualFulfillmentRequestData {
  channelId: string;
  orderId: string;
  itemId: string;
  warehouseId: string;
  sourceTenantId?: string;
  targetTenantId?: string;
  cooperationId?: string;
}

export interface AssignOrderItemWarehouseData {
  channelId: string;
  orderId: string;
  itemId: string;
  warehouseId?: string;
}

export interface UpdateItemStatusData {
  channelId: string;
  orderId: string;
  itemId: string;
  inProgress?: boolean;
  fulfilled?: boolean;
  pickedUp?: boolean;
  delivered?: boolean;
}

export interface OrderCreatedFulfillmentData {
  channelId: string;
  orderId: string;
}

export interface FulfillmentMutationResponse {
  success: boolean;
  message: string;
  created?: boolean;
  assigned?: boolean;
  requestId?: string;
}

export interface OrderCreatedFulfillmentResponse extends FulfillmentMutationResponse {
  createdCount: number;
  skippedCount: number;
}

export interface CleanupFulfillmentRequestsResponse extends FulfillmentMutationResponse {
  cancelledCount: number;
  syncedCount: number;
  errors: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FulfillmentApiError("Invalid request payload", 400);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new FulfillmentApiError(`Missing required parameter: ${key}`, 400);
  }

  return value.trim();
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function parseAcceptFulfillmentRequestData(
  payload: unknown,
): AcceptFulfillmentRequestData {
  const record = asRecord(payload);

  return {
    warehouseId: readRequiredString(record, "warehouseId"),
    requestId: readRequiredString(record, "requestId"),
    targetTenantId: readOptionalString(record, "targetTenantId"),
  };
}

export function parseRejectFulfillmentRequestData(
  payload: unknown,
): RejectFulfillmentRequestData {
  const record = asRecord(payload);

  return {
    warehouseId: readRequiredString(record, "warehouseId"),
    requestId: readRequiredString(record, "requestId"),
    reason: readOptionalString(record, "reason"),
    targetTenantId: readOptionalString(record, "targetTenantId"),
  };
}

export function parseCreateManualFulfillmentRequestData(
  payload: unknown,
): CreateManualFulfillmentRequestData {
  const record = asRecord(payload);

  return {
    channelId: readRequiredString(record, "channelId"),
    orderId: readRequiredString(record, "orderId"),
    itemId: readRequiredString(record, "itemId"),
    warehouseId: readRequiredString(record, "warehouseId"),
    sourceTenantId: readOptionalString(record, "sourceTenantId"),
    targetTenantId: readOptionalString(record, "targetTenantId"),
    cooperationId: readOptionalString(record, "cooperationId"),
  };
}

export function parseAssignOrderItemWarehouseData(
  payload: unknown,
): AssignOrderItemWarehouseData {
  const record = asRecord(payload);

  return {
    channelId: readRequiredString(record, "channelId"),
    orderId: readRequiredString(record, "orderId"),
    itemId: readRequiredString(record, "itemId"),
    warehouseId: readOptionalString(record, "warehouseId"),
  };
}

export function parseUpdateItemStatusData(
  payload: unknown,
): UpdateItemStatusData {
  const record = asRecord(payload);

  const data: UpdateItemStatusData = {
    channelId: readRequiredString(record, "channelId"),
    orderId: readRequiredString(record, "orderId"),
    itemId: readRequiredString(record, "itemId"),
    inProgress: readOptionalBoolean(record, "inProgress"),
    fulfilled: readOptionalBoolean(record, "fulfilled"),
    pickedUp: readOptionalBoolean(record, "pickedUp"),
    delivered: readOptionalBoolean(record, "delivered"),
  };

  if (
    data.inProgress === undefined &&
    data.fulfilled === undefined &&
    data.pickedUp === undefined &&
    data.delivered === undefined
  ) {
    throw new FulfillmentApiError(
      "Must provide at least one item status change",
      400,
    );
  }

  return data;
}

export function parseOrderCreatedFulfillmentData(
  payload: unknown,
): OrderCreatedFulfillmentData {
  const record = asRecord(payload);

  return {
    channelId: readRequiredString(record, "channelId"),
    orderId: readRequiredString(record, "orderId"),
  };
}

export function createSystemMember(): NestedMember {
  return {
    id: "system",
    name: "System",
  };
}
