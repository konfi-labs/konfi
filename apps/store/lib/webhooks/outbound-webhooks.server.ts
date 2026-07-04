import {
  CommerceWebhookEventType,
  type WebhookDelivery,
  WebhookDeliveryStatus,
  type WebhookSubscription,
} from "@konfi/types";
import { requireTenantContextTenantId, withTenantId } from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { randomUUID } from "crypto";
import { FieldValue, Timestamp, type Query } from "firebase-admin/firestore";
import { getAdminDb } from "../firebase/serverApp";
import { createCommerceWebhookSignature } from "./signature";

const WEBHOOK_DELIVERY_TIMEOUT_MS = 8_000;
const WEBHOOK_MAX_RESPONSE_BODY_LENGTH = 1_000;

export interface CommerceWebhookEventInput {
  channelId?: string;
  eventType: CommerceWebhookEventType;
  payload: Record<string, unknown>;
  subjectId: string;
  tenantContext: TenantContext;
}

interface CommerceWebhookEnvelope {
  channelId?: string;
  data: Record<string, unknown>;
  eventId: string;
  eventType: CommerceWebhookEventType;
  occurredAt: string;
  subjectId: string;
}

function shouldScopeByTenant(tenantContext: TenantContext) {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function withTenantOwned<T extends object>(
  data: T & { tenantId?: string },
  tenantContext: TenantContext,
  operationName: string,
): T & { tenantId?: string } {
  return shouldScopeByTenant(tenantContext)
    ? withTenantId(data, tenantContext, operationName)
    : data;
}

function applyTenantFilter<T>(
  query: Query<T>,
  tenantContext: TenantContext,
  operationName: string,
) {
  if (!shouldScopeByTenant(tenantContext)) {
    return query;
  }

  return query.where(
    "tenantId",
    "==",
    requireTenantContextTenantId(tenantContext, operationName),
  );
}

function isDeliverableSubscription(
  subscription: WebhookSubscription,
  channelId: string | undefined,
): boolean {
  if (!subscription.active || !subscription.url || !subscription.secret) {
    return false;
  }

  if (
    subscription.channelIds?.length &&
    (!channelId || !subscription.channelIds.includes(channelId))
  ) {
    return false;
  }

  try {
    const url = new URL(subscription.url);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function getActiveSubscriptions(
  eventType: CommerceWebhookEventType,
  tenantContext: TenantContext,
): Promise<WebhookSubscription[]> {
  const adminDb = getAdminDb();
  const query = applyTenantFilter(
    adminDb
      .collection("webhookSubscriptions")
      .where("active", "==", true)
      .where("events", "array-contains", eventType),
    tenantContext,
    "commerce webhook subscriptions",
  );
  const snapshot = await query.get();

  return snapshot.docs.map((doc) => ({
    ...(doc.data() as WebhookSubscription),
    id: doc.id,
  }));
}

async function deliverToSubscription(
  subscription: WebhookSubscription,
  envelope: CommerceWebhookEnvelope,
  tenantContext: TenantContext,
) {
  const adminDb = getAdminDb();
  const deliveryRef = adminDb.collection("webhookDeliveries").doc();
  const body = JSON.stringify(envelope);
  const timestamp = new Date().toISOString();
  const signature = createCommerceWebhookSignature(
    subscription.secret,
    timestamp,
    body,
  );
  const baseDelivery: WebhookDelivery = withTenantOwned(
    {
      id: deliveryRef.id,
      active: true,
      attempts: 1,
      createdAt: Timestamp.now(),
      createdBy: { id: "system", name: "System" },
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      name: `${envelope.eventType}:${envelope.subjectId}`,
      payload: envelope.data,
      request: { url: subscription.url },
      status: WebhookDeliveryStatus.PENDING,
      subscriptionId: subscription.id,
      updatedAt: Timestamp.now(),
      updatedBy: { id: "system", name: "System" },
      ...(envelope.channelId ? { channelId: envelope.channelId } : {}),
    },
    tenantContext,
    "commerce webhook delivery",
  );

  await deliveryRef.set(baseDelivery);

  try {
    const response = await fetch(subscription.url, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-konfi-event": envelope.eventType,
        "x-konfi-signature": `sha256=${signature}`,
        "x-konfi-timestamp": timestamp,
      },
      signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
    });
    const responseBody = (await response.text()).slice(
      0,
      WEBHOOK_MAX_RESPONSE_BODY_LENGTH,
    );
    const delivered = response.ok;

    await deliveryRef.set(
      {
        response: {
          body: responseBody,
          status: response.status,
        },
        status: delivered
          ? WebhookDeliveryStatus.DELIVERED
          : WebhookDeliveryStatus.FAILED,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    await adminDb
      .collection("webhookSubscriptions")
      .doc(subscription.id)
      .set(
        {
          failureCount: delivered ? 0 : FieldValue.increment(1),
          lastDeliveryAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
  } catch (error) {
    await deliveryRef.set(
      {
        error: error instanceof Error ? error.message : String(error),
        nextAttemptAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
        status: WebhookDeliveryStatus.FAILED,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    await adminDb
      .collection("webhookSubscriptions")
      .doc(subscription.id)
      .set(
        {
          failureCount: FieldValue.increment(1),
          lastDeliveryAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
  }
}

export async function emitCommerceWebhookEvent({
  channelId,
  eventType,
  payload,
  subjectId,
  tenantContext,
}: CommerceWebhookEventInput): Promise<void> {
  const subscriptions = (
    await getActiveSubscriptions(eventType, tenantContext)
  ).filter((subscription) =>
    isDeliverableSubscription(subscription, channelId),
  );

  if (subscriptions.length === 0) {
    return;
  }

  const envelope: CommerceWebhookEnvelope = {
    channelId,
    data: payload,
    eventId: randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    subjectId,
  };

  await Promise.all(
    subscriptions.map((subscription) =>
      deliverToSubscription(subscription, envelope, tenantContext),
    ),
  );
}
