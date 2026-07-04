import { storeMcpDedicatedOnlyResponse } from "@/lib/mcp/dedicated-only";
import { storeMcpAuthorizationServerMetadata } from "@/lib/mcp/oauth";

export async function GET(request: Request): Promise<Response> {
  const disabledResponse = await storeMcpDedicatedOnlyResponse();
  if (disabledResponse) {
    return disabledResponse;
  }

  return Response.json(storeMcpAuthorizationServerMetadata(request));
}
