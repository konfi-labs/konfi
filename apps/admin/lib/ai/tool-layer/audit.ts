import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { getToolLayerErrorCode, ToolLayerError } from "./errors";
import type {
  ToolAuditEvent,
  ToolAuditLogger,
  ToolAuditSummary,
  ToolAuthContext,
  ToolLayerRuntime,
  ToolScope,
} from "./types";

function denialReasonFor(
  error: unknown,
): ToolAuditEvent["authorization"]["denialReason"] {
  if (!(error instanceof ToolLayerError)) {
    return undefined;
  }

  if (
    error.code === "ambiguous_channel" ||
    error.code === "channel_required" ||
    error.code === "missing_scope" ||
    error.code === "channel_denied" ||
    error.code === "resource_denied" ||
    error.code === "validation_error"
  ) {
    return error.code;
  }

  return undefined;
}

function buildAuditEvent({
  auth,
  error,
  inputSummary,
  latencyMs,
  outputSummary,
  requestedScopes,
  status,
  toolName,
}: {
  auth: ToolAuthContext;
  error?: unknown;
  inputSummary: ToolAuditSummary;
  latencyMs: number;
  outputSummary?: ToolAuditSummary;
  requestedScopes: readonly ToolScope[];
  status: ToolAuditEvent["status"];
  toolName: string;
}): ToolAuditEvent {
  const denialReason = denialReasonFor(error);

  return {
    actor: {
      clientId: auth.token?.clientId,
      email: auth.actor.email,
      kind: auth.actor.kind,
      uid: auth.actor.uid,
    },
    authorization: {
      channelIds: auth.permissions.channelIds,
      decision: status === "denied" ? "deny" : "allow",
      denialReason,
      grantedScopes: auth.permissions.scopes,
      requestedScopes: [...requestedScopes],
    },
    errorCode: error ? getToolLayerErrorCode(error) : undefined,
    latencyMs,
    requestId: auth.request.requestId,
    source: auth.request.source,
    status,
    token: auth.token
      ? {
          jti: auth.token.jti,
          resource: auth.token.resource,
          scopes: auth.token.scopes,
        }
      : undefined,
    tool: {
      inputSummary,
      name: toolName,
      outputSummary,
    },
  };
}

async function logAuditEvent(
  runtime: ToolLayerRuntime,
  event: ToolAuditEvent,
): Promise<void> {
  try {
    await runtime.audit?.logToolCall(event);
  } catch (error) {
    console.warn("[tool-layer] Audit logging failed", { error });
  }
}

function stripUndefinedFields(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const sanitized = stripUndefinedFields(item);
      return sanitized === undefined ? [] : [sanitized];
    });
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      const sanitized = stripUndefinedFields(item);
      return sanitized === undefined ? [] : [[key, sanitized]];
    }),
  );
}

export async function auditToolCall<TResult>({
  inputSummary,
  operation,
  outputSummary,
  requestedScopes,
  runtime,
  toolName,
}: {
  inputSummary: ToolAuditSummary;
  operation: () => Promise<TResult>;
  outputSummary?: (result: TResult) => ToolAuditSummary;
  requestedScopes: readonly ToolScope[];
  runtime: ToolLayerRuntime;
  toolName: string;
}): Promise<TResult> {
  const startedAt = Date.now();

  try {
    const result = await operation();
    await logAuditEvent(
      runtime,
      buildAuditEvent({
        auth: runtime.auth,
        inputSummary,
        latencyMs: Date.now() - startedAt,
        outputSummary: outputSummary?.(result),
        requestedScopes,
        status: "success",
        toolName,
      }),
    );
    return result;
  } catch (error) {
    await logAuditEvent(
      runtime,
      buildAuditEvent({
        auth: runtime.auth,
        error,
        inputSummary,
        latencyMs: Date.now() - startedAt,
        requestedScopes,
        status: error instanceof ToolLayerError ? "denied" : "error",
        toolName,
      }),
    );
    throw error;
  }
}

export class FirestoreToolAuditLogger implements ToolAuditLogger {
  async logToolCall(event: ToolAuditEvent): Promise<void> {
    const firestore = getAdminDb();
    await firestore.collection("mcpToolAuditEvents").add({
      ...(stripUndefinedFields(event) as Record<string, unknown>),
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}
