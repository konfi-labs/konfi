import { storeMcpDedicatedOnlyResponse } from "@/lib/mcp/dedicated-only";
import {
  StoreMcpOAuthError,
  registerStoreMcpOAuthClient,
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
    const body = (await request.json()) as unknown;
    return Response.json(await registerStoreMcpOAuthClient(body), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return storeMcpOAuthErrorResponse(
        new StoreMcpOAuthError("invalid_client_metadata", "Invalid JSON body."),
      );
    }

    return storeMcpOAuthErrorResponse(error);
  }
}
