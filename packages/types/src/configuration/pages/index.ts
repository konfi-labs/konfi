import { Base } from "../../base";
import { Locale } from "../../enums";
import type { TranslatedContentMetadata } from "../../translation-meta";

export type dbPageContent = {
  id: string;
  content: { value: string }[];
};

export interface StorePageContentTranslation
  extends
    Omit<Base, "name" | "createdBy" | "updatedBy">,
    TranslatedContentMetadata {
  locale: Locale;
  content: dbPageContent["content"];
}

export interface StorePageContentTranslationCreate extends StorePageContentTranslation {}

export interface StorePageContentTranslationCreateForm extends Omit<
  StorePageContentTranslationCreate,
  "id" | "createdAt" | "updatedAt"
> {}

export interface StorePageContentTranslationUpdate extends Omit<
  StorePageContentTranslation,
  "id" | "createdAt"
> {}

export interface StorePageContentTranslationUpdateForm extends Omit<
  StorePageContentTranslationUpdate,
  "updatedAt"
> {}

export type dbPageContentCreate = dbPageContent;
export type dbPageContentUpdate = Omit<dbPageContent, "id">;
