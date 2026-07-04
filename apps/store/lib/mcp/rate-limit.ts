import "server-only";

import type { StoreMcpAuthContext } from "./types";

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

type RateLimitResult = RateLimitAllowedResult | RateLimitDeniedResult;

const STORE_MCP_RATE_LIMIT_POLICIES = {
  authenticated: {
    limit: 3_000,
    name: "store-mcp-authenticated",
    windowMs: 10 * 60 * 1_000,
  },
  ip: {
    limit: 600,
    name: "store-mcp-ip",
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

function rateLimitHeaders(result: RateLimitDeniedResult): HeadersInit {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(Math.ceil(result.resetAtMs / 1_000)),
  };
}

function rateLimitResponse(result: RateLimitDeniedResult): Response {
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

export function checkStoreMcpRouteIpRateLimit(
  request: Request,
): Response | null {
  const result = consumeRateLimit({
    identifier: clientAddress(request.headers),
    policy: STORE_MCP_RATE_LIMIT_POLICIES.ip,
  });

  return result.allowed ? null : rateLimitResponse(result);
}

export function checkStoreMcpOAuthRateLimit(request: Request): Response | null {
  return checkStoreMcpRouteIpRateLimit(request);
}

export function checkStoreMcpAuthenticatedRateLimit(
  auth: StoreMcpAuthContext,
): Response | null {
  if (auth.actor.kind !== "customer") {
    return null;
  }

  const result = consumeRateLimit({
    identifier: auth.actor.uid,
    policy: STORE_MCP_RATE_LIMIT_POLICIES.authenticated,
  });

  return result.allowed ? null : rateLimitResponse(result);
}

export function resetStoreMcpRateLimitsForTests(): void {
  buckets.clear();
  nextCleanupAtMs = 0;
}

export const storeMcpRateLimitTestPolicies = STORE_MCP_RATE_LIMIT_POLICIES;
