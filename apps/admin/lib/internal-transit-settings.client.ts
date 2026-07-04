import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type { TenantContext } from "@konfi/types";
import type {
  InternalTransitSettings,
  TransitDayOverride,
} from "@konfi/types";
import {
  INTERNAL_TRANSIT_SETTINGS_DOC_ID,
  normalizeInternalTransitSettings,
  transitDayOverrideDocId,
} from "@konfi/utils";
import {
  type DocumentReference,
  deleteDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";

export function getInternalTransitSettingsRef(
  channelId: string,
): DocumentReference<InternalTransitSettings> {
  return db.doc<InternalTransitSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    INTERNAL_TRANSIT_SETTINGS_DOC_ID,
  );
}

export async function loadInternalTransitSettings(
  channelId: string,
): Promise<InternalTransitSettings> {
  const snapshot = await getDoc(getInternalTransitSettingsRef(channelId));

  return normalizeInternalTransitSettings(
    snapshot.exists() ? snapshot.data() : null,
  );
}

export async function saveInternalTransitSettings(
  channelId: string,
  settings: InternalTransitSettings,
  tenantContext: TenantContext,
): Promise<void> {
  const nextSettings = normalizeInternalTransitSettings(settings);

  await setDoc(
    getInternalTransitSettingsRef(channelId),
    withTenantId(nextSettings, tenantContext),
    { merge: true },
  );
}

function getDayOverrideRef(
  channelId: string,
  routeId: string,
  date: string,
): DocumentReference<TransitDayOverride> {
  return db.doc<TransitDayOverride>(
    firestore,
    `/channels/${channelId}/transitDayOverrides`,
    transitDayOverrideDocId(routeId, date),
  );
}

export async function loadTransitDayOverride(
  channelId: string,
  routeId: string,
  date: string,
): Promise<TransitDayOverride | null> {
  const snapshot = await getDoc(getDayOverrideRef(channelId, routeId, date));

  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveTransitDayOverride(
  channelId: string,
  override: TransitDayOverride,
  tenantContext: TenantContext,
): Promise<void> {
  const hasContent =
    (override.skipDepartureIds?.length ?? 0) > 0 ||
    (override.extraDepartures?.length ?? 0) > 0;

  const ref = getDayOverrideRef(channelId, override.routeId, override.date);

  if (!hasContent) {
    await deleteDoc(ref);
    return;
  }

  await setDoc(ref, withTenantId(override, tenantContext), { merge: false });
}
