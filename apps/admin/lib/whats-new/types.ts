import { FeatureHighlight, Locale, NestedMember } from "@konfi/types";
import type { Timestamp } from "firebase-admin/firestore";

export const WHATS_NEW_CHANGE_KIND = {
  MANUAL: "manual",
  WEEKLY_UPDATE: "weekly-update",
  MONTHLY_GROWTH: "monthly-growth",
} as const;

export type WhatsNewChangeKind =
  (typeof WHATS_NEW_CHANGE_KIND)[keyof typeof WHATS_NEW_CHANGE_KIND];

export const WHATS_NEW_CHANGE_SOURCE = {
  MANUAL: "manual",
  AI: "ai",
} as const;

export type WhatsNewChangeSource =
  (typeof WHATS_NEW_CHANGE_SOURCE)[keyof typeof WHATS_NEW_CHANGE_SOURCE];

export interface WhatsNewChange {
  id: string;
  timestamp: string;
  title: Record<Locale, string> | Record<string, string>;
  description: Record<Locale, string> | Record<string, string>;
  imageUrl?: string;
  highlightFeatures?: FeatureHighlight[];
  seoSuggestionCount?: number;
  campaignProposalCount?: number;
  kind?: WhatsNewChangeKind;
  source?: WhatsNewChangeSource;
}

export interface StoredWhatsNewChange extends Omit<
  WhatsNewChange,
  "timestamp" | "source"
> {
  timestamp: Timestamp;
  source: typeof WHATS_NEW_CHANGE_SOURCE.AI;
  periodKey: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  seoSuggestionCount?: number;
}

export interface SeoSuggestionDraft {
  title: string;
  description: string;
}

export interface ProductSeoSuggestion {
  productId: string;
  productName: string;
  currentSeo: SeoSuggestionDraft;
  suggestedSeo: SeoSuggestionDraft;
  research: Record<Locale, string> | Record<string, string>;
  appliedAt?: string;
  appliedBy?: NestedMember;
}

export interface StoredProductSeoSuggestion extends Omit<
  ProductSeoSuggestion,
  "appliedAt"
> {
  appliedAt?: Timestamp;
}
