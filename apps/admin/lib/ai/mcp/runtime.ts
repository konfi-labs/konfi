import "server-only";

import {
  createFirestoreToolLayerReaders,
  createFirestoreToolLayerWriters,
  FirestoreToolAuditLogger,
  type ToolAuthContext,
  type ToolLayerRuntime,
} from "../tool-layer";

export function createMcpToolRuntime(auth: ToolAuthContext): ToolLayerRuntime {
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
