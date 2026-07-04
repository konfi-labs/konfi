"use client";

import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { setAdminProductStock } from "@/actions/stock";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
  Card,
  Grid,
  GridItem,
  HStack,
  Input,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CustomHeading, toaster } from "@konfi/components";
import { getStock } from "@konfi/firebase";
import {
  InventoryLedgerSubjectType,
  type InventoryMovement,
  Product,
  StockWithAvailable,
} from "@konfi/types";
import { useChannels } from "context/channels";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

interface StockRow {
  product: Product;
  stock: StockWithAvailable | null;
}

function timestampToMillis(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    const millis = value.toMillis();
    return typeof millis === "number" && Number.isFinite(millis) ? millis : 0;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date ? date.getTime() : 0;
  }

  return 0;
}

function formatMovementDate(value: unknown, locale?: string): string {
  const millis = timestampToMillis(value);
  if (millis <= 0) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(millis));
}

export default function StockManagementPage({
  warehouseId,
}: {
  warehouseId: string;
}) {
  const { channel } = useChannels();
  const [newTotals, setNewTotals] = useState<Record<string, number>>({});
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const { i18n, t } = useT();

  const swrKey = useMemo(
    () =>
      channel?.id ? (["stockEntries", channel.id, warehouseId] as const) : null,
    [channel?.id, warehouseId],
  );

  const fetcher = async () => {
    if (!channel?.id) {
      return { movements: [], rows: [] };
    }

    // Get all products in the channel
    const productsCollection = collection(
      firestore,
      `channels/${channel.id}/products`,
    );
    const productsSnapshot = await getDocs(productsCollection);

    const products = productsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Product[];

    const movementsCollection = collection(
      firestore,
      `channels/${channel.id}/warehouses/${warehouseId}/inventoryMovements`,
    );
    const [rows, movementsSnapshot] = await Promise.all([
      products.map(async (product) => {
        const stock = await getStock(
          firestore,
          channel.id!,
          warehouseId,
          product.id,
        );
        return { product, stock } as StockRow;
      }),
      getDocs(movementsCollection),
    ]);

    const movements = movementsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as InventoryMovement[];

    return { movements, rows: await Promise.all(rows) };
  };

  const {
    data,
    isLoading,
    error: loadError,
    mutate,
  } = useSWR<{ movements: InventoryMovement[]; rows: StockRow[] }>(
    swrKey,
    fetcher,
  );

  const stockRows = data?.rows;
  const movementsByProductId = useMemo(() => {
    const grouped = new Map<string, InventoryMovement[]>();

    for (const movement of data?.movements ?? []) {
      if (
        movement.subjectType !== InventoryLedgerSubjectType.PRODUCT ||
        !movement.productId
      ) {
        continue;
      }

      const existing = grouped.get(movement.productId) ?? [];
      existing.push(movement);
      grouped.set(movement.productId, existing);
    }

    for (const [productId, movements] of grouped) {
      grouped.set(
        productId,
        movements
          .toSorted(
            (left, right) =>
              timestampToMillis(right.createdAt) -
              timestampToMillis(left.createdAt),
          )
          .slice(0, 3),
      );
    }

    return grouped;
  }, [data?.movements]);

  // Initialize defaults for newTotals when data changes (without overwriting edited values)
  useEffect(() => {
    if (!stockRows) return;
    setNewTotals((prev) => {
      const next = { ...prev };
      for (const row of stockRows) {
        if (next[row.product.id] === undefined) {
          next[row.product.id] = row.stock?.total ?? 0;
        }
      }
      return next;
    });
  }, [stockRows]);

  useEffect(() => {
    if (!loadError) return;
    console.error("Error loading stock data:", loadError);
    queueMicrotask(() => {
      toaster.create({
        title: t("common.error"),
        description: t("stock.failedToLoad"),
        type: "error",
      });
    });
  }, [loadError, t]);

  const updateStock = async (productId: string, newTotal: number) => {
    if (!channel?.id) return;

    try {
      setUpdating((prev) => ({ ...prev, [productId]: true }));

      await setAdminProductStock({
        channelId: channel.id,
        productId,
        totalStock: newTotal,
        warehouseId,
      });
      // Refresh the stock data
      await mutate();

      toaster.create({
        title: t("common.success"),
        description: t("stock.updatedSuccessfully"),
        type: "success",
      });
    } catch (updateError) {
      console.error("Error updating stock:", updateError);
      toaster.create({
        title: t("common.error"),
        description: t("stock.failedToUpdate"),
        type: "error",
      });
    } finally {
      setUpdating((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleTotalChange = (productId: string, value: string) => {
    const newTotal = parseInt(value) || 0;
    setNewTotals((prev) => ({ ...prev, [productId]: newTotal }));
  };

  const handleUpdateClick = (productId: string, newTotal: number) => {
    updateStock(productId, newTotal);
  };

  if (isLoading) {
    return <AdminLoadingSkeleton variant="cards" rows={6} />;
  }

  return (
    <Box>
      <VStack gap={6} align="stretch">
        <CustomHeading
          heading={t("stock.title")}
          breadcrumb={true}
          goBack={true}
          t={t}
        />

        <Text color={{ base: "gray.600", _dark: "gray.400" }}>
          {t("stock.inventoryDescription", { warehouseId })}
        </Text>

        <Grid templateColumns="repeat(auto-fit, minmax(400px, 1fr))" gap={4}>
          {stockRows?.map((entry) => {
            const recentMovements =
              movementsByProductId.get(entry.product.id) ?? [];

            return (
              <GridItem key={entry.product.id}>
                <Card.Root>
                  <Card.Body gap={3}>
                    <Text fontWeight="bold">{entry.product.name}</Text>

                    <HStack justify="space-between">
                      <Text
                        fontSize="sm"
                        color={{ base: "gray.600", _dark: "gray.400" }}
                      >
                        {t("stock.productId")}
                      </Text>
                      <Text fontSize="sm">{entry.product.id}</Text>
                    </HStack>

                    {entry.stock && (
                      <>
                        <HStack justify="space-between">
                          <Text
                            fontSize="sm"
                            color={{ base: "gray.600", _dark: "gray.400" }}
                          >
                            {t("stock.totalStock")}
                          </Text>
                          <Text fontSize="sm">{entry.stock.total}</Text>
                        </HStack>

                        <HStack justify="space-between">
                          <Text
                            fontSize="sm"
                            color={{ base: "gray.600", _dark: "gray.400" }}
                          >
                            {t("stock.allocated")}
                          </Text>
                          <Text fontSize="sm">{entry.stock.allocated}</Text>
                        </HStack>

                        <HStack justify="space-between">
                          <Text
                            fontSize="sm"
                            color={{ base: "gray.600", _dark: "gray.400" }}
                          >
                            {t("stock.available")}
                          </Text>
                          <Text
                            fontSize="sm"
                            color={{
                              base: "success.600",
                              _dark: "success.400",
                            }}
                            fontWeight="bold"
                          >
                            {entry.stock.available}
                          </Text>
                        </HStack>
                      </>
                    )}

                    <HStack>
                      <Input
                        type="number"
                        min="0"
                        value={
                          newTotals[entry.product.id] ?? entry.stock?.total ?? 0
                        }
                        onChange={(e) =>
                          handleTotalChange(entry.product.id, e.target.value)
                        }
                        placeholder={t("stock.newTotalStock")}
                      />
                      <Button
                        colorPalette="primary"
                        onClick={() =>
                          handleUpdateClick(
                            entry.product.id,
                            newTotals[entry.product.id] ??
                              entry.stock?.total ??
                              0,
                          )
                        }
                        loading={!!updating[entry.product.id]}
                        disabled={!!updating[entry.product.id]}
                      >
                        {t("common.update")}
                      </Button>
                    </HStack>

                    {recentMovements.length > 0 ? (
                      <>
                        <Separator />
                        <VStack align="stretch" gap={2}>
                          <Text fontSize="sm" fontWeight="semibold">
                            {t("stock.recentMovements", {
                              defaultValue: "Recent stock movements",
                            })}
                          </Text>
                          {recentMovements.map((movement) => (
                            <Box key={movement.id}>
                              <HStack justify="space-between" gap={3}>
                                <Text fontSize="sm" fontWeight="medium">
                                  {t(
                                    `InventoryMovementType.${movement.movementType}`,
                                    {
                                      defaultValue: movement.movementType,
                                    },
                                  )}
                                </Text>
                                <Text fontSize="sm">
                                  {formatMovementDate(
                                    movement.createdAt,
                                    i18n.resolvedLanguage,
                                  )}
                                </Text>
                              </HStack>
                              <HStack
                                color={{ base: "gray.600", _dark: "gray.400" }}
                                fontSize="xs"
                                gap={3}
                                wrap="wrap"
                              >
                                <Text>
                                  {t("stock.movementQuantity", {
                                    defaultValue: "Quantity",
                                  })}
                                  : {movement.quantity}
                                </Text>
                                {movement.resultingTotal !== undefined ? (
                                  <Text>
                                    {t("stock.movementResultingTotal", {
                                      defaultValue: "Resulting total",
                                    })}
                                    : {movement.resultingTotal}
                                  </Text>
                                ) : null}
                                {movement.reason ? (
                                  <Text>{movement.reason}</Text>
                                ) : null}
                              </HStack>
                            </Box>
                          ))}
                        </VStack>
                      </>
                    ) : null}
                  </Card.Body>
                </Card.Root>
              </GridItem>
            );
          })}
        </Grid>

        {stockRows && stockRows.length === 0 && (
          <Text
            textAlign="center"
            color={{ base: "gray.500", _dark: "gray.400" }}
          >
            {t("stock.noProductsFound")}
          </Text>
        )}
      </VStack>
    </Box>
  );
}
