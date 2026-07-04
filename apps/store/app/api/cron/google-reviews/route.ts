import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { languages } from "@/i18n/settings";
import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import { listConnectedTenantGoogleStorefrontIntegrations } from "@/lib/google/integration-config";
import {
  buildGoogleReviewsMonthKey,
  ensureFirebaseAdminInitialized,
  getGoogleReviewsSyncDocument,
  saveGoogleReviewSnapshots,
  saveGoogleReviewSyncFailure,
} from "@/lib/google/review-snapshots";
import { getGooglePlaceReviews } from "@konfi/google";
import { Locale } from "@konfi/types";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

interface GoogleReviewsSyncResult {
  channelId?: string;
  tenantId?: string;
  placeId?: string;
  skipped: boolean;
  reason?: string;
  error?: string;
  failed?: boolean;
  syncedAt?: string;
  attemptedAt?: string;
  locales?: Array<{
    locale: Locale;
    count: number;
  }>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown Google reviews sync error.";
}

function isLocale(value: string): value is Locale {
  return Object.values(Locale).includes(value as Locale);
}

async function loadReviewsByLocale(placeId: string, apiKey: string) {
  const reviewLocales = languages.filter(isLocale);
  const reviewsByLocaleEntries = await Promise.all(
    reviewLocales.map(async (locale) => {
      const reviews = await getGooglePlaceReviews(placeId, apiKey, locale);

      return [locale, reviews] as const;
    }),
  );

  return {
    reviewLocales,
    reviewsByLocale: Object.fromEntries(reviewsByLocaleEntries) as Record<
      Locale,
      Awaited<ReturnType<typeof getGooglePlaceReviews>>
    >,
  };
}

async function syncGoogleReviewsForChannel({
  apiKey,
  channelId,
  force,
  placeId,
  syncedMonth,
}: {
  apiKey: string;
  channelId?: string;
  force: boolean;
  placeId: string;
  syncedMonth: string;
}): Promise<GoogleReviewsSyncResult> {
  const existingSyncDocument = await getGoogleReviewsSyncDocument(channelId);

  if (existingSyncDocument?.lastSyncedMonth === syncedMonth && !force) {
    return {
      channelId,
      placeId,
      skipped: true,
      reason: "Google reviews already synced for the current month.",
    };
  }

  const attemptedAt = new Date().toISOString();
  let reviewLocales: Locale[];
  let reviewsByLocale: Awaited<
    ReturnType<typeof loadReviewsByLocale>
  >["reviewsByLocale"];

  try {
    ({ reviewLocales, reviewsByLocale } = await loadReviewsByLocale(
      placeId,
      apiKey,
    ));
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await saveGoogleReviewSyncFailure({
      channelId,
      attemptedAt,
      attemptedMonth: syncedMonth,
      error: errorMessage,
      placeId,
    });

    return {
      channelId,
      placeId,
      skipped: false,
      failed: true,
      attemptedAt,
      error: errorMessage,
    };
  }

  await saveGoogleReviewSnapshots({
    channelId,
    placeId,
    syncedAt: attemptedAt,
    syncedMonth,
    reviewsByLocale,
  });

  return {
    channelId,
    placeId,
    skipped: false,
    syncedAt: attemptedAt,
    locales: reviewLocales.map((locale) => ({
      locale,
      count: reviewsByLocale[locale].length,
    })),
  };
}

async function channelBelongsToTenant(tenantId: string, channelId: string) {
  const snapshot = await getAdminDb()
    .collection("channels")
    .doc(channelId)
    .get();
  const channel = snapshot.exists
    ? (snapshot.data() as { tenantId?: unknown } | undefined)
    : undefined;

  return channel?.tenantId === tenantId;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "GOOGLE_PLACES_API_KEY is not configured.",
      },
      { status: 500 },
    );
  }

  try {
    await ensureFirebaseAdminInitialized();

    const force = request.nextUrl.searchParams.get("force") === "1";
    const syncedMonth = buildGoogleReviewsMonthKey();
    const tenantContext = getTenantContext();

    if (tenantContext.deploymentMode === "saas") {
      const integrations =
        await listConnectedTenantGoogleStorefrontIntegrations(getAdminDb());
      const results: GoogleReviewsSyncResult[] = [];

      for (const integration of integrations) {
        for (const [channelId, config] of Object.entries(
          integration.channels,
        )) {
          if (!config.reviewsEnabled || !config.placeId) {
            results.push({
              channelId,
              tenantId: integration.tenantId,
              skipped: true,
              reason: "Google reviews are disabled or Place ID is missing.",
            });
            continue;
          }

          if (
            !(await channelBelongsToTenant(integration.tenantId, channelId))
          ) {
            results.push({
              channelId,
              tenantId: integration.tenantId,
              skipped: true,
              reason: "Channel does not belong to tenant.",
            });
            continue;
          }

          results.push({
            tenantId: integration.tenantId,
            ...(await syncGoogleReviewsForChannel({
              apiKey,
              channelId,
              force,
              placeId: config.placeId,
              syncedMonth,
            })),
          });
        }
      }

      revalidateTag("googleReviews", "max");
      const status = results.some((result) => result.failed) ? 500 : 200;

      return NextResponse.json(
        {
          success: !results.some((result) => result.failed),
          force,
          syncedMonth,
          mode: "saas",
          results,
        },
        { status },
      );
    }

    const dedicatedPlaceId = process.env.GOOGLE_PLACE_ID?.trim();

    if (!dedicatedPlaceId) {
      return NextResponse.json(
        {
          error: "GOOGLE_PLACE_ID is not configured.",
        },
        { status: 500 },
      );
    }

    const result = await syncGoogleReviewsForChannel({
      apiKey,
      force,
      placeId: dedicatedPlaceId,
      syncedMonth,
    });

    revalidateTag("googleReviews", "max");

    return NextResponse.json(
      {
        success: !result.failed,
        force,
        syncedMonth,
        mode: "dedicated",
        ...result,
      },
      { status: result.failed ? 500 : 200 },
    );
  } catch (error) {
    console.error("Error syncing Google reviews:", error);

    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
