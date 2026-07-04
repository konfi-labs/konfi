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
import {
  assertOwnedGeneratedStoragePath,
  getStoragePathExtension,
  parseProductImageDestinationPrefix,
} from "./attach-generated-product-images.utils";

async function assertAuthorizedProductImageDestination(destination: {
  channelId: string;
  productId: string;
}): Promise<void> {
  const channelId = await requireTenantAdminChannelAccess(
    destination.channelId,
  );
  const productSnapshot = await getAdminDb()
    .doc(`channels/${channelId}/products/${destination.productId}`)
    .get();

  if (!productSnapshot.exists) {
    throw new Error("Product image destination was not found.");
  }
}

export async function attachGeneratedProductImages(input: {
  destinationPrefix: string;
  sourceStoragePaths: string[];
}): Promise<{
  fileNames: string[];
  fullPaths: string[];
}> {
  const adminUid = await getAuthenticatedAdminUid();
  const destination = parseProductImageDestinationPrefix(
    input.destinationPrefix,
  );
  await assertAuthorizedProductImageDestination(destination);
  const sourceStoragePaths = Array.from(
    new Set(
      input.sourceStoragePaths
        .map((storagePath) => storagePath.trim())
        .filter(Boolean),
    ),
  );

  if (sourceStoragePaths.length <= 0) {
    return { fileNames: [], fullPaths: [] };
  }

  sourceStoragePaths.forEach((sourceStoragePath) => {
    assertOwnedGeneratedStoragePath(sourceStoragePath, adminUid);
  });

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  }

  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
  const sourceFileSizes = await Promise.all(
    sourceStoragePaths.map(async (sourceStoragePath) => {
      const [metadata] = await bucket.file(sourceStoragePath).getMetadata();
      const size =
        typeof metadata.size === "number"
          ? metadata.size
          : Number(metadata.size ?? 0);
      return Number.isFinite(size) ? size : 0;
    }),
  );
  const requestedStorageBytes = sourceFileSizes.reduce(
    (sum, size) => sum + size,
    0,
  );
  const tenantContext = await getTenantContextForRequest();
  await assertSaasRuntimeQuota({
    context: tenantContext,
    firestore: getAdminDb(),
    operation: "admin.generated-product-images.attach",
    requested: requestedStorageBytes,
    resource: "storageBytes",
  });

  const copiedFiles = await Promise.all(
    sourceStoragePaths.map(async (sourceStoragePath) => {
      const extension = getStoragePathExtension(sourceStoragePath);
      const fileName = `ai-${randomUUID()}${extension}`;
      const fullPath = `images/${destination.prefix}/${fileName}`;

      await bucket.file(sourceStoragePath).copy(bucket.file(fullPath));

      return { fileName, fullPath };
    }),
  );
  await recordSaasRuntimeQuotaUsage({
    context: tenantContext,
    firestore: getAdminDb(),
    operation: "admin.generated-product-images.attach",
    requested: requestedStorageBytes,
    resource: "storageBytes",
  });

  return {
    fileNames: copiedFiles.map((file) => file.fileName),
    fullPaths: copiedFiles.map((file) => file.fullPath),
  };
}
