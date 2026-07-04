import "server-only";

import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";
import {
  OMIT_EXTERNAL_ATTRIBUTE_REQUEST_VALUE,
  isSyntheticExternalOptionValue,
} from "@/lib/external-products/option-mapping-utils";
import type {
  ExternalAttribute,
  ExternalProvider,
  ExternalProviderEndpoint,
} from "@konfi/types";

/**
 * URL / endpoint / selection helpers extracted from `price-fetch-system.ts`.
 *
 * Covers:
 * - `{productId}`-style placeholder detection and substitution
 * - endpoint key / comparison normalization
 * - building the ordered list of pricing endpoint candidates from a provider
 * - sanitizing AI-returned `PricingEndpointSelection` payloads against the
 *   allowed external attribute set
 *
 * These are pure helpers (no I/O, no AI calls) and are shared across the
 * price-fetch orchestration code paths.
 */

const PRODUCT_ID_PLACEHOLDER_PATTERN =
  /\{(productId|id|product_id|sku|code)\}/i;
const PRODUCT_ID_PLACEHOLDER_GLOBAL =
  /\{(productId|id|product_id|sku|code)\}/gi;
const ANY_PLACEHOLDER_PATTERN = /\{[^}]+\}/;

export type PricingEndpointSelection = {
  endpointId?: string;
  configurationParams?: Record<string, string>;
  staticQueryParams?: Record<string, string>;
  valueMappings?: Record<string, Record<string, string>>;
};

export type PricingEndpointCandidate = {
  endpoint: ExternalProviderEndpoint;
  sampleUrl?: string;
  queryParams: string[];
};

export function hasProductIdPlaceholder(value: string): boolean {
  return PRODUCT_ID_PLACEHOLDER_PATTERN.test(value);
}

function replaceProductIdPlaceholders(
  url: string,
  sampleProductId: string,
): { resolvedUrl: string; hasUnresolved: boolean } {
  const resolvedUrl = url.replace(
    PRODUCT_ID_PLACEHOLDER_GLOBAL,
    sampleProductId,
  );

  return {
    resolvedUrl,
    hasUnresolved: ANY_PLACEHOLDER_PATTERN.test(resolvedUrl),
  };
}

export function resolveUrlWithSampleProductId(
  url: string,
  sampleProductId?: string,
): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (!ANY_PLACEHOLDER_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (!sampleProductId || !hasProductIdPlaceholder(trimmed)) {
    return null;
  }

  const { resolvedUrl, hasUnresolved } = replaceProductIdPlaceholders(
    trimmed,
    sampleProductId,
  );

  if (hasUnresolved) {
    return null;
  }

  return resolvedUrl;
}

export function resolveUrlWithProductId(
  url: string,
  productId?: string,
): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (!ANY_PLACEHOLDER_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (!productId) {
    return null;
  }

  const { resolvedUrl, hasUnresolved } = replaceProductIdPlaceholders(
    trimmed,
    productId,
  );

  return hasUnresolved ? null : resolvedUrl;
}

