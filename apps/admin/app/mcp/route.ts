import { McpAuthError, resolveMcpAuthContext } from "@/lib/ai/mcp/auth";
import { handleMcpStreamableHttpRequest } from "@/lib/ai/mcp/protocol";
import { createMcpToolRuntime } from "@/lib/ai/mcp/runtime";
import {
  checkMcpAuthenticatedRateLimit,
  checkMcpRouteIpRateLimit,
} from "@/lib/ai/mcp/rate-limit";
import { mcpOAuthRequestOrigin } from "@konfi/utils/server/mcp-oauth-core";

const ALLOWED_METHODS = "POST, OPTIONS";

// Local verification:
// OAuth clients discover auth through the WWW-Authenticate protected resource
// metadata URL and complete authorization-code + PKCE against /mcp/oauth/*.

function protectedResourceMetadataUrl(request: Request): string {
  return new URL(
    "/.well-known/oauth-protected-resource/mcp",
    mcpOAuthRequestOrigin(request),
  ).href;
}

function mcpResourceUrl(request: Request): string {
  return new URL("/mcp", mcpOAuthRequestOrigin(request)).href;
}

function unauthorizedResponse(request: Request): Response {
  return Response.json(
    {
      error: {
        code: -32001,
        message: "Authentication failed.",
      },
      id: null,
      jsonrpc: "2.0",
    },
    {
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(
          request,
        )}"`,
      },
      status: 401,
    },
  );
}

function methodNotAllowedResponse(): Response {
  return Response.json(
    {
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
      jsonrpc: "2.0",
    },
    {
      headers: {
        Allow: ALLOWED_METHODS,
      },
      status: 405,
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  const ipRateLimitResponse = checkMcpRouteIpRateLimit(request);
  if (ipRateLimitResponse) {
    return ipRateLimitResponse;
  }

  let authContext;

  try {
    authContext = await resolveMcpAuthContext(
      request.headers,
      mcpResourceUrl(request),
    );
  } catch (error) {
    if (error instanceof McpAuthError) {
      console.warn("[mcp] Unauthorized request", {
        pathname: new URL(request.url).pathname,
      });
      return unauthorizedResponse(request);
    }

    throw error;
  }

  const authenticatedRateLimitResponse =
    checkMcpAuthenticatedRateLimit(authContext);
  if (authenticatedRateLimitResponse) {
    return authenticatedRateLimitResponse;
  }

  return handleMcpStreamableHttpRequest(
    createMcpToolRuntime(authContext),
    request,
  );
}

async function rejectStatefulMethod(request: Request): Promise<Response> {
  const ipRateLimitResponse = checkMcpRouteIpRateLimit(request);
  if (ipRateLimitResponse) {
    return ipRateLimitResponse;
  }

  try {
    const authContext = await resolveMcpAuthContext(
      request.headers,
      mcpResourceUrl(request),
    );
    const authenticatedRateLimitResponse =
      checkMcpAuthenticatedRateLimit(authContext);
    if (authenticatedRateLimitResponse) {
      return authenticatedRateLimitResponse;
    }
  } catch (error) {
    if (error instanceof McpAuthError) {
      return unauthorizedResponse(request);
    }

    throw error;
  }

  return methodNotAllowedResponse();
}

export const GET = rejectStatefulMethod;
export const DELETE = rejectStatefulMethod;

export function OPTIONS(): Response {
  return new Response(null, {
    headers: {
      Allow: ALLOWED_METHODS,
    },
    status: 204,
  });
}
