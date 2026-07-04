import {
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import type { SaasRuntimeQuotaResource } from "@/lib/saas-runtime-quotas";

export interface ActiveSettingsDefinition {
  archived?: boolean;
  enabled?: boolean;
}

export const countActiveSettingsDefinitions = (
  definitions: readonly ActiveSettingsDefinition[],
): number =>
  definitions.filter(
    (definition) =>
      definition.enabled !== false && definition.archived !== true,
  ).length;

export const enforceConfigurableSettingsQuota = async ({
  current,
  next,
  operation,
  resource,
}: {
  current: number;
  next: number;
  operation: string;
  resource: Extract<
    SaasRuntimeQuotaResource,
    "configurableCurrencies" | "configurableStatuses" | "configurableUnits"
  >;
}): Promise<number> => {
  const increment = next - current;

  if (increment <= 0) {
    return 0;
  }

  await assertSaasRuntimeQuotaAction({
    current,
    operation,
    requested: increment,
    resource,
  });

  return increment;
};

export const recordConfigurableSettingsQuotaUsage = async ({
  current,
  operation,
  requested,
  resource,
}: {
  current: number;
  operation: string;
  requested: number;
  resource: Extract<
    SaasRuntimeQuotaResource,
    "configurableCurrencies" | "configurableStatuses" | "configurableUnits"
  >;
}): Promise<void> => {
  if (requested <= 0) {
    return;
  }

  await recordSaasRuntimeQuotaUsageAction({
    current,
    operation,
    requested,
    resource,
  });
};
