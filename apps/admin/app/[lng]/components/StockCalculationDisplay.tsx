"use client";

import { useSheetStockCalculation } from "../../../hooks/useSheetStockCalculation";
import { Box, VStack, Text, Badge, HStack, Separator } from "@chakra-ui/react";
import type { Attribute, Option } from "@konfi/types";

interface StockCalculationDisplayProps {
  quantity: number;
  formatOption?: Option;
  paperAttribute?: Attribute;
  wastagePercent?: number;
}

export function StockCalculationDisplay({
  quantity,
  formatOption,
  paperAttribute,
  wastagePercent = 5,
}: StockCalculationDisplayProps) {
  const calculation = useSheetStockCalculation({
    quantity,
    formatOption,
    paperAttribute,
    wastagePercent,
  });

  if (!calculation) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg="gray.50">
        <Text fontSize="sm" color="gray.600">
          No sheet-based stock calculation available
        </Text>
      </Box>
    );
  }

  return (
    <Box p={4} borderWidth={1} borderRadius="md" bg="primaryAccent.50">
      <VStack align="stretch" gap={3}>
        <Text fontWeight="bold" fontSize="sm">
          Sheet Stock Calculation
        </Text>

        <HStack justify="space-between">
          <Text fontSize="sm">Units per sheet:</Text>
          <Badge colorScheme="blue">{calculation.unitsPerSheet}</Badge>
        </HStack>

        <HStack justify="space-between">
          <Text fontSize="sm">Sheets needed:</Text>
          <Badge colorScheme="green">{calculation.sheetsNeeded}</Badge>
        </HStack>

        <HStack justify="space-between">
          <Text fontSize="sm">Wastage:</Text>
          <Badge colorScheme="orange">{calculation.wastagePercent}%</Badge>
        </HStack>

        <Separator />

        <VStack align="stretch" gap={1}>
          <Text fontSize="xs" color="gray.600">
            Sheet: {calculation.sheetDimensions.width} ×{" "}
            {calculation.sheetDimensions.height} mm
          </Text>
          <Text fontSize="xs" color="gray.600">
            Item: {calculation.itemDimensions.width} ×{" "}
            {calculation.itemDimensions.height} mm
          </Text>
          <Text fontSize="xs" color="gray.600">
            Total units: {calculation.totalUnits}
          </Text>
        </VStack>
      </VStack>
    </Box>
  );
}
