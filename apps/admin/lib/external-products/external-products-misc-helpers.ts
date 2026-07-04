import type { ExternalProduct, ExternalProvider } from "@konfi/types";
import { normalizeExtractedExternalPriceInfo } from "@/lib/external-products/normalize-extracted-price-info";
import crypto from "crypto";

/**
 * Generate content hash for change detection
 */
export function generateContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function extractStringId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

export function buildRequestHeadersFromProvider(
  provider?: ExternalProvider | null,
): Record<string, string> {
  let requestHeaders: Record<string, string> = {};

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

export function normalizeExternalProductPriceInfo<T extends { priceInfo?: unknown }>(
  product: T,
): Omit<T, "priceInfo"> & { priceInfo?: ExternalProduct["priceInfo"] } {
  return {
    ...product,
    priceInfo: normalizeExtractedExternalPriceInfo(product.priceInfo),
  };
}

export function toExternalProductListItem(
  product: ExternalProduct & { id: string },
): Omit<
  ExternalProduct & { id: string },
  "pendingPriceConfigurations" | "priceConfigurations"
> {
  const {
    pendingPriceConfigurations: _pendingPriceConfigurations,
    priceConfigurations: _priceConfigurations,
    ...listItem
  } = {
    ...product,
    pendingPriceConfigurationsCount:
      product.pendingPriceConfigurationsCount ??
      product.pendingPriceConfigurations?.length,
    priceConfigurationsCount:
      product.priceConfigurationsCount ?? product.priceConfigurations?.length,
  };

  return listItem;
}

