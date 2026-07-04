"use server";

import {
  getAuthenticatedAdminUid,
  requireTenantAdminChannelAccess,
} from "@/actions/auth-utils";
import {
  getAdminDb,
  getFirebaseAdminApp,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  assertSaasRuntimeQuota,
  recordSaasRuntimeQuotaUsage,
} from "@/lib/saas-runtime-quotas";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import { type StoreOrder, isNestedCustomer } from "@konfi/types";
import {
  assertOwnedGeneratedStoragePath,
  getStoragePathExtension,
} from "./attach-generated-product-images.utils";
import { buildOrderItemAttachmentPaths } from "./attach-generated-order-item-image.utils";
import { tenantStoragePaths } from "@konfi/firebase";

export async function attachGeneratedOrderItemImage(input: {
  channelId: string;
  orderId: string;
  orderItemId: string;
  sourceStoragePath: string;
}): Promise<{
  fileName: string;
  fullPath: string;
  thumbnailPath: string;
}> {
  const adminUid = await getAuthenticatedAdminUid();
  const channelId = await requireTenantAdminChannelAccess(input.channelId);
  const sourceStoragePath = input.sourceStoragePath.trim();

  if (!sourceStoragePath) {
    throw new Error("Generated image storage path is required.");
  }

  assertOwnedGeneratedStoragePath(sourceStoragePath, adminUid);

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  }

  const orderSnapshot = await getAdminDb()
    .doc(`channels/${channelId}/orders/${input.orderId}`)
    .get();

  if (!orderSnapshot.exists) {
    throw new Error("Order was not found.");
  }

  const order = orderSnapshot.data() as StoreOrder;
  const customerId =
    typeof order.customer === "string"
      ? order.customer.trim()
      : isNestedCustomer(order.customer)
        ? order.customer.id
        : "";
  const orderItem = order.items.find((item) => item.id === input.orderItemId);

  if (!customerId) {
    throw new Error("Order customer was not found.");
  }

  if (!orderItem) {
    throw new Error("Order item was not found.");
  }

  const tenantContext = await getTenantContextForRequest();
  const fileName = `ai-${randomUUID()}${getStoragePathExtension(sourceStoragePath)}`;
  const paths = buildOrderItemAttachmentPaths({
    ...(tenantContext.deploymentMode === "saas" ? { channelId } : {}),
    customerId,
    orderId: input.orderId,
    orderItemId: orderItem.id,
    fileName,
  });
  const fullPath = tenantStoragePaths.withTenantPrefix(
    tenantContext,
    paths.fullPath,
  );
  const thumbnailPath = tenantStoragePaths.withTenantPrefix(
    tenantContext,
    paths.thumbnailPath,
  );

  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
  const [metadata] = await bucket.file(sourceStoragePath).getMetadata();
  const sourceSize =
    typeof metadata.size === "number"
      ? metadata.size
      : Number(metadata.size ?? 0);
  const requestedStorageBytes =
    (Number.isFinite(sourceSize) ? sourceSize : 0) * 2;
  await assertSaasRuntimeQuota({
    context: tenantContext,
    firestore: getAdminDb(),
    operation: "admin.generated-order-item-image.attach",
    requested: requestedStorageBytes,
    resource: "storageBytes",
  });
  await bucket.file(sourceStoragePath).copy(bucket.file(fullPath));
  await bucket.file(sourceStoragePath).copy(bucket.file(thumbnailPath));
  await recordSaasRuntimeQuotaUsage({
    context: tenantContext,
    firestore: getAdminDb(),
    operation: "admin.generated-order-item-image.attach",
    requested: requestedStorageBytes,
    resource: "storageBytes",
  });

  return {
    fileName,
    fullPath,
    thumbnailPath,
  };
}
