import { DEFAULT_LOCALE, Locale } from "@konfi/types";
import type { Timestamp } from "firebase/firestore";

export const MANAGED_TRANSLATION_SOURCE_LOCALE = DEFAULT_LOCALE;
export const MANAGED_TRANSLATION_TARGET_LOCALES = [
  Locale.en,
  Locale.uk,
  Locale.de,
  Locale.cs,
  Locale.sk,
  Locale.fr,
] as const;

export type ManagedTranslationTargetLocale =
  (typeof MANAGED_TRANSLATION_TARGET_LOCALES)[number];

export type ManagedTranslationKind =
  | "product"
  | "category"
  | "attribute"
  | "blogPost"
  | "blogCategory"
  | "blogTag"
  | "hero"
  | "storeMetadata"
  | "storePageContent"
  | "printingMethodsSettings"
  | "paymentMethodsSettings"
  | "shippingMethodsSettings"
  | "orderWorkflowStatusesSettings"
  | "orderRulePresetsSettings"
  | "unitsProofingSettings"
  | "supportTaxonomySettings";

export type ManagedTranslationRef =
  | { kind: "product"; channelId: string; entityId: string }
  | { kind: "category"; channelId: string; entityId: string }
  | { kind: "attribute"; entityId: string }
  | { kind: "blogPost"; entityId: string }
  | { kind: "blogCategory"; entityId: string }
  | { kind: "blogTag"; entityId: string }
  | { kind: "hero"; channelId: string }
  | { kind: "storeMetadata"; channelId: string; entityId: string }
  | { kind: "storePageContent"; channelId: string; entityId: string }
  | { kind: "printingMethodsSettings"; channelId: string }
  | { kind: "paymentMethodsSettings"; channelId: string }
  | { kind: "shippingMethodsSettings"; channelId: string }
  | { kind: "orderWorkflowStatusesSettings"; channelId: string }
  | { kind: "orderRulePresetsSettings"; channelId: string }
  | { kind: "unitsProofingSettings"; channelId: string }
  | { kind: "supportTaxonomySettings"; channelId: string };

export type TranslationMetaStatus = "manual" | "ai_generated" | "reviewed";

export interface ManagedTranslationMeta {
  sourceLocale: Locale;
  sourceHash: string;
  status: TranslationMetaStatus;
  generatedAt?: Omit<Timestamp, "toJSON">;
  generatedBy?: string;
  generatedProvider?: string;
  generatedModel?: string;
  reviewedAt?: Omit<Timestamp, "toJSON">;
  reviewedBy?: string;
}

export interface ManagedTranslationDocument extends Record<string, unknown> {
  locale?: Locale;
  active?: boolean;
  translationMeta?: ManagedTranslationMeta;
}

export interface ManagedTranslationField {
  key: string;
  sourcePath: string;
  targetPath: string;
  label?: string;
  required?: boolean;
  translatable?: boolean;
}

export interface ManagedTranslationDescriptor {
  kind: ManagedTranslationKind;
  fields: ManagedTranslationField[];
  sourceHash: string;
  normalizeTranslation?: (
    translation: ManagedTranslationDocument,
  ) => ManagedTranslationDocument;
}

export type ManagedTranslationDisplayStatus =
  | "missing"
  | "incomplete"
  | "stale"
  | "aiDraft"
  | "reviewed"
  | "complete";

export interface ManagedTranslationHealth {
  status: ManagedTranslationDisplayStatus;
  issues: Array<
    Exclude<ManagedTranslationDisplayStatus, "reviewed" | "complete">
  >;
  missingFieldKeys: string[];
  staleFieldCount: number;
  sourceHash: string;
}
