"use client";

import { useTenantContext } from "@/context/tenant";
import { firestore } from "@/lib/firebase/clientApp";
import {
  readTenantModuleAccess,
  shouldReadTenantModuleAccess,
  type TenantModuleAccessOptions,
  type TenantModuleName,
} from "@/lib/tenant-module-access";
import { doc, getDoc } from "firebase/firestore";
import useSWRImmutable from "swr/immutable";

export function useTenantModuleAccess(
  moduleName: TenantModuleName,
  options: TenantModuleAccessOptions = {},
) {
  const tenantContext = useTenantContext();
  const needsTenantModuleCheck = shouldReadTenantModuleAccess(tenantContext);
  const tenantModuleKey =
    needsTenantModuleCheck && tenantContext.tenantId
      ? ([
          "tenant-module-access",
          tenantContext.tenantId,
          moduleName,
          options.denyFreePlan === true,
        ] as const)
      : null;

  const { data: isAllowed, isLoading } = useSWRImmutable(
    tenantModuleKey,
    async ([, tenantId, nextModuleName, denyFreePlan]) => {
      const snapshot = await getDoc(doc(firestore, "tenants", tenantId));

      return readTenantModuleAccess(
        snapshot.exists() ? snapshot.data() : undefined,
        nextModuleName,
        { denyFreePlan },
      );
    },
  );
  const isChecking =
    needsTenantModuleCheck &&
    tenantModuleKey !== null &&
    isAllowed === undefined &&
    isLoading;

  return {
    isAllowed: needsTenantModuleCheck ? isAllowed === true : true,
    isChecking,
    needsTenantModuleCheck,
  };
}
