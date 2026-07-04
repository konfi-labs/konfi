import {
  assertSaasRuntimeModuleAction,
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import { auth, storage } from "@/lib/firebase/clientApp";
import {
  IMPOSITION_RESULT_PREFIX,
  buildImpositionArchiveDownloadUrl,
} from "@/lib/imposition/types";

function sanitizeStorageFilename(filename: string): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeFilename.length > 0 ? safeFilename : "imposition.tar.gz";
}

function createUploadId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function uploadGeneratedImpositionArchive(input: {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}): Promise<{ downloadUrl: string; storagePath: string }> {
  const { ref, uploadBytes } = await import("firebase/storage");
  const accountId = auth.currentUser?.uid;

  if (!accountId) {
    throw new Error("Authenticated admin user is required.");
  }

  const dateSegment = new Date().toISOString().split("T")[0];
  const safeFilename = sanitizeStorageFilename(input.filename);
  const storagePath = `${IMPOSITION_RESULT_PREFIX}/accounts/${accountId}/${dateSegment}/${createUploadId()}-${safeFilename}`;
  const storageRef = ref(storage, storagePath);
  const output = Uint8Array.from(input.bytes);

  await assertSaasRuntimeModuleAction({
    module: "imposition",
    operation: "admin.imposition.archive-upload",
  });
  await assertSaasRuntimeQuotaAction({
    operation: "admin.imposition.archive-upload",
    requested: output.byteLength,
    resource: "storageBytes",
  });

  await uploadBytes(storageRef, output, {
    contentType: input.contentType,
    customMetadata: {
      accountId,
      originalFilename: input.filename,
      generatedBy: "client-imposition",
    },
  });
  await recordSaasRuntimeQuotaUsageAction({
    operation: "admin.imposition.archive-upload",
    requested: output.byteLength,
    resource: "storageBytes",
  });

  return {
    downloadUrl: buildImpositionArchiveDownloadUrl(storagePath),
    storagePath,
  };
}
