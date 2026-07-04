"use server";

import {
  STORE_SESSION_COOKIE,
  getAdminDb,
  getTenantContextForRequest,
  verifySessionCookie,
} from "@/lib/firebase/serverApp";
import { publishNotificationPush } from "@/lib/notifications/push";
import {
  Customer,
  Notification,
  Order,
  RmaRequest,
  RmaRequestItem,
  RmaRequestType,
} from "@konfi/types";
import {
  RMA_REQUESTS_COLLECTION,
  createRmaRequestFromOrder,
} from "@konfi/utils";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { cookies } from "next/headers";

interface CustomerRmaItemInput {
  description?: string;
  orderItemId: string;
  quantity: number;
}

interface CreateCustomerRmaRequestInput {
  channelId: string;
  description: string;
  items: CustomerRmaItemInput[];
  orderId: string;
  type: RmaRequestType;
}

type CreateCustomerRmaRequestResult =
  | {
      id: string;
      ok: true;
    }
  | {
      errorCode: CustomerRmaRequestErrorCode;
      ok: false;
    };

const customerRmaRequestErrorCodes = [
  "customerNotFound",
  "descriptionTooLong",
  "descriptionTooShort",
  "invalidItems",
  "missingContext",
  "orderNotFound",
  "unauthorized",
  "unknown",
] as const;

type CustomerRmaRequestErrorCode =
  (typeof customerRmaRequestErrorCodes)[number];

function createCustomerRmaRequestError(code: CustomerRmaRequestErrorCode) {
  return new Error(code);
}

function isCustomerRmaRequestErrorCode(
  value: string,
): value is CustomerRmaRequestErrorCode {
  return customerRmaRequestErrorCodes.includes(
    value as CustomerRmaRequestErrorCode,
  );
}

function customerIdFromOrder(order: Order): string | undefined {
  if (typeof order.customer === "string") {
    return order.customer;
  }

  return order.customer.id || undefined;
}

function isOrderOwnedByCustomer(order: Order, customerId: string) {
  return order.active !== false && customerIdFromOrder(order) === customerId;
}

function normalizeRmaRequestType(type: RmaRequestType): RmaRequestType {
  return Object.values(RmaRequestType).includes(type)
    ? type
    : RmaRequestType.CLAIM;
}

function normalizeDescription(description: string) {
  const normalized = description.trim();

  if (normalized.length < 10) {
    throw createCustomerRmaRequestError("descriptionTooShort");
  }

  if (normalized.length > 5000) {
    throw createCustomerRmaRequestError("descriptionTooLong");
  }

  return normalized;
}

function normalizeRmaItems(
  inputItems: CustomerRmaItemInput[],
  order: Order,
): RmaRequestItem[] {
  const orderItemsById = new Map(order.items.map((item) => [item.id, item]));
  const normalizedItems = inputItems.flatMap((inputItem) => {
    const orderItem = orderItemsById.get(inputItem.orderItemId);

    if (!orderItem) {
      return [];
    }

    const quantity = Math.round(inputItem.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return [];
    }

    return [
      {
        ...(inputItem.description?.trim()
          ? { description: inputItem.description.trim().slice(0, 1000) }
          : {}),
        orderItemId: orderItem.id,
        quantity: Math.min(
          quantity,
          Math.max(1, Math.round(orderItem.quantity)),
        ),
      },
    ];
  });

  if (normalizedItems.length === 0) {
    throw createCustomerRmaRequestError("invalidItems");
  }

  return normalizedItems;
}

async function getAuthenticatedCustomer() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(STORE_SESSION_COOKIE)?.value;

  if (!sessionCookie) {
    throw createCustomerRmaRequestError("unauthorized");
  }

  const decodedToken = await verifySessionCookie(sessionCookie);

  if (!decodedToken) {
    throw createCustomerRmaRequestError("unauthorized");
  }

  const firestore = getAdminDb();
  const customerSnapshot = await firestore
    .collection("customers")
    .doc(decodedToken.uid)
    .get();

  if (!customerSnapshot.exists) {
    throw createCustomerRmaRequestError("customerNotFound");
  }

  return {
    customer: {
      ...(customerSnapshot.data() as Customer),
      id: customerSnapshot.id,
    },
    uid: decodedToken.uid,
  };
}

