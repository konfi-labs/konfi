import { StoreMcpAuthError, resolveStoreMcpAuthContext } from "@/lib/mcp/auth";
import { storeMcpDedicatedOnlyResponse } from "@/lib/mcp/dedicated-only";
import { storeMcpResourceUrl } from "@/lib/mcp/oauth";
import {
  createStoreMcpRuntime,
  handleStoreMcpStreamableHttpRequest,
} from "@/lib/mcp/protocol";
import {
  checkStoreMcpAuthenticatedRateLimit,
  checkStoreMcpRouteIpRateLimit,
} from "@/lib/mcp/rate-limit";
import { mcpOAuthRequestOrigin } from "@konfi/utils/server/mcp-oauth-core";

const ALLOWED_METHODS = "POST, OPTIONS";

function unauthorizedResponse(request: Request): Response {
  const metadataUrl = new URL(
    "/.well-known/oauth-protected-resource/mcp",
    mcpOAuthRequestOrigin(request),
  ).href;

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
        "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"`,
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
  const disabledResponse = await storeMcpDedicatedOnlyResponse({
    jsonRpc: true,
  });
  if (disabledResponse) {
    return disabledResponse;
  }

  const ipRateLimitResponse = checkStoreMcpRouteIpRateLimit(request);
  if (ipRateLimitResponse) {
    return ipRateLimitResponse;
  }

  let authContext;
  try {
    authContext = await resolveStoreMcpAuthContext(
      request.headers,
      storeMcpResourceUrl(request).href,
    );
  } catch (error) {
    if (error instanceof StoreMcpAuthError) {
      console.warn("[store-mcp] Unauthorized request", {
        pathname: new URL(request.url).pathname,
      });
      return unauthorizedResponse(request);
    }

    throw error;
  }

  const authenticatedRateLimitResponse =
    checkStoreMcpAuthenticatedRateLimit(authContext);
  if (authenticatedRateLimitResponse) {
    return authenticatedRateLimitResponse;
  }

  return handleStoreMcpStreamableHttpRequest(
    createStoreMcpRuntime(authContext),
    request,
  );
}

async function rejectStatefulMethod(request: Request): Promise<Response> {
  const disabledResponse = await storeMcpDedicatedOnlyResponse({
    jsonRpc: true,
  });
  if (disabledResponse) {
    return disabledResponse;
  }

  const ipRateLimitResponse = checkStoreMcpRouteIpRateLimit(request);
  if (ipRateLimitResponse) {
    return ipRateLimitResponse;
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
