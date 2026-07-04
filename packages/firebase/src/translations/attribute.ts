import {
  AttributeTranslation,
  AttributeTranslationCreate,
  AttributeTranslationUpdate,
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

export async function getAttributeTranslations(
  firestore: Firestore,
  attributeId: string,
  locale?: string,
): Promise<AttributeTranslation[]> {
  try {
    if (!attributeId) {
      console.warn("Attribute ID is required to fetch translations.");
      return [];
    }
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<AttributeTranslation>(
      firestore,
      `/attributes/${attributeId}/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map((doc) => doc.data() as AttributeTranslation);
  } catch (error) {
    console.error("Error fetching attribute translations:", error);
    return [];
  }
}

export async function getAttributeTranslation(
  firestore: Firestore,
  attributeId: string,
  translationId: string,
): Promise<AttributeTranslation | undefined> {
  try {
    if (!attributeId || !translationId) {
      return undefined;
    }
    const docRef = db.doc<AttributeTranslation>(
      firestore,
      `/attributes/${attributeId}/translations`,
      translationId,
    );
    const snapData = await getDoc(docRef);
    if (!snapData.exists()) {
      return undefined;
    } else {
      return snapData.data() as AttributeTranslation;
    }
  } catch (error) {
    console.error("Error fetching attribute translation:", error);
    return undefined;
  }
}

export async function createAttributeTranslation(
  firestore: Firestore,
  attributeId: string,
  translation: AttributeTranslationCreate,
  tenantContext?: TenantContext,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<AttributeTranslation>(
      firestore,
      `/attributes/${attributeId}/translations`,
      translation.locale,
    );
    const translationData: AttributeTranslationCreate = {
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
    await create<AttributeTranslationCreate>(
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
    console.error("Error creating attribute translation:", error);
    throw error;
  }
}

export async function updateAttributeTranslation(
  firestore: Firestore,
  attributeId: string,
  translationId: string,
  translation: AttributeTranslationUpdate,
  tenantContext?: TenantContext,
): Promise<void> {
  try {
    const docRef = db.doc<AttributeTranslation>(
      firestore,
      `/attributes/${attributeId}/translations`,
      translationId,
    );
    await update<AttributeTranslationUpdate>(
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
    console.error("Error updating attribute translation:", error);
    throw error;
  }
}
