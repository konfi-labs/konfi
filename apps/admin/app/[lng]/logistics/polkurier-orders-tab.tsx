"use client";

import {
  cancelPolkurierOrder,
  getPolkurierLabel,
  getPolkurierOrders,
} from "@/actions/polkurier";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Card,
  HStack,
  ScrollArea,
  Text,
} from "@chakra-ui/react";
import { ButtonLink, Empty, MaterialSymbol, toaster } from "@konfi/components";
import { SCROLL_MASK_CSS } from "@konfi/utils";
import { useCallback, useEffect, useState } from "react";

type PolkurierOrder = {
  orderId: string;
  orderNumber: string;
  reference: string;
  status: string;
  status_date: string;
  courier: string;
  shipment_type: string;
  tracking_number?: string;
  tracking_url?: string;
  sender: {
    name: string;
    street: string;
    house_number: string;
    postcode: string;
    city: string;
    country: string;
  };
  recipient: {
    name: string;
    street: string;
    house_number: string;
    postcode: string;
    city: string;
    country: string;
    phone?: string;
    email?: string;
  };
  packs: Array<{
    width: number;
    height: number;
    length: number;
    weight: number;
    amount: number;
    type: string;
  }>;
  cod?: {
    amount: number;
    bank_account?: string;
  };
  insurance?: number;
  created_at: string;
  pickup_date?: string;
  raw: Record<string, unknown>;
};

