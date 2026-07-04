import "server-only";

import { getFirebaseAdminApp } from "@/lib/firebase/serverApp";
import { tenantStoragePaths } from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { getStorage } from "firebase-admin/storage";
import path from "node:path";

interface CartFileMoveFile {
  name: string;
  move: (destination: string) => Promise<unknown>;
}

export interface CartFileMoveBucket {
  getFiles: (query: {
    prefix: string;
  }) => Promise<[CartFileMoveFile[], ...unknown[]]>;
}

function getStorageBucketName(): string {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error(
      "Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET for cart file transfer.",
    );
  }

  return bucketName;
}

function getOrderStorageBucket(): CartFileMoveBucket {
  return getStorage(getFirebaseAdminApp()).bucket(getStorageBucketName());
}

interface MoveCartFilesToOrderParams {
  cartCustomerId: string;
  channelId: string;
  orderCustomerId: string;
  orderId: string;
  items: Array<{ id: string }>;
  tenantContext: TenantContext;
}

async function getFilesForOrderItem(
  bucket: CartFileMoveBucket,
  basePrefix: string,
  itemId: string,
  index: number,
) {
  const prefixes = [itemId];
  const legacyIndex = String(index);

  if (legacyIndex !== itemId) {
    prefixes.push(legacyIndex);
  }

  for (const itemPrefix of prefixes) {
    const [files] = await bucket.getFiles({
      prefix: `${basePrefix}/items/${itemPrefix}/`,
    });

    if (files.length > 0) {
      return files;
    }
  }

  return [];
}

async function moveFilesForOrderItem(params: {
  bucket: CartFileMoveBucket;
  destinationBasePrefix: string;
  index: number;
  itemId: string;
  sourceBasePrefix: string;
}) {
  const files = await getFilesForOrderItem(
    params.bucket,
    params.sourceBasePrefix,
    params.itemId,
    params.index,
  );

  await Promise.all(
    files.map((file) =>
      file.move(
        `${params.destinationBasePrefix}/items/${params.itemId}/${path.posix.basename(file.name)}`,
      ),
    ),
  );
}

export async function moveCartFilesToOrderInBucket(
  bucket: CartFileMoveBucket,
  params: MoveCartFilesToOrderParams,
) {
  await Promise.all(
    params.items.map(async (item, index) => {
      const itemId = item.id || String(index);

      await Promise.all([
        moveFilesForOrderItem({
          bucket,
          sourceBasePrefix: tenantStoragePaths.withTenantPrefix(
            params.tenantContext,
            `carts/${params.cartCustomerId}`,
          ),
          destinationBasePrefix: tenantStoragePaths.orderFolder(
            params.tenantContext,
            params.channelId,
            params.orderCustomerId,
            params.orderId,
          ),
          itemId,
          index,
        }),
        moveFilesForOrderItem({
          bucket,
          sourceBasePrefix: tenantStoragePaths.withTenantPrefix(
            params.tenantContext,
            `thumb_carts/${params.cartCustomerId}`,
          ),
          destinationBasePrefix: tenantStoragePaths.orderThumbnailFolder(
            params.tenantContext,
            params.channelId,
            params.orderCustomerId,
            params.orderId,
          ),
          itemId,
          index,
        }),
      ]);
    }),
  );
}

export async function moveCartFilesToOrder(params: MoveCartFilesToOrderParams) {
  await moveCartFilesToOrderInBucket(getOrderStorageBucket(), params);
}
