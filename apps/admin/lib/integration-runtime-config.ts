import "server-only";

import { resolveServerTenantContext } from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { isSharedSaasTenantRuntime } from "./tenant-runtime";

export type ProcessEnvIntegrationName =
  | "Fakturownia"
  | "Polkurier"
  | "Przelewy24"
  | "Resend"
  | "Stripe";

export interface EnvBackedIntegrationFlags {
  fakturowniaApiKeyProvided: boolean;
  polkurierApiKeyProvided: boolean;
  przelewy24Configured: boolean;
  resendConfigured: boolean;
  stripeConfigured: boolean;
}

export function assertProcessEnvIntegrationAllowed(
  integrationName: ProcessEnvIntegrationName,
  context: TenantContext = resolveServerTenantContext(),
): void {
  if (!isSharedSaasTenantRuntime(context)) {
    return;
  }

  throw new Error(
    `Tenant-specific ${integrationName} runtime config is required in SaaS mode.`,
  );
}

export function scopeEnvBackedIntegrationFlags<
  TFlags extends EnvBackedIntegrationFlags,
>(flags: TFlags, context: TenantContext): TFlags {
  if (!isSharedSaasTenantRuntime(context)) {
    return flags;
  }

  return {
    ...flags,
    fakturowniaApiKeyProvided: false,
    polkurierApiKeyProvided: false,
    przelewy24Configured: false,
    resendConfigured: false,
    stripeConfigured: false,
  };
}
