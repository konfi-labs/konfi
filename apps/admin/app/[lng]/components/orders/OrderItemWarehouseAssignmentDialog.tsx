"use client";

import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { assignOrderItemWarehouse } from "@/lib/fulfillment/client";
import type { FulfillmentMutationResponse } from "@/lib/fulfillment/types";
import {
  Button,
  Dialog,
  Flex,
  HStack,
  Select,
  Separator,
  Text,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import type { OrderItem, Warehouse } from "@konfi/types";
import { useCallback, useEffect, useMemo, useState } from "react";

interface OrderItemWarehouseAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  orderId: string;
  orderItem: OrderItem;
  warehouses: Warehouse[];
  onSuccess?: (
    warehouseId: string | undefined,
    result: FulfillmentMutationResponse,
  ) => void;
}

function normalizeTenantId(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return !trimmed || trimmed === "default" ? undefined : trimmed;
}

function getWarehouseLabel(warehouse: Warehouse) {
  return warehouse.name || warehouse.address?.name || warehouse.id;
}

export function OrderItemWarehouseAssignmentDialog({
  open,
  onOpenChange,
  channelId,
  orderId,
  orderItem,
  warehouses,
  onSuccess,
}: OrderItemWarehouseAssignmentDialogProps) {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentWarehouseId = orderItem.warehouseId ?? "";
  const canClearAssignment =
    currentWarehouseId !== "" &&
    orderItem.fulfillmentAssignment?.assignmentSource === "DIRECT";

  useEffect(() => {
    if (open) {
      setSelectedWarehouseId(currentWarehouseId);
    }
  }, [currentWarehouseId, open]);

  const availableWarehouses = useMemo(() => {
    const currentTenantId = normalizeTenantId(tenantContext.tenantId);

    return warehouses.filter((warehouse) => {
      if (tenantContext.deploymentMode !== "saas") {
        return true;
      }

      return normalizeTenantId(warehouse.tenantId) === currentTenantId;
    });
  }, [tenantContext.deploymentMode, tenantContext.tenantId, warehouses]);

  const warehouseCollection = useMemo(
    () =>
      createListCollection({
        items: availableWarehouses.map((warehouse) => ({
          label: getWarehouseLabel(warehouse),
          value: warehouse.id,
        })),
      }),
    [availableWarehouses],
  );

  const selectedWarehouse = useMemo(
    () =>
      availableWarehouses.find(
        (warehouse) => warehouse.id === selectedWarehouseId,
      ),
    [availableWarehouses, selectedWarehouseId],
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedWarehouse) {
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.selectWarehouseForAssignment", {
          defaultValue: "Please select a warehouse",
        }),
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const promise = assignOrderItemWarehouse({
        channelId,
        itemId: orderItem.id,
        orderId,
        warehouseId: selectedWarehouse.id,
      });

      toaster.promise(promise, {
        loading: {
          title: t("admin.assigningWarehouse", {
            defaultValue: "Assigning warehouse...",
          }),
        },
        success: {
          title: t("common.success", { defaultValue: "Success" }),
          description: t("admin.warehouseAssigned", {
            defaultValue: "Warehouse assigned successfully",
          }),
        },
        error: (error) => ({
          title: t("common.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("admin.warehouseAssignmentFailed", {
                  defaultValue: "Failed to assign warehouse",
                }),
        }),
      });

      const result = await promise;
      onSuccess?.(selectedWarehouse.id, result);
      onOpenChange(false);
    } catch (error) {
      console.error("Error assigning order item warehouse:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    channelId,
    onOpenChange,
    onSuccess,
    orderId,
    orderItem.id,
    selectedWarehouse,
    t,
  ]);

  const handleClear = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const promise = assignOrderItemWarehouse({
        channelId,
        itemId: orderItem.id,
        orderId,
      });

      toaster.promise(promise, {
        loading: {
          title: t("admin.clearingWarehouseAssignment", {
            defaultValue: "Clearing warehouse assignment...",
          }),
        },
        success: {
          title: t("common.success", { defaultValue: "Success" }),
          description: t("admin.warehouseAssignmentCleared", {
            defaultValue: "Warehouse assignment cleared successfully",
          }),
        },
        error: (error) => ({
          title: t("common.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("admin.warehouseAssignmentClearFailed", {
                  defaultValue: "Failed to clear warehouse assignment",
                }),
        }),
      });

      const result = await promise;
      onSuccess?.(undefined, result);
      onOpenChange(false);
    } catch (error) {
      console.error("Error clearing order item warehouse assignment:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [channelId, onOpenChange, onSuccess, orderId, orderItem.id, t]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setSelectedWarehouseId(currentWarehouseId);
  }, [currentWarehouseId, onOpenChange]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>
              {currentWarehouseId
                ? t("admin.changeWarehouseAssignment", {
                    defaultValue: "Change warehouse assignment",
                  })
                : t("admin.assignWarehouse", {
                    defaultValue: "Assign warehouse",
                  })}
            </Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <VStack gap={4} align="stretch">
              <Text>
                {t("admin.assignWarehouseDescription", {
                  defaultValue:
                    "Assign this exact order item to an internal warehouse without creating a pending fulfillment request.",
                })}
              </Text>
              <Separator />
              <VStack align="stretch" gap={2}>
                <Text fontWeight="medium">
                  {t("admin.orderItem", { defaultValue: "Order Item" })}:
                </Text>
                <Text color="fg.muted">
                  {orderItem.product?.name || orderItem.name}
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  {t("admin.quantity", { defaultValue: "Quantity" })}:{" "}
                  {orderItem.quantity} {t(`Unit.${orderItem.unit}`)}
                </Text>
              </VStack>
              <Separator />
              <VStack align="stretch" gap={2}>
                <Text fontWeight="medium">
                  {t("admin.warehouse", { defaultValue: "Warehouse" })}*
                </Text>
                <Select.Root
                  collection={warehouseCollection}
                  value={selectedWarehouseId ? [selectedWarehouseId] : []}
                  onValueChange={(event) =>
                    setSelectedWarehouseId((event.value[0] as string) || "")
                  }
                  size="sm"
                  disabled={warehouseCollection.items.length === 0}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t("admin.chooseWarehouse", {
                          defaultValue: "Choose a warehouse...",
                        })}
                      />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      {warehouseCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item}>
                          {item.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
                {warehouseCollection.items.length === 0 ? (
                  <Text fontSize="sm" color="fg.muted">
                    {t("admin.noInternalWarehousesAvailable", {
                      defaultValue: "No internal warehouses are available.",
                    })}
                  </Text>
                ) : null}
              </VStack>
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <Flex gap={3} width="100%" justifyContent="space-between">
              {canClearAssignment ? (
                <Button
                  colorPalette="red"
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  onClick={handleClear}
                  variant="ghost"
                >
                  <MaterialSymbol>link_off</MaterialSymbol>
                  {t("admin.clearWarehouseAssignment", {
                    defaultValue: "Clear assignment",
                  })}
                </Button>
              ) : (
                <span />
              )}
              <HStack gap={3}>
                <Dialog.ActionTrigger asChild>
                  <Button
                    disabled={isSubmitting}
                    onClick={handleCancel}
                    variant="outline"
                  >
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  colorPalette="primary"
                  disabled={
                    isSubmitting ||
                    !selectedWarehouse ||
                    selectedWarehouse.id === currentWarehouseId
                  }
                  loading={isSubmitting}
                  onClick={handleSubmit}
                >
                  <MaterialSymbol>warehouse</MaterialSymbol>
                  {currentWarehouseId
                    ? t("admin.changeWarehouseAssignment", {
                        defaultValue: "Change assignment",
                      })
                    : t("admin.assignWarehouse", {
                        defaultValue: "Assign warehouse",
                      })}
                </Button>
              </HStack>
            </Flex>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
