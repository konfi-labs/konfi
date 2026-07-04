import "server-only";

import type { ExternalProviderEndpoint } from "@konfi/types";
import { fetchExternalProviderUrl } from "@/lib/external-products/provider-url-policy";
import {
  createWorkflowRuntimeDeadline,
  fetchWithinWorkflowRuntime,
  type WorkflowRuntimeDeadline,
  WorkflowRuntimeLimitError,
} from "@/lib/workflow-runtime-limit";
import crypto from "crypto";
import { FatalError, RetryableError } from "workflow";

type OpenApiSpec = {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, unknown>;
  servers?: Array<{
    url?: string;
    variables?: Record<string, { default?: string }>;
  }>;
};

type EndpointKind =
  | "pricing"
  | "spec"
  | "attribute"
  | "product"
  | "allProducts"
  | "other";

type DiscoveredEndpoint = ExternalProviderEndpoint & {
  kind: EndpointKind;
  priority: number;
};

const OPENAPI_CANDIDATE_PATHS = [
  "openapi.json",
  "swagger.json",
  "swagger/v1/swagger.json",
  "v3/api-docs",
  "api-docs",
  "docs/openapi.json",
  "docs/swagger.json",
  "api/openapi.json",
  "api/swagger.json",
  ".well-known/openapi.json",
];

const DISCOVERY_LIMIT = 20;

const PRODUCT_ID_PLACEHOLDER_GLOBAL =
  /\{(productId|id|product_id|sku|code)\}/gi;
const ANY_PLACEHOLDER_PATTERN = /\{[^}]+\}/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = ensureTrailingSlash(baseUrl);
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase).toString();
}

function buildOpenApiCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  return OPENAPI_CANDIDATE_PATHS.map(
    (path) => `${normalized}/${path.replace(/^\/+/, "")}`,
  );
}

async function fetchJsonValue(
  url: string,
  headers?: Record<string, string>,
  runtimeDeadline?: WorkflowRuntimeDeadline,
): Promise<unknown | null> {
  try {
    const response = await fetchExternalProviderUrl(
      url,
      {
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      },
      {
        fetchImpl: (input, init) =>
          fetchWithinWorkflowRuntime(
            runtimeDeadline,
            "fetching external provider discovery metadata",
            input,
            init,
          ),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new RetryableError("Rate limited while fetching OpenAPI", {
          retryAfter: "5m",
        });
      }

      if (response.status >= 500) {
        throw new RetryableError(
          `Upstream error while fetching OpenAPI (HTTP ${response.status})`,
          { retryAfter: "1m" },
        );
      }

      return null;
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  } catch (error) {
    console.error("Error fetching JSON:", error);
    if (error instanceof RetryableError) {
      throw error;
    }

    throw new RetryableError(
      error instanceof Error ? error.message : "Unknown error",
      { retryAfter: "1m" },
    );
  }
}

function looksLikeOpenApiSpec(value: unknown): value is OpenApiSpec {
  if (!isRecord(value)) {
    return false;
  }

  const hasVersion =
    typeof value.openapi === "string" || typeof value.swagger === "string";
  const pathsValue = value.paths;

  return hasVersion && isRecord(pathsValue);
}

function resolveServerUrl(
  rawUrl: string,
  variables?: Record<string, { default?: string }>,
): string {
  return rawUrl.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const fallback = variables?.[name]?.default;
    return typeof fallback === "string" ? fallback : "";
  });
}

function resolveOpenApiBaseUrl(
  spec: OpenApiSpec,
  fallbackBaseUrl: string,
): string {
  const server = spec.servers?.[0];
  const serverUrl = server?.url;

  if (!serverUrl) {
    return fallbackBaseUrl;
  }

  const resolvedServerUrl = resolveServerUrl(serverUrl, server.variables);
  if (
    resolvedServerUrl.startsWith("http://") ||
    resolvedServerUrl.startsWith("https://")
  ) {
    return resolvedServerUrl.replace(/\/+$/, "");
  }

  if (resolvedServerUrl.startsWith("/")) {
    try {
      const base = new URL(fallbackBaseUrl);
      return `${base.origin}${resolvedServerUrl}`.replace(/\/+$/, "");
    } catch {
      return fallbackBaseUrl;
    }
  }

  return `${fallbackBaseUrl.replace(/\/+$/, "")}/${resolvedServerUrl}`.replace(
    /\/+$/,
    "",
  );
}

function classifyEndpointPath(path: string): EndpointKind {
  const lower = path.toLowerCase();
  const hasProductPath = /\/products?\b/.test(lower);
  const hasPlaceholder = ANY_PLACEHOLDER_PATTERN.test(path);

  if (/(price|pricing|cost|quote)/.test(lower)) {
    return "pricing";
  }

  if (/(spec|specification|details|dimension|metadata)/.test(lower)) {
    return "spec";
  }

  if (
    /(attribute|attributes|option|options|variant|variants|config)/.test(lower)
  ) {
    return "attribute";
  }

  if (hasProductPath && hasPlaceholder) {
    return "product";
  }

  if (hasProductPath && !hasPlaceholder) {
    return "allProducts";
  }

  return "other";
}

function priorityForKind(kind: EndpointKind): number {
  switch (kind) {
    case "pricing":
      return 5;
    case "spec":
      return 4;
    case "attribute":
      return 3;
    case "product":
    case "allProducts":
      return 2;
    case "other":
    default:
      return 1;
  }
}

