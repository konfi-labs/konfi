"use client";

import { AnalyticsChartTooltip } from "./analytics-chart-tooltip";
import { getAnalyticsChartPalette } from "./analytics-chart-theme";
import { Chart, useChart } from "@chakra-ui/charts";
import { Box, Text } from "@chakra-ui/react";
import { useColorMode } from "@konfi/components";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

export type BreakdownChartRow = {
  id: string;
  label: string;
  count: number;
  totalValue: number;
  share: number;
  avgAgeDays?: number;
};

type BreakdownMetric = "count" | "value";

interface BreakdownBarChartProps {
  rows: BreakdownChartRow[];
  metric: BreakdownMetric;
  metricLabel: string;
  emptyText: string;
  labels: {
    orders: string;
    value: string;
    share: string;
    avgAgeDays?: string;
  };
}

type BreakdownChartDatum = BreakdownChartRow & {
  metricValue: number;
};

export function BreakdownBarChart({
  rows,
  metric,
  metricLabel,
  emptyText,
  labels,
}: BreakdownBarChartProps) {
  const { colorMode } = useColorMode();
  const palette = getAnalyticsChartPalette(colorMode);

  if (rows.length === 0) {
    return (
      <Text color="fg.muted" fontSize="sm">
        {emptyText}
      </Text>
    );
  }

  const chartData: BreakdownChartDatum[] = rows.map((row) => ({
    ...row,
    metricValue: metric === "count" ? row.count : row.totalValue / 100,
  }));

  const chart = useChart({
    data: chartData,
    series: [
      {
        name: "metricValue",
        label: metricLabel,
        color:
          metric === "count"
            ? palette.primarySeries
            : palette.comparisonSeries,
      },
    ],
  });

  const renderTooltip = ({
    active,
    payload,
  }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) {
      return null;
    }

    const datum = payload[0]?.payload as BreakdownChartDatum | undefined;
    if (!datum) {
      return null;
    }

    return (
      <AnalyticsChartTooltip
        title={datum.label}
        rows={[
          {
            label: labels.orders,
            value: datum.count,
          },
          {
            label: labels.value,
            value: new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: "PLN",
            }).format(datum.totalValue / 100),
          },
          {
            label: labels.share,
            value: new Intl.NumberFormat(undefined, {
              style: "percent",
              maximumFractionDigits: 0,
            }).format(datum.share / 100),
          },
          ...(typeof datum.avgAgeDays === "number" && labels.avgAgeDays
            ? [
                {
                  label: labels.avgAgeDays,
                  value: datum.avgAgeDays.toFixed(1),
                },
              ]
            : []),
        ]}
      />
    );
  };

  return (
    <Box height="340px" width="100%">
      <Chart.Root h="full" chart={chart}>
        <BarChart
          data={chart.data}
          layout="vertical"
          responsive
          margin={{ left: 16, right: 16 }}
        >
          <CartesianGrid stroke={palette.gridStroke} horizontal={false} />
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tickFormatter={
              metric === "count"
                ? chart.formatNumber({ style: "decimal" })
                : chart.formatNumber({
                    style: "currency",
                    currency: "PLN",
                    notation: "compact",
                  })
            }
          />
          <YAxis
            type="category"
            width={120}
            axisLine={false}
            tickLine={false}
            dataKey={chart.key("label")}
          />
          <Tooltip
            cursor={{
              fill: palette.hoverFill,
              stroke: palette.gridStroke,
            }}
            animationDuration={100}
            content={renderTooltip}
          />
          <Bar
            isAnimationActive={false}
            radius={4}
            dataKey={chart.key("metricValue")}
            fill={
              metric === "count"
                ? palette.primarySeries
                : palette.comparisonSeries
            }
            stroke={
              metric === "count"
                ? palette.primarySeries
                : palette.comparisonSeries
            }
            name={metricLabel}
          />
        </BarChart>
      </Chart.Root>
    </Box>
  );
}
