import { firestore } from "@/lib/firebase/clientApp";
import { db, withTenantId } from "@konfi/firebase";
import type {
  OrderRulePresetsSettings,
  OrderWorkflowStatusesSettings,
  PrintingMethodsSettings,
  TenantContext,
} from "@konfi/types";
import {
  ORDER_RULE_PRESETS_SETTINGS_DOC_ID,
  normalizeOrderRulePresetsSettings,
} from "@konfi/utils";
import { type DocumentReference, getDoc, setDoc } from "firebase/firestore";

export function getOrderRulePresetsSettingsRef(
  channelId: string,
): DocumentReference<OrderRulePresetsSettings> {
  return db.doc<OrderRulePresetsSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    ORDER_RULE_PRESETS_SETTINGS_DOC_ID,
  );
}

export async function loadOrderRulePresetsSettings(
  channelId: string,
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null,
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null,
): Promise<OrderRulePresetsSettings> {
  const snapshot = await getDoc(getOrderRulePresetsSettingsRef(channelId));

  return normalizeOrderRulePresetsSettings(
    snapshot.exists() ? snapshot.data() : null,
    orderWorkflowStatusesSettings,
    printingMethodsSettings,
  );
}

export async function saveOrderRulePresetsSettings(
  channelId: string,
  settings: OrderRulePresetsSettings,
  tenantContext: TenantContext,
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null,
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null,
): Promise<void> {
  await setDoc(
    getOrderRulePresetsSettingsRef(channelId),
    withTenantId(
      normalizeOrderRulePresetsSettings(
        settings,
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
      ),
      tenantContext,
    ),
    { merge: true },
  );
}
