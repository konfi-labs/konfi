import { google } from "@google-analytics/data/build/protos/protos";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

interface BaseFnProps {
  analyticsDataClient: BetaAnalyticsDataClient;
  propertyId: string;
}

export async function getSessions({
  analyticsDataClient,
  propertyId,
}: BaseFnProps) {
  const response = await runReport({
    analyticsDataClient,
    propertyId,
    startDate: "60daysAgo",
    endDate: "yesterday",
    dimensions: ["month"],
    metrics: ["engagedSessions"],
    metricAggregations: [google.analytics.data.v1beta.MetricAggregation.TOTAL],
  });

  if (!response.rows) {
    return { lastMonthSessions: 0, thisMonthSessions: 0 };
  }

  const lastMonthSessions = readMetricValue(response.rows[1]);
  const thisMonthSessions = readMetricValue(response.rows[0]);

  return {
    lastMonthSessions,
    thisMonthSessions,
  };
}

export async function getRevenue({
  analyticsDataClient,
  propertyId,
}: BaseFnProps) {
  const response = await runReport({
    analyticsDataClient,
    propertyId,
    startDate: "60daysAgo",
    endDate: "yesterday",
    dimensions: ["month"],
    metrics: ["totalRevenue"],
    metricAggregations: [google.analytics.data.v1beta.MetricAggregation.TOTAL],
  });

  if (!response.rows) {
    return { lastMonthRevenue: 0, thisMonthRevenue: 0 };
  }

  const lastMonthRevenue = readRoundedMetricValue(response.rows[1]);
  const thisMonthRevenue = readRoundedMetricValue(response.rows[0]);

  return {
    lastMonthRevenue,
    thisMonthRevenue,
  };
}

export async function getPurchases({
  analyticsDataClient,
  propertyId,
}: BaseFnProps) {
  const response = await runReport({
    analyticsDataClient,
    propertyId,
    startDate: "60daysAgo",
    endDate: "today",
    dimensions: ["month"],
    metrics: ["ecommercePurchases"],
    metricAggregations: [google.analytics.data.v1beta.MetricAggregation.TOTAL],
  });

  if (!response.rows) {
    return { lastMonthPurchases: 0, thisMonthPurchases: 0 };
  }

  const lastMonthPurchases = readMetricValue(response.rows[1]);
  const thisMonthPurchases = readMetricValue(response.rows[0]);

  return {
    lastMonthPurchases,
    thisMonthPurchases,
  };
}

export async function getPopularProductsIds({
  analyticsDataClient,
  propertyId,
}: BaseFnProps) {
  const response = await runReport({
    analyticsDataClient,
    propertyId,
    startDate: "30daysAgo",
    endDate: "yesterday",
    dimensions: ["itemId"],
    metrics: ["itemsAddedToCart"],
    orderBys: [
      {
        metric: {
          metricName: "itemsAddedToCart",
        },
        desc: true,
      },
    ],
  });

  if (!response.rows) {
    return [];
  }

  let ids: string[] = [];

  for (const row of response.rows) {
    if (!row.dimensionValues?.[0].value) {
      continue;
    }

    ids.push(row.dimensionValues?.[0].value);
  }

  return ids;
}

function readMetricValue(
  row: google.analytics.data.v1beta.IRow | undefined,
): number {
  const value = Number(row?.metricValues?.[0]?.value);

  return Number.isFinite(value) ? value : 0;
}

function readRoundedMetricValue(
  row: google.analytics.data.v1beta.IRow | undefined,
): number {
  return Number(readMetricValue(row).toFixed(2));
}

interface Props {
  analyticsDataClient: BetaAnalyticsDataClient;
  propertyId: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  orderBys?: {
    metric: {
      metricName: string;
    };
    desc: boolean;
  }[];
  limit?: number;
  metricAggregations?: google.analytics.data.v1beta.MetricAggregation[];
}

async function runReport({
  analyticsDataClient,
  propertyId,
  startDate = "30daysAgo",
  endDate = "yesterday",
  dimensions = [],
  metrics = [],
  orderBys,
  limit,
  metricAggregations,
}: Props) {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      {
        startDate: startDate,
        endDate: endDate,
      },
    ],
    dimensions: dimensions.map((dimension) => ({
      name: dimension,
    })),
    metrics: metrics.map((metric) => ({
      name: metric,
    })),
    orderBys,
    limit,
    metricAggregations,
  });

  return response;
}
