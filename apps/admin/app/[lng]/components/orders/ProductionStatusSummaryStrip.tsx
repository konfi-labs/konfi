"use client";

import { Badge, Box, Button, Grid, Skeleton, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { Tooltip } from "@konfi/components/ui/tooltip";
import {
  type OrderWorkflowStatusesSettings,
  type OrderWorkflowStatusId,
} from "@konfi/types";
import {
  getOrderWorkflowStatusColorPalette,
  getOrderWorkflowStatusIcon,
  getOrderWorkflowStatusLabel,
} from "@konfi/utils/order-workflow-statuses";
import type { TFunction } from "i18next";

interface ProductionStatusSummaryAggregate {
  count: number | null;
  statusId: string;
}

interface ProductionStatusSummaryStripProps {
  activeLocale: string;
  borderRadius: string;
  onVisibleStatusToggle: (
    statusId: OrderWorkflowStatusId,
    checked: boolean,
  ) => void;
  orderWorkflowStatusesSettings: OrderWorkflowStatusesSettings;
  statusSummaryAggregates: ProductionStatusSummaryAggregate[];
  t: TFunction;
  visibleStatusSet: Set<string>;
}

export function ProductionStatusSummaryStrip({
  activeLocale,
  borderRadius,
  onVisibleStatusToggle,
  orderWorkflowStatusesSettings,
  statusSummaryAggregates,
  t,
  visibleStatusSet,
}: ProductionStatusSummaryStripProps) {
  const statusSummaryColumnCount = Math.max(statusSummaryAggregates.length, 1);

  return (
    <Box
      borderColor="border.subtle"
      borderRadius={borderRadius}
      borderWidth="1px"
      overflowX={{ base: "auto", xl: "visible" }}
      px={2}
      py={2}
    >
      <Grid
        gap={1.5}
        gridTemplateColumns={{
          base: `repeat(${statusSummaryColumnCount}, minmax(10.5rem, 1fr))`,
          xl: `repeat(${statusSummaryColumnCount}, minmax(0, 1fr))`,
        }}
        minW={{ base: "max-content", xl: 0 }}
        w="full"
      >
        {statusSummaryAggregates.map(({ count: aggCount, statusId }) => {
          const statusColor = getOrderWorkflowStatusColorPalette(
            statusId,
            orderWorkflowStatusesSettings,
          );
          const statusIcon = getOrderWorkflowStatusIcon(
            statusId,
            orderWorkflowStatusesSettings,
          );
          const statusLabel = getOrderWorkflowStatusLabel(
            statusId,
            orderWorkflowStatusesSettings,
            t,
            activeLocale,
          );
          const isVisible = visibleStatusSet.has(statusId);

          return (
            <Tooltip
              key={statusId}
              content={t("orders.productionView.summary.toggleHint", {
                defaultValue: "Click to show or hide this section",
              })}
            >
              <Button
                aria-pressed={isVisible}
                color="fg"
                colorPalette="gray"
                flexShrink={0}
                h="full"
                justifyContent="flex-start"
                minW={{ base: "10.5rem", xl: 0 }}
                opacity={isVisible ? 1 : 0.6}
                size="sm"
                transition="opacity 120ms ease, background 120ms ease"
                variant={isVisible ? "surface" : "ghost"}
                w="full"
                onClick={() => onVisibleStatusToggle(statusId, !isVisible)}
              >
                <Box
                  as="span"
                  color={isVisible ? "colorPalette.fg" : "fg.muted"}
                  colorPalette={statusColor}
                  display="inline-flex"
                  flexShrink={0}
                >
                  <MaterialSymbol>{statusIcon}</MaterialSymbol>
                </Box>
                <Text as="span" flex="1" minW={0} textAlign="start" truncate>
                  {statusLabel}
                </Text>
                {aggCount === null ? (
                  <Skeleton flexShrink={0} h="4" rounded="full" w="8" />
                ) : (
                  <Badge
                    colorPalette="gray"
                    flexShrink={0}
                    fontVariantNumeric="tabular-nums"
                    size="xs"
                    variant={isVisible ? "surface" : "outline"}
                  >
                    {aggCount}
                  </Badge>
                )}
              </Button>
            </Tooltip>
          );
        })}
      </Grid>
    </Box>
  );
}
