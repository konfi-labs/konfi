"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { AnalyticsChartTooltip } from "./analytics-chart-tooltip";
import { getAnalyticsChartPalette } from "./analytics-chart-theme";
import { Chart, useChart } from "@chakra-ui/charts";
import { Box, Skeleton, Text } from "@chakra-ui/react";
import { useColorMode } from "@konfi/components";
import {
  Timestamp,
  collection,
  getAggregateFromServer,
  query,
  sum,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

interface RevenueChartProps {
  channelId: string;
  timeFrameDays: number;
  compare?: boolean;
}

interface RevenueChartDatum {
  date: string;
  revenue: number;
  prevRevenue?: number;
}

type RevenueSeriesKey = "revenue" | "prevRevenue";

export const RevenueChart = ({
  channelId,
  timeFrameDays,
  compare = false,
}: RevenueChartProps) => {
  const { i18n, t } = useT();
  const { colorMode } = useColorMode();
  const [chartData, setChartData] = useState<RevenueChartDatum[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const palette = getAnalyticsChartPalette(colorMode);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        style: "currency",
        currency: "PLN",
      }),
    [i18n.resolvedLanguage],
  );

  const series: Array<{
    name: RevenueSeriesKey;
    label: string;
    color: string;
  }> = compare
    ? [
        {
          name: "prevRevenue",
          label: String(t("analytics.previousPeriod")),
          color: palette.comparisonSeries,
        },
        {
          name: "revenue",
          label: String(t("analytics.revenue")),
          color: palette.primarySeries,
        },
      ]
    : [
        {
          name: "revenue",
          label: String(t("analytics.revenue")),
          color: palette.primarySeries,
        },
      ];

  const chart = useChart({
    data: chartData,
    series,
  });

  const fetchChartData = useCallback(async () => {
    if (!channelId) return;

    setIsLoading(true);
    setError(null);

    try {
      const interval = Math.max(1, Math.floor(timeFrameDays / 7));

      const ordersCollection = collection(
        firestore,
        `channels/${channelId}/orders`,
      );
      const endDate = new Date();
      const startDate = new Date(
        endDate.getTime() - timeFrameDays * 24 * 60 * 60 * 1000,
      );

      const dateRanges = [];
      for (let i = 0; i < timeFrameDays; i += interval) {
        const rangeStart = new Date(
          startDate.getTime() + i * 24 * 60 * 60 * 1000,
        );
        const rangeEnd = new Date(
          Math.min(
            rangeStart.getTime() + interval * 24 * 60 * 60 * 1000,
            endDate.getTime(),
          ),
        );
        dateRanges.push({ start: rangeStart, end: rangeEnd });
      }

      const prevDateRanges = [];
      if (compare) {
        const prevEndDate = new Date(startDate.getTime());
        const prevStartDate = new Date(
          prevEndDate.getTime() - timeFrameDays * 24 * 60 * 60 * 1000,
        );

        for (let i = 0; i < timeFrameDays; i += interval) {
          const rangeStart = new Date(
            prevStartDate.getTime() + i * 24 * 60 * 60 * 1000,
          );
          const rangeEnd = new Date(
            Math.min(
              rangeStart.getTime() + interval * 24 * 60 * 60 * 1000,
              prevEndDate.getTime(),
            ),
          );
          prevDateRanges.push({ start: rangeStart, end: rangeEnd });
        }
      }

      const currentPeriodData = await Promise.all(
        dateRanges.map(async (range, index) => {
          const rangeQuery = query(
            ordersCollection,
            where("createdAt", ">=", Timestamp.fromDate(range.start)),
            where("createdAt", "<", Timestamp.fromDate(range.end)),
            where("paymentDocumentId", "!=", ""),
            where("active", "==", true),
          );

          const snapshot = await getAggregateFromServer(rangeQuery, {
            totalRevenue: sum("totalPrice"),
          });

          const totalRevenue = snapshot.data().totalRevenue || 0;
          const dateFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
            day: "2-digit",
            month: "2-digit",
          });

          return {
            date: dateFormat.format(range.start),
            revenue: totalRevenue / 100,
            prevRevenue: 0,
            index,
          };
        }),
      );

      if (compare && prevDateRanges.length > 0) {
        const prevPeriodData = await Promise.all(
          prevDateRanges.map(async (range, index) => {
            const rangeQuery = query(
              ordersCollection,
              where("createdAt", ">=", Timestamp.fromDate(range.start)),
              where("createdAt", "<", Timestamp.fromDate(range.end)),
              where("paymentDocumentId", "!=", ""),
              where("active", "==", true),
            );

            const snapshot = await getAggregateFromServer(rangeQuery, {
              totalRevenue: sum("totalPrice"),
            });

            const totalRevenue = snapshot.data().totalRevenue || 0;

            return {
              index,
              prevRevenue: totalRevenue / 100,
            };
          }),
        );

        setChartData(
          currentPeriodData.map((current) => {
            const matching = prevPeriodData.find(
              (prev) => prev.index === current.index,
            );

            return {
              date: current.date,
              revenue: current.revenue,
              prevRevenue: matching?.prevRevenue || 0,
            };
          }),
        );
      } else {
        setChartData(
          currentPeriodData.map((item) => ({
            date: item.date,
            revenue: item.revenue,
          })),
        );
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
      setError(t("analytics.chartLoadingError"));
    } finally {
      setIsLoading(false);
    }
  }, [channelId, compare, i18n.resolvedLanguage, t, timeFrameDays]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  const renderTooltip = ({
    active,
    label,
    payload,
  }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) {
      return null;
    }

    return (
      <AnalyticsChartTooltip
        title={label}
        rows={payload.map((item) => ({
          label:
            series.find((seriesItem) => seriesItem.name === item.dataKey)?.label ??
            item.name ??
            "",
          swatchColor: typeof item.color === "string" ? item.color : undefined,
          value: currencyFormatter.format(Number(item.value ?? 0)),
        }))}
      />
    );
  };

  if (isLoading) {
    return <Skeleton height="300px" />;
  }

  if (error) {
    return (
      <Box textAlign="center" p={4}>
        <Text color={{ base: "red.500", _dark: "red.400" }}>{error}</Text>
      </Box>
    );
  }

  return (
    <Box width="100%" mt={6}>
      <Chart.Root maxH="md" chart={chart}>
        <BarChart data={chart.data} responsive>
          <CartesianGrid stroke={palette.gridStroke} vertical={false} />
          <XAxis
            axisLine={false}
            tickLine={false}
            dataKey={chart.key("date")}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={chart.formatNumber({
              style: "currency",
              currency: "PLN",
              notation: "compact",
            })}
          />
          <Tooltip
            cursor={{
              fill: palette.hoverFill,
              stroke: palette.gridStroke,
            }}
            animationDuration={100}
            content={renderTooltip}
          />
          <Legend content={<Chart.Legend />} />
          {series.map((item) => (
            <Bar
              isAnimationActive={false}
              key={item.name}
              radius={4}
              dataKey={chart.key(item.name)}
              fill={item.color}
              stroke={item.color}
              name={item.label}
            />
          ))}
        </BarChart>
      </Chart.Root>
    </Box>
  );
};
