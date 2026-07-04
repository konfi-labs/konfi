import {
  authorizeMcpOAuthRequest,
  isMcpOAuthConsentTokenValid,
  oauthErrorResponse,
} from "@/lib/ai/mcp/oauth";
import { checkMcpOAuthRateLimit } from "@/lib/ai/mcp/rate-limit";
import { mcpOAuthRequestOrigin } from "@konfi/utils/server/mcp-oauth-core";

export async function GET(request: Request): Promise<Response> {
  const rateLimitResponse = checkMcpOAuthRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    return await authorizeMcpOAuthRequest(request);
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function hasSameOrigin(request: Request): boolean {
  const requestOrigin = mcpOAuthRequestOrigin(request);

  // In development, the consent page is served with Referrer-Policy: no-referrer
  // which suppresses the Referer header on form submit, and some browsers also
  // omit Origin for same-origin form POSTs. Skip the CSRF check for loopback
  // hosts in development where there is no real cross-site threat.
  if (process.env.NODE_ENV !== "production") {
    try {
      const requestUrl = new URL(requestOrigin);
      if (isLoopback(requestUrl.hostname)) {
        return true;
      }
    } catch {
      // fall through to header-based check
    }
  }

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
  const rateLimitResponse = checkMcpOAuthRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.text();
    const params = new URLSearchParams(body);

    if (
      !hasSameOrigin(request) &&
      !isMcpOAuthConsentTokenValid(request, params)
    ) {
      return Response.json(
        {
          error: "invalid_request",
          error_description:
            "OAuth consent must be submitted from the admin origin.",
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

    return await authorizeMcpOAuthRequest(request, {
      consentConfirmed,
      params,
    });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
