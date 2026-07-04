import { storeMcpDedicatedOnlyResponse } from "@/lib/mcp/dedicated-only";
import {
  exchangeStoreMcpOAuthToken,
  storeMcpOAuthErrorResponse,
} from "@/lib/mcp/oauth";
import { checkStoreMcpOAuthRateLimit } from "@/lib/mcp/rate-limit";

export async function POST(request: Request): Promise<Response> {
  const disabledResponse = await storeMcpDedicatedOnlyResponse();
  if (disabledResponse) {
    return disabledResponse;
  }

  const rateLimitResponse = checkStoreMcpOAuthRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    return Response.json(await exchangeStoreMcpOAuthToken(request));
  } catch (error) {
    return storeMcpOAuthErrorResponse(error);
  }
}
