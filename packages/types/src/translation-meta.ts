import { Timestamp } from "firebase/firestore";
import { Locale } from "./enums";

export type TranslationMetaStatus = "manual" | "ai_generated" | "reviewed";

export type TranslationMetaProvider = "google-vertex";

export interface TranslationMeta {
  sourceLocale: Locale;
  sourceHash: string;
  status: TranslationMetaStatus;
  generatedAt?: Omit<Timestamp, "toJSON">;
  generatedBy?: string;
  generatedProvider?: TranslationMetaProvider | string;
  generatedModel?: string;
  reviewedAt?: Omit<Timestamp, "toJSON">;
  reviewedBy?: string;
}

export interface TranslatedContentMetadata {
  translationMeta?: TranslationMeta;
}
