import "server-only";

import { sendEmail } from "../email";
import { getAdminDb } from "../firebase/serverApp";
import { publishNotificationPush } from "../notifications/push";
import { getResendConfig } from "../resend/client";
import { getAdminBaseUrl } from "@konfi/payments";
import { NewOrderAdmin, NewOrderCustomer } from "@konfi/emails";
import {
  type Channel,
  isNestedCustomer,
  type Notification,
  NotificationType,
  type StoreOrder,
} from "@konfi/types";
import { getChannelNotificationEmails } from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { Timestamp } from "firebase-admin/firestore";
import { isSharedSaasTenantRuntime } from "../tenant-runtime";

type NewOrderNotificationOrder = {
  channelId: string;
  checkoutSession?: {
    url?: string | null;
  } | null;
  contact: {
    email?: string | null;
  };
  customer: StoreOrder["customer"];
  id: string;
  number: StoreOrder["number"];
  tenantId?: string;
};

function getCustomerName(order: NewOrderNotificationOrder): string {
  return isNestedCustomer(order.customer)
    ? order.customer.name
    : typeof order.customer === "string"
      ? order.customer
      : "";
}

function getAdminOrderUrl(
  order: NewOrderNotificationOrder,
): string | undefined {
  try {
    return new URL(
      `/orders/${order.id}?channelId=${order.channelId}`,
      `${getAdminBaseUrl()}/`,
    ).toString();
  } catch (error) {
    console.error(
      "Failed to build admin order URL for new order email:",
      error,
    );
    return undefined;
  }
}

async function createAdminNotification(params: {
  channelId: string;
  channelName: string;
  orderId: string;
  orderNumber: string;
  tenantId?: string;
}) {
  const adminDb = getAdminDb();
  const notificationDoc = adminDb.collection("notifications").doc();

  const notification: Notification & { tenantId?: string } = {
    id: notificationDoc.id,
    title: "Nowe zamówienie",
    options: {
      body: `Nowe zamówienie nr.${params.orderNumber} zostało utworzone w kanale sprzedaży ${params.channelName}`,
    },
    archived: false,
    channelId: params.channelId,
    url: `/orders/${params.orderId}`,
    createdAt: Timestamp.now(),
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
  };

  await notificationDoc.set(notification);
  await publishNotificationPush(notification);
}

export async function sendNewOrderNotifications(
  order: NewOrderNotificationOrder,
  { tenantContext }: { tenantContext: TenantContext },
): Promise<void> {
  try {
    const adminDb = getAdminDb();
    const isSaasTenantRuntime = isSharedSaasTenantRuntime(tenantContext);
    const noReplyEmail = process.env.NO_REPLY_EMAIL?.trim();
    const orderNumber = `${order.number}`;
    const subject = "Nowe zamówienie";
    const customerName = getCustomerName(order);

    const channelSnapshot = await adminDb
      .collection("channels")
      .doc(order.channelId)
      .get();

    const channel = channelSnapshot.data() as Channel | undefined;
    const channelName = channel?.name ?? "";

    if (channel) {
      try {
        await createAdminNotification({
          channelId: order.channelId,
          channelName,
          orderId: order.id,
          orderNumber,
          tenantId: order.tenantId,
        });
      } catch (error) {
        console.error("Failed to create new-order admin notification:", error);
      }
    } else {
      console.error(
        `Channel ${order.channelId} not found while sending new-order notifications.`,
      );
    }

    if (!isSaasTenantRuntime && !noReplyEmail) {
      console.error("NO_REPLY_EMAIL is not defined");
      return;
    }

    try {
      await getResendConfig(tenantContext);
    } catch (error) {
      console.error(
        `Skipping new-order emails for order ${order.id} because Resend is not configured:`,
        error,
      );
      return;
    }

    const emailPromises: Promise<void>[] = [];
    const customerEmail = order.contact.email?.trim();

    if (customerEmail) {
      emailPromises.push(
        sendEmail({
          to: customerEmail,
          ...(!isSaasTenantRuntime && noReplyEmail
            ? { from: noReplyEmail }
            : {}),
          subject,
          tenantContext,
          template: NewOrderCustomer({
            brand: "store",
            name: customerName,
            orderNumber,
            url: order.checkoutSession?.url || "",
          }),
          fallbackTemplate: process.env.RESEND_NEW_ORDER_CUSTOMER_TEMPLATE_ID
            ? {
                id: process.env.RESEND_NEW_ORDER_CUSTOMER_TEMPLATE_ID,
                variables: {
                  name: customerName,
                  orderNumber,
                  url: order.checkoutSession?.url || "",
                },
              }
            : undefined,
        }),
      );
    } else {
      console.error(
        `Order ${order.id} has no contact email for customer email.`,
      );
    }

    const channelNotificationsEnabled =
      channel?.notifications?.enabledTypes?.includes(
        NotificationType.STORE_ORDER_CREATED,
      ) ?? false;

    if (channelNotificationsEnabled) {
      const adminOrderUrl = getAdminOrderUrl(order);
      const notificationEmails = channel
        ? getChannelNotificationEmails(
            channel,
            isSaasTenantRuntime ? undefined : process.env.NOTIFICATIONS_EMAIL,
          )
        : [];

      if (!adminOrderUrl) {
        console.error(
          `Skipping new-order admin emails for order ${order.id} because ADMIN_URL or NEXT_PUBLIC_ADMIN_URL is not configured.`,
        );
      } else {
        for (const notificationEmail of notificationEmails) {
          emailPromises.push(
            sendEmail({
              to: notificationEmail,
              ...(!isSaasTenantRuntime && noReplyEmail
                ? { from: noReplyEmail }
                : {}),
              subject,
              tenantContext,
              template: NewOrderAdmin({
                brand: "admin",
                channelName,
                orderNumber,
                url: adminOrderUrl,
              }),
              fallbackTemplate: process.env.RESEND_NEW_ORDER_ADMIN_TEMPLATE_ID
                ? {
                    id: process.env.RESEND_NEW_ORDER_ADMIN_TEMPLATE_ID,
                    variables: {
                      channelName,
                      orderNumber,
                      url: adminOrderUrl,
                    },
                  }
                : undefined,
            }),
          );
        }
      }
    }

    const results = await Promise.allSettled(emailPromises);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Failed to send new-order email:", result.reason);
      }
    }
  } catch (error) {
    console.error("Failed to process store new-order notifications:", error);
  }
}
