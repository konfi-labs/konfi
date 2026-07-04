import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { describe, expect, it, vi } from "vitest";
import { getPurchases, getRevenue, getSessions } from "./analytics";

type ReportRow = {
  metricValues?: {
    value?: string;
  }[];
};

function createAnalyticsDataClient(rows: ReportRow[] | undefined) {
  return {
    runReport: vi.fn(async () => [{ rows }]),
  } as unknown as BetaAnalyticsDataClient;
}

describe("analytics metric summaries", () => {
  it("should default missing comparison rows to zero", async () => {
    const analyticsDataClient = createAnalyticsDataClient([
      { metricValues: [{ value: "12" }] },
    ]);

    await expect(
      getSessions({ analyticsDataClient, propertyId: "property-id" }),
    ).resolves.toEqual({
      lastMonthSessions: 0,
      thisMonthSessions: 12,
    });

    await expect(
      getPurchases({ analyticsDataClient, propertyId: "property-id" }),
    ).resolves.toEqual({
      lastMonthPurchases: 0,
      thisMonthPurchases: 12,
    });
  });

  it("should default invalid metric values to zero", async () => {
    const analyticsDataClient = createAnalyticsDataClient([
      { metricValues: [{ value: "34.567" }] },
      { metricValues: [{ value: "not-a-number" }] },
    ]);

    await expect(
      getRevenue({ analyticsDataClient, propertyId: "property-id" }),
    ).resolves.toEqual({
      lastMonthRevenue: 0,
      thisMonthRevenue: 34.57,
    });
  });
});
