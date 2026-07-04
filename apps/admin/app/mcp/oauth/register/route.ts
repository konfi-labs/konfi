import {
  McpOAuthError,
  oauthErrorResponse,
  registerMcpOAuthClient,
} from "@/lib/ai/mcp/oauth";
import { checkMcpOAuthRateLimit } from "@/lib/ai/mcp/rate-limit";

export async function POST(request: Request): Promise<Response> {
  const rateLimitResponse = checkMcpOAuthRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = (await request.json()) as unknown;
    return Response.json(await registerMcpOAuthClient(body), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return oauthErrorResponse(
        new McpOAuthError("invalid_client_metadata", "Invalid JSON body."),
      );
    }

    return oauthErrorResponse(error);
  }
}
