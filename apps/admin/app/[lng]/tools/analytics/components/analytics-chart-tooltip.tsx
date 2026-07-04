"use client";

import { Box, HStack, Text } from "@chakra-ui/react";
import { useColorMode } from "@konfi/components";
import { type ReactNode } from "react";
import { getAnalyticsChartPalette } from "./analytics-chart-theme";

interface AnalyticsChartTooltipRow {
  label: ReactNode;
  swatchColor?: string;
  value: ReactNode;
}

interface AnalyticsChartTooltipProps {
  rows: AnalyticsChartTooltipRow[];
  title?: ReactNode;
}

export function AnalyticsChartTooltip({
  rows,
  title,
}: AnalyticsChartTooltipProps) {
  const { colorMode } = useColorMode();
  const palette = getAnalyticsChartPalette(colorMode);

  return (
    <Box
      bg={palette.tooltipBg}
      borderWidth="1px"
      borderColor={palette.tooltipBorder}
      boxShadow="md"
      rounded="md"
      px="3"
      py="2"
    >
      {title ? (
        <Text
          color={palette.tooltipText}
          fontSize="sm"
          fontWeight="medium"
          mb="1"
        >
          {title}
        </Text>
      ) : null}
      {rows.map((row, index) => (
        <HStack align="center" gap="2" justify="space-between" key={index}>
          <HStack gap="2">
            {row.swatchColor ? (
              <Box bg={row.swatchColor} boxSize="2" rounded="full" />
            ) : null}
            <Text color={palette.tooltipMutedText} fontSize="xs">
              {row.label}
            </Text>
          </HStack>
          <Text
            color={palette.tooltipText}
            fontFamily="mono"
            fontSize="xs"
            fontVariantNumeric="tabular-nums"
            fontWeight="medium"
          >
            {row.value}
          </Text>
        </HStack>
      ))}
    </Box>
  );
}
