import { exchangeMcpOAuthToken, oauthErrorResponse } from "@/lib/ai/mcp/oauth";
import { checkMcpOAuthRateLimit } from "@/lib/ai/mcp/rate-limit";

export async function POST(request: Request): Promise<Response> {
  const rateLimitResponse = checkMcpOAuthRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    return Response.json(await exchangeMcpOAuthToken(request));
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
