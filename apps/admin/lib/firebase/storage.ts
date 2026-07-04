import {
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import {
  deleteObject as deleteStorageObject,
  download as downloadStorageObject,
  list as listStorage,
  uploadFiles,
} from "@konfi/firebase";
import type { StorageReference } from "firebase/storage";
import { storage } from "./clientApp";

export async function upload(data: { file?: File; url: string }[]) {
  try {
    if (!Array.isArray(data)) {
      return;
    }
    const requestedBytes = data.reduce(
      (sum, dataElement) => sum + (dataElement.file?.size ?? 0),
      0,
    );
    await assertSaasRuntimeQuotaAction({
      operation: "admin.storage.upload",
      requested: requestedBytes,
      resource: "storageBytes",
    });
    await uploadFiles(data, storage);
    await recordSaasRuntimeQuotaUsageAction({
      operation: "admin.storage.upload",
      requested: requestedBytes,
      resource: "storageBytes",
    });
  } catch (error) {
    console.error(error);
  }
}

export async function list(
  url?: string,
): Promise<StorageReference[] | undefined> {
  return listStorage(url, storage);
}

export async function deleteObject(url?: string): Promise<void> {
  return deleteStorageObject(url, storage);
}

export async function download(url?: string, preview = false): Promise<void> {
  return downloadStorageObject(url, preview, storage);
}
