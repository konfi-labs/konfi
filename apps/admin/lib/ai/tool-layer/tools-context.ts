import "server-only";

import { ToolLayerError } from "./errors";
import {
  normalizeLimit,
  normalizePage,
  requireAnyScope,
  requireScopes,
} from "./permissions";
import { auditToolCall } from "./audit";
import {
  getBusinessResourceDescriptor,
  listBusinessResourceDescriptors,
  sanitizeBusinessRecordData,
  summarizeBusinessRecord,
} from "./business-resources";
import type {
  BusinessRecordOutput,
  BusinessRecordsOutput,
  BusinessJsonValue,
  FirestoreQueryOrderByClause,
  FirestoreQueryOrderDirection,
  FirestoreQueryRuntimeValue,
  FirestoreQueryWhereClause,
  FirestoreQueryWhereOperator,
  ToolLayerRuntime,
} from "./types";
import { READ_ONLY_TOOL_SCOPES } from "./types";
import {
  businessResourceNotes,
  listAuthorizedChannels,
  optionalNonEmpty,
  requireNonEmpty,
  resolveToolChannel,
  summarizeChannel,
} from "./tool-helpers";
import type {
  CurrentUserToolContext,
  GetBusinessRecordInput,
  ListBusinessResourcesOutput,
  ListChannelsOutput,
  QueryFirestoreRecordsInput,
  QueryFirestoreRecordsOutput,
  SearchBusinessRecordsInput,
} from "./tool-inputs";

const MAX_FIRESTORE_WHERE_CLAUSES = 8;
const MAX_FIRESTORE_ORDER_BY_CLAUSES = 3;
const FIELD_PATH_PATTERN = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
const ARRAY_OPERATORS = new Set<FirestoreQueryWhereOperator>([
  "array-contains-any",
  "in",
  "not-in",
]);
const SCALAR_OPERATORS = new Set<FirestoreQueryWhereOperator>([
  "<",
  "<=",
  "==",
  "!=",
  ">=",
  ">",
  "array-contains",
]);
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function validateFirestoreFieldPath(field: string, label: string): string {
  const normalized = field.trim();

  if (!normalized || !FIELD_PATH_PATTERN.test(normalized)) {
    throw new ToolLayerError(
      "validation_error",
      `${label} must be a dotted Firestore field path using letters, numbers, and underscores.`,
      {
        details: { field },
      },
    );
  }

  if (normalized.split(".").some((segment) => segment.startsWith("__"))) {
    throw new ToolLayerError(
      "validation_error",
      `${label} cannot query Firestore reserved fields.`,
      {
        details: { field },
      },
    );
  }

  return normalized;
}

function isFirestoreTimestampField(field: string): boolean {
  return /(?:At|Date|deadline|validUntil)$/i.test(field);
}

function normalizeFirestoreScalarValue(
  field: string,
  value: BusinessJsonValue,
): FirestoreQueryRuntimeValue {
  if (Array.isArray(value)) {
    throw new ToolLayerError(
      "validation_error",
      "Scalar Firestore query operators require a non-array value.",
      {
        details: { field },
      },
    );
  }

  if (value && typeof value === "object") {
    throw new ToolLayerError(
      "validation_error",
      "Firestore query values must be scalar, except array values for in/not-in/array-contains-any.",
      {
        details: { field },
      },
    );
  }

  if (
    typeof value === "string" &&
    isFirestoreTimestampField(field) &&
    ISO_TIMESTAMP_PATTERN.test(value)
  ) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return value;
}

function normalizeFirestoreArrayValue(
  field: string,
  value: BusinessJsonValue,
): FirestoreQueryRuntimeValue[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new ToolLayerError(
      "validation_error",
      "Firestore in/not-in/array-contains-any values must be a non-empty array with at most 10 items.",
      {
        details: { field },
      },
    );
  }

  return value.map((item) => normalizeFirestoreScalarValue(field, item));
}

