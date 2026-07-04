import {
  READ_ONLY_TOOL_SCOPES,
  WRITE_TOOL_SCOPES,
  type ToolScope,
} from "../tool-layer/types";
import { TenantRole } from "@sblyvwx/cloud-contracts";

export const BASIC_MCP_SCOPES = [
  "user:context",
  "channels:read",
  "products:read",
  "pricing:explain",
] as const satisfies readonly ToolScope[];

export const ADMIN_MCP_SCOPES = [
  ...READ_ONLY_TOOL_SCOPES,
  "drafts:write",
] as const satisfies readonly ToolScope[];

export const SUPER_ADMIN_MCP_SCOPES = [
  ...READ_ONLY_TOOL_SCOPES,
  ...WRITE_TOOL_SCOPES,
] as const satisfies readonly ToolScope[];

export function parseCsv(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function isToolScope(value: string): value is ToolScope {
  return SUPER_ADMIN_MCP_SCOPES.includes(value as ToolScope);
}

export function readSupportedOAuthScopes(): ToolScope[] {
  return [...SUPER_ADMIN_MCP_SCOPES];
}

export function allowedMcpScopesForClaims(input: {
  accessLevel?: unknown;
  admin?: unknown;
  tenantAccessLevel?: unknown;
  tenantRole?: unknown;
}): ToolScope[] {
  if (input.admin !== true) {
    return [...BASIC_MCP_SCOPES];
  }

  if (
    input.accessLevel === 9999 ||
    input.tenantRole === TenantRole.OWNER ||
    input.tenantAccessLevel === 5000
  ) {
    return [...SUPER_ADMIN_MCP_SCOPES];
  }

  return [...ADMIN_MCP_SCOPES];
}

export function capMcpScopesToClaims(
  requestedScopes: readonly ToolScope[],
  claims: {
    accessLevel?: unknown;
    admin?: unknown;
    tenantAccessLevel?: unknown;
    tenantRole?: unknown;
  },
): ToolScope[] {
  const allowedScopes = new Set(allowedMcpScopesForClaims(claims));
  return requestedScopes.filter((scope) => allowedScopes.has(scope));
}
