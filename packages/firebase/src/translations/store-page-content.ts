import {
  StorePageContentTranslation,
  StorePageContentTranslationCreate,
  StorePageContentTranslationUpdate,
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

export async function getStorePageContentTranslations(
  firestore: Firestore,
  channelId: string,
  pageId: string,
  locale?: string,
): Promise<StorePageContentTranslation[]> {
  try {
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<StorePageContentTranslation>(
      firestore,
      `/channels/${channelId}/pages/${pageId}/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map(
      (doc) => doc.data() as StorePageContentTranslation,
    );
  } catch (error) {
    console.error("Error fetching store page content translations:", error);
    return [];
  }
}

export async function getStorePageContentTranslation(
  firestore: Firestore,
  channelId: string,
  pageIds: string[],
  translationId?: string,
): Promise<Map<string, StorePageContentTranslation> | undefined> {
  try {
    if (!translationId) {
      return undefined;
    }
    const storePageContentTranslation: Map<
      string,
      StorePageContentTranslation
    > = new Map();
    for (const pageId of pageIds) {
      const docRef = db.doc<StorePageContentTranslation>(
        firestore,
        `/channels/${channelId}/pages/${pageId}/translations`,
        translationId,
      );
      const snapData = await getDoc(docRef);
      if (!snapData.exists()) {
        continue;
      } else {
        storePageContentTranslation.set(
          pageId,
          snapData.data() as StorePageContentTranslation,
        );
      }
    }
    return storePageContentTranslation;
  } catch (error) {
    console.error("Error fetching store page content translation:", error);
    return undefined;
  }
}

export async function createStorePageContentTranslation(
  firestore: Firestore,
  channelId: string,
  pageId: string,
  translation: StorePageContentTranslationCreate,
  tenantContext?: TenantContext,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<StorePageContentTranslation>(
      firestore,
      `/channels/${channelId}/pages/${pageId}/translations`,
      translation.locale,
    );
    const translationData: StorePageContentTranslationCreate = {
      ...translation,
      id: translation.locale,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await create<StorePageContentTranslationCreate>(
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
    console.error("Error creating store page content translation:", error);
    throw error;
  }
}

export async function updateStorePageContentTranslation(
  firestore: Firestore,
  channelId: string,
  pageId: string,
  translationId: string,
  translation: StorePageContentTranslationUpdate,
  tenantContext?: TenantContext,
): Promise<void> {
  try {
    const docRef = db.doc<StorePageContentTranslation>(
      firestore,
      `/channels/${channelId}/pages/${pageId}/translations`,
      translationId,
    );
    await update<StorePageContentTranslationUpdate>(
      {
        ...translation,
        updatedAt: Timestamp.now(),
      },
      docRef,
      tenantContext,
    );
  } catch (error) {
    console.error("Error updating store page content translation:", error);
    throw error;
  }
}
