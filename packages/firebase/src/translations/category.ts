import {
  CategoryTranslation,
  CategoryTranslationCreate,
  CategoryTranslationUpdate,
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

export async function getCategoryTranslations(
  firestore: Firestore,
  channelId: string,
  categoryId: string,
  locale?: string,
): Promise<CategoryTranslation[]> {
  try {
    if (!categoryId) {
      console.warn("Category ID is required to fetch translations.");
      return [];
    }
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<CategoryTranslation>(
      firestore,
      `/channels/${channelId}/categories/${categoryId}/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map((doc) => doc.data() as CategoryTranslation);
  } catch (error) {
    console.error("Error fetching category translations:", error);
    return [];
  }
}

export async function getCategoryTranslation(
  firestore: Firestore,
  channelId: string,
  categoryId: string,
  translationId: string,
): Promise<CategoryTranslation | undefined> {
  try {
    if (!categoryId || !translationId) {
      return undefined;
    }
    const docRef = db.doc<CategoryTranslation>(
      firestore,
      `/channels/${channelId}/categories/${categoryId}/translations`,
      translationId,
    );
    const snapData = await getDoc(docRef);
    if (!snapData.exists()) {
      return undefined;
    } else {
      return snapData.data() as CategoryTranslation;
    }
  } catch (error) {
    console.error("Error fetching category translation:", error);
    return undefined;
  }
}

export async function createCategoryTranslation(
  firestore: Firestore,
  channelId: string,
  categoryId: string,
  translation: CategoryTranslationCreate,
  tenantContext?: TenantContext,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<CategoryTranslation>(
      firestore,
      `/channels/${channelId}/categories/${categoryId}/translations`,
      translation.locale,
    );
    const translationData: CategoryTranslationCreate = {
      ...translation,
      id: translation.locale,
      createdBy: {
        id: translation.createdBy.id,
        name: translation.createdBy.name,
      },
      createdAt: Timestamp.now(),
      updatedBy: {
        id: translation.createdBy.id,
        name: translation.createdBy.name,
      },
      updatedAt: Timestamp.now(),
    };
    await create<CategoryTranslationCreate>(
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
    console.error("Error creating category translation:", error);
    throw error;
  }
}

export async function updateCategoryTranslation(
  firestore: Firestore,
  channelId: string,
  categoryId: string,
  translationId: string,
  translation: CategoryTranslationUpdate,
  tenantContext?: TenantContext,
): Promise<void> {
  try {
    const docRef = db.doc<CategoryTranslation>(
      firestore,
      `/channels/${channelId}/categories/${categoryId}/translations`,
      translationId,
    );
    await update<CategoryTranslationUpdate>(
      {
        ...translation,
        updatedAt: Timestamp.now(),
        updatedBy: {
          id: translation.updatedBy?.id || "",
          name: translation.updatedBy?.name || "",
        },
      },
      docRef,
      tenantContext,
    );
  } catch (error) {
    console.error("Error updating category translation:", error);
    throw error;
  }
}
