import { PermanentProviderError, RetryableProviderError } from "./types";

export interface MetaClientConfig {
  graphApiVersion: string;
}

interface GraphApiErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
}

// Graph API error codes that indicate rate-limiting or transient server issues.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

// Graph API error code for invalid / expired token.
const EXPIRED_TOKEN_CODE = 190;

function classifyGraphError(
  status: number,
  body: GraphApiErrorBody,
): never {
  const code = body?.error?.code;
  const message =
    body?.error?.message ?? `Graph API returned HTTP ${status}`;

  // HTTP 429 or 5xx → transient
  if (status === 429 || status >= 500) {
    throw new RetryableProviderError(message);
  }

  if (typeof code === "number") {
    if (code === EXPIRED_TOKEN_CODE) {
      throw new PermanentProviderError(message, { tokenExpired: true });
    }
    if (RATE_LIMIT_CODES.has(code)) {
      throw new RetryableProviderError(message);
    }
  }

  // All other 4xx → permanent
  throw new PermanentProviderError(message);
}

/**
 * Thin fetch wrapper for https://graph.facebook.com.
 * On non-OK responses, parses the Graph error envelope and throws
 * either RetryableProviderError or PermanentProviderError.
 */
export async function metaGraphFetch<T = unknown>({
  graphApiVersion,
  path,
  method = "GET",
  accessToken,
  params,
  body,
}: {
  graphApiVersion: string;
  path: string;
  method?: string;
  accessToken: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<T> {
  const url = new URL(
    `https://graph.facebook.com/${graphApiVersion}/${path.replace(/^\//, "")}`,
  );

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  if (body) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), init);

  if (!res.ok) {
    let parsed: GraphApiErrorBody = {};
    try {
      parsed = (await res.json()) as GraphApiErrorBody;
    } catch {
      // ignore parse failure — classifyGraphError handles missing fields
    }
    classifyGraphError(res.status, parsed);
  }

  return res.json() as Promise<T>;
}