export default function PolkurierOrdersTab() {
  const { t, i18n } = useT(["order", "translation"]);
  const [orders, setOrders] = useState<PolkurierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingOrders, setCancellingOrders] = useState<Set<string>>(
    new Set(),
  );
  const [downloadingLabels, setDownloadingLabels] = useState<Set<string>>(
    new Set(),
  );
  const [totalRows, setTotalRows] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const fetchOrders = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const result = await getPolkurierOrders({ limit: 50, page });
      if (result.success) {
        setOrders(result.orders);
        setTotalRows(result.totalRows || 0);
        setCurrentPage(result.currentPage || 1);
      }
    } catch (err) {
      console.error("Error fetching Polkurier orders:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const handleCancelOrder = async (orderNumber: string) => {
    if (
      !confirm(
        t("logistics.confirmCancelOrder", {
          defaultValue: "Are you sure you want to cancel this order?",
        }),
      )
    ) {
      return;
    }

    setCancellingOrders((prev) => new Set(prev).add(orderNumber));

    try {
      await cancelPolkurierOrder(orderNumber);
      toaster.create({
        title: t("logistics.orderCancelledTitle", {
          defaultValue: "Order cancelled",
        }),
        description: t("logistics.orderCancelledDescription", {
          defaultValue: "The order has been successfully cancelled.",
        }),
        type: "success",
      });

      // Refresh orders list
      await fetchOrders();
    } catch (err) {
      console.error("Error cancelling order:", err);
      toaster.create({
        title: t("logistics.cancelOrderErrorTitle", {
          defaultValue: "Failed to cancel order",
        }),
        description:
          err instanceof Error
            ? err.message
            : t("logistics.cancelOrderErrorDescription", {
                defaultValue: "An error occurred while cancelling the order.",
              }),
        type: "error",
      });
    } finally {
      setCancellingOrders((prev) => {
        const newSet = new Set(prev);
        newSet.delete(orderNumber);
        return newSet;
      });
    }
  };

  const handleOpenTracking = (url?: string) => {
    if (!url) return;
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleDownloadLabel = async (orderNumber: string) => {
    setDownloadingLabels((prev) => new Set(prev).add(orderNumber));

    try {
      const result = await getPolkurierLabel([orderNumber]);

      if (result.success && result.file) {
        // Convert base64 to blob and download
        const byteCharacters = atob(result.file);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `label-${orderNumber}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toaster.create({
          title: t("logistics.labelDownloadedTitle", {
            defaultValue: "Label downloaded",
          }),
          description: t("logistics.labelDownloadedDescription", {
            defaultValue:
              "The shipping label has been downloaded successfully.",
          }),
          type: "success",
        });
      } else {
        throw new Error("Failed to retrieve label");
      }
    } catch (err) {
      console.error("Error downloading label:", err);
      toaster.create({
        title: t("logistics.downloadLabelErrorTitle", {
          defaultValue: "Failed to download label",
        }),
        description:
          err instanceof Error
            ? err.message
            : t("logistics.downloadLabelErrorDescription", {
                defaultValue: "An error occurred while downloading the label.",
              }),
        type: "error",
      });
    } finally {
      setDownloadingLabels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(orderNumber);
        return newSet;
      });
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return dateFormatter.format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const formatAddress = (address: {
    street: string;
    house_number: string;
    postcode: string;
    city: string;
    country: string;
  }) => {
    return `${address.street} ${address.house_number}, ${address.postcode} ${address.city}, ${address.country}`;
  };

  const canCancelOrder = (order: PolkurierOrder) => {
    // Orders can typically be cancelled if they haven't been delivered or already cancelled
    const status = order.status.toLowerCase();
    return !status.includes("dostarczone") && !status.includes("anulowane");
  };

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  if (loading) {
    return <AdminLoadingSkeleton variant="table" showHeader={false} rows={5} />;
  }

  if (process.env.NODE_ENV === "development") {
    console.log(orders);
  }

  if (error) {
    return (
      <Empty
        title={t("logistics.polkurierErrorTitle", {
          defaultValue: "Failed to load Polkurier orders",
        })}
        description={error}
        icon="error"
      />
    );
  }

  if (orders.length === 0) {
    return (
      <Box>
        <HStack justify="space-between" mb="4" gap="3" flexWrap="wrap">
          <Text fontSize="lg" fontWeight="semibold">
            {t("logistics.polkurierOrders", {
              defaultValue: "Polkurier Orders",
            })}
          </Text>
          <ButtonLink
            href="/send-parcel"
            lng={i18n.resolvedLanguage}
            ariaLabel={t("order.sendParcel", { defaultValue: "Send parcel" })}
            colorPalette="primary"
            size="sm"
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("order.sendParcel", { defaultValue: "Send parcel" })}
          </ButtonLink>
        </HStack>

        <Empty
          title={t("logistics.polkurierNoOrdersTitle", {
            defaultValue: "No Polkurier orders found",
          })}
          description={t("logistics.polkurierNoOrdersDescription", {
            defaultValue: "No orders have been created through Polkurier yet.",
          })}
          icon="local_shipping"
        >
          <ButtonLink
            href="/send-parcel"
            lng={i18n.resolvedLanguage}
            ariaLabel={t("order.sendParcel", { defaultValue: "Send parcel" })}
            colorPalette="primary"
            mt="4"
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("order.sendParcel", { defaultValue: "Send parcel" })}
          </ButtonLink>
        </Empty>
      </Box>
    );
  }

  return (
    <Box>
      <HStack justify="space-between" mb="4">
        <Text fontSize="lg" fontWeight="semibold">
          {t("logistics.polkurierOrders", { defaultValue: "Polkurier Orders" })}{" "}
          ({totalRows})
        </Text>
        <HStack gap="2" flexWrap="wrap">
          <ButtonLink
            href="/send-parcel"
            lng={i18n.resolvedLanguage}
            ariaLabel={t("order.sendParcel", { defaultValue: "Send parcel" })}
            colorPalette="primary"
            size="sm"
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("order.sendParcel", { defaultValue: "Send parcel" })}
          </ButtonLink>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            loading={refreshing}
          >
            <MaterialSymbol>refresh</MaterialSymbol>
            {t("logistics.refresh", { defaultValue: "Refresh" })}
          </Button>
        </HStack>
      </HStack>

      <ScrollArea.Root h="75vh">
        <ScrollArea.Viewport css={SCROLL_MASK_CSS} tabIndex={-1}>
          <ScrollArea.Content spaceY="4" tabIndex={-1}>
            {orders.map((order) => (
              <Card.Root
                key={order.orderNumber || order.orderId}
                borderWidth="1px"
                borderRadius="3xl"
                size="sm"
              >
                <Card.Body gap="2">
                  <Card.Title fontWeight="semibold">
                    <HStack gap="2" justify="space-between" w="100%">
                      <HStack gap="2">
                        <Text>#{order.orderNumber || order.orderId}</Text>
                        {order.reference && (
                          <Badge colorPalette="cyan" variant="subtle">
                            {order.reference}
                          </Badge>
                        )}
                      </HStack>
                      <HStack gap="2">
                        <Badge colorPalette="primary" variant="outline">
                          {order.courier}
                        </Badge>
                        <Badge
                          colorPalette={
                            order.status.toLowerCase().includes("deliver")
                              ? "success"
                              : order.status.toLowerCase().includes("cancel")
                                ? "red"
                                : "orange"
                          }
                          variant="subtle"
                        >
                          {order.status}
                        </Badge>
                      </HStack>
                    </HStack>
                  </Card.Title>

                  <HStack
                    gap="8"
                    fontSize="sm"
                    alignItems="flex-start"
                    flexWrap="wrap"
                  >
                    <Box>
                      <Text
                        fontWeight="medium"
                        color={{ base: "gray.700", _dark: "gray.200" }}
                      >
                        {t("logistics.sender", { defaultValue: "Sender" })}:
                      </Text>
                      <Text color={{ base: "gray.600", _dark: "gray.300" }}>
                        {order.sender.name}
                      </Text>
                      <Text
                        color={{ base: "gray.500", _dark: "gray.400" }}
                        fontSize="xs"
                      >
                        {formatAddress(order.sender)}
                      </Text>
                    </Box>

                    <Box>
                      <Text
                        fontWeight="medium"
                        color={{ base: "gray.700", _dark: "gray.200" }}
                      >
                        {t("logistics.recipient", {
                          defaultValue: "Recipient",
                        })}
                        :
                      </Text>
                      <Text color={{ base: "gray.600", _dark: "gray.300" }}>
                        {order.recipient.name}
                      </Text>
                      <Text
                        color={{ base: "gray.500", _dark: "gray.400" }}
                        fontSize="xs"
                      >
                        {formatAddress(order.recipient)}
                      </Text>
                      {order.recipient.phone && (
                        <Text
                          color={{ base: "gray.500", _dark: "gray.400" }}
                          fontSize="xs"
                        >
                          {t("logistics.phone", { defaultValue: "Phone" })}:{" "}
                          {order.recipient.phone}
                        </Text>
                      )}
                    </Box>

                    {order.packs && order.packs.length > 0 && (
                      <Box>
                        <Text
                          fontWeight="medium"
                          color={{ base: "gray.700", _dark: "gray.200" }}
                        >
                          {t("logistics.packages", {
                            defaultValue: "Packages",
                          })}
                          :
                        </Text>
                        {order.packs.map((pack, idx) => (
                          <Text
                            key={idx}
                            color={{ base: "gray.600", _dark: "gray.300" }}
                            fontSize="xs"
                          >
                            {pack.amount}x {pack.width}×{pack.height}×
                            {pack.length} cm, {pack.weight} kg
                          </Text>
                        ))}
                      </Box>
                    )}

                    {order.cod && order.cod.amount > 0 && (
                      <Box>
                        <Badge colorPalette="orange" variant="outline">
                          {t("logistics.cod", { defaultValue: "COD" })}:{" "}
                          {order.cod.amount} PLN
                        </Badge>
                      </Box>
                    )}

                    {order.tracking_number && (
                      <Box>
                        <Text
                          fontWeight="medium"
                          color={{ base: "gray.700", _dark: "gray.200" }}
                        >
                          {t("logistics.trackingNumber", {
                            defaultValue: "Tracking number",
                          })}
                          :
                        </Text>
                        <Text
                          color={{ base: "gray.600", _dark: "gray.300" }}
                          fontSize="xs"
                        >
                          {order.tracking_number}
                        </Text>
                      </Box>
                    )}
                  </HStack>
                </Card.Body>

                <Card.Footer justifyContent="space-between">
                  <Text
                    fontSize="sm"
                    color={{ base: "gray.600", _dark: "gray.300" }}
                  >
                    {t("logistics.created", { defaultValue: "Created" })}:{" "}
                    {formatDate(order.created_at)}
                  </Text>
                  <HStack gap="2">
                    <Button
                      size="xs"
                      colorPalette="blue"
                      variant="outline"
                      onClick={() =>
                        handleDownloadLabel(order.orderNumber || order.orderId)
                      }
                      loading={downloadingLabels.has(
                        order.orderNumber || order.orderId,
                      )}
                    >
                      <MaterialSymbol>download</MaterialSymbol>
                      {t("order.sendParcelForm.downloadLabel", {
                        defaultValue: "Download Label",
                      })}
                    </Button>
                    {canCancelOrder(order) && (
                      <Button
                        size="xs"
                        colorPalette="red"
                        variant="outline"
                        onClick={() =>
                          handleCancelOrder(order.orderNumber || order.orderId)
                        }
                        loading={cancellingOrders.has(
                          order.orderNumber || order.orderId,
                        )}
                      >
                        <MaterialSymbol>cancel</MaterialSymbol>
                        {t("logistics.cancelOrder", { defaultValue: "Cancel" })}
                      </Button>
                    )}
                    {order.tracking_url && (
                      <Button
                        size="xs"
                        colorPalette="primary"
                        onClick={() => handleOpenTracking(order.tracking_url)}
                      >
                        {t("logistics.trackShipment", {
                          defaultValue: "Track shipment",
                        })}
                        <MaterialSymbol>open_in_new</MaterialSymbol>
                      </Button>
                    )}
                  </HStack>
                </Card.Footer>
              </Card.Root>
            ))}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    </Box>
  );
}
