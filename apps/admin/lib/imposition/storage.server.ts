import { getFirebaseAdminApp } from "@/lib/firebase/serverApp";
import {
  DEFAULT_IMPOSITION_ARCHIVE_FILENAME,
  IMPOSITION_RESULT_PREFIX,
  IMPOSITION_UPLOAD_PREFIX,
  LEGACY_GENERATED_IMPOSITION_ARCHIVE_PREFIX,
  buildImpositionArchiveDownloadUrl,
  type CreateImpositionResponse,
  type ImpositionUploadReference,
} from "./types";
import type { ImpositionWarning } from "./warnings";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

type ImpositionInputFile = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
};

type ImpositionArchive = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  warnings: ImpositionWarning[];
};

function getStorageBucketName(): string {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  }

  return bucketName;
}

function buildContentDisposition(filename: string): string {
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sanitizeFilename(filename: string): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeFilename.length > 0
    ? safeFilename
    : DEFAULT_IMPOSITION_ARCHIVE_FILENAME;
}

type ImpositionArchivePathKind = "account" | "legacy";

function getObjectOwnerAccountId(metadata: {
  metadata?: Record<string, unknown> | null;
}): string | undefined {
  return getStringMetadataValue(metadata.metadata?.accountId);
}

function assertObjectOwnedByAccount(params: {
  accountId: string;
  metadata: { metadata?: Record<string, unknown> | null };
  resourceName: string;
}): void {
  if (getObjectOwnerAccountId(params.metadata) !== params.accountId) {
    throw new Error(
      `${params.resourceName} does not belong to the current admin.`,
    );
  }
}

function assertImpositionUploadStoragePath(
  storagePath: string,
  accountId: string,
  metadata?: { metadata?: Record<string, unknown> | null },
): void {
  if (!storagePath.startsWith(`${IMPOSITION_UPLOAD_PREFIX}/`)) {
    throw new Error(
      `Invalid imposition upload path: ${storagePath}. Expected prefix ${IMPOSITION_UPLOAD_PREFIX}/.`,
    );
  }

  const accountsPrefix = `${IMPOSITION_UPLOAD_PREFIX}/accounts/`;
  const expectedAccountPrefix = `${accountsPrefix}${accountId}/`;

  if (storagePath.startsWith(accountsPrefix)) {
    if (!storagePath.startsWith(expectedAccountPrefix)) {
      throw new Error(
        "Imposition upload does not belong to the current admin.",
      );
    }

    return;
  }

  if (!metadata) {
    return;
  }

  assertObjectOwnedByAccount({
    accountId,
    metadata,
    resourceName: "Imposition upload",
  });
}

function assertImpositionArchiveStoragePath(
  storagePath: string,
  accountId: string,
): ImpositionArchivePathKind {
  const expectedPrefix = `${IMPOSITION_RESULT_PREFIX}/accounts/${accountId}/`;
  const accountsPrefix = `${IMPOSITION_RESULT_PREFIX}/accounts/`;

  if (storagePath.startsWith(expectedPrefix)) {
    return "account";
  }

  if (storagePath.startsWith(accountsPrefix)) {
    throw new Error("Invalid imposition archive path.");
  }

  if (
    storagePath.startsWith(`${LEGACY_GENERATED_IMPOSITION_ARCHIVE_PREFIX}/`)
  ) {
    return "legacy";
  }

  throw new Error("Invalid imposition archive path.");
}

function isStorageErrorWithCode(error: unknown): error is { code: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "number"
  );
}

function getStorageBucket() {
  const bucketName = getStorageBucketName();

  return {
    bucket: getStorage(getFirebaseAdminApp()).bucket(bucketName),
  };
}

function getStringMetadataValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function getMetadataSize(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(value);
  }

  return undefined;
}

function getOriginalFilename(metadata: {
  metadata?: Record<string, unknown> | null;
}): string {
  return (
    getStringMetadataValue(metadata.metadata?.originalFilename) ??
    DEFAULT_IMPOSITION_ARCHIVE_FILENAME
  );
}

function resolveDownloadMetadata(metadata: {
  contentDisposition?: string;
  contentType?: string;
  metadata?: Record<string, unknown> | null;
  size?: number | string;
}) {
  const filename = getOriginalFilename(metadata);

  return {
    contentDisposition:
      getStringMetadataValue(metadata.contentDisposition) ??
      buildContentDisposition(filename),
    contentLength: getMetadataSize(metadata.size),
    contentType:
      getStringMetadataValue(metadata.contentType) ??
      "application/octet-stream",
  };
}

function getImpositionArchiveFile(params: {
  accountId: string;
  storagePath: string;
}) {
  const storagePath = params.storagePath.trim();

  if (!storagePath) {
    throw new Error("Imposition archive path is required.");
  }

  const pathKind = assertImpositionArchiveStoragePath(
    storagePath,
    params.accountId,
  );

  const { bucket } = getStorageBucket();
  return {
    pathKind,
    storageFile: bucket.file(storagePath),
  };
}

