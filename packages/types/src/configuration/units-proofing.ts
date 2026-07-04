import type { ProofingOptions, Unit } from "../enums";
import type { BusinessTaxonomyDefinition } from "./business-taxonomy";

export type UnitId = string;
export type LegacyUnitId = Unit;

export interface UnitDefinition extends BusinessTaxonomyDefinition {
  id: UnitId;
  abbreviation: string;
  precision: number;
}

export type ProofingMethodId = string;
export type LegacyProofingMethodId = ProofingOptions;

export interface ProofingMethodDefinition extends BusinessTaxonomyDefinition {
  id: ProofingMethodId;
}

export interface UnitsProofingSettings {
  units: UnitDefinition[];
  proofingMethods: ProofingMethodDefinition[];
  updatedAt?: unknown;
  tenantId?: string;
}
