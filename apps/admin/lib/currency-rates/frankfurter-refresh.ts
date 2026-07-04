import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { requireTenantContextTenantId } from "@konfi/firebase";
import type { CurrencySettings } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  CURRENCIES_SETTINGS_DOC_ID,
  fetchFrankfurterCurrencyRates,
  FRANKFURTER_CURRENCY_RATE_PROVIDER,
  normalizeCurrencySettings,
  refreshAutomaticCurrencyRates,
} from "@konfi/utils";
import { Timestamp } from "firebase-admin/firestore";

export interface FrankfurterCurrencyRateRefreshSummary {
  failedCount: number;
  refreshedCount: number;
  scannedCount: number;
  skippedCount: number;
}

const FIRESTORE_BATCH_LIMIT = 500;

function getDb(): FirebaseFirestore.Firestore {
  return getAdminDb();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown rate refresh error.";
}

function isFrankfurterAutomaticSettings(settings: CurrencySettings): boolean {
  return (
    settings.conversion.enabled === true &&
    settings.conversion.mode === "automatic" &&
    settings.conversion.automatic?.enabled === true &&
    settings.conversion.automatic.provider ===
      FRANKFURTER_CURRENCY_RATE_PROVIDER
  );
}

function getTenantScopeId(tenantContext?: TenantContext): string | undefined {
  return tenantContext && isSharedSaasTenantRuntime(tenantContext)
    ? requireTenantContextTenantId(tenantContext, "currency rates cron")
    : undefined;
}

export async function refreshFrankfurterCurrencyRates(
  tenantContext?: TenantContext,
): Promise<FrankfurterCurrencyRateRefreshSummary> {
  const firestore = getDb();
  const tenantId = getTenantScopeId(tenantContext);
  let settingsQuery: FirebaseFirestore.Query =
    firestore.collectionGroup("settings");
  if (tenantId) {
    settingsQuery = settingsQuery.where("tenantId", "==", tenantId);
  }
  const settingsSnapshot = await settingsQuery.get();
  const now = Timestamp.now();
  let batch = firestore.batch();
  let batchOperationCount = 0;
  let failedCount = 0;
  let refreshedCount = 0;
  let scannedCount = 0;
  let skippedCount = 0;

  async function commitBatchIfNeeded(force = false): Promise<void> {
    if (
      batchOperationCount === 0 ||
      (!force && batchOperationCount < FIRESTORE_BATCH_LIMIT)
    ) {
      return;
    }

    await batch.commit();
    batch = firestore.batch();
    batchOperationCount = 0;
  }

  for (const settingsDoc of settingsSnapshot.docs) {
    if (settingsDoc.id !== CURRENCIES_SETTINGS_DOC_ID) {
      continue;
    }

    scannedCount += 1;
    const settings = normalizeCurrencySettings(
      settingsDoc.data() as Partial<CurrencySettings>,
    );

    if (!isFrankfurterAutomaticSettings(settings)) {
      skippedCount += 1;
      continue;
    }

    try {
      const refreshResult = await refreshAutomaticCurrencyRates({
        settings,
        now,
        provider: FRANKFURTER_CURRENCY_RATE_PROVIDER,
        fetchRates: (fetchParams) =>
          fetchFrankfurterCurrencyRates({
            ...fetchParams,
            baseUrl: settings.conversion.automatic?.baseUrl,
          }),
      });

      if (!refreshResult.refreshed) {
        skippedCount += 1;
        continue;
      }

      batch.set(settingsDoc.ref, refreshResult.settings, { merge: true });
      batchOperationCount += 1;
      refreshedCount += 1;
      await commitBatchIfNeeded();
    } catch (error) {
      failedCount += 1;
      batch.set(
        settingsDoc.ref,
        {
          conversion: {
            automatic: {
              ...settings.conversion.automatic,
              lastAttemptAt: now,
              lastError: getErrorMessage(error),
            },
            updatedAt: now,
          },
          updatedAt: now,
        },
        { merge: true },
      );
      batchOperationCount += 1;
      await commitBatchIfNeeded();
    }
  }

  await commitBatchIfNeeded(true);

  return {
    failedCount,
    refreshedCount,
    scannedCount,
    skippedCount,
  };
}
