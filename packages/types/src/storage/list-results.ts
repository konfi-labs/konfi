import { FullMetadata, StorageReference } from "firebase/storage";

export interface ListResults {
  storageReference: StorageReference;
  metadata: FullMetadata;
}
