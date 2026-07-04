import type {
  ProductionCooperationParticipantStatus,
  ProductionCooperationProductSharingAccess,
  ProductionCooperationRequestTransport,
} from "@sblyvwx/cloud-contracts";
import type { Base } from "./base";
import type { TenantId, TenantPlanId } from "./tenant";

export const productionCooperationPaidPlanIds = [
  "starter",
  "pro",
  "enterprise",
] as const;

export const isProductionCooperationPaidPlanId = (
  value: unknown,
): value is TenantPlanId =>
  typeof value === "string" &&
  productionCooperationPaidPlanIds.includes(
    value
      .trim()
      .toLowerCase() as (typeof productionCooperationPaidPlanIds)[number],
  );

export const hasProductionCooperationPaidPlans = (
  cooperation: Pick<TenantCooperation, "sourcePlanId" | "targetPlanId">,
): boolean =>
  isProductionCooperationPaidPlanId(cooperation.sourcePlanId) &&
  isProductionCooperationPaidPlanId(cooperation.targetPlanId);

export const hasTenantCooperationProductSharingAccess = (
  cooperation: Pick<TenantCooperation, "productSharing">,
  productId?: string | null,
): boolean => {
  const normalizedProductId = productId?.trim();
  const productIds = cooperation.productSharing?.productIds;

  return Boolean(
    normalizedProductId &&
    cooperation.productSharing?.enabled === true &&
    Array.isArray(productIds) &&
    productIds.includes(normalizedProductId),
  );
};

export interface TenantCooperation extends Base {
  sourceTenantId: TenantId;
  targetTenantId: TenantId;
  sourcePlanId?: TenantPlanId;
  targetPlanId?: TenantPlanId;
  sourceParticipantId?: string;
  targetParticipantId?: string;
  status: ProductionCooperationParticipantStatus;
  transport: ProductionCooperationRequestTransport;
  productSharing?: ProductionCooperationProductSharingAccess;
  targetWarehouseIds?: string[];
  notes?: string;
}
