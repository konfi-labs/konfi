"use server";

import {
  requireAdminAuth,
  requireTenantAdminChannelAccess,
} from "./auth-utils";
import { sendEmail } from "@/lib/email";
import {
  getAdminDb,
  getAdminStorage,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { AttachmentNotification } from "@konfi/emails";
import {
  requireTenantContextTenantId,
  type TenantContext,
} from "@konfi/firebase";
import { Customer, StoreOrder, isNestedCustomer } from "@konfi/types";
import { STORE_ACCOUNT_ORDERS } from "@konfi/utils";
import path from "path";

type AttachmentRecipientResolution = {
  recipientEmail?: string;
  fallbackApplied: boolean;
};

function resolveAttachmentRecipientEmail(params: {
  customerEmail?: string;
  contactEmail?: string;
}): AttachmentRecipientResolution {
  const customerEmail = params.customerEmail?.trim();
  if (customerEmail) {
    return {
      recipientEmail: customerEmail,
      fallbackApplied: false,
    };
  }

  const contactEmail = params.contactEmail?.trim();
  if (contactEmail) {
    return {
      recipientEmail: contactEmail,
      fallbackApplied: true,
    };
  }

  return {
    fallbackApplied: false,
  };
}

function getStoreOrderUrl(orderId: string) {
  const storeUrl = process.env.STORE_URL?.trim();
  if (!storeUrl) {
    return `${STORE_ACCOUNT_ORDERS}/${orderId}`;
  }

  return new URL(`${STORE_ACCOUNT_ORDERS}/${orderId}`, storeUrl).toString();
}

function getStorageBucket() {
  const storageBucketName =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();

  return storageBucketName
    ? getAdminStorage().bucket(storageBucketName)
    : getAdminStorage().bucket();
}

function shouldSendAttachmentEmailForChannel(channelId: string) {
  const scopedChannelId = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID?.trim();

  return !scopedChannelId || channelId === scopedChannelId;
}

function normalizeAttachmentStoragePath(
  filePath: string,
  tenantContext: TenantContext,
  channelId: string,
): {
  customerId: string;
  fileName: string;
  orderId: string;
  storagePath: string;
} {
  const storagePath = filePath.trim().replace(/^\/+/, "");
  const legacyMatch = /^attachments\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(
    storagePath,
  );

  if (tenantContext.deploymentMode !== "saas") {
    if (!legacyMatch) {
      throw new Error("Invalid attachment storage path.");
    }

    return {
      customerId: legacyMatch[1],
      fileName: legacyMatch[3],
      orderId: legacyMatch[2],
      storagePath,
    };
  }

  const tenantId = requireTenantContextTenantId(
    tenantContext,
    "attachment storage path",
  );
  const match =
    /^tenants\/([^/]+)\/channels\/([^/]+)\/attachments\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(
      storagePath,
    );

  if (!match || match[1] !== tenantId || match[2] !== channelId) {
    throw new Error("Invalid attachment storage path.");
  }

  return {
    customerId: match[3],
    fileName: match[5],
    orderId: match[4],
    storagePath,
  };
}

function getOrderCustomerId(order: StoreOrder): string | undefined {
  if (typeof order.customer === "string") {
    return order.customer.trim() || undefined;
  }

  if (isNestedCustomer(order.customer)) {
    return order.customer.id;
  }

  return undefined;
}

function assertAttachmentBelongsToOrder(params: {
  order: StoreOrder;
  requestedCustomerId: string;
  requestedOrderId: string;
  storageCustomerId: string;
  storageOrderId: string;
}): void {
  const orderCustomerId = getOrderCustomerId(params.order);

  if (
    params.storageOrderId !== params.requestedOrderId ||
    params.storageCustomerId !== params.requestedCustomerId ||
    orderCustomerId !== params.requestedCustomerId
  ) {
    throw new Error("Attachment does not belong to the selected order.");
  }
}

export async function sendAttachmentNotificationForUploadedFile(params: {
  channelId: string;
  customerId: string;
  filePath: string;
  orderId: string;
}) {
  await requireAdminAuth();
  const channelId = await requireTenantAdminChannelAccess(params.channelId);
  const tenantContext = await getTenantContextForRequest();

  if (!shouldSendAttachmentEmailForChannel(channelId)) {
    return { sent: false, skipped: "channel" };
  }

  const firestore = getAdminDb();
  const orderSnapshot = await firestore
    .doc(`channels/${channelId}/orders/${params.orderId}`)
    .get();

  if (!orderSnapshot.exists) {
    return { sent: false, skipped: "order" };
  }

  const order = orderSnapshot.data() as StoreOrder;
  const attachmentPath = normalizeAttachmentStoragePath(
    params.filePath,
    tenantContext,
    channelId,
  );
  assertAttachmentBelongsToOrder({
    order,
    requestedCustomerId: params.customerId,
    requestedOrderId: params.orderId,
    storageCustomerId: attachmentPath.customerId,
    storageOrderId: attachmentPath.orderId,
  });

  const customerSnapshot = await firestore
    .collection("customers")
    .doc(params.customerId)
    .get();
  const customer = customerSnapshot.data() as Customer | undefined;
  const recipientResolution = resolveAttachmentRecipientEmail({
    customerEmail: customer?.email,
    contactEmail: order.contact?.email,
  });

  if (!recipientResolution.recipientEmail) {
    return { sent: false, skipped: "recipient" };
  }

  const bucket = getStorageBucket();
  const file = bucket.file(attachmentPath.storagePath);
  const [metadata] = await file.getMetadata();

  if (metadata.contentType !== "application/pdf") {
    throw new Error(
      `Invalid file type: ${metadata.contentType}. Only application/pdf is allowed.`,
    );
  }

  const [fileBuffer] = await file.download();
  const fileName = path.basename(attachmentPath.fileName);
  const name = customer?.name ?? order.contact?.name ?? "";

  await sendEmail({
    to: recipientResolution.recipientEmail,
    from: process.env.NO_REPLY_EMAIL?.trim(),
    subject: "Nowy dokument do zamowienia",
    template: AttachmentNotification({
      brand: "store",
      name,
      orderNumber: `${order.number}`,
      fileName,
      url: getStoreOrderUrl(order.id),
    }),
    attachments: [
      {
        content: fileBuffer.toString("base64"),
        filename: fileName,
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  });

  return {
    sent: true,
    fallbackApplied: recipientResolution.fallbackApplied,
  };
}
