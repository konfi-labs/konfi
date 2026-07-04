import "server-only";

import { getAdminDb, getFirebaseAdminApp } from "@/lib/firebase/serverApp";
import { rasterizePdfFirstPageToPng } from "@/lib/preflight-preview.server";
import type {
  CartPreflightWorkflowInput,
  CartPreflightWorkflowResult,
} from "@/lib/cart-preflight/types";
import {
  resolveServerTenantContext,
  tenantFirestorePaths,
} from "@konfi/firebase";
import {
  inspectImagePreflightFromBytes,
  inspectPdfPreflightFromBytes,
} from "@konfi/wasm";
import { getStorage } from "firebase-admin/storage";

function getPreflightJobRef(input: CartPreflightWorkflowInput) {
  const tenantContext = resolveServerTenantContext(process.env, input.tenantId);

  return getAdminDb()
    .collection(
      tenantFirestorePaths.cartPreflightCollection(tenantContext, input.userId),
    )
    .doc(input.jobId);
}

function normalizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toPlainUint8Array(bytes: Uint8Array) {
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function getStorageBucketName(): string {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error(
      "Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET for preflight check.",
    );
  }

  return bucketName;
}

function isImageContentType(contentType: string) {
  return contentType.startsWith("image/");
}

function isPdfContentType(contentType: string, filename: string) {
  return (
    contentType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")
  );
}

function createThumbnailPngFilename(filename: string) {
  const extensionStart = filename.lastIndexOf(".");
  const baseName =
    extensionStart >= 0 ? filename.slice(0, extensionStart) : filename;

  return `thumb_${baseName}.png`;
}

async function saveThumbnail(params: {
  bytes: Uint8Array;
  filePath: string;
  filename: string;
}) {
  const bucket = getStorage(getFirebaseAdminApp()).bucket(
    getStorageBucketName(),
  );
  const previewPath = createCartThumbnailPath(params.filePath, params.filename);

  await bucket.file(previewPath).save(params.bytes, {
    contentType: "image/png",
    resumable: false,
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
    },
  });

  return previewPath;
}

function createCartThumbnailPath(filePath: string, filename: string) {
  const tenantCartPathMatch = filePath.match(/^(tenants\/[^/]+)\/carts\/(.+)$/);

  if (tenantCartPathMatch) {
    return `${tenantCartPathMatch[1]}/thumb_carts/${tenantCartPathMatch[2]}/${filename}`;
  }

  return `thumb_${filePath}/${filename}`;
}

export async function runCartPreflightStep(
  input: CartPreflightWorkflowInput,
): Promise<CartPreflightWorkflowResult> {
  "use step";

  const storagePath = `${input.filePath}/${input.filename}`;
  const bucket = getStorage(getFirebaseAdminApp()).bucket(
    getStorageBucketName(),
  );
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType ?? "application/octet-stream";
  const [bytes] = await file.download();

  if (isImageContentType(contentType)) {
    const issues = await inspectImagePreflightFromBytes(bytes, contentType);

    return { issues };
  }

  if (isPdfContentType(contentType, input.filename)) {
    const issues = await inspectPdfPreflightFromBytes(bytes);

    try {
      const previewBytes = await rasterizePdfFirstPageToPng(
        toPlainUint8Array(bytes),
      );
      const previewPath = await saveThumbnail({
        bytes: previewBytes,
        filePath: input.filePath,
        filename: createThumbnailPngFilename(input.filename),
      });

      return { issues, previewPath };
    } catch (error) {
      console.error("Error generating PDF preflight preview:", error);
      return { issues };
    }
  }

  return { issues: [] };
}

export async function markCartPreflightRunningStep(
  input: CartPreflightWorkflowInput,
) {
  "use step";

  await getPreflightJobRef(input).set(
    {
      filename: input.filename,
      itemId: input.itemId,
      status: "running",
      tenantId: input.tenantId ?? null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function markCartPreflightCompletedStep(params: {
  input: CartPreflightWorkflowInput;
  result: CartPreflightWorkflowResult;
}) {
  "use step";

  await getPreflightJobRef(params.input).set(
    {
      error: null,
      filename: params.input.filename,
      issues: normalizeForFirestore(params.result.issues),
      itemId: params.input.itemId,
      previewPath: params.result.previewPath ?? null,
      status: "completed",
      tenantId: params.input.tenantId ?? null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function markCartPreflightFailedStep(params: {
  error: string;
  input: CartPreflightWorkflowInput;
}) {
  "use step";

  await getPreflightJobRef(params.input).set(
    {
      error: params.error,
      filename: params.input.filename,
      itemId: params.input.itemId,
      status: "failed",
      tenantId: params.input.tenantId ?? null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}