function normalizeProductIdPlaceholders(
  url: string,
  kind: EndpointKind,
): string {
  if (
    kind === "product" ||
    kind === "pricing" ||
    kind === "spec" ||
    kind === "attribute"
  ) {
    return url.replace(PRODUCT_ID_PLACEHOLDER_GLOBAL, "{productId}");
  }

  return url;
}

function createEndpointId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

function createDiscoveredEndpoint(
  baseUrl: string,
  path: string,
  name: string,
  description: string | undefined,
  sampleProductId?: string,
): DiscoveredEndpoint {
  const kind = classifyEndpointPath(path);
  const rawUrl = joinUrl(baseUrl, path);
  const normalizedUrl = normalizeProductIdPlaceholders(rawUrl, kind);
  const resolvedSampleUrl = sampleProductId
    ? resolveUrlWithSampleProductId(normalizedUrl, sampleProductId)
    : null;

  return {
    id: createEndpointId(),
    name: name.trim() || path,
    url: normalizedUrl,
    sampleUrl: resolvedSampleUrl || undefined,
    description: description?.trim() || undefined,
    kind,
    priority: priorityForKind(kind),
  };
}

function extractOpenApiEndpoints(
  spec: OpenApiSpec,
  baseUrl: string,
  sampleProductId?: string,
): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];
  const paths = spec.paths;

  if (!paths) {
    return endpoints;
  }

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      continue;
    }

    const getOperation = pathItem.get;
    if (!isRecord(getOperation)) {
      continue;
    }

    const summary =
      typeof getOperation.summary === "string" ? getOperation.summary : "";
    const operationId =
      typeof getOperation.operationId === "string"
        ? getOperation.operationId
        : "";
    const description =
      typeof getOperation.description === "string"
        ? getOperation.description
        : undefined;

    const name = summary || operationId || `GET ${path}`;
    endpoints.push(
      createDiscoveredEndpoint(
        baseUrl,
        path,
        name,
        description,
        sampleProductId,
      ),
    );
  }

  return endpoints;
}

function resolveUrlWithSampleProductId(
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

  if (!sampleProductId) {
    return null;
  }

  const resolvedUrl = trimmed.replace(
    PRODUCT_ID_PLACEHOLDER_GLOBAL,
    sampleProductId,
  );

  if (ANY_PLACEHOLDER_PATTERN.test(resolvedUrl)) {
    return null;
  }

  return resolvedUrl;
}

export type ProviderDiscoveryResult = {
  method: "openapi" | "none";
  endpoints?: ExternalProviderEndpoint[];
  allProductsEndpoint?: string;
  productEndpoint?: string;
  attributeAvailabilityEndpoint?: string;
};

export async function discoverProviderEndpointsStep({
  baseUrl,
  requestHeaders,
  sampleProductId,
  workflowStartedAtMs,
}: {
  baseUrl: string;
  requestHeaders: Record<string, string>;
  sampleProductId?: string;
  workflowStartedAtMs?: number;
}): Promise<ProviderDiscoveryResult> {
  "use step";

  try {
    const runtimeDeadline =
      typeof workflowStartedAtMs === "number"
        ? createWorkflowRuntimeDeadline(workflowStartedAtMs)
        : undefined;
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (!normalizedBaseUrl) {
      return { method: "none" };
    }

    const candidates = buildOpenApiCandidates(normalizedBaseUrl);
    let discovered: DiscoveredEndpoint[] = [];

    for (const candidateUrl of candidates) {
      const json = await fetchJsonValue(
        candidateUrl,
        requestHeaders,
        runtimeDeadline,
      );
      if (!json || !looksLikeOpenApiSpec(json)) {
        continue;
      }

      const resolvedBaseUrl = resolveOpenApiBaseUrl(json, normalizedBaseUrl);
      discovered = extractOpenApiEndpoints(
        json,
        resolvedBaseUrl,
        sampleProductId,
      );
      if (discovered.length > 0) {
        break;
      }
    }

    if (discovered.length === 0) {
      return { method: "none" };
    }

    const ranked = discovered
      .toSorted((a, b) => b.priority - a.priority || a.url.localeCompare(b.url))
      .slice(0, DISCOVERY_LIMIT);

    const allProductsEndpoint = ranked.find(
      (endpoint) => endpoint.kind === "allProducts",
    )?.url;
    const productEndpoint = ranked.find(
      (endpoint) => endpoint.kind === "product",
    )?.url;
    const attributeAvailabilityEndpoint = ranked.find(
      (endpoint) => endpoint.kind === "attribute",
    )?.url;

    const excludedUrls = new Set(
      [
        allProductsEndpoint,
        productEndpoint,
        attributeAvailabilityEndpoint,
      ].filter((value): value is string => Boolean(value)),
    );

    const endpoints = ranked
      .filter((endpoint) => !excludedUrls.has(endpoint.url))
      .map(({ kind: _kind, priority: _priority, ...endpoint }) => endpoint);

    return {
      method: "openapi",
      endpoints,
      allProductsEndpoint,
      productEndpoint,
      attributeAvailabilityEndpoint,
    };
  } catch (error) {
    if (error instanceof WorkflowRuntimeLimitError) {
      throw new FatalError(error.message);
    }

    throw error;
  }
}
