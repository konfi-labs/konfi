import "server-only";

export {
  SaasRuntimeQuotaError,
  assertSaasRuntimeModuleEnabled,
  assertSaasRuntimeQuota,
  recordSaasRuntimeQuotaUsage,
} from "@konfi/firebase";

export type {
  SaasRuntimeModuleFlag,
  SaasRuntimeQuotaResource,
} from "@konfi/firebase";
