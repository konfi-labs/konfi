import { PaymentType, type NestedMember } from "@konfi/types";
import { NextResponse } from "next/server";

import {
  getStoreRuntimeConfigForRequest,
  verifyAnyIdToken,
} from "@/lib/firebase/serverApp";
import { changeStoreOrderPaymentMethod } from "@/lib/orders/change-payment-method.server";

import type {
  ChangeStoreOrderPaymentMethodRequest,
  ChangeStoreOrderPaymentMethodResult,
} from "@/lib/orders/types";

function createErrorResponse(
  payload: ChangeStoreOrderPaymentMethodResult,
  status: number,
) {
  return NextResponse.json(payload, { status });
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
}

function parseRequestBody(
  body: unknown,
): ChangeStoreOrderPaymentMethodRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const paymentType = (body as { paymentType?: unknown }).paymentType;
  if (
    typeof paymentType !== "string" ||
    !Object.values(PaymentType).includes(paymentType as PaymentType)
  ) {
    return null;
  }

  return {
    paymentType: paymentType as PaymentType,
  };
}

function getStatusCodeForMessage(message: string) {
  switch (message) {
    case "UNAUTHENTICATED":
      return 401;
    case "UNAUTHORIZED":
      return 403;
    case "ORDER_NOT_FOUND":
      return 404;
    case "PAYMENT_METHOD_CHANGED":
      return 200;
    case "BUYING_DISABLED":
    case "CHECKOUT_SESSION_CREATION_FAILED":
    case "NOT_ELIGIBLE":
    case "PAYMENT_TYPE_NOT_AVAILABLE":
    case "INVALID_ARGUMENT":
      return 400;
    default:
      return 500;
  }
}

function getActorName(decodedToken: {
  name?: unknown;
  email?: unknown;
}): string {
  if (typeof decodedToken.name === "string" && decodedToken.name.trim()) {
    return decodedToken.name.trim();
  }

  if (typeof decodedToken.email === "string" && decodedToken.email.trim()) {
    return decodedToken.email.trim();
  }

  return "Customer";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const idToken = getBearerToken(request);
    if (!idToken) {
      return createErrorResponse(
        {
          success: false,
          message: "UNAUTHENTICATED",
          error: "User is not authenticated",
        },
        401,
      );
    }

    const decodedToken = await verifyAnyIdToken(idToken);
    if (!decodedToken) {
      return createErrorResponse(
        {
          success: false,
          message: "UNAUTHENTICATED",
          error: "User is not authenticated",
        },
        401,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createErrorResponse(
        {
          success: false,
          message: "INVALID_ARGUMENT",
          error: "Invalid request body",
        },
        400,
      );
    }

    const parsedBody = parseRequestBody(body);
    if (!parsedBody) {
      return createErrorResponse(
        {
          success: false,
          message: "INVALID_ARGUMENT",
          error: "paymentType is required",
        },
        400,
      );
    }

    const { id: orderId } = await context.params;
    const actor: NestedMember = {
      id: decodedToken.uid,
      name: getActorName(decodedToken),
    };
    const runtimeConfig = await getStoreRuntimeConfigForRequest();
    if (!runtimeConfig) {
      return createErrorResponse(
        {
          success: false,
          message: "STORE_NOT_FOUND",
          error: "Store domain is not active or could not be resolved",
        },
        404,
      );
    }

    if (runtimeConfig.maintenance.enabled && decodedToken.admin !== true) {
      return createErrorResponse(
        {
          success: false,
          message: "STORE_MAINTENANCE",
          error: "Store is in maintenance mode",
        },
        503,
      );
    }

    const result = await changeStoreOrderPaymentMethod({
      orderId,
      paymentType: parsedBody.paymentType,
      authUid: decodedToken.uid,
      actor,
      isAdmin: decodedToken.admin === true,
      tenantContext: runtimeConfig.tenantContext,
      runtimeConfig,
    });

    return NextResponse.json(result, {
      status: getStatusCodeForMessage(result.message),
    });
  } catch (error) {
    console.error("Error changing store payment method", error);
    return createErrorResponse(
      {
        success: false,
        message: "CHANGE_PAYMENT_METHOD_FAILED",
        error: "Failed to change payment method",
      },
      500,
    );
  }
}
