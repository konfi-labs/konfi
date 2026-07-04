"use client";

import type {
  AcceptFulfillmentRequestData,
  AssignOrderItemWarehouseData,
  CreateManualFulfillmentRequestData,
  FulfillmentMutationResponse,
  OrderCreatedFulfillmentData,
  OrderCreatedFulfillmentResponse,
  RejectFulfillmentRequestData,
  UpdateItemStatusData,
} from "./types";

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };
    return payload.error ?? payload.message ?? "Request failed";
  } catch {
    return "Request failed";
  }
}

async function postFulfillmentRequest<TResponse>(
  url: string,
  body: unknown,
): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as TResponse;
}

export function createManualFulfillmentRequest(
  data: CreateManualFulfillmentRequestData,
): Promise<FulfillmentMutationResponse> {
  return postFulfillmentRequest<FulfillmentMutationResponse>(
    "/api/fulfillment/requests/manual",
    data,
  );
}

export function assignOrderItemWarehouse(
  data: AssignOrderItemWarehouseData,
): Promise<FulfillmentMutationResponse> {
  return postFulfillmentRequest<FulfillmentMutationResponse>(
    "/api/fulfillment/items/warehouse",
    data,
  );
}

export function acceptFulfillmentRequest(
  data: AcceptFulfillmentRequestData,
): Promise<FulfillmentMutationResponse> {
  return postFulfillmentRequest<FulfillmentMutationResponse>(
    "/api/fulfillment/requests/accept",
    data,
  );
}

export function rejectFulfillmentRequest(
  data: RejectFulfillmentRequestData,
): Promise<FulfillmentMutationResponse> {
  return postFulfillmentRequest<FulfillmentMutationResponse>(
    "/api/fulfillment/requests/reject",
    data,
  );
}

export function updateItemStatus(
  data: UpdateItemStatusData,
): Promise<FulfillmentMutationResponse> {
  return postFulfillmentRequest<FulfillmentMutationResponse>(
    "/api/fulfillment/items/status",
    data,
  );
}

export function notifyOrderCreated(
  data: OrderCreatedFulfillmentData,
): Promise<OrderCreatedFulfillmentResponse> {
  return postFulfillmentRequest<OrderCreatedFulfillmentResponse>(
    "/api/fulfillment/order-created",
    data,
  );
}
