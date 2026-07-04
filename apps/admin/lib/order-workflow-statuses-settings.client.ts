import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type { TenantContext } from "@konfi/types";
import {
  ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
  SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
  normalizeOrderWorkflowStatusesSettings,
  normalizeSupportTaxonomySettings,
  type OrderWorkflowStatusesSettings,
  type SupportTaxonomySettings,
} from "@konfi/utils";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";
import {
  countActiveSettingsDefinitions,
  enforceConfigurableSettingsQuota,
  recordConfigurableSettingsQuotaUsage,
} from "./settings-quota.client";

const countActiveWorkflowStatuses = (settings: OrderWorkflowStatusesSettings) =>
  countActiveSettingsDefinitions(settings.orderStatuses) +
  countActiveSettingsDefinitions(settings.fileStatuses);

const countActiveSupportStatuses = (settings: SupportTaxonomySettings) =>
  countActiveSettingsDefinitions(settings.complaintStatuses);

const loadSupportStatusCount = async (channelId: string): Promise<number> => {
  const snapshot = await getDoc(
    db.doc<SupportTaxonomySettings>(
      firestore,
      `/channels/${channelId}/settings`,
      SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
    ),
  );

  return countActiveSupportStatuses(
    normalizeSupportTaxonomySettings(
      snapshot.exists() ? snapshot.data() : null,
    ),
  );
};

export function getOrderWorkflowStatusesSettingsRef(
  channelId: string,
): DocumentReference<OrderWorkflowStatusesSettings> {
  return db.doc<OrderWorkflowStatusesSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
  );
}

export async function loadOrderWorkflowStatusesSettings(
  channelId: string,
): Promise<OrderWorkflowStatusesSettings> {
  const snapshot = await getDoc(getOrderWorkflowStatusesSettingsRef(channelId));

  return normalizeOrderWorkflowStatusesSettings(
    snapshot.exists() ? snapshot.data() : null,
  );
}

export async function saveOrderWorkflowStatusesSettings(
  channelId: string,
  settings: OrderWorkflowStatusesSettings,
  tenantContext: TenantContext,
): Promise<void> {
  const currentSettings = await loadOrderWorkflowStatusesSettings(channelId);
  const nextSettings = normalizeOrderWorkflowStatusesSettings(settings);
  const supportStatuses = await loadSupportStatusCount(channelId);
  const current =
    countActiveWorkflowStatuses(currentSettings) + supportStatuses;
  const next = countActiveWorkflowStatuses(nextSettings) + supportStatuses;
  const increment = await enforceConfigurableSettingsQuota({
    current,
    next,
    operation: "admin.settings.order-workflow-statuses.save",
    resource: "configurableStatuses",
  });

  await setDoc(
    getOrderWorkflowStatusesSettingsRef(channelId),
    withTenantId(nextSettings, tenantContext),
    { merge: true },
  );

  await recordConfigurableSettingsQuotaUsage({
    current: next,
    operation: "admin.settings.order-workflow-statuses.save",
    requested: increment,
    resource: "configurableStatuses",
  });
}
