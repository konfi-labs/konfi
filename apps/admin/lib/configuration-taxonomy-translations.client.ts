import { firestore } from "@/lib/firebase/clientApp";
import {
  MANAGED_TRANSLATION_TARGET_LOCALES,
  type ManagedTranslationDocument,
  type ManagedTranslationKind,
} from "@/lib/translations";
import { db, withTenantId } from "@konfi/firebase";
import type { Locale, TenantContext } from "@konfi/types";
import {
  ORDER_RULE_PRESETS_SETTINGS_DOC_ID,
  ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
  PAYMENT_METHODS_SETTINGS_DOC_ID,
  PRINTING_METHODS_SETTINGS_DOC_ID,
  SHIPPING_METHODS_SETTINGS_DOC_ID,
  SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
  UNITS_PROOFING_SETTINGS_DOC_ID,
} from "@konfi/utils";
import {
  collection,
  type DocumentReference,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

export type ConfigurableSettingsTranslationKind = Extract<
  ManagedTranslationKind,
  | "printingMethodsSettings"
  | "paymentMethodsSettings"
  | "shippingMethodsSettings"
  | "orderWorkflowStatusesSettings"
  | "orderRulePresetsSettings"
  | "unitsProofingSettings"
  | "supportTaxonomySettings"
>;

const SETTINGS_DOC_BY_TRANSLATION_KIND: Record<
  ConfigurableSettingsTranslationKind,
  string
> = {
  printingMethodsSettings: PRINTING_METHODS_SETTINGS_DOC_ID,
  paymentMethodsSettings: PAYMENT_METHODS_SETTINGS_DOC_ID,
  shippingMethodsSettings: SHIPPING_METHODS_SETTINGS_DOC_ID,
  orderWorkflowStatusesSettings: ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
  orderRulePresetsSettings: ORDER_RULE_PRESETS_SETTINGS_DOC_ID,
  unitsProofingSettings: UNITS_PROOFING_SETTINGS_DOC_ID,
  supportTaxonomySettings: SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
};

export function getConfigurableSettingsTranslationRef(
  channelId: string,
  kind: ConfigurableSettingsTranslationKind,
  locale: Locale,
): DocumentReference<ManagedTranslationDocument> {
  const settingsDocId = SETTINGS_DOC_BY_TRANSLATION_KIND[kind];
  return db.doc<ManagedTranslationDocument>(
    firestore,
    `/channels/${channelId}/settings/${settingsDocId}/translations`,
    locale,
  );
}

export async function loadConfigurableSettingsTranslations(
  channelId: string,
  kind: ConfigurableSettingsTranslationKind,
): Promise<ManagedTranslationDocument[]> {
  const settingsDocId = SETTINGS_DOC_BY_TRANSLATION_KIND[kind];
  const snapshot = await getDocs(
    collection(
      firestore,
      `/channels/${channelId}/settings/${settingsDocId}/translations`,
    ),
  );
  const configuredLocales = new Set<Locale>(MANAGED_TRANSLATION_TARGET_LOCALES);

  return snapshot.docs
    .map((doc) => doc.data() as ManagedTranslationDocument)
    .filter((translation) =>
      translation.locale ? configuredLocales.has(translation.locale) : false,
    );
}

export async function saveConfigurableSettingsTranslation(params: {
  channelId: string;
  kind: ConfigurableSettingsTranslationKind;
  locale: Locale;
  tenantContext: TenantContext;
  translation: ManagedTranslationDocument;
}): Promise<void> {
  await setDoc(
    getConfigurableSettingsTranslationRef(
      params.channelId,
      params.kind,
      params.locale,
    ),
    withTenantId(
      {
        ...params.translation,
        id: params.locale,
        locale: params.locale,
        active: true,
        updatedAt: serverTimestamp(),
      },
      params.tenantContext,
    ),
    { merge: true },
  );
}
