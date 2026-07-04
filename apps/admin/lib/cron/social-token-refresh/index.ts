import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "@/lib/integration-secret-crypto";
import { exchangeForLongLivedUserToken } from "@/lib/social/meta-auth";
import { getMetaAppConfig } from "@/lib/social/meta-config";
import { markMetaIntegrationNeedsAttention } from "@/lib/social/meta-credentials";
import {
  META_TENANT_INTEGRATION_KEY,
  normalizeMetaTenantIntegrationMetadata,
  tenantMetaIntegrationDocumentId,
  TENANT_INTEGRATIONS_COLLECTION,
} from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";

/** Refresh the user token when it expires within this many ms from now. */
const REFRESH_WINDOW_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

export type MetaTokenRefreshOutcome =
  | "refreshed"
  | "skipped"
  | "not_connected"
  | "failed";

export interface MetaTokenRefreshResult {
  outcome: MetaTokenRefreshOutcome;
  error?: string;
}

/**
 * Refresh the Meta long-lived user token for a single tenant if it is due.
 * Mirrors frankfurter-refresh's lastAttemptAt/lastError error-tracking style.
 */
export async function refreshMetaTokenForTenant(
  tenantContext: TenantContext,
): Promise<MetaTokenRefreshResult> {
  const tenantId = tenantContext.tenantId;
  if (!tenantId) return { outcome: "not_connected" };

  const snap = await getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantMetaIntegrationDocumentId(tenantId))
    .get();

  if (!snap.exists) return { outcome: "not_connected" };

  const raw = snap.data() as Record<string, unknown> | undefined;

  if (raw?.status !== "connected") return { outcome: "not_connected" };

  const { meta } = normalizeMetaTenantIntegrationMetadata(raw?.metadata);

  if (!isEncryptedIntegrationSecret(meta.encryptedUserToken)) {
    return { outcome: "not_connected" };
  }

  // Only refresh when expiry is within the refresh window.
  const expiresAt = meta.userTokenExpiresAt ?? 0;
  const now = Date.now();
  if (expiresAt - now > REFRESH_WINDOW_MS) {
    return { outcome: "skipped" };
  }

  const appConfig = await getMetaAppConfig(tenantContext);
  if (!appConfig) {
    return { outcome: "not_connected" };
  }

  const scope = { integrationKey: META_TENANT_INTEGRATION_KEY, tenantId };

  try {
    const currentUserToken = decryptIntegrationSecret({
      encrypted: meta.encryptedUserToken,
      scope,
    });

    const { accessToken: newToken, expiresAt: newExpiresAt } =
      await exchangeForLongLivedUserToken({
        appConfig,
        shortLivedToken: currentUserToken,
      });

    const encryptedUserToken = encryptIntegrationSecret({
      plaintext: newToken,
      scope,
    });

    await getAdminDb()
      .collection(TENANT_INTEGRATIONS_COLLECTION)
      .doc(tenantMetaIntegrationDocumentId(tenantId))
      .set(
        {
          metadata: {
            meta: {
              encryptedUserToken,
              userTokenExpiresAt: newExpiresAt,
              userTokenRefreshedAt: now,
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return { outcome: "refreshed" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown token refresh error.";

    await markMetaIntegrationNeedsAttention(tenantContext, message);

    return { outcome: "failed", error: message };
  }
}
