"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  acceptFulfillmentRequest,
  rejectFulfillmentRequest,
  updateItemStatus,
} from "@/lib/fulfillment/client";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  Badge,
  Button,
  Dialog,
  Flex,
  HStack,
  Separator,
  Skeleton,
  Spacer,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  DataTable,
  IconButtonLink,
  MaterialSymbol,
  RefreshButton,
  SearchInput,
  toaster,
  Tooltip,
} from "@konfi/components";
import {
  FulfillmentRequest,
  FulfillmentRequestStatus,
  Order,
  OrderItem,
} from "@konfi/types";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useAuth } from "context/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

// TTL: 2 days in milliseconds
const TTL_MS = 2 * 24 * 60 * 60 * 1000;

interface FulfillmentRequestsPageProps {
  warehouseId: string;
}

/**
 * Calculate remaining time until TTL expiry
 * Returns null if not a PENDING request or already expired
 */
function getTTLInfo(
  request: FulfillmentRequest,
): { remainingMs: number; isExpiring: boolean } | null {
  if (request.status !== FulfillmentRequestStatus.PENDING) {
    return null;
  }

  const requestedAt = request.requestedAt as Timestamp;
  if (!requestedAt?.toDate) {
    return null;
  }

  const requestedTime = requestedAt.toDate().getTime();
  const expiryTime = requestedTime + TTL_MS;
  const now = Date.now();
  const remainingMs = expiryTime - now;

  if (remainingMs <= 0) {
    return { remainingMs: 0, isExpiring: true };
  }

  // Consider "expiring" if less than 12 hours remaining
  const isExpiring = remainingMs < 12 * 60 * 60 * 1000;

  return { remainingMs, isExpiring };
}

/**
 * Format remaining time as human-readable string
 */
function formatRemainingTime(ms: number, t: TFunction): string {
  if (ms <= 0) {
    return t("admin.ttlExpired", { defaultValue: "Expired" });
  }

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return t("admin.ttlDaysHours", {
        defaultValue: `${days}d ${remainingHours}h`,
        days: days,
        remainingHours: remainingHours,
      });
    }
    return t("admin.ttlDays", { defaultValue: `${days}d`, days: days });
  }

  if (hours > 0) {
    return t("admin.ttlHoursMinutes", {
      defaultValue: `${hours}h ${minutes}m`,
      hours: hours,
      minutes: minutes,
    });
  }

  return t("admin.ttlMinutes", {
    defaultValue: `${minutes}m`,
    minutes: minutes,
  });
}

