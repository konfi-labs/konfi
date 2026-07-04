import { oauthErrorResponse, revokeMcpOAuthToken } from "@/lib/ai/mcp/oauth";
import { checkMcpOAuthRateLimit } from "@/lib/ai/mcp/rate-limit";

export async function POST(request: Request): Promise<Response> {
  const rateLimitResponse = checkMcpOAuthRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    await revokeMcpOAuthToken(request);
    return new Response(null, { status: 200 });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
