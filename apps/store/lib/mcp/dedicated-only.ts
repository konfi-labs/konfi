import "server-only";

import { getTenantContextForRequest } from "@/lib/firebase/serverApp";

const STORE_MCP_DEDICATED_ONLY_MESSAGE =
  "Store MCP is available only for dedicated store deployments.";

export async function storeMcpDedicatedOnlyResponse(options?: {
  jsonRpc?: boolean;
}): Promise<Response | null> {
  const tenantContext = await getTenantContextForRequest();

  if (
    tenantContext.deploymentMode !== "saas" &&
    !tenantContext.requireTenantId
  ) {
    return null;
  }

  if (options?.jsonRpc) {
    return Response.json(
      {
        error: {
          code: -32000,
          message: STORE_MCP_DEDICATED_ONLY_MESSAGE,
        },
        id: null,
        jsonrpc: "2.0",
      },
      { status: 404 },
    );
  }

  return Response.json(
    {
      error: "not_found",
      error_description: STORE_MCP_DEDICATED_ONLY_MESSAGE,
    },
    { status: 404 },
  );
}
