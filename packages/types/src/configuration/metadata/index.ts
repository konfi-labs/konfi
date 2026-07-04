export type dbMetadata = {
  id: string;
  title: string;
  description: string;
  keywords: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
};

export type dbMetadataCreate = dbMetadata;

export type dbMetadataUpdate = Omit<dbMetadata, "id">;

import { Base } from "../../base";
import { Locale } from "../../enums";
import type { TranslatedContentMetadata } from "../../translation-meta";

export interface StoreMetadataTranslation
  extends
    Omit<Base, "name" | "createdBy" | "updatedBy">,
    TranslatedContentMetadata {
  locale: Locale;
  title: string;
  description: string;
  keywords: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export interface StoreMetadataTranslationCreate extends StoreMetadataTranslation {}

export interface StoreMetadataTranslationCreateForm extends Omit<
  StoreMetadataTranslationCreate,
  "id" | "createdAt" | "updatedAt"
> {}

export interface StoreMetadataTranslationUpdate extends Omit<
  StoreMetadataTranslation,
  "id" | "createdAt"
> {}

export interface StoreMetadataTranslationUpdateForm extends Omit<
  StoreMetadataTranslationUpdate,
  "updatedAt"
> {}
