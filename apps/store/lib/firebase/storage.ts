import {
  deleteObject as deleteStorageObject,
  download as downloadStorageObject,
  list as listStorage,
} from "@konfi/firebase";
import type { StorageReference } from "firebase/storage";
import { storage } from "./clientApp";

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
