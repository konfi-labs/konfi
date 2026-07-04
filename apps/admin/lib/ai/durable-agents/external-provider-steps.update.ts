import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import type {
  ApiResponseSchema,
  ExternalProviderEndpoint,
  SaveExternalProviderRequest,
} from "@konfi/types";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import type { ExternalProviderSchemaDrafts } from "./external-provider-steps.schema";

function getDb() {
  return getAdminDb();
}

function getSchemaTimestamp(): ApiResponseSchema["generatedAt"] {
  return Timestamp.now() as unknown as ApiResponseSchema["generatedAt"];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function removeUndefinedDeep(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const cleaned: unknown[] = [];
    for (const item of value) {
      const next = removeUndefinedDeep(item);
      if (next !== undefined) {
        cleaned.push(next);
      }
    }
    return cleaned;
  }

  if (isPlainObject(value)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const next = removeUndefinedDeep(val);
      if (next !== undefined) {
        cleaned[key] = next;
      }
    }
    return cleaned;
  }

  return value;
}

export async function updateExternalProviderStep({
  providerId,
  provider,
  schemas,
  endpoints,
  sampleProductId,
}: {
  providerId: string;
  provider: SaveExternalProviderRequest["provider"];
  schemas?: ExternalProviderSchemaDrafts;
  endpoints?: ExternalProviderEndpoint[];
  sampleProductId?: string;
}) {
  "use step";

  const db = getDb();
  const payload: Record<string, unknown> = {
    ...provider,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "workflow",
  };

  if (schemas?.allProductsSchema) {
    payload.allProductsSchema = {
      ...schemas.allProductsSchema,
      generatedAt: getSchemaTimestamp(),
    };
  }

  if (schemas?.productSchema) {
    payload.productSchema = {
      ...schemas.productSchema,
      generatedAt: getSchemaTimestamp(),
    };
  }

  if (schemas?.attributeAvailabilitySchema) {
    payload.attributeAvailabilitySchema = {
      ...schemas.attributeAvailabilitySchema,
      generatedAt: getSchemaTimestamp(),
    };
  }

  const endpointPayload = endpoints ?? provider.endpoints;
  if (endpointPayload) {
    payload.endpoints = endpointPayload.map((endpoint) =>
      endpoint.schema
        ? {
            ...endpoint,
            schema: {
              ...endpoint.schema,
              generatedAt: getSchemaTimestamp(),
            },
          }
        : endpoint,
    );
  }

  if (sampleProductId) {
    payload.sampleProductId = sampleProductId;
  }

  const sanitizedPayload = removeUndefinedDeep(payload);
  await db
    .collection("externalProviders")
    .doc(providerId)
    .update(sanitizedPayload as Record<string, unknown>);
}