function normalizeEndpointKey(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function normalizeSelectionKey(value: string): string {
  return stripWrappingQuotes(value).trim().toLowerCase();
}

function buildExternalAttributeNameMap(
  externalAttributes: ExternalAttribute[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const attr of externalAttributes) {
    const key = getExternalAttributeKey(attr);
    // Map both normalized name and id to the attribute key.
    // For duplicate names, the first one wins for the name entry,
    // but each id-based entry is always unique.
    if (!map.has(normalizeSelectionKey(attr.name))) {
      map.set(normalizeSelectionKey(attr.name), key);
    }
    if (attr.id) {
      map.set(normalizeSelectionKey(attr.id), key);
    }
  }
  return map;
}

export function sanitizePricingSelection(
  selection: PricingEndpointSelection,
  externalAttributes: ExternalAttribute[],
): PricingEndpointSelection {
  const attributeNameMap = buildExternalAttributeNameMap(externalAttributes);
  const attributeByKey = new Map<string, ExternalAttribute>();
  for (const attr of externalAttributes) {
    if (!attributeByKey.has(normalizeSelectionKey(attr.name))) {
      attributeByKey.set(normalizeSelectionKey(attr.name), attr);
    }
    attributeByKey.set(
      normalizeSelectionKey(getExternalAttributeKey(attr)),
      attr,
    );
  }

  const normalizeAttributeKey = (name: string): string | undefined => {
    const normalized = normalizeSelectionKey(name);
    return attributeNameMap.get(normalized);
  };

  const configurationParams: Record<string, string> = {};
  if (selection.configurationParams) {
    for (const [rawKey, rawValue] of Object.entries(
      selection.configurationParams,
    )) {
      const attributeKey = normalizeAttributeKey(rawKey);
      if (!attributeKey) continue;
      const paramName = stripWrappingQuotes(rawValue).trim();
      if (!paramName) continue;
      configurationParams[attributeKey] = paramName;
    }
  }

  const staticQueryParams: Record<string, string> = {};
  if (selection.staticQueryParams) {
    for (const [rawKey, rawValue] of Object.entries(
      selection.staticQueryParams,
    )) {
      const key = stripWrappingQuotes(rawKey).trim();
      const value = stripWrappingQuotes(rawValue).trim();
      if (!key || !value) continue;
      staticQueryParams[key] = value;
    }
  }

  const valueMappings: Record<string, Record<string, string>> = {};
  if (selection.valueMappings) {
    for (const [rawKey, rawValue] of Object.entries(selection.valueMappings)) {
      const attributeKey = normalizeAttributeKey(rawKey);
      if (!attributeKey) continue;
      const attribute = attributeByKey.get(normalizeSelectionKey(attributeKey));
      const allowedValues = new Set(attribute?.values ?? []);
      const mappedValues: Record<string, string> = {};
      for (const [rawFrom, rawTo] of Object.entries(rawValue)) {
        const from = stripWrappingQuotes(rawFrom).trim();
        const to = stripWrappingQuotes(rawTo).trim();
        if (!from || !to) continue;
        if (to === OMIT_EXTERNAL_ATTRIBUTE_REQUEST_VALUE) {
          mappedValues[from] = to;
          continue;
        }
        if (
          !isSyntheticExternalOptionValue(from) &&
          allowedValues.size > 0 &&
          !allowedValues.has(to)
        ) {
          continue;
        }
        mappedValues[from] = to;
      }
      if (Object.keys(mappedValues).length > 0) {
        valueMappings[attributeKey] = mappedValues;
      }
    }
  }

  const endpointId = selection.endpointId
    ? stripWrappingQuotes(selection.endpointId).trim()
    : undefined;

  return {
    endpointId: endpointId || undefined,
    configurationParams:
      Object.keys(configurationParams).length > 0
        ? configurationParams
        : undefined,
    staticQueryParams:
      Object.keys(staticQueryParams).length > 0 ? staticQueryParams : undefined,
    valueMappings:
      Object.keys(valueMappings).length > 0 ? valueMappings : undefined,
  };
}

function normalizeEndpointComparisonKey(
  url: string,
  sampleProductId?: string,
): string {
  const base = url.split("?")[0]?.trim().replace(/\/+$/, "") ?? "";
  if (!sampleProductId) {
    return base.toLowerCase();
  }
  return base.split(sampleProductId).join("{productId}").toLowerCase();
}

export function resolveTemplateEndpointCandidate(options: {
  candidates: ExternalProviderEndpoint[];
  selectedEndpoint: ExternalProviderEndpoint;
  sampleProductId?: string;
}): ExternalProviderEndpoint {
  const { candidates, selectedEndpoint, sampleProductId } = options;
  if (!sampleProductId) return selectedEndpoint;

  if (hasProductIdPlaceholder(selectedEndpoint.url)) {
    return selectedEndpoint;
  }

  const selectedKey = normalizeEndpointComparisonKey(
    selectedEndpoint.url,
    sampleProductId,
  );

  const templateMatch = candidates.find((candidate) => {
    if (!hasProductIdPlaceholder(candidate.url)) return false;
    const candidateKey = normalizeEndpointComparisonKey(
      candidate.url,
      sampleProductId,
    );
    return candidateKey === selectedKey;
  });

  return templateMatch ?? selectedEndpoint;
}

export function extractQueryParamNames(url?: string): string[] {
  if (!url) return [];
  try {
    const parsed = new URL(url);
    return Array.from(parsed.searchParams.keys());
  } catch {
    return [];
  }
}

export function buildPricingEndpointCandidates(
  provider: ExternalProvider,
): ExternalProviderEndpoint[] {
  const candidates: ExternalProviderEndpoint[] = [];
  const seen = new Set<string>();

  const pushEndpoint = (endpoint?: ExternalProviderEndpoint) => {
    if (!endpoint) return;
    const key = normalizeEndpointKey(endpoint.url);
    if (seen.has(key)) return;
    candidates.push(endpoint);
    seen.add(key);
  };

  if (provider.productEndpoint) {
    pushEndpoint({
      id: "productEndpoint",
      name: "Product",
      url: provider.productEndpoint,
      description: "Primary product endpoint",
    });
  }

  if (provider.attributeAvailabilityEndpoint) {
    pushEndpoint({
      id: "attributeAvailability",
      name: "Attributes",
      url: provider.attributeAvailabilityEndpoint,
      description: "Attribute availability endpoint",
    });
  }

  if (provider.allProductsEndpoint) {
    pushEndpoint({
      id: "allProductsEndpoint",
      name: "All products",
      url: provider.allProductsEndpoint,
      description: "All products endpoint",
    });
  }

  for (const endpoint of provider.endpoints ?? []) {
    pushEndpoint(endpoint);
  }

  return candidates;
}
