import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  decryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "@/lib/integration-secret-crypto";
import {
  META_TENANT_INTEGRATION_KEY,
  normalizeMetaTenantIntegrationMetadata,
  tenantMetaIntegrationDocumentId,
  TENANT_INTEGRATIONS_COLLECTION,
} from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";

export interface MetaPublishCredentials {
  userToken: string;
  pages: {
    id: string;
    name: string;
    pageToken: string;
    igAccount?: { id: string; username: string };
  }[];
}

/**
 * Read and decrypt publish credentials for the tenant's Meta integration.
 * Returns null when no connected integration exists or decryption fails.
 */
export async function getMetaPublishCredentials(
  tenantContext: TenantContext,
): Promise<MetaPublishCredentials | null> {
  const tenantId = tenantContext.tenantId;
  if (!tenantId) return null;

  const snap = await getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantMetaIntegrationDocumentId(tenantId))
    .get();

  if (!snap.exists) return null;

  const raw = snap.data() as Record<string, unknown> | undefined;

  if (raw?.status !== "connected") return null;

  const { meta } = normalizeMetaTenantIntegrationMetadata(raw?.metadata);
  const scope = { integrationKey: META_TENANT_INTEGRATION_KEY, tenantId };

  if (!isEncryptedIntegrationSecret(meta.encryptedUserToken)) return null;

  const userToken = decryptIntegrationSecret({
    encrypted: meta.encryptedUserToken,
    scope,
  });

  const pages = (meta.pages ?? []).flatMap((page) => {
    if (!isEncryptedIntegrationSecret(page.encryptedPageToken)) return [];
    const pageToken = decryptIntegrationSecret({
      encrypted: page.encryptedPageToken,
      scope,
    });
    return [
      {
        id: page.id,
        name: page.name,
        pageToken,
        igAccount: page.igAccount,
      },
    ];
  });

  return { userToken, pages };
}

/**
 * Mark the Meta integration as needing attention (e.g. expired token).
 * Mirrors the frankfurter-refresh lastAttemptAt/lastError error-tracking pattern.
 */
export async function markMetaIntegrationNeedsAttention(
  tenantContext: TenantContext,
  error: string,
): Promise<void> {
  const tenantId = tenantContext.tenantId;
  if (!tenantId) return;

  const docRef = getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantMetaIntegrationDocumentId(tenantId));

  await docRef.set(
    {
      status: "needs_attention",
      lastError: error,
      lastAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