function normalizeFirestoreWhereClauses(
  input: QueryFirestoreRecordsInput,
): FirestoreQueryWhereClause[] {
  const clauses = input.where ?? [];

  if (clauses.length > MAX_FIRESTORE_WHERE_CLAUSES) {
    throw new ToolLayerError(
      "validation_error",
      `At most ${MAX_FIRESTORE_WHERE_CLAUSES} Firestore where clauses are allowed.`,
    );
  }

  return clauses.map((clause) => {
    const field = validateFirestoreFieldPath(clause.field, "where.field");
    const op = clause.op;

    if (ARRAY_OPERATORS.has(op)) {
      return {
        field,
        op,
        value: normalizeFirestoreArrayValue(field, clause.value),
      };
    }

    if (SCALAR_OPERATORS.has(op)) {
      return {
        field,
        op,
        value: normalizeFirestoreScalarValue(field, clause.value),
      };
    }

    throw new ToolLayerError(
      "validation_error",
      "Unsupported Firestore where operator.",
      {
        details: { op },
      },
    );
  });
}

function normalizeFirestoreOrderByClauses(
  input: QueryFirestoreRecordsInput,
): FirestoreQueryOrderByClause[] {
  const clauses = input.orderBy ?? [];

  if (clauses.length > MAX_FIRESTORE_ORDER_BY_CLAUSES) {
    throw new ToolLayerError(
      "validation_error",
      `At most ${MAX_FIRESTORE_ORDER_BY_CLAUSES} Firestore orderBy clauses are allowed.`,
    );
  }

  return clauses.map((clause) => {
    const direction: FirestoreQueryOrderDirection =
      clause.direction === "asc" || clause.direction === "desc"
        ? clause.direction
        : "asc";

    return {
      direction,
      field: validateFirestoreFieldPath(clause.field, "orderBy.field"),
    };
  });
}

function isFirestoreIndexError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const code = record.code;
  const message = typeof record.message === "string" ? record.message : "";

  return (
    code === 9 ||
    code === "failed-precondition" ||
    (message.toLowerCase().includes("index") &&
      message.toLowerCase().includes("firestore"))
  );
}

export async function getCurrentUserContext(
  runtime: ToolLayerRuntime,
): Promise<CurrentUserToolContext> {
  return auditToolCall({
    inputSummary: {},
    operation: async () => {
      requireScopes(runtime.auth, ["user:context"]);

      return {
        actor: runtime.auth.actor,
        permissions: {
          channelIds: runtime.auth.permissions.channelIds,
          isAdmin: runtime.auth.permissions.isAdmin,
          isSuperAdmin: runtime.auth.permissions.isSuperAdmin,
          scopes: runtime.auth.permissions.scopes,
        },
        request: runtime.auth.request,
      };
    },
    requestedScopes: ["user:context"],
    runtime,
    toolName: "getCurrentUserContext",
  });
}

export async function listChannels(
  runtime: ToolLayerRuntime,
): Promise<ListChannelsOutput> {
  return auditToolCall({
    inputSummary: {},
    operation: async () => {
      requireAnyScope(runtime.auth, READ_ONLY_TOOL_SCOPES);

      const channels = await listAuthorizedChannels(runtime);

      return {
        channels: channels.map(summarizeChannel),
      };
    },
    outputSummary: (result) => ({
      count: result.channels.length,
    }),
    requestedScopes: [],
    runtime,
    toolName: "listChannels",
  });
}

export async function listBusinessResources(
  runtime: ToolLayerRuntime,
): Promise<ListBusinessResourcesOutput> {
  return auditToolCall({
    inputSummary: {},
    operation: async () => {
      requireScopes(runtime.auth, ["business:read"]);

      return {
        notes: businessResourceNotes(),
        resources: listBusinessResourceDescriptors(),
      };
    },
    outputSummary: (result) => ({
      count: result.resources.length,
    }),
    requestedScopes: ["business:read"],
    runtime,
    toolName: "listBusinessResources",
  });
}