async function createCustomerRmaNotification(params: {
  channelId: string;
  order: Order;
  rmaRequest: RmaRequest;
  tenantId?: string;
}) {
  const firestore = getAdminDb();
  const notificationRef = firestore.collection("notifications").doc();
  const notification: Notification & { tenantId?: string } = {
    archived: false,
    channelId: params.channelId,
    createdAt: Timestamp.now(),
    id: notificationRef.id,
    options: {
      body: `Customer submitted RMA request ${params.rmaRequest.id} for order ${params.order.number}.`,
    },
    title: "New RMA request",
    url: `/complaints/rma`,
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
  };

  await notificationRef.set(notification);
  await publishNotificationPush(notification);
}

export async function createCustomerRmaRequest(
  input: CreateCustomerRmaRequestInput,
): Promise<CreateCustomerRmaRequestResult> {
  try {
    const channelId = input.channelId.trim();
    const orderId = input.orderId.trim();

    if (!channelId || !orderId) {
      throw createCustomerRmaRequestError("missingContext");
    }

    const [tenantContext, authenticated] = await Promise.all([
      getTenantContextForRequest(),
      getAuthenticatedCustomer(),
    ]);
    const firestore = getAdminDb();
    const timestampNow = Timestamp.now();
    const orderRef = firestore.doc(`channels/${channelId}/orders/${orderId}`);
    const rmaRef = firestore
      .collection(`channels/${channelId}/${RMA_REQUESTS_COLLECTION}`)
      .doc();
    let createdRequest: RmaRequest | undefined;
    let sourceOrder: Order | undefined;

    await firestore.runTransaction(async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef);

      if (!orderSnapshot.exists) {
        throw createCustomerRmaRequestError("orderNotFound");
      }

      const order = {
        ...(orderSnapshot.data() as Order),
        id: orderSnapshot.id,
      };

      if (!isOrderOwnedByCustomer(order, authenticated.uid)) {
        throw createCustomerRmaRequestError("orderNotFound");
      }

      if (order.channelId !== channelId) {
        throw createCustomerRmaRequestError("orderNotFound");
      }

      const actor = {
        id: authenticated.uid,
        name:
          authenticated.customer.personName ||
          authenticated.customer.name ||
          authenticated.customer.email ||
          "Customer",
      };
      const rmaRequest: RmaRequest = {
        id: rmaRef.id,
        ...createRmaRequestFromOrder({
          actor,
          channelId,
          customerId: authenticated.uid,
          description: normalizeDescription(input.description),
          items: normalizeRmaItems(input.items, order),
          now: timestampNow,
          order,
          type: normalizeRmaRequestType(input.type),
        }),
        ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
      };

      transaction.set(rmaRef, rmaRequest);
      transaction.update(orderRef, {
        updatedAt: timestampNow,
        updatedBy: actor,
        keywords: FieldValue.arrayUnion(rmaRef.id),
      });

      createdRequest = rmaRequest;
      sourceOrder = order;
    });

    if (createdRequest && sourceOrder) {
      await createCustomerRmaNotification({
        channelId,
        order: sourceOrder,
        rmaRequest: createdRequest,
        tenantId: tenantContext.tenantId,
      }).catch((error) => {
        console.error("Failed to create customer RMA notification:", error);
      });
    }

    return { id: rmaRef.id, ok: true };
  } catch (error) {
    console.error("Failed to create customer RMA request:", error);
    const errorCode =
      error instanceof Error && isCustomerRmaRequestErrorCode(error.message)
        ? error.message
        : "unknown";

    return {
      errorCode,
      ok: false,
    };
  }
}
