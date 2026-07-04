"use client";

import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualFulfillmentRequest } from "@/lib/fulfillment/client";
import {
  Badge,
  Button,
  Dialog,
  Flex,
  HStack,
  Select,
  Separator,
  Spinner,
  Text,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import {
  type FulfillmentRequest,
  FulfillmentRequestStatus,
  type OrderItem,
  type TenantCooperation,
  type Warehouse,
  hasProductionCooperationPaidPlans,
  hasTenantCooperationProductSharingAccess,
} from "@konfi/types";
import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

interface ManualFulfillmentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  orderId: string;
  orderItem: OrderItem;
  warehouses: Warehouse[];
  onSuccess?: () => void;
}

interface FulfillmentTargetOption {
  cooperationId?: string;
  label: string;
  sourceTenantId?: string;
  targetTenantId?: string;
  value: string;
  warehouseId: string;
}

export function ManualFulfillmentRequestDialog({
  open,
  onOpenChange,
  channelId,
  orderId,
  orderItem,
  warehouses,
  onSuccess,
}: ManualFulfillmentRequestDialogProps) {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingRequests, setExistingRequests] = useState<
    FulfillmentRequest[]
  >([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [tenantCooperations, setTenantCooperations] = useState<
    TenantCooperation[]
  >([]);
  const [loadingCooperations, setLoadingCooperations] = useState(false);
  const productId = orderItem.product?.id;
  const shouldLoadTenantCooperations =
    open && tenantContext.deploymentMode === "saas" && !!tenantContext.tenantId;

  // Load existing pending requests for this item when dialog opens
  useEffect(() => {
    if (!open || !orderId || !orderItem.id) {
      setExistingRequests([]);
      return;
    }

    const loadExistingRequests = async () => {
      setLoadingRequests(true);
      try {
        const requestsRef = collectionGroup(firestore, "fulfillmentRequests");
        const q = query(
          requestsRef,
          where("orderId", "==", orderId),
          where("itemId", "==", orderItem.id),
          where("status", "in", [
            FulfillmentRequestStatus.PENDING,
            FulfillmentRequestStatus.ACCEPTED,
          ]),
        );

        const snapshot = await getDocs(q);
        const requests = snapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id }) as FulfillmentRequest,
        );
        setExistingRequests(requests);
      } catch (error) {
        console.error("Error loading existing requests:", error);
      } finally {
        setLoadingRequests(false);
      }
    };

    loadExistingRequests();
  }, [open, orderId, orderItem.id]);

  useEffect(() => {
    if (!shouldLoadTenantCooperations) {
      setTenantCooperations([]);
      setLoadingCooperations(false);
      return;
    }

    const loadTenantCooperations = async () => {
      setLoadingCooperations(true);
      try {
        const cooperationsRef = collection(firestore, "tenantCooperations");
        const q = query(
          cooperationsRef,
          where("sourceTenantId", "==", tenantContext.tenantId),
          where("status", "==", "ACTIVE"),
          where("transport", "==", "SAME_DATABASE"),
        );

        const snapshot = await getDocs(q);
        setTenantCooperations(
          snapshot.docs
            .map(
              (doc) =>
                ({
                  ...doc.data(),
                  id: doc.id,
                }) as TenantCooperation,
            )
            .filter(
              (cooperation) =>
                cooperation.active !== false &&
                hasProductionCooperationPaidPlans(cooperation),
            ),
        );
      } catch (error) {
        console.error("Error loading tenant cooperations:", error);
        setTenantCooperations([]);
      } finally {
        setLoadingCooperations(false);
      }
    };

    loadTenantCooperations();
  }, [shouldLoadTenantCooperations, tenantContext.tenantId]);

  const targetOptions = useMemo<FulfillmentTargetOption[]>(() => {
    const warehousesWithRequests = new Set(
      existingRequests.map((request) => request.targetWarehouseId),
    );
    const cooperationTargets = productId
      ? tenantCooperations.flatMap((cooperation) =>
          hasTenantCooperationProductSharingAccess(cooperation, productId)
            ? (cooperation.targetWarehouseIds ?? [])
                .filter(
                  (warehouseId) => !warehousesWithRequests.has(warehouseId),
                )
                .map((warehouseId) => ({
                  cooperationId: cooperation.id,
                  label: t("admin.cooperationTargetLabel", {
                    defaultValue: "{{target}} / {{warehouse}}",
                    target:
                      cooperation.targetParticipantId ||
                      cooperation.targetTenantId ||
                      t("admin.cooperationTarget", {
                        defaultValue: "Cooperation target",
                      }),
                    warehouse: warehouseId,
                  }),
                  sourceTenantId: cooperation.sourceTenantId,
                  targetTenantId: cooperation.targetTenantId,
                  value: `cooperation:${cooperation.id}:${warehouseId}`,
                  warehouseId,
                }))
            : [],
        )
      : [];

    return cooperationTargets;
  }, [existingRequests, productId, t, tenantCooperations]);

  const warehouseCollection = useMemo(
    () =>
      createListCollection({
        items: targetOptions.map((target) => ({
          label: target.label,
          value: target.value,
        })),
      }),
    [targetOptions],
  );

  const selectedTarget = useMemo(
    () => targetOptions.find((target) => target.value === selectedTargetKey),
    [selectedTargetKey, targetOptions],
  );

  const getWarehouseName = useCallback(
    (warehouseId: string) => {
      return warehouses.find((w) => w.id === warehouseId)?.name || warehouseId;
    },
    [warehouses],
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedTarget) {
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.selectProductionTarget", {
          defaultValue: "Please select a production target",
        }),
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const promise = createManualFulfillmentRequest({
        channelId,
        orderId,
        itemId: orderItem.id,
        warehouseId: selectedTarget.warehouseId,
        sourceTenantId: selectedTarget.sourceTenantId,
        targetTenantId: selectedTarget.targetTenantId,
        cooperationId: selectedTarget.cooperationId,
      });

      toaster.promise(promise, {
        loading: {
          title: t("admin.creatingFulfillmentRequest", {
            defaultValue: "Creating fulfillment request...",
          }),
        },
        success: {
          title: t("common.success", { defaultValue: "Success" }),
          description: t("admin.fulfillmentRequestCreated", {
            defaultValue: "Fulfillment request created successfully",
          }),
        },
        error: (error) => ({
          title: t("common.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("admin.fulfillmentRequestCreateError", {
                  defaultValue: "Failed to create fulfillment request",
                }),
        }),
      });

      await promise;
      onOpenChange(false);
      setSelectedTargetKey("");
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error creating manual fulfillment request:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedTarget,
    channelId,
    orderId,
    orderItem.id,
    t,
    onOpenChange,
    onSuccess,
  ]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setSelectedTargetKey("");
  }, [onOpenChange]);

  const getStatusBadge = (status: FulfillmentRequestStatus) => {
    const statusConfig = {
      [FulfillmentRequestStatus.PENDING]: {
        colorPalette: "yellow",
        label: t(
          `FulfillmentRequestStatus.${FulfillmentRequestStatus.PENDING}`,
        ),
      },
      [FulfillmentRequestStatus.ACCEPTED]: {
        colorPalette: "success",
        label: t(
          `FulfillmentRequestStatus.${FulfillmentRequestStatus.ACCEPTED}`,
        ),
      },
      [FulfillmentRequestStatus.REJECTED]: {
        colorPalette: "red",
        label: t(
          `FulfillmentRequestStatus.${FulfillmentRequestStatus.REJECTED}`,
        ),
      },
      [FulfillmentRequestStatus.FULFILLED]: {
        colorPalette: "blue",
        label: t(
          `FulfillmentRequestStatus.${FulfillmentRequestStatus.FULFILLED}`,
        ),
      },
      [FulfillmentRequestStatus.CANCELLED]: {
        colorPalette: "gray",
        label: t(
          `FulfillmentRequestStatus.${FulfillmentRequestStatus.CANCELLED}`,
        ),
      },
    };

    const config = statusConfig[status];
    return (
      <Badge colorPalette={config.colorPalette} size="sm">
        {config.label}
      </Badge>
    );
  };

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
              {t("admin.createManualFulfillmentRequest", {
                defaultValue: "Create Fulfillment Request",
              })}
            </Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <VStack gap={4} align="stretch">
              <Text>
                {t("admin.createFulfillmentRequestDescription", {
                  defaultValue:
                    "Request fulfillment for this order item from a specific warehouse.",
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

              {/* Existing requests section */}
              {loadingRequests || loadingCooperations ? (
                <HStack gap={2}>
                  <Spinner size="sm" />
                  <Text fontSize="sm" color="fg.muted">
                    {t("common.loading", { defaultValue: "Loading..." })}
                  </Text>
                </HStack>
              ) : existingRequests.length > 0 ? (
                <VStack align="stretch" gap={2}>
                  <Separator />
                  <Text fontWeight="medium" color="orange.600">
                    <MaterialSymbol>warning</MaterialSymbol>{" "}
                    {t("admin.existingFulfillmentRequests", {
                      defaultValue: "Existing Requests",
                    })}
                  </Text>
                  <VStack align="stretch" gap={1}>
                    {existingRequests.map((request) => (
                      <HStack
                        key={request.id}
                        p={2}
                        borderRadius="md"
                        bg="bg.subtle"
                        justify="space-between"
                      >
                        <Text fontSize="sm">
                          {getWarehouseName(request.targetWarehouseId)}
                        </Text>
                        {getStatusBadge(request.status)}
                      </HStack>
                    ))}
                  </VStack>
                  <Text fontSize="xs" color="fg.muted">
                    {t("admin.existingRequestsNote", {
                      defaultValue:
                        "Warehouses with active requests are excluded from the selection below.",
                    })}
                  </Text>
                </VStack>
              ) : null}

              <Separator />
              <VStack align="stretch" gap={2}>
                <Text fontWeight="medium">
                  {t("admin.selectProductionTarget", {
                    defaultValue: "Select production target",
                  })}
                  *
                </Text>
                <Select.Root
                  collection={warehouseCollection}
                  value={selectedTargetKey ? [selectedTargetKey] : []}
                  onValueChange={(e) =>
                    setSelectedTargetKey((e.value[0] as string) || "")
                  }
                  size="sm"
                  disabled={
                    warehouseCollection.items.length === 0 ||
                    loadingRequests ||
                    loadingCooperations
                  }
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t("admin.chooseProductionTarget", {
                          defaultValue: "Choose a production target...",
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
                {warehouseCollection.items.length === 0 &&
                  !loadingRequests &&
                  !loadingCooperations && (
                    <Text fontSize="sm" color="fg.muted">
                      {existingRequests.length > 0
                        ? t("admin.allTargetsHaveRequests", {
                            defaultValue:
                              "All available production targets already have active requests for this item.",
                          })
                        : t("admin.noAvailableProductionTargets", {
                            defaultValue:
                              "No cooperation production targets are available",
                          })}
                    </Text>
                  )}
              </VStack>
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <Flex gap={3} width="100%" justifyContent="flex-end">
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" onClick={handleCancel}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="primary"
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  !selectedTarget ||
                  loadingRequests ||
                  loadingCooperations
                }
                loading={isSubmitting}
              >
                <MaterialSymbol>assignment_add</MaterialSymbol>
                {t("admin.createRequest", { defaultValue: "Create Request" })}
              </Button>
            </Flex>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
