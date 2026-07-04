import "server-only";

import {
  AdminAuthError,
  getTenantAdminScopeTenantId,
  requireTenantAdminAuthContextForUid,
  type TenantAdminAuthContext,
} from "@/actions/auth-utils";
import { getAdminDb, verifyIdToken } from "@/lib/firebase/serverApp";
import type { UserRecord } from "firebase-admin/auth";
import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
} from "firebase-admin/firestore";
import {
  assertAgentRunTenantAccess,
  type AgentRunData,
} from "./agent-run-tenant-access";

export interface AuthorizedAgentApiRequest {
  authContext: TenantAdminAuthContext;
  firestore: Firestore;
  tenantScopeId?: string;
  user: UserRecord;
}

export interface AuthorizedAgentRun {
  agentRef: DocumentReference;
  data: AgentRunData;
  runId: string;
  snapshot: DocumentSnapshot;
}

function getBearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AdminAuthError(
      "Unauthorized: Missing or invalid authorization header",
      401,
    );
  }

  return authHeader.slice("Bearer ".length).trim();
}

function normalizeRunId(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new AdminAuthError("Bad Request: runId is required", 400);
  }

  return normalized;
}

function readDocumentData(snapshot: DocumentSnapshot): AgentRunData {
  const data = snapshot.data();
  return data && typeof data === "object" ? data : {};
}

export async function requireAuthorizedAgentApiRequest(
  request: Request,
): Promise<AuthorizedAgentApiRequest> {
  const idToken = getBearerToken(request);
  const user = await verifyIdToken(idToken);

  if (!user) {
    throw new AdminAuthError("Unauthorized: Invalid token", 401);
  }

  if (user.customClaims?.admin !== true) {
    throw new AdminAuthError("Forbidden: Admin access required", 403);
  }

  const authContext = await requireTenantAdminAuthContextForUid(user.uid);
  const tenantScopeId = getTenantAdminScopeTenantId(authContext.tenantContext);

  return {
    authContext,
    firestore: getAdminDb(),
    tenantScopeId,
    user,
  };
}

export async function requireAuthorizedAgentRun(params: {
  auth: AuthorizedAgentApiRequest;
  runId: string | null | undefined;
}): Promise<AuthorizedAgentRun> {
  const runId = normalizeRunId(params.runId);
  const agentRef = params.auth.firestore.collection("agents").doc(runId);
  const snapshot = await agentRef.get();

  if (!snapshot.exists) {
    throw new AdminAuthError("Agent run not found", 404);
  }

  const data = readDocumentData(snapshot);
  assertAgentRunTenantAccess(data, params.auth.tenantScopeId);

  return {
    agentRef,
    data,
    runId,
    snapshot,
  };
}

export async function findAuthorizedAgentRunByPendingHookToken(params: {
  auth: AuthorizedAgentApiRequest;
  token: string | null | undefined;
}): Promise<AuthorizedAgentRun> {
  const token = params.token?.trim();
  if (!token) {
    throw new AdminAuthError("Bad Request: hook token is required", 400);
  }

  let query: Query = params.auth.firestore
    .collection("agents")
    .where("pendingHookToken", "==", token);

  if (params.auth.tenantScopeId) {
    query = query.where("tenantId", "==", params.auth.tenantScopeId);
  }

  const snapshot = await query.limit(2).get();
  if (snapshot.empty) {
    throw new AdminAuthError("Agent run not found", 404);
  }

  if (snapshot.docs.length > 1) {
    throw new AdminAuthError("Ambiguous pending hook token", 409);
  }

  const agentSnapshot = snapshot.docs[0];
  const data = readDocumentData(agentSnapshot);
  assertAgentRunTenantAccess(data, params.auth.tenantScopeId);

  return {
    agentRef: agentSnapshot.ref,
    data,
    runId: agentSnapshot.id,
    snapshot: agentSnapshot,
  };
}