const FulfillmentRequestsPage = ({
  warehouseId,
}: FulfillmentRequestsPageProps) => {
  const { t, i18n } = useT(["order", "orders", "translation"]);
  const { user } = useAuth();
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<FulfillmentRequest | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const columHelper = createColumnHelper<FulfillmentRequest>();

  // Fetch fulfillment requests using useSWR
  const swrKey = useMemo(
    () =>
      warehouseId ? (["fulfillmentRequests", warehouseId] as const) : null,
    [warehouseId],
  );

  const fetcher = async ([, warehouseId]: readonly [string, string]) => {
    try {
      const requestsRef = collection(
        firestore,
        `warehouses/${warehouseId}/fulfillmentRequests`,
      );
      const q = query(
        requestsRef,
        where("active", "==", true),
        orderBy("requestedAt", "desc"),
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id }) as FulfillmentRequest,
      );
    } catch (error) {
      console.error("Error fetching fulfillment requests:", error);
      return [];
    }
  };

  const {
    data: requests,
    error,
    isLoading,
    mutate,
  } = useSWR<FulfillmentRequest[]>(swrKey, fetcher);

  const data = useMemo<FulfillmentRequest[]>(
    () =>
      requests
        ? filterLocalFuseItems(requests, searchKey ?? "", {
            keys: [
              { name: "productName", weight: 0.55 },
              {
                getFn: (request) => String(request.orderNumber ?? ""),
                name: "orderNumber",
                weight: 0.2,
              },
              { name: "status", weight: 0.15 },
              { name: "orderId", weight: 0.1 },
            ],
            threshold: 0.36,
          })
        : [],
    [requests, searchKey],
  );

  const [orderItemsMap, setOrderItemsMap] = useState<
    Record<string, OrderItem | undefined>
  >({});
  const [itemStatuses, setItemStatuses] = useState<
    Record<string, { inProgress: boolean; fulfilled: boolean } | null>
  >({});

  const getItemKey = useCallback(
    (request: FulfillmentRequest) =>
      `${request.channelId}__${request.orderId}__${request.itemId}`,
    [],
  );

  useEffect(() => {
    if (!requests || requests.length === 0) {
      setOrderItemsMap({});
      setItemStatuses({});
      return;
    }

    let isActive = true;

    const fetchOrderStatuses = async () => {
      try {
        const uniqueOrdersMap = new Map<
          string,
          { channelId: string; orderId: string }
        >();

        requests.forEach((request) => {
          const orderKey = `${request.channelId}__${request.orderId}`;
          if (!uniqueOrdersMap.has(orderKey)) {
            uniqueOrdersMap.set(orderKey, {
              channelId: request.channelId,
              orderId: request.orderId,
            });
          }
        });

        const orderEntries = await Promise.all(
          Array.from(uniqueOrdersMap.entries()).map(
            async ([orderKey, { channelId, orderId }]) => {
              try {
                const orderRef = doc(
                  firestore,
                  `channels/${channelId}/orders/${orderId}`,
                );
                const orderSnapshot = await getDoc(orderRef);

                if (!orderSnapshot.exists()) {
                  return { orderKey, order: null } as const;
                }

                return {
                  orderKey,
                  order: {
                    ...orderSnapshot.data(),
                    id: orderSnapshot.id,
                  } as Order,
                } as const;
              } catch (error) {
                console.error("Error fetching order:", error);
                return { orderKey, order: null } as const;
              }
            },
          ),
        );

        if (!isActive) {
          return;
        }

        const ordersByKey = new Map(
          orderEntries.map((entry) => [entry.orderKey, entry.order]),
        );
        const nextOrderItems: Record<string, OrderItem | undefined> = {};
        const nextItemStatuses: Record<
          string,
          { inProgress: boolean; fulfilled: boolean } | null
        > = {};

        requests.forEach((request) => {
          const itemKey = getItemKey(request);
          const orderKey = `${request.channelId}__${request.orderId}`;
          const order = ordersByKey.get(orderKey);

          if (!order) {
            nextOrderItems[itemKey] = undefined;
            nextItemStatuses[itemKey] = null;
            return;
          }

          const orderItem = order.items.find(
            (item) => item.id === request.itemId,
          );

          nextOrderItems[itemKey] = orderItem;
          if (!orderItem) {
            nextItemStatuses[itemKey] = null;
            return;
          }

          const fulfilledItems = order.fulfilledItems ?? [];
          const inProgressItems = order.inProgressItems ?? [];

          nextItemStatuses[itemKey] = {
            fulfilled: fulfilledItems.includes(request.itemId),
            inProgress: inProgressItems.includes(request.itemId),
          };
        });

        setOrderItemsMap(nextOrderItems);
        setItemStatuses(nextItemStatuses);
      } catch (error) {
        console.error("Error loading order item statuses:", error);
      }
    };

    fetchOrderStatuses();

    return () => {
      isActive = false;
    };
  }, [requests, getItemKey]);

  const handleAccept = useCallback(
    async (request: FulfillmentRequest) => {
      if (!user) return;

      setProcessing(true);
      try {
        const promise = (async () => {
          const response = await acceptFulfillmentRequest({
            warehouseId,
            requestId: request.id,
          });
          await mutate();
          return response;
        })();

        toaster.promise(promise, {
          loading: {
            title: t("admin.acceptingFulfillmentRequest", {
              defaultValue: "Accepting fulfillment request...",
            }),
          },
          success: (result) => ({
            title: t("common.success", { defaultValue: "Success" }),
            description:
              result?.message ??
              t("admin.fulfillmentRequestAccepted", {
                defaultValue: "Fulfillment request accepted",
              }),
          }),
          error: (error) => ({
            title: t("common.error", { defaultValue: "Error" }),
            description:
              error instanceof Error
                ? error.message
                : t("admin.fulfillmentRequestAcceptError", {
                    defaultValue: "Failed to accept fulfillment request",
                  }),
          }),
        });

        await promise;
      } catch (error) {
        console.error("Error accepting request:", error);
      } finally {
        setProcessing(false);
      }
    },
    [warehouseId, user, t, mutate],
  );

  const handleReject = useCallback(async (request: FulfillmentRequest) => {
    setSelectedRequest(request);
    setShowRejectDialog(true);
  }, []);

  const confirmReject = useCallback(async () => {
    if (!user || !selectedRequest) return;

    setProcessing(true);
    try {
      const promise = (async () => {
        const response = await rejectFulfillmentRequest({
          warehouseId,
          requestId: selectedRequest.id,
          reason: rejectReason || undefined,
        });
        await mutate();
        return response;
      })();

      toaster.promise(promise, {
        loading: {
          title: t("admin.rejectingFulfillmentRequest", {
            defaultValue: "Rejecting fulfillment request...",
          }),
        },
        success: (result) => ({
          title: t("common.success", { defaultValue: "Success" }),
          description:
            result?.message ??
            t("admin.fulfillmentRequestRejected", {
              defaultValue: "Fulfillment request rejected",
            }),
        }),
        error: (error) => ({
          title: t("common.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("admin.fulfillmentRequestRejectError", {
                  defaultValue: "Failed to reject fulfillment request",
                }),
        }),
      });

      await promise;

      setShowRejectDialog(false);
      setSelectedRequest(null);
      setRejectReason("");
    } catch (error) {
      console.error("Error rejecting request:", error);
    } finally {
      setProcessing(false);
    }
  }, [warehouseId, user, selectedRequest, rejectReason, t, mutate]);

  const refreshRequests = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleMarkInProgress = useCallback(
    async (request: FulfillmentRequest, targetInProgress: boolean) => {
      if (!user) {
        return;
      }

      const itemKey = getItemKey(request);
      const orderItem = orderItemsMap[itemKey];
      const currentStatus = itemStatuses[itemKey];

      if (!orderItem) {
        toaster.create({
          title: t("common.error"),
          description: t("order.itemStatusUpdateError", {
            defaultValue: "Failed to update item status",
          }),
          type: "error",
        });
        return;
      }

      if (orderItem.warehouseId && orderItem.warehouseId !== warehouseId) {
        toaster.create({
          title: t("common.error"),
          description: t("admin.fulfillmentRequestAssignmentMismatch", {
            defaultValue: "Item is assigned to another warehouse.",
          }),
          type: "error",
        });
        return;
      }

      if (
        currentStatus &&
        currentStatus.inProgress === targetInProgress &&
        !processing
      ) {
        return;
      }

      setProcessing(true);

      try {
        const promise = (async () => {
          const response = await updateItemStatus({
            channelId: request.channelId,
            orderId: request.orderId,
            itemId: request.itemId,
            inProgress: targetInProgress,
          });

          setItemStatuses((prev) => ({
            ...prev,
            [itemKey]: {
              inProgress: targetInProgress,
              fulfilled: targetInProgress
                ? false
                : (prev[itemKey]?.fulfilled ?? false),
            },
          }));

          await mutate();
          return response;
        })();

        toaster.promise(promise, {
          loading: {
            title: t("order.updatingItemStatus", {
              defaultValue: "Updating item status...",
            }),
          },
          success: () => ({
            title: t("common.success", { defaultValue: "Success" }),
            description: targetInProgress
              ? t("order.itemInProgress", { defaultValue: "Item in progress" })
              : t("order.itemRemovedFromInProgress", {
                  defaultValue: "Item removed from in progress",
                }),
          }),
          error: (error) => ({
            title: t("order.itemInProgressError", { defaultValue: "Error" }),
            description:
              error instanceof Error
                ? error.message
                : t("order.itemInProgressErrorDescription", {
                    defaultValue:
                      "An error occurred while updating in-progress items.",
                  }),
          }),
        });

        await promise;
      } catch (error) {
        console.error("Error updating item status:", error);
      } finally {
        setProcessing(false);
      }
    },
    [
      user,
      getItemKey,
      orderItemsMap,
      itemStatuses,
      mutate,
      t,
      warehouseId,
      processing,
    ],
  );

  const handleMarkFulfilled = useCallback(
    async (request: FulfillmentRequest, targetFulfilled: boolean) => {
      if (!user) {
        return;
      }

      const itemKey = getItemKey(request);
      const orderItem = orderItemsMap[itemKey];
      const currentStatus = itemStatuses[itemKey];

      if (!orderItem) {
        toaster.create({
          title: t("common.error"),
          description: t("order.itemStatusUpdateError", {
            defaultValue: "Failed to update item status",
          }),
          type: "error",
        });
        return;
      }

      if (orderItem.warehouseId && orderItem.warehouseId !== warehouseId) {
        toaster.create({
          title: t("common.error"),
          description: t("admin.fulfillmentRequestAssignmentMismatch", {
            defaultValue: "Item is assigned to another warehouse.",
          }),
          type: "error",
        });
        return;
      }

      if (
        currentStatus &&
        currentStatus.fulfilled === targetFulfilled &&
        !processing
      ) {
        return;
      }

      setProcessing(true);

      try {
        const promise = (async () => {
          const response = await updateItemStatus({
            channelId: request.channelId,
            orderId: request.orderId,
            itemId: request.itemId,
            fulfilled: targetFulfilled,
          });

          setItemStatuses((prev) => ({
            ...prev,
            [itemKey]: {
              fulfilled: targetFulfilled,
              inProgress: targetFulfilled
                ? false
                : (prev[itemKey]?.inProgress ?? false),
            },
          }));

          await mutate();
          return response;
        })();

        toaster.promise(promise, {
          loading: {
            title: t("order.updatingItemStatus", {
              defaultValue: "Updating item status...",
            }),
          },
          success: () => ({
            title: t("common.success", { defaultValue: "Success" }),
            description: targetFulfilled
              ? t("order.itemFulfilled", { defaultValue: "Item fulfilled" })
              : t("order.itemRemovedFromFulfilled", {
                  defaultValue: "Item removed from fulfilled",
                }),
          }),
          error: (error) => ({
            title: t("order.itemFulfilledError", { defaultValue: "Error" }),
            description:
              error instanceof Error
                ? error.message
                : t("order.itemFulfilledErrorDescription", {
                    defaultValue:
                      "An error occurred while updating fulfilled items.",
                  }),
          }),
        });

        await promise;
      } catch (error) {
        console.error("Error updating item status:", error);
      } finally {
        setProcessing(false);
      }
    },
    [
      user,
      getItemKey,
      orderItemsMap,
      itemStatuses,
      mutate,
      t,
      warehouseId,
      processing,
    ],
  );

  const getStatusBadge = (status: FulfillmentRequestStatus) => {
    const statusConfig = {
      [FulfillmentRequestStatus.PENDING]: {
        colorPalette: "yellow",
        label: `FulfillmentRequestStatus.${FulfillmentRequestStatus.PENDING}`,
      },
      [FulfillmentRequestStatus.ACCEPTED]: {
        colorPalette: "success",
        label: `FulfillmentRequestStatus.${FulfillmentRequestStatus.ACCEPTED}`,
      },
      [FulfillmentRequestStatus.REJECTED]: {
        colorPalette: "red",
        label: `FulfillmentRequestStatus.${FulfillmentRequestStatus.REJECTED}`,
      },
      [FulfillmentRequestStatus.FULFILLED]: {
        colorPalette: "blue",
        label: `FulfillmentRequestStatus.${FulfillmentRequestStatus.FULFILLED}`,
      },
      [FulfillmentRequestStatus.CANCELLED]: {
        colorPalette: "gray",
        label: `FulfillmentRequestStatus.${FulfillmentRequestStatus.CANCELLED}`,
      },
    };

    const config = statusConfig[status];
    return <Badge colorPalette={config.colorPalette}>{t(config.label)}</Badge>;
  };

  const columns = useMemo<ColumnDef<FulfillmentRequest, any>[]>(
    () => [
      columHelper.accessor("orderNumber", {
        cell: (info) => `#${info.getValue()}`,
        header: t("orders.order"),
      }),
      columHelper.accessor("productName", {
        cell: (info) => info.getValue(),
        header: t("common.product"),
      }),
      columHelper.accessor("quantity", {
        cell: (info) =>
          `${info.getValue()} ` + t(`Unit.${info.row.original.unit}`),
        header: t("common.quantity"),
      }),
      columHelper.accessor("status", {
        cell: (info) => getStatusBadge(info.getValue()),
        header: t("status"),
      }),
      columHelper.display({
        id: "item-status",
        header: t("order.itemStatus", { defaultValue: "Item status" }),
        cell: (props) => {
          const request = props.row.original;
          const itemKey = getItemKey(request);
          const status = itemStatuses[itemKey];

          if (typeof status === "undefined") {
            return "-";
          }

          if (status === null) {
            return (
              <Badge colorPalette="red">
                {t("common.notAvailable", { defaultValue: "Not available" })}
              </Badge>
            );
          }

          if (status.fulfilled) {
            return (
              <Badge colorPalette="success">
                {t("order.fulfilled", { defaultValue: "Fulfilled" })}
              </Badge>
            );
          }

          if (status.inProgress) {
            return (
              <Badge colorPalette="blue">
                {t("order.inProgress", { defaultValue: "In progress" })}
              </Badge>
            );
          }

          return (
            <Badge colorPalette="gray">
              {t("order.itemPending", { defaultValue: "Pending" })}
            </Badge>
          );
        },
      }),
      columHelper.accessor("requestedAt", {
        cell: (info) =>
          info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
        header: t("admin.requestedAt"),
      }),
      columHelper.display({
        id: "ttl",
        header: t("admin.expiresIn", { defaultValue: "Expires in" }),
        cell: (props) => {
          const request = props.row.original;
          const ttlInfo = getTTLInfo(request);

          if (!ttlInfo) {
            return <Text color="fg.muted">-</Text>;
          }

          const { remainingMs, isExpiring } = ttlInfo;
          const formattedTime = formatRemainingTime(remainingMs, t);

          if (remainingMs <= 0) {
            return (
              <Badge colorPalette="red" size="sm">
                <MaterialSymbol>timer_off</MaterialSymbol>
                {formattedTime}
              </Badge>
            );
          }

          if (isExpiring) {
            return (
              <Tooltip
                content={t("admin.ttlExpiringWarning", {
                  defaultValue:
                    "This request will auto-cancel soon if not accepted",
                })}
              >
                <Badge colorPalette="orange" size="sm">
                  <MaterialSymbol>schedule</MaterialSymbol>
                  {formattedTime}
                </Badge>
              </Tooltip>
            );
          }

          return (
            <HStack gap={1}>
              <MaterialSymbol color="fg.muted">schedule</MaterialSymbol>
              <Text fontSize="sm" color="fg.muted">
                {formattedTime}
              </Text>
            </HStack>
          );
        },
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => {
          const request = props.row.original;
          const isPending = request.status === FulfillmentRequestStatus.PENDING;
          const isAccepted =
            request.status === FulfillmentRequestStatus.ACCEPTED;
          const itemKey = getItemKey(request);
          const itemStatus = itemStatuses[itemKey];
          const statusUnavailable =
            typeof itemStatus === "undefined" || itemStatus === null;
          const isInProgress = itemStatus?.inProgress ?? false;
          const isFulfilled = itemStatus?.fulfilled ?? false;
          const disableStatusActions = processing || statusUnavailable;

          return (
            <Flex
              justify={"end"}
              align="center"
              gap={"1"}
              onClick={(e) => e.stopPropagation()}
            >
              {request.url && (
                <IconButtonLink
                  lng={i18n.resolvedLanguage}
                  href={request.url}
                  icon={"visibility"}
                  ariaLabel={t("admin.viewOrder")}
                  tooltipLabel={t("admin.viewOrderDetails")}
                  prefetch={false}
                />
              )}
              {isPending && (
                <>
                  <Button
                    size="xs"
                    colorPalette="success"
                    onClick={() => handleAccept(request)}
                    disabled={processing}
                  >
                    <MaterialSymbol>check</MaterialSymbol>
                    {t("common.accept")}
                  </Button>
                  <Button
                    size="xs"
                    colorPalette="red"
                    onClick={() => handleReject(request)}
                    disabled={processing}
                  >
                    <MaterialSymbol>close</MaterialSymbol>
                    {t("common.reject")}
                  </Button>
                </>
              )}
              {isAccepted && (
                <>
                  <Button
                    size="xs"
                    colorPalette="blue"
                    onClick={() => handleMarkInProgress(request, !isInProgress)}
                    disabled={disableStatusActions}
                  >
                    <MaterialSymbol>schedule</MaterialSymbol>
                    {isInProgress
                      ? t("order.itemRemoveFromInProgress", {
                          defaultValue: "Mark as pending",
                        })
                      : t("order.inProgress")}
                  </Button>
                  <Button
                    size="xs"
                    colorPalette="success"
                    onClick={() => handleMarkFulfilled(request, !isFulfilled)}
                    disabled={disableStatusActions}
                  >
                    <MaterialSymbol>check_circle</MaterialSymbol>
                    {isFulfilled
                      ? t("order.itemMarkAsUnfulfilled", {
                          defaultValue: "Mark as unfulfilled",
                        })
                      : t("order.fulfilled")}
                  </Button>
                </>
              )}
            </Flex>
          );
        },
      }),
    ],
    [
      columHelper,
      i18n.resolvedLanguage,
      t,
      handleAccept,
      handleReject,
      handleMarkInProgress,
      handleMarkFulfilled,
      processing,
      getStatusBadge,
      getItemKey,
      itemStatuses,
    ],
  );

  return (
    <>
      <CustomHeading
        heading={t("ROUTES.fulfillmentRequests")}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex>
        <SearchInput
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          placeholder={t("admin.searchByProductName")}
          t={t}
        />
        <Spacer />
        <RefreshButton
          label={t("common.refresh")}
          refreshFunction={refreshRequests}
        />
      </Flex>
      <Separator my={"6"} />

      {isLoading ? (
        <Skeleton height={"300px"} />
      ) : data && data.length > 0 ? (
        <DataTable<FulfillmentRequest>
          columns={columns}
          data={data}
          enableSorting
          paginationType="uncontrolled"
          t={t}
          i18n={i18n}
        />
      ) : (
        <Text color="fg.muted">{t("admin.noFulfillmentRequests")}</Text>
      )}

      {/* Reject Dialog */}
      <Dialog.Root
        open={showRejectDialog}
        onOpenChange={(e) => {
          setShowRejectDialog(e.open);
          if (!e.open) {
            setSelectedRequest(null);
            setRejectReason("");
          }
        }}
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{t("admin.rejectFulfillmentRequest")}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack gap={"4"} align={"stretch"}>
                <Text>{t("admin.confirmRejectFulfillmentRequest")}</Text>
                <Text fontSize={"sm"} color={"gray.600"}>
                  {t("orders.order")}: #{selectedRequest?.orderNumber}
                </Text>
                <Text fontSize={"sm"} color={"gray.600"}>
                  {t("common.product")}: {selectedRequest?.productName}
                </Text>
                <VStack align={"stretch"} gap={"2"}>
                  <Text fontSize={"sm"} fontWeight={"medium"}>
                    {t("admin.reasonOptional")}:
                  </Text>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t("admin.enterRejectionReason")}
                    rows={3}
                  />
                </VStack>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <Button variant="outline" disabled={processing}>
                  {t("common.cancel")}
                </Button>
              </Dialog.CloseTrigger>
              <Button
                colorPalette="red"
                onClick={confirmReject}
                disabled={processing}
              >
                {processing ? t("common.processing") : t("admin.rejectRequest")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </>
  );
};

export default FulfillmentRequestsPage;
