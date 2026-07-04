import {
  HeroTranslation,
  HeroTranslationCreate,
  HeroTranslationUpdate,
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

export async function getHeroTranslations(
  firestore: Firestore,
  channelId: string,
  locale?: string,
): Promise<HeroTranslation[]> {
  try {
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<HeroTranslation>(
      firestore,
      `/channels/${channelId}/cms/hero/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map((doc) => doc.data() as HeroTranslation);
  } catch (error) {
    console.error("Error fetching hero translations:", error);
    return [];
  }
}

export async function getHeroTranslation(
  firestore: Firestore,
  channelId: string,
  translationId: string,
): Promise<HeroTranslation | undefined> {
  try {
    if (!translationId) {
      return undefined;
    }
    const docRef = db.doc<HeroTranslation>(
      firestore,
      `/channels/${channelId}/cms/hero/translations`,
      translationId,
    );
    const snapData = await getDoc(docRef);
    if (!snapData.exists()) {
      return undefined;
    } else {
      return snapData.data() as HeroTranslation;
    }
  } catch (error) {
    console.error("Error fetching hero translation:", error);
    return undefined;
  }
}

export async function createHeroTranslation(
  firestore: Firestore,
  channelId: string,
  translation: HeroTranslationCreate,
  tenantContext?: TenantContext,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<HeroTranslation>(
      firestore,
      `/channels/${channelId}/cms/hero/translations`,
      translation.locale,
    );
    const translationData: HeroTranslationCreate = {
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
    await create<HeroTranslationCreate>(
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
    console.error("Error creating hero translation:", error);
    throw error;
  }
}

export async function updateHeroTranslation(
  firestore: Firestore,
  channelId: string,
  translationId: string,
  translation: HeroTranslationUpdate,
  tenantContext?: TenantContext,
): Promise<void> {
  try {
    const docRef = db.doc<HeroTranslation>(
      firestore,
      `/channels/${channelId}/cms/hero/translations`,
      translationId,
    );
    await update<HeroTranslationUpdate>(
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
    console.error("Error updating hero translation:", error);
    throw error;
  }
}
