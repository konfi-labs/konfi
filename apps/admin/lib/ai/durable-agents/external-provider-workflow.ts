import "server-only";

import type {
  ExternalProviderEndpoint,
  SaveExternalProviderRequest,
} from "@konfi/types";
import {
  assertWithinWorkflowRuntime,
  createWorkflowRuntimeDeadline,
  runWithinWorkflowRuntime,
  WorkflowRuntimeLimitError,
} from "@/lib/workflow-runtime-limit";
import {
  detectAttributePayloadStep,
  discoverProviderEndpointsStep,
  fetchEndpointJsonStep,
  generateSchemaFromResponseStep,
  updateExternalProviderStep,
  type ExternalProviderSchemaDrafts,
} from "@/lib/ai/durable-agents/external-provider-steps";
import { FatalError } from "workflow";

type ProviderInput = SaveExternalProviderRequest["provider"];

type ExternalProviderWorkflowInput = {
  providerId: string;
  provider: ProviderInput;
  workflowStartedAtMs?: number;
};

const PRODUCT_ID_PLACEHOLDER_PATTERN =
  /\{(productId|id|product_id|sku|code)\}/i;
const PRODUCT_ID_PLACEHOLDER_GLOBAL =
  /\{(productId|id|product_id|sku|code)\}/gi;
const ANY_PLACEHOLDER_PATTERN = /\{[^}]+\}/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractStringId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function extractIdFromRecord(
  record: Record<string, unknown>,
): string | undefined {
  return (
    extractStringId(record.id) ||
    extractStringId(record.productId) ||
    extractStringId(record.sku) ||
    extractStringId(record.code)
  );
}

function extractFirstItem(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data[0];
  }

  if (isRecord(data)) {
    const listKeys = ["products", "items", "data", "results"];
    for (const key of listKeys) {
      const value = data[key];
      if (Array.isArray(value)) {
        return value[0];
      }
      if (isRecord(value)) {
        const nested = value.items ?? value.data ?? value.results;
        if (Array.isArray(nested)) {
          return nested[0];
        }
      }
    }
  }

  return undefined;
}

function extractSampleProductId(data: unknown): string | undefined {
  const firstItem = extractFirstItem(data);
  if (isRecord(firstItem)) {
    return extractIdFromRecord(firstItem);
  }

  if (isRecord(data)) {
    return extractIdFromRecord(data);
  }

  return undefined;
}

