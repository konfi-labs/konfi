import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type { SupportTaxonomySettings, TenantContext } from "@konfi/types";
import {
  ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
  SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
  normalizeOrderWorkflowStatusesSettings,
  normalizeSupportTaxonomySettings,
  type OrderWorkflowStatusesSettings,
} from "@konfi/utils";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";
import {
  countActiveSettingsDefinitions,
  enforceConfigurableSettingsQuota,
  recordConfigurableSettingsQuotaUsage,
} from "./settings-quota.client";

const countActiveOrderWorkflowStatuses = (
  settings: OrderWorkflowStatusesSettings,
) =>
  countActiveSettingsDefinitions(settings.orderStatuses) +
  countActiveSettingsDefinitions(settings.fileStatuses);

const loadOrderWorkflowStatusCount = async (
  channelId: string,
): Promise<number> => {
  const snapshot = await getDoc(
    db.doc<OrderWorkflowStatusesSettings>(
      firestore,
      `/channels/${channelId}/settings`,
      ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
    ),
  );

  return countActiveOrderWorkflowStatuses(
    normalizeOrderWorkflowStatusesSettings(
      snapshot.exists() ? snapshot.data() : null,
    ),
  );
};

export function getSupportTaxonomySettingsRef(
  channelId: string,
): DocumentReference<SupportTaxonomySettings> {
  return db.doc<SupportTaxonomySettings>(
    firestore,
    `/channels/${channelId}/settings`,
    SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
  );
}

export async function loadSupportTaxonomySettings(
  channelId: string,
): Promise<SupportTaxonomySettings> {
  const snapshot = await getDoc(getSupportTaxonomySettingsRef(channelId));

  return normalizeSupportTaxonomySettings(
    snapshot.exists() ? snapshot.data() : null,
  );
}

export async function saveSupportTaxonomySettings(
  channelId: string,
  settings: SupportTaxonomySettings,
  tenantContext: TenantContext,
): Promise<void> {
  const currentSettings = await loadSupportTaxonomySettings(channelId);
  const nextSettings = normalizeSupportTaxonomySettings(settings);
  const orderWorkflowStatuses = await loadOrderWorkflowStatusCount(channelId);
  const current =
    countActiveSettingsDefinitions(currentSettings.complaintStatuses) +
    orderWorkflowStatuses;
  const next =
    countActiveSettingsDefinitions(nextSettings.complaintStatuses) +
    orderWorkflowStatuses;
  const increment = await enforceConfigurableSettingsQuota({
    current,
    next,
    operation: "admin.settings.support-taxonomy.save",
    resource: "configurableStatuses",
  });

  await setDoc(
    getSupportTaxonomySettingsRef(channelId),
    withTenantId(nextSettings, tenantContext),
    { merge: true },
  );

  await recordConfigurableSettingsQuotaUsage({
    current: next,
    operation: "admin.settings.support-taxonomy.save",
    requested: increment,
    resource: "configurableStatuses",
  });
}
