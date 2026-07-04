import "server-only";

import { getFirebaseAdminApp } from "@/lib/firebase/serverApp";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

const maxContentImageFileSizeBytes = 5 * 1024 * 1024;
const maxFaviconFileSizeBytes = 1024 * 1024;
const maxLogoFileSizeBytes = 2 * 1024 * 1024;
const maxOpenGraphImageFileSizeBytes = 5 * 1024 * 1024;
const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const logoContentTypes = new Set([...imageContentTypes, "image/svg+xml"]);
const faviconContentTypes = new Set([
  "image/png",
  "image/svg+xml",
  "image/vnd.microsoft.icon",
  "image/x-icon",
]);
const openGraphImageContentTypes = new Set(["image/jpeg", "image/png"]);
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const logoExtensions: Record<string, string> = {
  ...imageExtensions,
  "image/svg+xml": "svg",
};
const faviconExtensions: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/vnd.microsoft.icon": "ico",
  "image/x-icon": "ico",
};

function getStorageBucketName(): string {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error(
      "Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET for storefront editor assets.",
    );
  }

  return bucketName;
}

function buildFirebaseDownloadUrl(
  bucketName: string,
  storagePath: string,
  token: string,
): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

export async function uploadStorefrontLogo(params: {
  channelId: string;
  file: File;
  tenantId: string;
  uid: string;
}) {
  const { channelId, file, tenantId, uid } = params;

  if (!logoContentTypes.has(file.type)) {
    throw new Error("Storefront logo must be a PNG, JPG, SVG, or WebP image.");
  }

  if (file.size > maxLogoFileSizeBytes) {
    throw new Error("Storefront logo must be smaller than 2 MB.");
  }

  const bucketName = getStorageBucketName();
  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
  const token = randomUUID();
  const fileId = randomUUID();
  const extension = logoExtensions[file.type] ?? "bin";
  const storagePath = `tenants/${tenantId}/channels/${channelId}/storefront/logo/${fileId}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await bucket.file(storagePath).save(bytes, {
    contentType: file.type,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedByUid: uid,
      },
    },
    resumable: false,
  });

  return {
    logoUrl: buildFirebaseDownloadUrl(bucketName, storagePath, token),
    storagePath,
  };
}

export async function uploadStorefrontContentImage(params: {
  channelId: string;
  file: File;
  tenantId: string;
  uid: string;
}) {
  const { channelId, file, tenantId, uid } = params;

  if (!imageContentTypes.has(file.type)) {
    throw new Error(
      "Storefront content image must be a PNG, JPG, or WebP image.",
    );
  }

  if (file.size > maxContentImageFileSizeBytes) {
    throw new Error("Storefront content image must be smaller than 5 MB.");
  }

  const bucketName = getStorageBucketName();
  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
  const token = randomUUID();
  const fileId = randomUUID();
  const extension = imageExtensions[file.type] ?? "bin";
  const storagePath = `tenants/${tenantId}/channels/${channelId}/storefront/content/${fileId}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await bucket.file(storagePath).save(bytes, {
    contentType: file.type,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedByUid: uid,
      },
    },
    resumable: false,
  });

  return {
    imageUrl: buildFirebaseDownloadUrl(bucketName, storagePath, token),
    storagePath,
  };
}

export async function uploadStorefrontFavicon(params: {
  channelId: string;
  file: File;
  tenantId: string;
  uid: string;
}) {
  const { channelId, file, tenantId, uid } = params;

  if (!faviconContentTypes.has(file.type)) {
    throw new Error("Storefront favicon must be a PNG, SVG, or ICO image.");
  }

  if (file.size > maxFaviconFileSizeBytes) {
    throw new Error("Storefront favicon must be smaller than 1 MB.");
  }

  const bucketName = getStorageBucketName();
  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
  const token = randomUUID();
  const fileId = randomUUID();
  const extension = faviconExtensions[file.type] ?? "bin";
  const storagePath = `tenants/${tenantId}/channels/${channelId}/storefront/brand/favicon/${fileId}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await bucket.file(storagePath).save(bytes, {
    contentType: file.type,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedByUid: uid,
      },
    },
    resumable: false,
  });

  return {
    imageUrl: buildFirebaseDownloadUrl(bucketName, storagePath, token),
    storagePath,
  };
}

export async function uploadStorefrontOpenGraphImage(params: {
  channelId: string;
  file: File;
  tenantId: string;
  uid: string;
}) {
  const { channelId, file, tenantId, uid } = params;

  if (!openGraphImageContentTypes.has(file.type)) {
    throw new Error("Storefront Open Graph image must be a PNG or JPG image.");
  }

  if (file.size > maxOpenGraphImageFileSizeBytes) {
    throw new Error("Storefront Open Graph image must be smaller than 5 MB.");
  }

  const bucketName = getStorageBucketName();
  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
  const token = randomUUID();
  const fileId = randomUUID();
  const extension = imageExtensions[file.type] ?? "bin";
  const storagePath = `tenants/${tenantId}/channels/${channelId}/storefront/brand/open-graph/${fileId}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await bucket.file(storagePath).save(bytes, {
    contentType: file.type,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedByUid: uid,
      },
    },
    resumable: false,
  });

  return {
    imageUrl: buildFirebaseDownloadUrl(bucketName, storagePath, token),
    storagePath,
  };
}
