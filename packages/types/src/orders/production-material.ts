import type { Base } from "../base";
import type {
  ProductionGroupingAxisId,
  ProductionGroupingProfileId,
} from "../configuration";
import type { TenantOwned } from "../tenant";

export const productionGroupingClassificationVersion = "2026-06-18-generic";
export const productionMaterialClassificationVersion =
  productionGroupingClassificationVersion;

export type ProductionGroupingClassificationSource =
  | "deterministic"
  | "ai"
  | "manual"
  | "unclassified";

export type ProductionMaterialClassificationSource =
  ProductionGroupingClassificationSource;

export interface ProductionGroupingClassifiedValue {
  axisId: ProductionGroupingAxisId;
  groupKey: string;
  key: string;
  label: string;
}

export interface ProductionGroupingClassification extends TenantOwned {
  itemId: string;
  inputHash: string;
  signatureHash: string;
  profileId: ProductionGroupingProfileId;
  profileHash: string;
  primary: ProductionGroupingClassifiedValue;
  secondary?: ProductionGroupingClassifiedValue;
  source: ProductionGroupingClassificationSource;
  confidence: number;
  classificationVersion: string;
  reasoning?: string;
  orderId?: string;
  createdAt?: Base["createdAt"];
  updatedAt?: Base["updatedAt"];
}

export type ProductionGroupingClassificationCacheResult = Record<
  string,
  ProductionGroupingClassification
>;

export type ProductionMaterialClassification = ProductionGroupingClassification;

export type ProductionMaterialClassificationCacheResult =
  ProductionGroupingClassificationCacheResult;
