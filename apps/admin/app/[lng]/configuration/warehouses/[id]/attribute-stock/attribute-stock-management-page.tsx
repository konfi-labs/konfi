"use client";

import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { setAdminAttributeStock } from "@/actions/stock";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  Card,
  Collapsible,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CustomHeading, MaterialSymbol, toaster } from "@konfi/components";
import { getWarehouseAttributeStock } from "@konfi/firebase";
import { Attribute, AttributeStockWithAvailable } from "@konfi/types";
import { useChannels } from "context/channels";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

interface AttributeStockRow {
  attribute: Attribute;
  optionValue: string;
  optionLabel: string;
  stock: AttributeStockWithAvailable | null;
}

export default function AttributeStockManagementPage({
  warehouseId,
}: {
  warehouseId: string;
}) {
  const { channel } = useChannels();
  const [newTotals, setNewTotals] = useState<Record<string, number>>({});
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const { t } = useT();

  // Always create a consistent key, never null to avoid hook order issues
  const swrKey = useMemo(
    () => ["attributeStockEntries", channel?.id || "", warehouseId] as const,
    [channel?.id, warehouseId],
  );

  const fetcher = async ([, channelId, stockWarehouseId]: readonly [
    string,
    string,
    string,
  ]) => {
    if (!channelId) return [] as AttributeStockRow[];

    try {
      // Get all attributes that have stock tracking enabled
      const attributesCollection = collection(firestore, "attributes");
      const attributesSnapshot = await getDocs(attributesCollection);

      const trackingAttributes = attributesSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((attr: any) => attr.trackStock === true) as Attribute[];

      if (trackingAttributes.length === 0) {
        return [];
      }

      // Get all attribute stocks for this warehouse
      const attributeStocks = await getWarehouseAttributeStock(
        firestore,
        channelId,
        stockWarehouseId,
      );

      // Create stock rows combining attribute metadata with stock data
      const stockRows: AttributeStockRow[] = [];

      for (const attribute of trackingAttributes) {
        for (const option of attribute.options) {
          const stockId = `${attribute.id}_${option.value}`;
          const stock = attributeStocks.find((s) => s.id === stockId) || null;

          stockRows.push({
            attribute,
            optionValue: option.value,
            optionLabel: option.label,
            stock,
          });
        }
      }

      return stockRows;
    } catch (error) {
      console.error("Error fetching attribute stock data:", error);
      throw error;
    }
  };

  const {
    data,
    isLoading,
    error: loadError,
    mutate,
  } = useSWR<AttributeStockRow[]>(swrKey, fetcher);

  // Group data by attribute for better organization
  // Move this before any conditional returns to maintain consistent hook order
  const groupedData = useMemo(() => {
    if (!data) return new Map();

    const groups = new Map<string, AttributeStockRow[]>();

    for (const row of data) {
      const attributeId = row.attribute.id;
      if (!groups.has(attributeId)) {
        groups.set(attributeId, []);
      }
      groups.get(attributeId)!.push(row);
    }

    return groups;
  }, [data]);

  // Initialize defaults for newTotals when data changes
  useEffect(() => {
    if (!data) return;
    setNewTotals((prev) => {
      const next = { ...prev };
      for (const row of data) {
        const key = `${row.attribute.id}_${row.optionValue}`;
        if (next[key] === undefined) {
          next[key] = row.stock?.total ?? 0;
        }
      }
      return next;
    });
  }, [data]);

  useEffect(() => {
    if (!loadError) return;
    console.error("Error loading attribute stock data:", loadError);
    toaster.create({
      title: t("common.error"),
      description: t("attributeStock.loadFailed"),
      type: "error",
    });
  }, [loadError, t]);

  const updateStock = async (
    attributeId: string,
    optionValue: string,
    newTotal: number,
  ) => {
    if (!channel?.id) {
      toaster.create({
        title: t("common.error"),
        description: t("admin.noChannelSelected"),
        type: "error",
      });
      return;
    }

    const stockKey = `${attributeId}_${optionValue}`;

    try {
      setUpdating((prev) => ({ ...prev, [stockKey]: true }));

      await setAdminAttributeStock({
        attributeId,
        channelId: channel.id,
        optionValue,
        totalStock: newTotal,
        warehouseId,
      });
      await mutate();

      toaster.create({
        title: t("common.success"),
        description: t("attributeStock.stockUpdated"),
        type: "success",
      });
    } catch (updateError) {
      console.error("Error updating attribute stock:", updateError);
      toaster.create({
        title: t("common.error"),
        description: t("attributeStock.stockUpdateFailed"),
        type: "error",
      });
    } finally {
      setUpdating((prev) => ({ ...prev, [stockKey]: false }));
    }
  };

  const handleTotalChange = (
    attributeId: string,
    optionValue: string,
    value: string,
  ) => {
    const newTotal = parseInt(value) || 0;
    const stockKey = `${attributeId}_${optionValue}`;
    setNewTotals((prev) => ({ ...prev, [stockKey]: newTotal }));
  };

  const handleUpdateClick = (attributeId: string, optionValue: string) => {
    const stockKey = `${attributeId}_${optionValue}`;
    const newTotal = newTotals[stockKey] ?? 0;
    updateStock(attributeId, optionValue, newTotal);
  };

  // Conditional returns must come after all hooks
  if (isLoading) {
    return <AdminLoadingSkeleton variant="cards" rows={6} />;
  }

  return (
    <Box>
      <VStack gap={6} align="stretch">
        <CustomHeading
          heading={t("attributeStock.title")}
          breadcrumb={true}
          goBack={true}
          t={t}
        />

        <Text color={{ base: "gray.600", _dark: "gray.400" }}>
          {t("attributeStock.description", { warehouseId })}
        </Text>

        {Array.from(groupedData.entries()).map(
          ([attributeId, rows]: [string, AttributeStockRow[]]) => {
            const attribute = rows[0]?.attribute;
            if (!attribute) return null;

            return (
              <Card.Root key={attributeId}>
                <Collapsible.Root>
                  <Card.Body gap={4}>
                    <Collapsible.Trigger asChild>
                      <HStack
                        cursor={{ base: "pointer" }}
                        _hover={{ bg: { base: "gray.50", _dark: "gray.800" } }}
                        p={2}
                        borderRadius="md"
                        mx={-2}
                      >
                        <Heading size="md">{attribute.name}</Heading>
                        {attribute.trackStock && (
                          <Badge colorScheme="green" size="sm">
                            {t("attributeStock.stockTracked")}
                          </Badge>
                        )}
                        {attribute.calculateStockFromSheet?.enabled && (
                          <Badge colorScheme="blue" size="sm">
                            {t("attributeStock.sheetBased")}
                          </Badge>
                        )}
                        <MaterialSymbol ml="auto">
                          expand_content
                        </MaterialSymbol>
                      </HStack>
                    </Collapsible.Trigger>

                    <Collapsible.Content>
                      <Grid
                        templateColumns="repeat(auto-fit, minmax(400px, 1fr))"
                        gap={4}
                      >
                        {rows.map((row) => {
                          const stockKey = `${row.attribute.id}_${row.optionValue}`;

                          return (
                            <GridItem key={stockKey}>
                              <Card.Root>
                                <Card.Body gap={3}>
                                  <Text fontWeight="bold">
                                    {row.optionLabel}
                                  </Text>

                                  <HStack justify="space-between">
                                    <Text
                                      fontSize="sm"
                                      color={{
                                        base: "gray.600",
                                        _dark: "gray.400",
                                      }}
                                    >
                                      {t("attributeStock.optionValue")}
                                    </Text>
                                    <Text fontSize="sm">{row.optionValue}</Text>
                                  </HStack>

                                  {row.stock && (
                                    <>
                                      <HStack justify="space-between">
                                        <Text
                                          fontSize="sm"
                                          color={{
                                            base: "gray.600",
                                            _dark: "gray.400",
                                          }}
                                        >
                                          {t("attributeStock.totalStock")}
                                        </Text>
                                        <Text fontSize="sm">
                                          {row.stock.total}
                                        </Text>
                                      </HStack>

                                      <HStack justify="space-between">
                                        <Text
                                          fontSize="sm"
                                          color={{
                                            base: "gray.600",
                                            _dark: "gray.400",
                                          }}
                                        >
                                          {t("attributeStock.allocated")}
                                        </Text>
                                        <Text fontSize="sm">
                                          {row.stock.allocated}
                                        </Text>
                                      </HStack>

                                      <HStack justify="space-between">
                                        <Text
                                          fontSize="sm"
                                          color={{
                                            base: "gray.600",
                                            _dark: "gray.400",
                                          }}
                                        >
                                          {t("attributeStock.available")}
                                        </Text>
                                        <Text
                                          fontSize="sm"
                                          color={{
                                            base: "success.600",
                                            _dark: "success.400",
                                          }}
                                          fontWeight="bold"
                                        >
                                          {row.stock.available}
                                        </Text>
                                      </HStack>
                                    </>
                                  )}

                                  <HStack>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={
                                        newTotals[stockKey] ??
                                        row.stock?.total ??
                                        0
                                      }
                                      onChange={(e) =>
                                        handleTotalChange(
                                          row.attribute.id,
                                          row.optionValue,
                                          e.target.value,
                                        )
                                      }
                                      placeholder={t(
                                        "attributeStock.newTotalStock",
                                      )}
                                    />
                                    <Button
                                      colorPalette="primary"
                                      onClick={() =>
                                        handleUpdateClick(
                                          row.attribute.id,
                                          row.optionValue,
                                        )
                                      }
                                      loading={!!updating[stockKey]}
                                      disabled={!!updating[stockKey]}
                                    >
                                      {t("common.update")}
                                    </Button>
                                  </HStack>

                                  {row.attribute.calculateStockFromSheet
                                    ?.enabled && (
                                    <Card.Root
                                      variant={"subtle"}
                                      borderRadius="3xl"
                                    >
                                      <Card.Body>
                                        <VStack align="stretch" gap={2}>
                                          <Text
                                            fontWeight="bold"
                                            fontSize="sm"
                                            color="primaryAccent.700"
                                          >
                                            {t(
                                              "attributeStock.sheetCalculation.enabled",
                                            )}
                                          </Text>
                                          <Text fontSize="xs" color="gray.600">
                                            {t(
                                              "attributeStock.sheetCalculation.sheet",
                                            )}{" "}
                                            {
                                              row.attribute
                                                .calculateStockFromSheet
                                                .sheetWidth
                                            }{" "}
                                            ×{" "}
                                            {
                                              row.attribute
                                                .calculateStockFromSheet
                                                .sheetHeight
                                            }{" "}
                                            mm
                                          </Text>
                                          <Text fontSize="xs" color="gray.600">
                                            {t(
                                              "attributeStock.sheetCalculation.margin",
                                            )}{" "}
                                            {row.attribute
                                              .calculateStockFromSheet.margin ||
                                              3}
                                            mm,{" "}
                                            {t(
                                              "attributeStock.sheetCalculation.bleed",
                                            )}{" "}
                                            {row.attribute
                                              .calculateStockFromSheet.bleed ||
                                              3}
                                            mm
                                          </Text>
                                        </VStack>
                                      </Card.Body>
                                    </Card.Root>
                                  )}
                                </Card.Body>
                              </Card.Root>
                            </GridItem>
                          );
                        })}
                      </Grid>
                    </Collapsible.Content>
                  </Card.Body>
                </Collapsible.Root>
              </Card.Root>
            );
          },
        )}

        {data && data.length === 0 && (
          <Text
            textAlign="center"
            color={{ base: "gray.500", _dark: "gray.400" }}
          >
            {t("attributeStock.emptyState")}
          </Text>
        )}
      </VStack>
    </Box>
  );
}
