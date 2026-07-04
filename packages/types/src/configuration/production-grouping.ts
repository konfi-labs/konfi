export type ProductionGroupingProfileId = string;
export type ProductionGroupingAxisId = string;
export type ProductionGroupingValueKey = string;

export interface ProductionGroupingAllowedValue {
  key: ProductionGroupingValueKey;
  label: string;
  aliases?: string[];
  archived?: boolean;
  order?: number;
}

export interface ProductionGroupingAxis {
  id: ProductionGroupingAxisId;
  label: string;
  aliases?: string[];
  allowedValues?: ProductionGroupingAllowedValue[];
  allowAiSuggestedValues?: boolean;
}

export interface ProductionGroupingProfile {
  id: ProductionGroupingProfileId;
  label: string;
  primaryAxis: ProductionGroupingAxis;
  secondaryAxis?: ProductionGroupingAxis | null;
}

export interface ProductionGroupingSettings {
  profile: ProductionGroupingProfile;
  updatedAt?: unknown;
  tenantId?: string;
}