export async function searchBusinessRecords(
  runtime: ToolLayerRuntime,
  input: SearchBusinessRecordsInput,
): Promise<BusinessRecordsOutput> {
  const descriptor = getBusinessResourceDescriptor(input.resource);
  const query = optionalNonEmpty(input.query, "query");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 25,
  });

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      limit,
      query: query ?? null,
      resource: input.resource,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["business:read"]);
      const channelId = descriptor.channelScoped
        ? await resolveToolChannel(runtime, input)
        : undefined;

      const records = await runtime.readers.listBusinessRecords({
        ...(channelId ? { channelId } : {}),
        limit,
        ...(query ? { query } : {}),
        resource: input.resource,
      });

      return {
        notes: businessResourceNotes({ descriptor }),
        records: records.map((record) =>
          summarizeBusinessRecord(descriptor, record),
        ),
        resource: input.resource,
        totalReturned: records.length,
      };
    },
    outputSummary: (result) => ({
      count: result.records.length,
      resource: result.resource,
    }),
    requestedScopes: ["business:read"],
    runtime,
    toolName: "searchBusinessRecords",
  });
}

export async function queryFirestoreRecords(
  runtime: ToolLayerRuntime,
  input: QueryFirestoreRecordsInput,
): Promise<QueryFirestoreRecordsOutput> {
  const descriptor = getBusinessResourceDescriptor(input.resource);
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 25,
  });
  const page = normalizePage(input.page);
  const offset = page * limit;
  const where = normalizeFirestoreWhereClauses(input);
  const orderBy = normalizeFirestoreOrderByClauses(input);

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      limit,
      orderBy: orderBy.length,
      page,
      resource: input.resource,
      where: where.length,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["business:read"]);

      if (descriptor.source !== "firestore") {
        throw new ToolLayerError(
          "validation_error",
          "query_firestore_records only supports Firestore-backed resources.",
          {
            details: { resource: input.resource },
          },
        );
      }

      const channelId = descriptor.channelScoped
        ? await resolveToolChannel(runtime, input)
        : undefined;

      try {
        const result = await runtime.readers.queryBusinessRecords({
          ...(channelId ? { channelId } : {}),
          limit,
          offset,
          orderBy,
          resource: input.resource,
          where,
        });

        return {
          collectionPath: result.collectionPath,
          limit,
          notes: [
            ...businessResourceNotes({ descriptor }),
            "This is a bounded read-only Firestore query over an allowlisted Konfi business resource. If Firestore reports a missing composite index, simplify the query or add the index before retrying.",
          ],
          orderBy,
          page,
          records: result.records.map((record) => ({
            ...summarizeBusinessRecord(descriptor, record),
            data: sanitizeBusinessRecordData(record.data),
            ...(record.path ? { path: record.path } : {}),
          })),
          resource: input.resource,
          totalReturned: result.records.length,
          where,
        };
      } catch (error) {
        if (isFirestoreIndexError(error)) {
          throw new ToolLayerError(
            "validation_error",
            "Firestore rejected this query because it requires a composite index. Simplify the where/orderBy clauses or add the required index before retrying.",
            {
              details: {
                resource: input.resource,
              },
            },
          );
        }

        throw error;
      }
    },
    outputSummary: (result) => ({
      count: result.records.length,
      resource: result.resource,
    }),
    requestedScopes: ["business:read"],
    runtime,
    toolName: "queryFirestoreRecords",
  });
}

export async function getBusinessRecord(
  runtime: ToolLayerRuntime,
  input: GetBusinessRecordInput,
): Promise<BusinessRecordOutput> {
  const descriptor = getBusinessResourceDescriptor(input.resource);
  const recordId = requireNonEmpty(input.recordId, "recordId");

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      recordId,
      resource: input.resource,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["business:read"]);
      const channelId = descriptor.channelScoped
        ? await resolveToolChannel(runtime, input)
        : undefined;
      const record = await runtime.readers.getBusinessRecord({
        ...(channelId ? { channelId } : {}),
        recordId,
        resource: input.resource,
      });

      if (!record) {
        throw new ToolLayerError("not_found", "Business record not found.");
      }

      return {
        notes: businessResourceNotes({ descriptor }),
        record: {
          ...summarizeBusinessRecord(descriptor, record),
          data: sanitizeBusinessRecordData(record.data),
          ...(record.path ? { path: record.path } : {}),
        },
      };
    },
    outputSummary: () => ({
      found: true,
      resource: input.resource,
    }),
    requestedScopes: ["business:read"],
    runtime,
    toolName: "getBusinessRecord",
  });
}
