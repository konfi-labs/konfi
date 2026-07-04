import { Timestamp } from "firebase/firestore";
import { enumToSearchOptions } from "../enums";

export enum NotificationType {
  NO_PAYMENT_DOCUMENTS = "NO_PAYMENT_DOCUMENTS",
  STALLED_ORDERS_REMINDER = "STALLED_ORDERS_REMINDER",
  CAMPAIGN_CREATED = "CAMPAIGN_CREATED",
  NOTE_CREATED = "NOTE_CREATED",
  COMPLAINT_CREATED = "COMPLAINT_CREATED",
  STORE_ORDER_CREATED = "STORE_ORDER_CREATED",
  FULFILLMENT_REQUEST = "FULFILLMENT_REQUEST",
  PRODUCTION_COOPERATION_REQUEST = "PRODUCTION_COOPERATION_REQUEST",
}

export const NotificationTypeAsOptions = enumToSearchOptions(NotificationType);

export interface NotificationSettings {
  enabledTypes: NotificationType[];
  email?: string;
}

export interface ChannelNotificationSettings extends Omit<
  NotificationSettings,
  "email"
> {
  // Channel defaults; members inherit unless overridden
  email?: string;
  emails?: string[] | string; // Multiple emails for channel notifications (array or comma/newline-separated string)
}

export interface MemberNotificationOverride {
  enabled: boolean;
  email?: string;
}

export type MemberNotificationSettings = {
  [K in NotificationType]?: MemberNotificationOverride;
};

// DOM-agnostic subset compatible with how we use notifications across apps
export interface AppNotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  data?: unknown;
}

export type Notification = {
  id: string;
  title: string;
  options?: AppNotificationOptions;
  archived?: boolean;
  channelId?: string;
  url?: string;
  createdAt: Omit<Timestamp, "toJSON">;
};
