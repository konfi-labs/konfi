import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type { TaxSettings, TenantContext } from "@konfi/types";
import { TAX_SETTINGS_DOC_ID, normalizeTaxSettings } from "@konfi/utils";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";

export function getTaxSettingsRef(
  channelId: string,
): DocumentReference<TaxSettings> {
  return db.doc<TaxSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    TAX_SETTINGS_DOC_ID,
  );
}

export async function loadTaxSettings(channelId: string): Promise<TaxSettings> {
  const snapshot = await getDoc(getTaxSettingsRef(channelId));

  return normalizeTaxSettings(snapshot.exists() ? snapshot.data() : null);
}

export async function saveTaxSettings(
  channelId: string,
  settings: TaxSettings,
  tenantContext: TenantContext,
): Promise<void> {
  await setDoc(
    getTaxSettingsRef(channelId),
    withTenantId(normalizeTaxSettings(settings), tenantContext),
    { merge: true },
  );
}
