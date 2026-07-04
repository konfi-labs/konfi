import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  assertProcessEnvIntegrationAllowed,
  scopeEnvBackedIntegrationFlags,
} from "./integration-runtime-config";

vi.mock("server-only", () => ({}));

const dedicatedContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
};

const saasContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
};

describe("integration runtime config", () => {
  it("keeps env-backed integration flags available in dedicated mode", () => {
    expect(
      scopeEnvBackedIntegrationFlags(
        {
          fakturowniaApiKeyProvided: true,
          polkurierApiKeyProvided: true,
          przelewy24Configured: true,
          resendConfigured: true,
          stripeConfigured: true,
        },
        dedicatedContext,
      ),
    ).toEqual({
      fakturowniaApiKeyProvided: true,
      polkurierApiKeyProvided: true,
      przelewy24Configured: true,
      resendConfigured: true,
      stripeConfigured: true,
    });
  });

  it("fails closed for env-backed integration flags in SaaS mode", () => {
    expect(
      scopeEnvBackedIntegrationFlags(
        {
          fakturowniaApiKeyProvided: true,
          polkurierApiKeyProvided: true,
          przelewy24Configured: true,
          resendConfigured: true,
          stripeConfigured: true,
        },
        saasContext,
      ),
    ).toEqual({
      fakturowniaApiKeyProvided: false,
      polkurierApiKeyProvided: false,
      przelewy24Configured: false,
      resendConfigured: false,
      stripeConfigured: false,
    });
  });

  it("rejects process-wide integration credentials in SaaS mode", () => {
    expect(() =>
      assertProcessEnvIntegrationAllowed("Fakturownia", saasContext),
    ).toThrow(
      "Tenant-specific Fakturownia runtime config is required in SaaS mode.",
    );
  });
});
