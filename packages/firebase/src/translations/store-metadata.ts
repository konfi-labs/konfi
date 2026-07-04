import {
  StoreMetadataTranslation,
  StoreMetadataTranslationCreate,
  StoreMetadataTranslationUpdate,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  Firestore,
  getDoc,
  getDocs,
  Timestamp,
  where,
} from "firebase/firestore";
import { create, db, update } from "../firestore";

export async function getStoreMetadataTranslations(
  firestore: Firestore,
  channelId: string,
  pageId: string,
  locale?: string,
): Promise<StoreMetadataTranslation[]> {
  try {
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<StoreMetadataTranslation>(
      firestore,
      `/channels/${channelId}/metadata/${pageId}/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map((doc) => doc.data() as StoreMetadataTranslation);
  } catch (error) {
    console.error("Error fetching store metadata translations:", error);
    return [];
  }
}

export async function getStoreMetadataTranslation(
  firestore: Firestore,
  channelId: string,
  pageIds: string[],
  translationId?: string,
): Promise<Map<string, StoreMetadataTranslation> | undefined> {
  try {
    if (!translationId) {
      return undefined;
    }
    const storeMetadataTranslation: Map<string, StoreMetadataTranslation> =
      new Map();
    for (const pageId of pageIds) {
      const docRef = db.doc<StoreMetadataTranslation>(
        firestore,
        `/channels/${channelId}/metadata/${pageId}/translations`,
        translationId,
      );
      const snapData = await getDoc(docRef);
      if (!snapData.exists()) {
        continue;
      } else {
        storeMetadataTranslation.set(
          pageId,
          snapData.data() as StoreMetadataTranslation,
        );
      }
    }
    return storeMetadataTranslation;
  } catch (error) {
    console.error("Error fetching store metadata translation:", error);
    return undefined;
  }
}

export async function createStoreMetadataTranslation(
  firestore: Firestore,
  channelId: string,
  pageId: string,
  translation: StoreMetadataTranslationCreate,
  tenantContext?: TenantContext,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<StoreMetadataTranslation>(
      firestore,
      `/channels/${channelId}/metadata/${pageId}/translations`,
      translation.locale,
    );
    const translationData: StoreMetadataTranslationCreate = {
      ...translation,
      id: translation.locale,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await create<StoreMetadataTranslationCreate>(
      firestore,
      translationData,
      docRef,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    return docRef.id;
  } catch (error) {
    console.error("Error creating store metadata translation:", error);
    throw error;
  }
}

export async function updateStoreMetadataTranslation(
  firestore: Firestore,
  channelId: string,
  pageId: string,
  translationId: string,
  translation: StoreMetadataTranslationUpdate,
  tenantContext?: TenantContext,
): Promise<void> {
  try {
    const docRef = db.doc<StoreMetadataTranslation>(
      firestore,
      `/channels/${channelId}/metadata/${pageId}/translations`,
      translationId,
    );
    await update<StoreMetadataTranslationUpdate>(
      {
        ...translation,
        updatedAt: Timestamp.now(),
      },
      docRef,
      tenantContext,
    );
  } catch (error) {
    console.error("Error updating store metadata translation:", error);
    throw error;
  }
}
