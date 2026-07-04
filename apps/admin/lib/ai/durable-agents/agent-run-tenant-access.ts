export type AgentRunData = Record<string, unknown>;

class AgentRunAccessError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AgentRunAccessError";
    this.statusCode = statusCode;
  }
}

export function assertAgentRunTenantAccess(
  data: AgentRunData,
  tenantScopeId: string | undefined,
): void {
  if (!tenantScopeId) {
    return;
  }

  if (data.tenantId !== tenantScopeId) {
    throw new AgentRunAccessError("Tenant agent run access is required", 403);
  }
}