export async function readImpositionUploadsFromStorage(
  uploads: ImpositionUploadReference[],
  accountId: string,
): Promise<ImpositionInputFile[]> {
  if (uploads.length === 0) {
    throw new Error("At least one uploaded file is required for imposition.");
  }

  const { bucket } = getStorageBucket();

  return await Promise.all(
    uploads.map(async (upload) => {
      const storagePath = upload.storagePath.trim();
      assertImpositionUploadStoragePath(storagePath, accountId);

      const storageFile = bucket.file(storagePath);

      const [metadata] = await storageFile.getMetadata();
      assertImpositionUploadStoragePath(storagePath, accountId, metadata);
      const [downloadedBytes] = await storageFile.download();

      return {
        bytes: new Uint8Array(downloadedBytes),
        contentType:
          metadata.contentType ||
          upload.contentType ||
          "application/octet-stream",
        filename: upload.filename || storageFile.name,
      };
    }),
  );
}

export async function deleteImpositionUploadSources(
  uploads: ImpositionUploadReference[],
  accountId: string,
): Promise<void> {
  if (uploads.length === 0) {
    return;
  }

  const { bucket } = getStorageBucket();
  const uniquePaths = Array.from(
    new Set(uploads.map((upload) => upload.storagePath)),
  );

  await Promise.allSettled(
    uniquePaths.map(async (storagePath) => {
      assertImpositionUploadStoragePath(storagePath, accountId);

      try {
        const storageFile = bucket.file(storagePath);
        const [metadata] = await storageFile.getMetadata();
        assertImpositionUploadStoragePath(storagePath, accountId, metadata);
        await storageFile.delete();
      } catch (error) {
        if (isStorageErrorWithCode(error) && error.code === 404) {
          return;
        }

        throw error;
      }
    }),
  );
}

export async function uploadImpositionArchive(params: {
  accountId: string;
  archive: ImpositionArchive;
}): Promise<CreateImpositionResponse> {
  const { accountId, archive } = params;
  const { bucket } = getStorageBucket();

  const safeFilename = sanitizeFilename(
    archive.filename || DEFAULT_IMPOSITION_ARCHIVE_FILENAME,
  );
  const dateStr = new Date().toISOString().split("T")[0];
  const archiveId = randomUUID();
  const storagePath = `${IMPOSITION_RESULT_PREFIX}/accounts/${accountId}/${dateStr}/${archiveId}-${safeFilename}`;

  await bucket.file(storagePath).save(Buffer.from(archive.bytes), {
    contentType: archive.contentType,
    resumable: false,
    metadata: {
      contentDisposition: buildContentDisposition(safeFilename),
      metadata: {
        originalFilename: safeFilename,
        accountId,
      },
    },
  });

  return {
    contentType: archive.contentType,
    downloadUrl: buildImpositionArchiveDownloadUrl(storagePath),
    filename: safeFilename,
    storagePath,
    warnings: archive.warnings,
  };
}

export async function getImpositionArchiveDownloadMetadata(params: {
  accountId: string;
  storagePath: string;
}): Promise<{
  contentDisposition: string;
  contentLength?: string;
  contentType: string;
}> {
  const { pathKind, storageFile } = getImpositionArchiveFile(params);

  try {
    const [metadata] = await storageFile.getMetadata();
    if (pathKind === "legacy") {
      assertObjectOwnedByAccount({
        accountId: params.accountId,
        metadata,
        resourceName: "Imposition archive",
      });
    }
    return resolveDownloadMetadata(metadata);
  } catch (error) {
    if (isStorageErrorWithCode(error) && error.code === 404) {
      throw new Error("Imposition archive was not found.", { cause: error });
    }

    throw error;
  }
}

export async function downloadImpositionArchiveFromStorage(params: {
  accountId: string;
  storagePath: string;
}): Promise<{
  bytes: Uint8Array;
  contentDisposition: string;
  contentLength?: string;
  contentType: string;
}> {
  const { pathKind, storageFile } = getImpositionArchiveFile(params);

  try {
    const [metadata] = await storageFile.getMetadata();
    if (pathKind === "legacy") {
      assertObjectOwnedByAccount({
        accountId: params.accountId,
        metadata,
        resourceName: "Imposition archive",
      });
    }
    const [downloadedBytes] = await storageFile.download();
    const downloadMetadata = resolveDownloadMetadata(metadata);

    return {
      ...downloadMetadata,
      bytes: new Uint8Array(downloadedBytes),
    };
  } catch (error) {
    if (isStorageErrorWithCode(error) && error.code === 404) {
      throw new Error("Imposition archive was not found.", { cause: error });
    }

    throw error;
  }
}
