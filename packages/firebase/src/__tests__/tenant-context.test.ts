import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEDICATED_TENANT_ID,
  normalizeTenantHostname,
  resolveClientTenantRuntimeFlags,
  resolveRequestTenantHostname,
  resolveDocumentTenantId,
  resolveServerTenantContext,
  requireTenantContextTenantId,
  shouldScopeByTenant,
  withTenantId,
  withTenantOwned,
} from "../tenant-context";

describe("tenant context", () => {
  it("defaults dedicated deployments to the legacy tenant", () => {
    const context = resolveServerTenantContext({});

    expect(context).toEqual({
      deploymentMode: "dedicated",
      tenantId: DEFAULT_DEDICATED_TENANT_ID,
      requireTenantId: false,
    });
  });

  it("uses configured tenant id in dedicated deployments", () => {
    const context = resolveServerTenantContext({
      KONFI_DEPLOYMENT_MODE: "dedicated",
      KONFI_TENANT_ID: "company-a",
    });

    expect(context).toEqual({
      deploymentMode: "dedicated",
      tenantId: "company-a",
      requireTenantId: false,
    });
  });

  it("requires tenant id for SaaS tenant-owned operations", () => {
    const context = resolveServerTenantContext({
      KONFI_DEPLOYMENT_MODE: "saas",
    });

    expect(context).toEqual({
      deploymentMode: "saas",
      tenantId: undefined,
      requireTenantId: true,
    });
    expect(() => requireTenantContextTenantId(context)).toThrow(
      "Missing tenantId for tenant-owned operation in saas deployment mode.",
    );
  });

  it("resolves explicit tenant id in SaaS deployments", () => {
    const context = resolveServerTenantContext(
      {
        KONFI_DEPLOYMENT_MODE: "saas",
      },
      "tenant-a",
    );

    expect(requireTenantContextTenantId(context)).toBe("tenant-a");
    const orderData = { name: "Order" };

    expect(withTenantId(orderData, context)).toEqual({
      name: "Order",
      tenantId: "tenant-a",
    });
  });

  it("mode-aware tenant ownership stamps only SaaS writes", () => {
    const dedicatedContext = resolveServerTenantContext({
      KONFI_DEPLOYMENT_MODE: "dedicated",
    });
    const saasContext = resolveServerTenantContext(
      {
        KONFI_DEPLOYMENT_MODE: "saas",
      },
      "tenant-a",
    );

    expect(shouldScopeByTenant(dedicatedContext)).toBe(false);
    expect(shouldScopeByTenant(saasContext)).toBe(true);
    expect(withTenantOwned({ name: "Order" }, dedicatedContext)).toEqual({
      name: "Order",
    });
    expect(withTenantOwned({ name: "Order" }, saasContext)).toEqual({
      name: "Order",
      tenantId: "tenant-a",
    });
  });

  it("mode-aware tenant ownership fails loudly when SaaS tenant id is missing", () => {
    const context = resolveServerTenantContext({
      KONFI_DEPLOYMENT_MODE: "saas",
    });

    expect(() => withTenantOwned({ name: "Order" }, context)).toThrow(
      "Missing tenantId for tenant-owned write in saas deployment mode.",
    );
  });

  it("treats missing document tenant ids as default only in dedicated mode", () => {
    const dedicatedContext = resolveServerTenantContext({
      KONFI_DEPLOYMENT_MODE: "dedicated",
    });
    const saasContext = resolveServerTenantContext({
      KONFI_DEPLOYMENT_MODE: "saas",
    });

    expect(resolveDocumentTenantId(dedicatedContext)).toBe(
      DEFAULT_DEDICATED_TENANT_ID,
    );
    expect(() => resolveDocumentTenantId(saasContext)).toThrow(
      "Missing tenantId",
    );
  });

  it("exposes only safe tenant runtime flags for client code", () => {
    expect(
      resolveClientTenantRuntimeFlags({
        NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE: "saas",
        NEXT_PUBLIC_KONFI_REQUIRE_TENANT_ID: "true",
        KONFI_TENANT_ID: "secret-tenant",
      }),
    ).toEqual({
      deploymentMode: "saas",
      requireTenantId: true,
    });
  });

  it("normalizes request hostnames for tenant domain lookup", () => {
    expect(normalizeTenantHostname("Tenant-A.Example.com:443")).toBe(
      "tenant-a.example.com",
    );
    expect(normalizeTenantHostname("https://Tenant-A.Example.com/app")).toBe(
      "tenant-a.example.com",
    );
    expect(normalizeTenantHostname("first.example.com, proxy.local")).toBe(
      "first.example.com",
    );
  });

  it("prefers forwarded host when resolving request tenant hostname", () => {
    const headers = {
      get: (name: string) =>
        name === "x-forwarded-host" ? "tenant.example.com" : "internal.local",
    };

    expect(resolveRequestTenantHostname(headers)).toBe("tenant.example.com");
  });
});
