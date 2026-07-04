import {
  ProductTranslation,
  ProductTranslationCreate,
  ProductTranslationUpdate,
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

export async function getProductTranslations(
  firestore: Firestore,
  channelId: string,
  productId: string,
  locale?: string,
): Promise<ProductTranslation[]> {
  try {
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<ProductTranslation>(
      firestore,
      `/channels/${channelId}/products/${productId}/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map((doc) => doc.data() as ProductTranslation);
  } catch (error) {
    console.error("Error fetching product translations:", error);
    return [];
  }
}

export async function getProductTranslation(
  firestore: Firestore,
  channelId: string,
  productId: string,
  translationId: string,
): Promise<ProductTranslation | undefined> {
  try {
    const docRef = db.doc<ProductTranslation>(
      firestore,
      `/channels/${channelId}/products/${productId}/translations`,
      translationId,
    );
    const snapData = await getDoc(docRef);
    if (!snapData.exists()) {
      console.warn("Translation not found:", translationId);
      return undefined;
    } else {
      return snapData.data() as ProductTranslation;
    }
  } catch (error) {
    console.error("Error fetching product translation:", error);
    return undefined;
  }
}

export async function createProductTranslation(
  firestore: Firestore,
  channelId: string,
  productId: string,
  translation: ProductTranslationCreate,
  tenantContext?: TenantContext,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<ProductTranslation>(
      firestore,
      `/channels/${channelId}/products/${productId}/translations`,
      translation.locale,
    );
    const translationData: ProductTranslationCreate = {
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
    await create<ProductTranslationCreate>(
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
    console.error("Error creating product translation:", error);
    throw error;
  }
}

export async function updateProductTranslation(
  firestore: Firestore,
  channelId: string,
  productId: string,
  translationId: string,
  translation: ProductTranslationUpdate,
  tenantContext?: TenantContext,
): Promise<void> {
  try {
    const docRef = db.doc<ProductTranslation>(
      firestore,
      `/channels/${channelId}/products/${productId}/translations`,
      translationId,
    );
    await update<ProductTranslationUpdate>(
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
    console.error("Error updating product translation:", error);
    throw error;
  }
}
