import "server-only";

import type { NestedMember } from "@konfi/types";
import { FirestoreToolAuditLogger } from "./audit";
import { createFirestoreToolLayerReaders } from "./readers";
import { createFirestoreToolLayerWriters } from "./writers";
import type {
  ToolAuthContext,
  ToolCallSource,
  ToolLayerRuntime,
  ToolScope,
} from "./types";

export function createInternalToolAuthContext({
  channelId,
  createdBy,
  requestId = crypto.randomUUID(),
  scopes,
  source,
  tenantId,
}: {
  channelId: string;
  createdBy?: NestedMember;
  requestId?: string;
  scopes: ToolScope[];
  source: Extract<ToolCallSource, "admin-assistant" | "durable-agent">;
  tenantId?: string;
}): ToolAuthContext {
  return {
    actor: {
      displayName: createdBy?.name,
      kind: createdBy ? "konfi-session" : "machine",
      uid: createdBy?.id ?? source,
    },
    permissions: {
      channelIds: [channelId],
      isAdmin: true,
      isSuperAdmin: false,
      scopes,
      ...(tenantId ? { tenantId } : {}),
    },
    request: {
      requestId,
      source,
    },
  };
}

export function createInternalToolRuntime(
  auth: ToolAuthContext,
): ToolLayerRuntime {
  return {
    audit: new FirestoreToolAuditLogger(),
    auth,
    readers: createFirestoreToolLayerReaders(undefined, {
      ...(auth.permissions.tenantId
        ? { tenantId: auth.permissions.tenantId }
        : {}),
    }),
    writers: createFirestoreToolLayerWriters(undefined, {
      ...(auth.permissions.tenantId
        ? { tenantId: auth.permissions.tenantId }
        : {}),
    }),
  };
}
