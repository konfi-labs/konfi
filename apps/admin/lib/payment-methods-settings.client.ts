import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type { PaymentMethodsSettings, TenantContext } from "@konfi/types";
import {
  PAYMENT_METHODS_SETTINGS_DOC_ID,
  normalizePaymentMethodsSettings,
} from "@konfi/utils";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";

export function getPaymentMethodsSettingsRef(
  channelId: string,
): DocumentReference<PaymentMethodsSettings> {
  return db.doc<PaymentMethodsSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    PAYMENT_METHODS_SETTINGS_DOC_ID,
  );
}

export async function loadPaymentMethodsSettings(
  channelId: string,
): Promise<PaymentMethodsSettings> {
  const snapshot = await getDoc(getPaymentMethodsSettingsRef(channelId));

  return normalizePaymentMethodsSettings(
    snapshot.exists() ? snapshot.data() : null,
  );
}

export async function savePaymentMethodsSettings(
  channelId: string,
  settings: PaymentMethodsSettings,
  tenantContext: TenantContext,
): Promise<void> {
  await setDoc(
    getPaymentMethodsSettingsRef(channelId),
    withTenantId(normalizePaymentMethodsSettings(settings), tenantContext),
    { merge: true },
  );
}
