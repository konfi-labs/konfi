import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type { CurrencySettings, TenantContext } from "@konfi/types";
import {
  CURRENCIES_SETTINGS_DOC_ID,
  normalizeCurrencySettings,
} from "@konfi/utils";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";
import {
  countActiveSettingsDefinitions,
  enforceConfigurableSettingsQuota,
  recordConfigurableSettingsQuotaUsage,
} from "./settings-quota.client";

export function getCurrencySettingsRef(
  channelId: string,
): DocumentReference<CurrencySettings> {
  return db.doc<CurrencySettings>(
    firestore,
    `/channels/${channelId}/settings`,
    CURRENCIES_SETTINGS_DOC_ID,
  );
}

export async function loadCurrencySettings(
  channelId: string,
): Promise<CurrencySettings> {
  const snapshot = await getDoc(getCurrencySettingsRef(channelId));

  return normalizeCurrencySettings(snapshot.exists() ? snapshot.data() : null);
}

export async function saveCurrencySettings(
  channelId: string,
  settings: CurrencySettings,
  tenantContext: TenantContext,
): Promise<void> {
  const currentSettings = await loadCurrencySettings(channelId);
  const nextSettings = normalizeCurrencySettings(settings);
  const current = countActiveSettingsDefinitions(currentSettings.currencies);
  const next = countActiveSettingsDefinitions(nextSettings.currencies);
  const increment = await enforceConfigurableSettingsQuota({
    current,
    next,
    operation: "admin.settings.currencies.save",
    resource: "configurableCurrencies",
  });

  await setDoc(
    getCurrencySettingsRef(channelId),
    withTenantId(nextSettings, tenantContext),
    { merge: true },
  );

  await recordConfigurableSettingsQuotaUsage({
    current: next,
    operation: "admin.settings.currencies.save",
    requested: increment,
    resource: "configurableCurrencies",
  });
}
