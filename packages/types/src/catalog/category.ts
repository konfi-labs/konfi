import { Base } from "../base";
import { Locale } from "../enums";
import type { TenantOwned } from "../tenant";
import type { TranslatedContentMetadata } from "../translation-meta";

export interface CategoryPathSegment {
  id: string;
  name: string;
}

export interface Category extends Omit<Base, "active">, TenantOwned {
  description?: string;
  parentId?: string | null;
  path?: CategoryPathSegment[];
  seo: {
    slug: string;
    title: string;
    description: string;
  };
  keywords: string[];
}

export interface CategoryTranslation extends Base, TranslatedContentMetadata {
  id: string;
  locale: Locale; // e.g., "en", "pl", "de"
  name: string;
  description?: string;
  seo?: {
    title?: string;
    description?: string;
    slug?: string;
  };
}

export interface CategoryTranslationCreate extends CategoryTranslation {}

export interface CategoryTranslationCreateForm extends Omit<
  CategoryTranslationCreate,
  "id" | "createdAt" | "updatedAt" | "updatedBy"
> {}

export interface CategoryTranslationUpdate extends Omit<
  CategoryTranslation,
  "id" | "createdAt" | "createdBy"
> {}

export interface CategoryTranslationUpdateForm extends Omit<
  CategoryTranslationUpdate,
  "updatedAt"
> {}

export interface CategoryCreate extends Category {
  toChannel?: {
    id?: string;
  };
}

export interface CategoryCreateForm extends Omit<
  CategoryCreate,
  | "id"
  | "path"
  | "keywords"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "active"
  | "tenantId"
> {}

export interface CategoryUpdate extends Omit<
  Category,
  "id" | "createdAt" | "createdBy"
> {}

export interface CategoryUpdateForm extends Omit<
  CategoryUpdate,
  "path" | "keywords" | "updatedAt" | "active" | "tenantId"
> {}

export type NestedCategory = Omit<
  Category,
  | "seo"
  | "description"
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "keywords"
  | "tenantId"
>;
