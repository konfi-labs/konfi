"use client";

import { getAdminConfigFlags } from "@/actions";
import { useTenantContext } from "@/context/tenant";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import useSWRImmutable from "swr/immutable";
import AdminLoadingSkeleton, {
  type AdminLoadingSkeletonVariant,
} from "../layout/AdminLoadingSkeleton";
import { IntegrationUnavailableCard } from "./IntegrationUnavailableCard";

type AdminConfigFlags = Awaited<ReturnType<typeof getAdminConfigFlags>>;

export type IntegrationAvailabilityFlagKey = {
  [Key in keyof AdminConfigFlags]: AdminConfigFlags[Key] extends boolean
    ? Key
    : never;
}[keyof AdminConfigFlags];

export function adminConfigFlagsSWRKey(tenantContext: TenantContext) {
  return [
    "admin-config-flags",
    tenantContext.deploymentMode,
    tenantContext.requireTenantId,
    tenantContext.tenantId ?? "",
  ] as const;
}

export function IntegrationAvailabilityGate({
  children,
  fallbackRows = 6,
  fallbackVariant = "form",
  flagKey,
  integrationName,
}: {
  children: React.ReactNode;
  fallbackRows?: number;
  fallbackVariant?: AdminLoadingSkeletonVariant;
  flagKey: IntegrationAvailabilityFlagKey;
  integrationName: string;
}) {
  const tenantContext = useTenantContext();
  const { data: configFlags, error } = useSWRImmutable(
    adminConfigFlagsSWRKey(tenantContext),
    () => getAdminConfigFlags(),
  );

  if (error) {
    throw error;
  }

  if (!configFlags) {
    return (
      <AdminLoadingSkeleton variant={fallbackVariant} rows={fallbackRows} />
    );
  }

  if (!configFlags[flagKey]) {
    return <IntegrationUnavailableCard integrationName={integrationName} />;
  }

  return <>{children}</>;
}
