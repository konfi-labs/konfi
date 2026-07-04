import type { Base } from "./base";
import type { TenantOwned } from "./tenant";

export enum CommerceWebhookEventType {
  ORDER_CREATED = "order.created",
  PAYMENT_COMPLETED = "payment.completed",
  PAYMENT_REFUNDED = "payment.refunded",
  FULFILLMENT_STATUS_CHANGED = "fulfillment.status_changed",
  COMPLAINT_CREATED = "complaint.created",
  COMPLAINT_RESOLVED = "complaint.resolved",
  STOCK_CHANGED = "stock.changed",
}

export enum WebhookDeliveryStatus {
  PENDING = "PENDING",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
}

export interface WebhookSubscription extends Base, TenantOwned {
  active: boolean;
  channelIds?: string[];
  description?: string;
  events: CommerceWebhookEventType[];
  failureCount?: number;
  lastDeliveryAt?: unknown;
  secret: string;
  url: string;
}

export interface WebhookDelivery extends Base, TenantOwned {
  attempts: number;
  channelId?: string;
  error?: string;
  eventId: string;
  eventType: CommerceWebhookEventType;
  nextAttemptAt?: unknown;
  payload: Record<string, unknown>;
  request: {
    url: string;
  };
  response?: {
    body?: string;
    status: number;
  };
  status: WebhookDeliveryStatus;
  subscriptionId: string;
}
