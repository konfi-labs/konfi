import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type { ShippingMethodsSettings, TenantContext } from "@konfi/types";
import {
  SHIPPING_METHODS_SETTINGS_DOC_ID,
  normalizeShippingMethodsSettings,
} from "@konfi/utils";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";

export function getShippingMethodsSettingsRef(
  channelId: string,
): DocumentReference<ShippingMethodsSettings> {
  return db.doc<ShippingMethodsSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    SHIPPING_METHODS_SETTINGS_DOC_ID,
  );
}

export async function loadShippingMethodsSettings(
  channelId: string,
): Promise<ShippingMethodsSettings> {
  const snapshot = await getDoc(getShippingMethodsSettingsRef(channelId));

  return normalizeShippingMethodsSettings(
    snapshot.exists() ? snapshot.data() : null,
  );
}

export async function saveShippingMethodsSettings(
  channelId: string,
  settings: ShippingMethodsSettings,
  tenantContext: TenantContext,
): Promise<void> {
  await setDoc(
    getShippingMethodsSettingsRef(channelId),
    withTenantId(normalizeShippingMethodsSettings(settings), tenantContext),
    { merge: true },
  );
}
