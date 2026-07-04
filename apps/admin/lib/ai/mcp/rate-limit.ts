import "server-only";

import type { ToolAuthContext } from "../tool-layer";

interface RateLimitPolicy {
  limit: number;
  name: string;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

interface RateLimitAllowedResult {
  allowed: true;
  limit: number;
  remaining: number;
  resetAtMs: number;
}

interface RateLimitDeniedResult {
  allowed: false;
  limit: number;
  remaining: 0;
  resetAtMs: number;
  retryAfterSeconds: number;
}

export type RateLimitResult = RateLimitAllowedResult | RateLimitDeniedResult;

const RATE_LIMIT_POLICIES = {
  mcpAuthenticated: {
    limit: 3_000,
    name: "mcp-authenticated",
    windowMs: 10 * 60 * 1_000,
  },
  mcpIp: {
    limit: 600,
    name: "mcp-ip",
    windowMs: 60 * 1_000,
  },
  oauthIp: {
    limit: 120,
    name: "mcp-oauth-ip",
    windowMs: 60 * 1_000,
  },
} as const satisfies Record<string, RateLimitPolicy>;

const buckets = new Map<string, RateLimitBucket>();
let nextCleanupAtMs = 0;

function cleanupExpiredBuckets(nowMs: number): void {
  if (nowMs < nextCleanupAtMs) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAtMs <= nowMs) {
      buckets.delete(key);
    }
  }

  nextCleanupAtMs = nowMs + 60_000;
}

function consumeRateLimit(input: {
  identifier: string;
  nowMs?: number;
  policy: RateLimitPolicy;
}): RateLimitResult {
  const nowMs = input.nowMs ?? Date.now();
  cleanupExpiredBuckets(nowMs);

  const key = `${input.policy.name}:${input.identifier}`;
  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAtMs > nowMs
      ? existing
      : {
          count: 0,
          resetAtMs: nowMs + input.policy.windowMs,
        };

  if (bucket.count >= input.policy.limit) {
    buckets.set(key, bucket);
    return {
      allowed: false,
      limit: input.policy.limit,
      remaining: 0,
      resetAtMs: bucket.resetAtMs,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.resetAtMs - nowMs) / 1_000),
      ),
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: true,
    limit: input.policy.limit,
    remaining: Math.max(0, input.policy.limit - bucket.count),
    resetAtMs: bucket.resetAtMs,
  };
}

function clientAddress(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstAddress = forwardedFor.split(",")[0]?.trim();
    if (firstAddress) {
      return firstAddress;
    }
  }

  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "Retry-After": result.allowed ? "0" : String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAtMs / 1_000)),
  };
}

function mcpRateLimitResponse(result: RateLimitDeniedResult): Response {
  return Response.json(
    {
      error: {
        code: -32029,
        message: "Rate limit exceeded.",
      },
      id: null,
      jsonrpc: "2.0",
    },
    {
      headers: rateLimitHeaders(result),
      status: 429,
    },
  );
}

function oauthRateLimitResponse(result: RateLimitDeniedResult): Response {
  return Response.json(
    {
      error: "temporarily_unavailable",
      error_description: "Rate limit exceeded.",
    },
    {
      headers: rateLimitHeaders(result),
      status: 429,
    },
  );
}

export function checkMcpRouteIpRateLimit(request: Request): Response | null {
  const result = consumeRateLimit({
    identifier: clientAddress(request.headers),
    policy: RATE_LIMIT_POLICIES.mcpIp,
  });

  return result.allowed ? null : mcpRateLimitResponse(result);
}

export function checkMcpAuthenticatedRateLimit(
  auth: ToolAuthContext,
): Response | null {
  const tokenIdentifier = auth.token?.clientId ?? auth.token?.jti ?? "session";
  const result = consumeRateLimit({
    identifier: `${auth.actor.uid}:${tokenIdentifier}`,
    policy: RATE_LIMIT_POLICIES.mcpAuthenticated,
  });

  return result.allowed ? null : mcpRateLimitResponse(result);
}

export function checkMcpOAuthRateLimit(request: Request): Response | null {
  const result = consumeRateLimit({
    identifier: clientAddress(request.headers),
    policy: RATE_LIMIT_POLICIES.oauthIp,
  });

  return result.allowed ? null : oauthRateLimitResponse(result);
}

export function resetMcpRateLimitsForTests(): void {
  buckets.clear();
  nextCleanupAtMs = 0;
}

export const mcpRateLimitTestPolicies = RATE_LIMIT_POLICIES;
