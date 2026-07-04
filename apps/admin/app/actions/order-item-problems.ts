"use server";

import {
  getAuthenticatedAdminMember,
  requireTenantAdminChannelAccess,
} from "./auth-utils";
import { sendEmail } from "@/lib/email";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { OrderItemProblemNotification } from "@konfi/emails";
import type { Channel, Order } from "@konfi/types";

interface SendOrderItemProblemNotificationInput {
  channelId: string;
  description: string;
  itemId: string;
  orderId: string;
}

interface SendOrderItemProblemNotificationResult {
  error?: string;
  sent: boolean;
  skipped?: "channel" | "email" | "item" | "order";
}

function getAdminBaseUrl(): string | undefined {
  return (
    process.env.ADMIN_URL?.trim() || process.env.NEXT_PUBLIC_ADMIN_URL?.trim()
  );
}

function buildAdminOrderUrl(orderId: string, channelId: string) {
  const path = `/orders/${orderId}?channelId=${encodeURIComponent(channelId)}`;
  const baseUrl = getAdminBaseUrl();

  if (!baseUrl) {
    return path;
  }

  return new URL(path, baseUrl).toString();
}

function getDefaultChannelNotificationEmail(channel: Channel) {
  const email = channel.notifications?.email?.trim();

  return email && email.includes("@") ? email : undefined;
}

function getOrderItemName(order: Order, itemId: string) {
  if (!Array.isArray(order.items)) {
    return undefined;
  }

  const orderItem = order.items.find((item) => item.id === itemId);

  if (!orderItem) {
    return undefined;
  }

  const productName = orderItem.product?.name?.trim();
  const itemName =
    typeof orderItem.name === "string" ? orderItem.name.trim() : "";

  return productName || itemName || itemId;
}

export async function sendOrderItemProblemNotification(
  input: SendOrderItemProblemNotificationInput,
): Promise<SendOrderItemProblemNotificationResult> {
  const channelId = await requireTenantAdminChannelAccess(input.channelId);
  const tenantContext = await getTenantContextForRequest();
  const firestore = getAdminDb();
  const [actor, channelSnapshot, orderSnapshot] = await Promise.all([
    getAuthenticatedAdminMember(),
    firestore.collection("channels").doc(channelId).get(),
    firestore.doc(`channels/${channelId}/orders/${input.orderId}`).get(),
  ]);

  if (!channelSnapshot.exists) {
    return { sent: false, skipped: "channel" };
  }

  if (!orderSnapshot.exists) {
    return { sent: false, skipped: "order" };
  }

  const channel = {
    ...(channelSnapshot.data() as Channel),
    id: channelSnapshot.id,
  } satisfies Channel;
  const recipientEmail = getDefaultChannelNotificationEmail(channel);

  if (!recipientEmail) {
    return { sent: false, skipped: "email" };
  }

  const order = {
    ...(orderSnapshot.data() as Order),
    id: orderSnapshot.id,
  } satisfies Order;
  const itemName = getOrderItemName(order, input.itemId);

  if (!itemName) {
    return { sent: false, skipped: "item" };
  }

  try {
    await sendEmail({
      to: recipientEmail,
      from: process.env.NO_REPLY_EMAIL?.trim(),
      subject: `Nowy problem pozycji zamowienia ${order.number}`,
      tenantContext,
      template: OrderItemProblemNotification({
        actorName: actor.name,
        brand: "admin",
        channelName: channel.name || "Nieznany kanal",
        description: input.description,
        itemName,
        orderNumber: `${order.number}`,
        url: buildAdminOrderUrl(order.id, channelId),
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to send item problem notification email";
    console.error("Failed to send item problem notification email", error);
    return { sent: false, error: message };
  }

  return { sent: true };
}
