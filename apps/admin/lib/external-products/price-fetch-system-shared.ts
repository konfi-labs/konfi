import "server-only";

import type { ExternalProvider } from "@konfi/types";
import { revalidateTag } from "next/cache";
import { z } from "zod";

/**
 * Cross-cutting helpers extracted from `price-fetch-system.ts`:
 * - Cache-tag revalidation
 * - JSON truncation for AI prompts
 * - Pricing-combination rule zod schema
 * - Browser-flavored request-header builder (sets default
 *   `Accept` / `Accept-Language` / `User-Agent` so price-fetch HTTP calls
 *   look like a real browser request; distinct from the no-defaults
 *   `buildRequestHeadersFromProvider` in
 *   `external-products-misc-helpers.ts`)
 *
 * Firestore handle, Vertex AI clients, and the gated `removeUndefinedDeep`
 * are re-exported from `external-products-firestore-helpers.ts` so callers
 * see a single canonical implementation.
 */

export {
  getDb,
  getVertexHighPrecisionModel,
  getVertexModel,
  removeUndefinedDeep,
} from "./external-products-firestore-helpers";

const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export function revalidateCachedTag(tag: string) {
  revalidateTag(tag, "max");
}

export function truncateJsonForPrompt(
  value: unknown,
  maxLength: number = 20_000,
): string {
  const serialized = JSON.stringify(value, null, 2);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}\n... [truncated ${serialized.length - maxLength} characters]`;
}

export function buildPricingCombinationRuleSchema() {
  return z.object({
    when: z.record(z.string(), z.string()).optional(),
    omitAttributes: z.array(z.string()).optional(),
    requiredAttributes: z.array(z.string()).optional(),
    allowedValues: z.record(z.string(), z.array(z.string())).optional(),
    reason: z.string().optional(),
  });
}

export function buildBrowserishRequestHeadersFromProvider(
  provider?: ExternalProvider | null,
): Record<string, string> {
  let requestHeaders: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "User-Agent": DEFAULT_BROWSER_USER_AGENT,
  };

  if (provider?.auth && provider.auth.type !== "none") {
    if (provider.auth.type === "bearer") {
      requestHeaders["Authorization"] = `Bearer ${provider.auth.tokenValue}`;
    } else if (provider.auth.headerName) {
      requestHeaders[provider.auth.headerName] = provider.auth.tokenValue || "";
    }
  }

  if (provider?.headers) {
    requestHeaders = { ...requestHeaders, ...provider.headers };
  }

  return requestHeaders;
}
