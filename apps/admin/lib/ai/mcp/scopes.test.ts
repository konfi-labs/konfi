import { describe, expect, it } from "vitest";
import {
  allowedMcpScopesForClaims,
  capMcpScopesToClaims,
  readSupportedOAuthScopes,
} from "./scopes";
import { TenantRole } from "@sblyvwx/cloud-contracts";

describe("MCP scopes", () => {
  it("lets normal admins request quote and order draft creation", () => {
    const scopes = allowedMcpScopesForClaims({ admin: true });

    expect(scopes).toContain("drafts:write");
    expect(scopes).toContain("orders:read");
    expect(scopes).not.toContain("business:write");
    expect(scopes).not.toContain("products:write");
  });

  it("caps requested write scopes for normal admins to draft writes", () => {
    expect(
      capMcpScopesToClaims(["drafts:write", "business:write"], {
        admin: true,
      }),
    ).toEqual(["drafts:write"]);
  });

  it("lets SaaS tenant owners request tenant write scopes", () => {
    const scopes = allowedMcpScopesForClaims({
      admin: true,
      tenantRole: TenantRole.OWNER,
    });

    expect(scopes).toContain("products:write");
    expect(scopes).toContain("business:write");
  });

  it("advertises super-admin business update scopes", () => {
    expect(readSupportedOAuthScopes()).toContain("drafts:write");
    expect(readSupportedOAuthScopes()).toContain("business:write");
  });
});
