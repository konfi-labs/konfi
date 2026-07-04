import type { Locale } from "../enums";

export type BusinessTaxonomyId = string;

export interface BusinessTaxonomyDefinition {
  id: BusinessTaxonomyId;
  name: string;
  localizedNames?: Partial<Record<Locale, string>>;
  order: number;
  enabled: boolean;
  archived?: boolean;
  isDefault?: boolean;
  icon: string;
  colorPalette: string;
}

export interface BusinessTaxonomySettings<
  TDefinition extends BusinessTaxonomyDefinition,
> {
  definitions: TDefinition[];
  updatedAt?: unknown;
  tenantId?: string;
}
