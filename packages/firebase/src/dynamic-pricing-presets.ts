import { DynamicPricingPreset } from "@konfi/types";
import {
  deleteDoc,
  doc,
  Firestore,
  getDoc as firestoreGetDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { create, db } from "./firestore";

const DYNAMIC_PRICING_PRESETS_COLLECTION = "dynamicPricingPresets";

function getDynamicPricingPresetsCollectionPath(channelId: string): string {
  return `/channels/${channelId}/${DYNAMIC_PRICING_PRESETS_COLLECTION}`;
}

export async function getDynamicPricingPresets(
  firestore: Firestore,
  channelId: string,
): Promise<DynamicPricingPreset[]> {
  try {
    const collectionRef = db.collection<DynamicPricingPreset>(
      firestore,
      getDynamicPricingPresetsCollectionPath(channelId),
    );
    const presetsQuery = query(collectionRef, orderBy("label", "asc"));
    const snapData = await getDocs(presetsQuery);

    return snapData.docs.map((item) => item.data());
  } catch (error) {
    console.error("Error fetching dynamic pricing presets:", error);
    return [];
  }
}

export async function getDynamicPricingPresetsByIds(
  firestore: Firestore,
  channelId: string,
  presetIds: string[],
): Promise<DynamicPricingPreset[]> {
  try {
    const uniqueIds = Array.from(
      new Set(presetIds.filter((presetId) => presetId.length > 0)),
    );

    if (uniqueIds.length === 0) {
      return [];
    }

    const presetSnapshots = await Promise.all(
      uniqueIds.map((presetId) =>
        firestoreGetDoc(
          db.doc<DynamicPricingPreset>(
            firestore,
            getDynamicPricingPresetsCollectionPath(channelId),
            presetId,
          ),
        ),
      ),
    );

    return presetSnapshots.flatMap((snapshot) =>
      snapshot.exists() ? [snapshot.data()] : [],
    );
  } catch (error) {
    console.error("Error fetching dynamic pricing presets by ids:", error);
    return [];
  }
}

export async function createDynamicPricingPreset(
  firestore: Firestore,
  channelId: string,
  preset: DynamicPricingPreset,
): Promise<boolean> {
  try {
    const docRef = db.doc<DynamicPricingPreset>(
      firestore,
      getDynamicPricingPresetsCollectionPath(channelId),
      preset.id,
    );
    await create(firestore, preset, docRef);
    return true;
  } catch (error) {
    console.error("Error creating dynamic pricing preset:", error);
    return false;
  }
}

export async function deleteDynamicPricingPreset(
  firestore: Firestore,
  channelId: string,
  presetId: string,
): Promise<boolean> {
  try {
    const docRef = doc(
      db.collection<DynamicPricingPreset>(
        firestore,
        getDynamicPricingPresetsCollectionPath(channelId),
      ),
      presetId,
    );
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error("Error deleting dynamic pricing preset:", error);
    return false;
  }
}

export async function getDynamicPricingPreset(
  firestore: Firestore,
  channelId: string,
  presetId: string,
): Promise<DynamicPricingPreset | undefined> {
  try {
    const docRef = db.doc<DynamicPricingPreset>(
      firestore,
      getDynamicPricingPresetsCollectionPath(channelId),
      presetId,
    );
    const docSnap = await firestoreGetDoc(docRef);
    return docSnap.exists() ? docSnap.data() : undefined;
  } catch (error) {
    console.error("Error fetching dynamic pricing preset:", error);
    return undefined;
  }
}
