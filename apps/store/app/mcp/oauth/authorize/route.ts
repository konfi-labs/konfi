import { storeMcpDedicatedOnlyResponse } from "@/lib/mcp/dedicated-only";
import {
  authorizeStoreMcpOAuthRequest,
  isStoreMcpOAuthConsentTokenValid,
  storeMcpOAuthErrorResponse,
} from "@/lib/mcp/oauth";
import { checkStoreMcpOAuthRateLimit } from "@/lib/mcp/rate-limit";
import { mcpOAuthRequestOrigin } from "@konfi/utils/server/mcp-oauth-core";

export async function GET(request: Request): Promise<Response> {
  const disabledResponse = await storeMcpDedicatedOnlyResponse();
  if (disabledResponse) {
    return disabledResponse;
  }

  const rateLimitResponse = checkStoreMcpOAuthRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    return await authorizeStoreMcpOAuthRequest(request);
  } catch (error) {
    return storeMcpOAuthErrorResponse(error);
  }
}

function hasSameOrigin(request: Request): boolean {
  const requestOrigin = mcpOAuthRequestOrigin(request);
  const source =
    request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) {
    return false;
  }

  try {
    return new URL(source).origin === requestOrigin;
  } catch {
    return source === requestOrigin;
  }
}

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
    const body = await request.text();
    const params = new URLSearchParams(body);

    if (
      !hasSameOrigin(request) &&
      !isStoreMcpOAuthConsentTokenValid(request, params)
    ) {
      return Response.json(
        {
          error: "invalid_request",
          error_description:
            "OAuth consent must be submitted from the store origin.",
        },
        { status: 403 },
      );
    }

    const consentConfirmed = params.get("mcp_oauth_consent") === "allow";

    if (!consentConfirmed) {
      return Response.json(
        {
          error: "access_denied",
          error_description: "OAuth authorization was not confirmed.",
        },
        { status: 400 },
      );
    }

    return await authorizeStoreMcpOAuthRequest(request, {
      consentConfirmed,
      params,
    });
  } catch (error) {
    return storeMcpOAuthErrorResponse(error);
  }
}