function hasProductIdPlaceholder(value: string): boolean {
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

function resolveEndpointUrl(
  endpoint: ExternalProviderEndpoint,
  sampleProductId?: string,
): string | null {
  const sampleUrl = endpoint.sampleUrl?.trim();
  if (sampleUrl) {
    return sampleUrl;
  }

  return resolveUrlWithSampleProductId(endpoint.url, sampleProductId);
}

function normalizeEndpointKey(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

function buildAttributeScanEndpoints(
  resolvedProvider: ProviderInput,
  attributeAvailabilityCandidate?: ExternalProviderEndpoint,
): ExternalProviderEndpoint[] {
  const endpoints: ExternalProviderEndpoint[] = [];
  const seen = new Set<string>();

  const pushEndpoint = (endpoint: ExternalProviderEndpoint | undefined) => {
    if (!endpoint) {
      return;
    }
    const key = normalizeEndpointKey(endpoint.url);
    if (seen.has(key)) {
      return;
    }
    endpoints.push(endpoint);
    seen.add(key);
  };

  pushEndpoint(attributeAvailabilityCandidate);

  if (resolvedProvider.attributeAvailabilityEndpoint) {
    pushEndpoint({
      id: "attributeAvailability",
      name: "Attributes",
      url: resolvedProvider.attributeAvailabilityEndpoint,
    });
  }

  if (resolvedProvider.productEndpoint) {
    pushEndpoint({
      id: "productEndpoint",
      name: "Product",
      url: resolvedProvider.productEndpoint,
    });
  }

  if (resolvedProvider.allProductsEndpoint) {
    pushEndpoint({
      id: "allProductsEndpoint",
      name: "All products",
      url: resolvedProvider.allProductsEndpoint,
    });
  }

  for (const endpoint of resolvedProvider.endpoints ?? []) {
    pushEndpoint(endpoint);
  }

  return endpoints;
}

function mergeDiscoveredEndpoints(
  existing: ExternalProviderEndpoint[] | undefined,
  discovered: ExternalProviderEndpoint[] | undefined,
): ExternalProviderEndpoint[] | undefined {
  if (!existing?.length && !discovered?.length) {
    return existing;
  }

  const merged = [...(existing ?? [])];
  const seen = new Set(
    merged.map((endpoint) => normalizeEndpointKey(endpoint.url)),
  );

  for (const endpoint of discovered ?? []) {
    const key = normalizeEndpointKey(endpoint.url);
    if (seen.has(key)) {
      continue;
    }

    merged.push(endpoint);
    seen.add(key);
  }

  return merged;
}

function buildRequestHeaders(provider: ProviderInput): Record<string, string> {
  let requestHeaders: Record<string, string> = {};

  if (provider.auth && provider.auth.type !== "none") {
    if (provider.auth.type === "bearer") {
      requestHeaders["Authorization"] = `Bearer ${provider.auth.tokenValue}`;
    } else if (provider.auth.type === "api-key" && provider.auth.headerName) {
      requestHeaders[provider.auth.headerName] = provider.auth.tokenValue || "";
    } else if (provider.auth.type === "custom" && provider.auth.headerName) {
      requestHeaders[provider.auth.headerName] = provider.auth.tokenValue || "";
    }
  }

  if (provider.headers) {
    requestHeaders = { ...requestHeaders, ...provider.headers };
  }

  return requestHeaders;
}

function normalizeProvider(provider: ProviderInput): ProviderInput {
  const baseUrl = provider.baseUrl?.trim();
  const allProductsEndpoint = provider.allProductsEndpoint?.trim();
  const productEndpoint = provider.productEndpoint?.trim();
  const attributeAvailabilityEndpoint =
    provider.attributeAvailabilityEndpoint?.trim();
  const sampleProductId = provider.sampleProductId?.trim();
  const endpoints = provider.endpoints?.map((endpoint) => ({
    ...endpoint,
    name: endpoint.name.trim(),
    url: endpoint.url.trim(),
    sampleUrl: endpoint.sampleUrl?.trim() || undefined,
    description: endpoint.description?.trim() || undefined,
  }));

  return {
    ...provider,
    baseUrl: baseUrl || undefined,
    allProductsEndpoint: allProductsEndpoint || undefined,
    productEndpoint: productEndpoint || undefined,
    attributeAvailabilityEndpoint: attributeAvailabilityEndpoint || undefined,
    sampleProductId: sampleProductId || undefined,
    endpoints: endpoints?.length ? endpoints : undefined,
  };
}

function shouldLogEndpointError(status?: number): boolean {
  if (!status) {
    return true;
  }

  return status !== 404;
}

export async function processExternalProviderWorkflow(
  input: ExternalProviderWorkflowInput,
) {
  "use workflow";

  const runtimeDeadline = createWorkflowRuntimeDeadline(
    input.workflowStartedAtMs,
  );
  const workflowStartedAtMs = runtimeDeadline.startedAtMs;

  try {
    const { providerId } = input;
    const normalizedProvider = normalizeProvider(input.provider);
    const requestHeaders = buildRequestHeaders(normalizedProvider);
    const attributeEndpointCandidate =
      normalizedProvider.attributeAvailabilityEndpoint
        ? {
            id: "attributeAvailability",
            name: "Attributes",
            url: normalizedProvider.attributeAvailabilityEndpoint,
          }
        : undefined;

    const providerBaseUrl = normalizedProvider.baseUrl;
    const discovery = providerBaseUrl
      ? await runWithinWorkflowRuntime(
          runtimeDeadline,
          "discovering external provider endpoints",
          () =>
            discoverProviderEndpointsStep({
              baseUrl: providerBaseUrl,
              requestHeaders,
              sampleProductId: normalizedProvider.sampleProductId,
              workflowStartedAtMs,
            }),
        )
      : { method: "none" as const };

    const allowDiscovery = discovery.method === "openapi";

    const resolvedProvider: ProviderInput = {
      ...normalizedProvider,
      allProductsEndpoint:
        normalizedProvider.allProductsEndpoint ??
        (allowDiscovery ? discovery.allProductsEndpoint : undefined),
      productEndpoint:
        normalizedProvider.productEndpoint ??
        (allowDiscovery ? discovery.productEndpoint : undefined),
      attributeAvailabilityEndpoint:
        normalizedProvider.attributeAvailabilityEndpoint ??
        (allowDiscovery ? discovery.attributeAvailabilityEndpoint : undefined),
      endpoints: mergeDiscoveredEndpoints(
        normalizedProvider.endpoints,
        allowDiscovery ? discovery.endpoints : undefined,
      ),
    };

    const explicitSchemaTargets = Boolean(
      normalizedProvider.allProductsEndpoint ||
      normalizedProvider.productEndpoint ||
      normalizedProvider.attributeAvailabilityEndpoint ||
      normalizedProvider.endpoints?.length,
    );

    const allowSchemaGeneration = explicitSchemaTargets || allowDiscovery;
    let sampleProductId = normalizedProvider.sampleProductId;

    const schemas: ExternalProviderSchemaDrafts = {};

    const allProductsEndpoint = resolvedProvider.allProductsEndpoint;

    if (allowSchemaGeneration && allProductsEndpoint) {
      assertWithinWorkflowRuntime(
        runtimeDeadline,
        "fetching the provider all-products schema source",
      );
      const fetchResult = await runWithinWorkflowRuntime(
        runtimeDeadline,
        "fetching the provider all-products schema source",
        () =>
          fetchEndpointJsonStep({
            url: allProductsEndpoint,
            headers: requestHeaders,
            workflowStartedAtMs,
          }),
      );

      if (fetchResult.success && fetchResult.data) {
        const schema = await runWithinWorkflowRuntime(
          runtimeDeadline,
          "generating the provider all-products schema",
          () =>
            generateSchemaFromResponseStep({
              response: fetchResult.data,
              options: { type: "allProducts" },
            }),
        );

        if (schema) {
          schemas.allProductsSchema = schema;
        }

        if (!sampleProductId) {
          sampleProductId = extractSampleProductId(fetchResult.data);
        }
      } else if (shouldLogEndpointError(fetchResult.status)) {
        console.warn(
          `External provider workflow: failed to fetch allProductsEndpoint (${fetchResult.error})`,
        );
      }
    }

    if (allowSchemaGeneration && resolvedProvider.productEndpoint) {
      const productEndpointUrl = resolveUrlWithSampleProductId(
        resolvedProvider.productEndpoint,
        sampleProductId,
      );

      if (productEndpointUrl) {
        assertWithinWorkflowRuntime(
          runtimeDeadline,
          "fetching the provider product schema source",
        );
        const fetchResult = await runWithinWorkflowRuntime(
          runtimeDeadline,
          "fetching the provider product schema source",
          () =>
            fetchEndpointJsonStep({
              url: productEndpointUrl,
              headers: requestHeaders,
              workflowStartedAtMs,
            }),
        );

        if (fetchResult.success && fetchResult.data) {
          const schema = await runWithinWorkflowRuntime(
            runtimeDeadline,
            "generating the provider product schema",
            () =>
              generateSchemaFromResponseStep({
                response: fetchResult.data,
                options: { type: "product" },
              }),
          );

          if (schema) {
            schemas.productSchema = schema;
          }
        } else if (shouldLogEndpointError(fetchResult.status)) {
          console.warn(
            `External provider workflow: failed to fetch productEndpoint (${fetchResult.error})`,
          );
        }
      }
    }

    let detectedAttributeEndpoint: ExternalProviderEndpoint | undefined;
    const attributeScanEndpoints = buildAttributeScanEndpoints(
      resolvedProvider,
      attributeEndpointCandidate,
    );

    if (allowSchemaGeneration && attributeScanEndpoints.length > 0) {
      for (const endpoint of attributeScanEndpoints) {
        assertWithinWorkflowRuntime(
          runtimeDeadline,
          "scanning attribute endpoints for provider schemas",
        );
        const resolvedUrl = resolveEndpointUrl(endpoint, sampleProductId);
        if (!resolvedUrl) {
          continue;
        }

        const fetchResult = await runWithinWorkflowRuntime(
          runtimeDeadline,
          "fetching provider attribute endpoint data",
          () =>
            fetchEndpointJsonStep({
              url: resolvedUrl,
              headers: requestHeaders,
              workflowStartedAtMs,
            }),
        );

        if (fetchResult.success && fetchResult.data) {
          const detection = await runWithinWorkflowRuntime(
            runtimeDeadline,
            "detecting attribute payloads in provider responses",
            () =>
              detectAttributePayloadStep({
                response: fetchResult.data,
                options: {
                  endpointName: endpoint.name,
                  endpointUrl: endpoint.url,
                },
              }),
          );

          if (!detection.hasAttributes) {
            continue;
          }

          const schema = await runWithinWorkflowRuntime(
            runtimeDeadline,
            "generating the provider attribute-availability schema",
            () =>
              generateSchemaFromResponseStep({
                response: fetchResult.data,
                options: { type: "attributeAvailability" },
              }),
          );

          if (schema) {
            schemas.attributeAvailabilitySchema = schema;
            detectedAttributeEndpoint = endpoint;
            break;
          }
        } else if (shouldLogEndpointError(fetchResult.status)) {
          console.warn(
            `External provider workflow: failed to fetch attribute endpoint ${endpoint.name} (${fetchResult.error})`,
          );
        }
      }
    }

    let updatedEndpoints: ExternalProviderEndpoint[] | undefined;
    const endpointList = resolvedProvider.endpoints ?? [];

    if (allowSchemaGeneration && endpointList.length > 0) {
      const userEndpointKeys = new Set(
        (normalizedProvider.endpoints ?? []).map((endpoint) =>
          normalizeEndpointKey(endpoint.url),
        ),
      );

      updatedEndpoints = [];

      for (const endpoint of endpointList) {
        assertWithinWorkflowRuntime(
          runtimeDeadline,
          "processing provider custom endpoints",
        );
        const baseEndpoint: ExternalProviderEndpoint = {
          ...endpoint,
          name: endpoint.name.trim(),
          url: endpoint.url.trim(),
          sampleUrl: endpoint.sampleUrl?.trim() || undefined,
          description: endpoint.description?.trim() || undefined,
        };

        const shouldGenerateEndpointSchema =
          allowDiscovery ||
          userEndpointKeys.has(normalizeEndpointKey(baseEndpoint.url));

        if (!shouldGenerateEndpointSchema) {
          updatedEndpoints.push(baseEndpoint);
          continue;
        }

        const resolvedUrl = resolveEndpointUrl(baseEndpoint, sampleProductId);
        if (!resolvedUrl) {
          updatedEndpoints.push(baseEndpoint);
          continue;
        }

        const fetchResult = await runWithinWorkflowRuntime(
          runtimeDeadline,
          "fetching provider custom endpoint data",
          () =>
            fetchEndpointJsonStep({
              url: resolvedUrl,
              headers: requestHeaders,
              workflowStartedAtMs,
            }),
        );

        if (fetchResult.success && fetchResult.data) {
          const schema = await runWithinWorkflowRuntime(
            runtimeDeadline,
            `generating schema for provider endpoint ${baseEndpoint.name}`,
            () =>
              generateSchemaFromResponseStep({
                response: fetchResult.data,
                options: {
                  type: "custom",
                  description: baseEndpoint.description,
                  name: baseEndpoint.name,
                },
              }),
          );

          if (schema) {
            updatedEndpoints.push({
              ...baseEndpoint,
              schema: schema as unknown as ExternalProviderEndpoint["schema"],
            });
            continue;
          }
        } else if (shouldLogEndpointError(fetchResult.status)) {
          console.warn(
            `External provider workflow: failed to fetch endpoint ${baseEndpoint.name} (${fetchResult.error})`,
          );
        }

        updatedEndpoints.push(baseEndpoint);
      }
    }

    await runWithinWorkflowRuntime(
      runtimeDeadline,
      "persisting external provider workflow results",
      () =>
        updateExternalProviderStep({
          providerId,
          provider: {
            ...resolvedProvider,
            attributeAvailabilityEndpoint:
              resolvedProvider.attributeAvailabilityEndpoint ??
              detectedAttributeEndpoint?.url,
            endpoints: updatedEndpoints ?? resolvedProvider.endpoints,
          },
          schemas,
          endpoints: updatedEndpoints,
          sampleProductId,
        }),
    );

    return { success: true };
  } catch (error) {
    if (error instanceof WorkflowRuntimeLimitError) {
      throw new FatalError(error.message);
    }

    throw error;
  }
}
