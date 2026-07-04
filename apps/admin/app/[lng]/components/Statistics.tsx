"use client";

import { useT } from "@/i18n/client";
import { Badge, HStack, Stack, Stat } from "@chakra-ui/react";

export interface StoreAnalyticsSummary {
  sessions: {
    lastMonthSessions: number;
    thisMonthSessions: number;
  };
  revenue: {
    lastMonthRevenue: number;
    thisMonthRevenue: number;
  };
  purchases: {
    lastMonthPurchases: number;
    thisMonthPurchases: number;
  };
}

interface Props {
  analytics?: StoreAnalyticsSummary | null;
  mb?: number | string;
}

const OUTLINED_PANEL_PROPS = {
  borderWidth: "1px",
  borderColor: "border.muted",
  rounded: "xl",
  p: 5,
} as const;

export function Statistics({ analytics, mb = 8 }: Props) {
  const { t } = useT();

  return (
    <>
      {analytics ? (
        <Stack direction={["column", "row"]} gap={"4"} mb={mb}>
          <Stat.Root {...OUTLINED_PANEL_PROPS}>
            <Stat.Label>
              {t("analytics.users", { defaultValue: "Users" })}
            </Stat.Label>
            <HStack>
              <Stat.ValueText>
                {analytics.sessions.thisMonthSessions}
              </Stat.ValueText>
              <Badge
                colorPalette={
                  analytics.sessions.thisMonthSessions >
                  analytics.sessions.lastMonthSessions
                    ? "success"
                    : "red"
                }
                gap={"0"}
              >
                {analytics.sessions.thisMonthSessions >
                analytics.sessions.lastMonthSessions ? (
                  <Stat.UpIndicator />
                ) : (
                  <Stat.DownIndicator />
                )}
                {(
                  ((analytics.sessions.thisMonthSessions -
                    analytics.sessions.lastMonthSessions) /
                    analytics.sessions.lastMonthSessions) *
                  100
                ).toFixed(2)}
                %
              </Badge>
            </HStack>
          </Stat.Root>
          <Stat.Root {...OUTLINED_PANEL_PROPS}>
            <Stat.Label>
              {t("analytics.sales", { defaultValue: "Sales" })}
            </Stat.Label>
            <HStack>
              <Stat.ValueText>
                {analytics.revenue.lastMonthRevenue} zł
              </Stat.ValueText>
              <Badge
                colorPalette={
                  analytics.revenue.thisMonthRevenue >
                  analytics.revenue.lastMonthRevenue
                    ? "success"
                    : "red"
                }
                gap={"0"}
              >
                {analytics.revenue.thisMonthRevenue >
                analytics.revenue.lastMonthRevenue ? (
                  <Stat.UpIndicator />
                ) : (
                  <Stat.DownIndicator />
                )}
                {(
                  ((analytics.revenue.thisMonthRevenue -
                    analytics.revenue.lastMonthRevenue) /
                    analytics.revenue.lastMonthRevenue) *
                  100
                ).toFixed(2)}
                %
              </Badge>
            </HStack>
          </Stat.Root>
          <Stat.Root {...OUTLINED_PANEL_PROPS}>
            <Stat.Label>
              {t("analytics.orders", { defaultValue: "Orders" })}
            </Stat.Label>
            <HStack>
              <Stat.ValueText>
                {analytics.purchases.thisMonthPurchases}
              </Stat.ValueText>
              <Badge
                colorPalette={
                  analytics.purchases.thisMonthPurchases >
                  analytics.purchases.lastMonthPurchases
                    ? "success"
                    : "red"
                }
                gap={"0"}
              >
                {analytics.purchases.thisMonthPurchases >
                analytics.purchases.lastMonthPurchases ? (
                  <Stat.UpIndicator />
                ) : (
                  <Stat.DownIndicator />
                )}
                {(
                  ((analytics.purchases.thisMonthPurchases -
                    analytics.purchases.lastMonthPurchases) /
                    analytics.purchases.lastMonthPurchases) *
                  100
                ).toFixed(2)}
                %
              </Badge>
            </HStack>
          </Stat.Root>
        </Stack>
      ) : null}
    </>
  );
}
