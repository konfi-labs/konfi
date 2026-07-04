import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type {
  ProofingMethodDefinition,
  TenantContext,
  UnitDefinition,
  UnitsProofingSettings,
} from "@konfi/types";
import {
  UNITS_PROOFING_SETTINGS_DOC_ID,
  createDefaultUnitsProofingSettings,
  createProofingMethodId,
  createUnitId,
  getProofingMethodColorPalette,
  getProofingMethodIcon,
  getUnitColorPalette,
  getUnitIcon,
  normalizeUnitsProofingSettings,
} from "@konfi/utils";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";
import {
  countActiveSettingsDefinitions,
  enforceConfigurableSettingsQuota,
  recordConfigurableSettingsQuotaUsage,
} from "./settings-quota.client";

export type { ProofingMethodDefinition, UnitDefinition, UnitsProofingSettings };

export {
  createDefaultUnitsProofingSettings,
  createProofingMethodId,
  createUnitId,
  getProofingMethodColorPalette,
  getProofingMethodIcon,
  getUnitColorPalette,
  getUnitIcon,
  normalizeUnitsProofingSettings,
};

export function getUnitsProofingSettingsRef(
  channelId: string,
): DocumentReference<UnitsProofingSettings> {
  return db.doc<UnitsProofingSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    UNITS_PROOFING_SETTINGS_DOC_ID,
  );
}

export async function loadUnitsProofingSettings(
  channelId: string,
): Promise<UnitsProofingSettings> {
  const snapshot = await getDoc(getUnitsProofingSettingsRef(channelId));

  return normalizeUnitsProofingSettings(
    snapshot.exists() ? snapshot.data() : null,
  );
}

export async function saveUnitsProofingSettings(
  channelId: string,
  settings: UnitsProofingSettings,
  tenantContext: TenantContext,
): Promise<void> {
  const currentSettings = await loadUnitsProofingSettings(channelId);
  const nextSettings = normalizeUnitsProofingSettings(settings);
  const current = countActiveSettingsDefinitions(currentSettings.units);
  const next = countActiveSettingsDefinitions(nextSettings.units);
  const increment = await enforceConfigurableSettingsQuota({
    current,
    next,
    operation: "admin.settings.units-proofing.save",
    resource: "configurableUnits",
  });

  await setDoc(
    getUnitsProofingSettingsRef(channelId),
    withTenantId(nextSettings, tenantContext),
    { merge: true },
  );

  await recordConfigurableSettingsQuotaUsage({
    current: next,
    operation: "admin.settings.units-proofing.save",
    requested: increment,
    resource: "configurableUnits",
  });
}
