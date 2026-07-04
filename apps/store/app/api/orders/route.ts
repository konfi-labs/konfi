import { NextResponse } from "next/server";

import {
  getStoreRuntimeConfigForRequest,
  verifyAnyIdToken,
} from "../../../lib/firebase/serverApp";
import {
  createStoreOrder,
  parseCreateStoreOrderRequest,
} from "../../../lib/orders/create-order.server";

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      id: "",
      message: "ORDER_CREATION_FAILED",
      url: "",
      error,
    },
    { status },
  );
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
}

export async function POST(request: Request) {
  try {
    const idToken = getBearerToken(request);
    if (!idToken) {
      return createErrorResponse("UNAUTHENTICATED", 401);
    }

    const decodedToken = await verifyAnyIdToken(idToken);
    if (!decodedToken) {
      return createErrorResponse("UNAUTHENTICATED", 401);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return createErrorResponse("INVALID_ARGUMENT", 400);
    }

    let parsedRequest;
    try {
      parsedRequest = await parseCreateStoreOrderRequest(payload);
    } catch (error) {
      return createErrorResponse(
        error instanceof Error ? error.message : "INVALID_ARGUMENT",
        400,
      );
    }

    const runtimeConfig = await getStoreRuntimeConfigForRequest();
    if (!runtimeConfig) {
      return createErrorResponse("STORE_NOT_FOUND", 404);
    }

    if (runtimeConfig.maintenance.enabled && decodedToken.admin !== true) {
      return createErrorResponse("STORE_MAINTENANCE", 503);
    }

    const result = await createStoreOrder({
      request: parsedRequest,
      authUid: decodedToken.uid,
      isAdmin: decodedToken.admin === true,
      tenantContext: runtimeConfig.tenantContext,
      runtimeConfig,
    });

    return NextResponse.json(result, {
      status: result.error ? 400 : 200,
    });
  } catch (error) {
    console.error("Error creating store order", error);
    return createErrorResponse("ORDER_CREATION_FAILED", 500);
  }
}
