import { firestore } from "@/lib/firebase/clientApp";
import {
  PRINTING_METHODS_SETTINGS_DOC_ID,
  normalizePrintingMethodsSettings,
} from "@konfi/utils";
import { db, withTenantId } from "@konfi/firebase";
import type { PrintingMethodsSettings, TenantContext } from "@konfi/types";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";

export function getPrintingMethodsSettingsRef(
  channelId: string,
): DocumentReference<PrintingMethodsSettings> {
  return db.doc<PrintingMethodsSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    PRINTING_METHODS_SETTINGS_DOC_ID,
  );
}

export async function loadPrintingMethodsSettings(
  channelId: string,
): Promise<PrintingMethodsSettings> {
  const snapshot = await getDoc(getPrintingMethodsSettingsRef(channelId));

  return normalizePrintingMethodsSettings(
    snapshot.exists() ? snapshot.data() : null,
  );
}

export async function savePrintingMethodsSettings(
  channelId: string,
  settings: PrintingMethodsSettings,
  tenantContext: TenantContext,
): Promise<void> {
  await setDoc(
    getPrintingMethodsSettingsRef(channelId),
    withTenantId(normalizePrintingMethodsSettings(settings), tenantContext),
    { merge: true },
  );
}
