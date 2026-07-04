import type { StoreAnalyticsSummary } from "@/components/Statistics";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { getPurchases, getRevenue, getSessions } from "@konfi/google";
import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import AnalyticsPage from "./analytics-page";

export default function Page() {
  return (
    <Suspense fallback={<AdminLoadingSkeleton variant="cards" rows={6} />}>
      <AnalyticsPageContent />
    </Suspense>
  );
}

async function AnalyticsPageContent() {
  await connection();
  const storeAnalytics = await getStoreAnalytics();

  return <AnalyticsPage storeAnalytics={storeAnalytics} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.analytics"),
  };
}

async function getStoreAnalytics(): Promise<StoreAnalyticsSummary | null> {
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.warn("GOOGLE_APPLICATION_CREDENTIALS is not set");
      return null;
    }

    const { analyticsDataClient, propertyId } =
      await import("@/lib/google/serverApp");

    if (!analyticsDataClient || !propertyId) {
      console.warn("analyticsDataClient or propertyId is not set");
      return null;
    }

    const [sessions, revenue, purchases] = await Promise.all([
      getSessions({ analyticsDataClient, propertyId }),
      getRevenue({ analyticsDataClient, propertyId }),
      getPurchases({ analyticsDataClient, propertyId }),
    ]);

    return {
      sessions,
      revenue,
      purchases,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
