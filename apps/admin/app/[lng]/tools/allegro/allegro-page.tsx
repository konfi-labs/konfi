"use client";

import OrderForm from "@/components/orders/OrderForm";
import { useAuth } from "@/context/auth";
import { useChannels } from "@/context/channels";
import { useCatalog } from "@/context/catalog";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import AllegroExportWizard from "./allegro-export-wizard";
import {
  canUseProductForAllegroImport,
  loadAllegroImportDefaultProduct,
} from "@/lib/allegro-import-settings";
import {
  createAllegroExternalSource,
  mapAllegroOrderToDuplicateDraft,
  AllegroAuthStatus,
  AllegroOrder,
  AllegroOrdersResponse,
  AllegroPrice,
} from "@/lib/allegro-order-import";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Checkbox,
  Dialog,
  Flex,
  Field,
  HStack,
  IconButton,
  Input,
  Portal,
  Select,
  SimpleGrid,
  Skeleton,
  Spacer,
  Tabs,
  Text,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import {
  ALLEGRO_ORDER_FULFILLMENT_STATUSES,
  ALLEGRO_READONLY_ORDER_FULFILLMENT_STATUSES,
  type AllegroOrderFulfillmentStatus,
  type AllegroOrderFulfillmentUpdateResponse,
  isAllegroOrderFulfillmentStatus,
  isAllegroReadonlyOrderFulfillmentStatus,
  shouldAutoMoveImportedAllegroOrderToProcessing,
} from "@/lib/allegro-order-fulfillment";
import {
  ButtonLink,
  CustomHeading,
  Empty,
  MaterialSymbol,
  RefreshButton,
  toaster,
} from "@konfi/components";
import { db, update } from "@konfi/firebase";
import { Order, Product } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

// ---------- helpers ----------

const STATUS_COLORS: Record<string, string> = {
  BOUGHT: "blue",
  FILLED_IN: "yellow",
  READY_FOR_PROCESSING: "success",
  CANCELLED: "red",
};

const STATUS_LABELS: Record<string, { key: string; defaultValue: string }> = {
  BOUGHT: {
    key: "allegro.status.bought",
    defaultValue: "Bought",
  },
  FILLED_IN: {
    key: "allegro.status.filledIn",
    defaultValue: "Filled in",
  },
  READY_FOR_PROCESSING: {
    key: "allegro.status.readyForProcessing",
    defaultValue: "Ready for processing",
  },
  CANCELLED: {
    key: "allegro.status.cancelled",
    defaultValue: "Cancelled",
  },
  NEW: {
    key: "allegro.status.new",
    defaultValue: "New",
  },
  PROCESSING: {
    key: "allegro.status.processing",
    defaultValue: "Processing",
  },
  READY_FOR_SHIPMENT: {
    key: "allegro.status.readyForShipment",
    defaultValue: "Ready for shipment",
  },
  SENT: {
    key: "allegro.status.sent",
    defaultValue: "Sent",
  },
  DELIVERED: {
    key: "allegro.status.delivered",
    defaultValue: "Delivered",
  },
  READY_FOR_PICKUP: {
    key: "allegro.status.readyForPickup",
    defaultValue: "Ready for pickup",
  },
  PICKED_UP: {
    key: "allegro.status.pickedUp",
    defaultValue: "Picked up",
  },
  SUSPENDED: {
    key: "allegro.status.suspended",
    defaultValue: "Suspended",
  },
  RETURNED: {
    key: "allegro.status.returned",
    defaultValue: "Returned",
  },
};

const ALLEGRO_CHECKOUT_FORM_STATUSES = [
  "BOUGHT",
  "FILLED_IN",
  "READY_FOR_PROCESSING",
  "CANCELLED",
] as const;

const ALLEGRO_SHIPMENT_SUMMARY_STATUSES = ["NONE", "SOME", "ALL"] as const;

type SelectOptionItem = {
  label: string;
  value: string;
};

interface AllegroSelectFieldProps {
  disabled?: boolean;
  items: SelectOptionItem[];
  label: string;
  onChange: (value: string) => void;
  value: string;
}

const allSelectValue = "__all__";

function AllegroSelectField({
  disabled,
  items,
  label,
  onChange,
  value,
}: AllegroSelectFieldProps) {
  const collection = useMemo(() => createListCollection({ items }), [items]);

  return (
    <Field.Root minW={{ base: "100%", md: "180px" }}>
      <Field.Label>{label}</Field.Label>
      <Select.Root
        collection={collection}
        disabled={disabled}
        value={[value]}
        onValueChange={(details) => {
          onChange(details.value[0] ?? allSelectValue);
        }}
      >
        <Select.HiddenSelect />
        <Select.Control>
          <Select.Trigger>
            <Select.ValueText />
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              {collection.items.map((item) => (
                <Select.Item item={item} key={item.value}>
                  {item.label}
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>
    </Field.Root>
  );
}

function formatAllegroStatus(
  status: string,
  t: (key: string, options: { defaultValue: string }) => string,
): string {
  const translation = STATUS_LABELS[status];
  if (translation) {
    return t(translation.key, { defaultValue: translation.defaultValue });
  }

  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function getAllegroFulfillmentStatus(order: AllegroOrder): string {
  return order.fulfillment?.status ?? "NEW";
}

function canChangeAllegroFulfillmentStatus(order: AllegroOrder): boolean {
  const fulfillmentStatus = getAllegroFulfillmentStatus(order);
  return (
    order.fulfillment?.provider?.id !== "ALLEGRO" &&
    isAllegroOrderFulfillmentStatus(fulfillmentStatus) &&
    !isAllegroReadonlyOrderFulfillmentStatus(fulfillmentStatus)
  );
}

// ---------- component ----------

const AllegroPage = () => {
  const { t, i18n } = useT(["allegro", "translation"]);
  const { userInfo } = useAuth();
  const { channel, channels, loadingChannels, setChannel } = useChannels();
  const { searchProductsInput } = useCatalog();
  const searchParams = useSearchParams();
  const searchParamsChannelId = searchParams.get("channelId")?.trim() ?? "";
  const [oauthChannelId, setOauthChannelId] = useState(searchParamsChannelId);
  const requestedChannelId = searchParamsChannelId || oauthChannelId;
  const [authStatus, setAuthStatus] = useState<AllegroAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<AllegroOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingImportId, setLoadingImportId] = useState<string | null>(null);
  const [importDraftOrder, setImportDraftOrder] = useState<Order | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [orderSearchTerm, setOrderSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(allSelectValue);
  const [fulfillmentStatusFilter, setFulfillmentStatusFilter] =
    useState(allSelectValue);
  const [fulfillmentProviderFilter, setFulfillmentProviderFilter] =
    useState(allSelectValue);
  const [shipmentSummaryFilter, setShipmentSummaryFilter] =
    useState(allSelectValue);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkStatus, setBulkStatus] =
    useState<AllegroOrderFulfillmentStatus>("PROCESSING");
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [detailsOrder, setDetailsOrder] = useState<AllegroOrder | null>(null);
  const [offset, setOffset] = useState(0);
  const [activeTab, setActiveTab] = useState("orders");
  const limit = 25;

  const allegroAuthUrl = useMemo(() => {
    const params = new URLSearchParams();
    const channelId = channel?.id ?? requestedChannelId;
    if (channelId) {
      params.set("channelId", channelId);
    }

    const query = params.toString();
    return query ? `/api/auth/allegro?${query}` : "/api/auth/allegro";
  }, [channel?.id, requestedChannelId]);
  const hasMissingAllegroScopes = Boolean(
    authStatus?.missingScopes && authStatus.missingScopes.length > 0,
  );

  useEffect(() => {
    if (searchParamsChannelId) {
      setOauthChannelId(searchParamsChannelId);
    }
  }, [searchParamsChannelId]);

  useEffect(() => {
    if (
      !requestedChannelId ||
      loadingChannels ||
      channel?.id === requestedChannelId
    ) {
      return;
    }

    const canSelectRequestedChannel = channels?.some(
      (candidate) => candidate.id === requestedChannelId,
    );
    if (canSelectRequestedChannel) {
      setChannel({ value: requestedChannelId });
    }
  }, [channel?.id, channels, loadingChannels, requestedChannelId, setChannel]);

  useEffect(() => {
    if (!showImportForm) {
      setImportDraftOrder(null);
    }
  }, [showImportForm]);

  const duplicateInitialOverrides = useMemo(
    () =>
      importDraftOrder
        ? { paymentStatus: importDraftOrder.paymentStatus }
        : undefined,
    [importDraftOrder],
  );

  const importExternalSource = useMemo(() => {
    if (!importDraftOrder) {
      return undefined;
    }
    if (importDraftOrder.externalSource) {
      return importDraftOrder.externalSource;
    }
    const matchingOrder = orders.find(
      (order) => order.id === importDraftOrder.id,
    );
    return matchingOrder
      ? createAllegroExternalSource({ ...matchingOrder })
      : undefined;
  }, [importDraftOrder, orders]);

  const createOverrides = useMemo(
    () =>
      importDraftOrder
        ? {
            externalSource: importExternalSource,
          }
        : undefined,
    [importDraftOrder, importExternalSource],
  );

  // ---------- toast on redirect ----------

  useEffect(() => {
    if (typeof window === "undefined") return;

    const redirectSearchParams = new URLSearchParams(window.location.search);
    const success = redirectSearchParams.get("success");
    const error = redirectSearchParams.get("error");
    const errorDescriptionFromQuery =
      redirectSearchParams.get("error_description");

    if (!success && !error) return;

    if (success === "allegro_connected") {
      toaster.success({
        title: t("allegro.connectSuccessTitle", {
          defaultValue: "Allegro connected",
        }),
        description: t("allegro.connectSuccessDescription", {
          defaultValue: "Your Allegro account is now connected.",
        }),
      });
    } else if (error) {
      const errorDescriptions: Record<
        string,
        { key: string; defaultValue: string }
      > = {
        allegro_auth_failed: {
          key: "allegro.connectErrorAuth",
          defaultValue:
            "Allegro returned an authorization error. Please try again.",
        },
        invalid_callback: {
          key: "allegro.connectErrorCallback",
          defaultValue:
            "Invalid callback parameters. Please try connecting again.",
        },
        state_mismatch: {
          key: "allegro.connectErrorState",
          defaultValue: "Your session expired. Please try connecting again.",
        },
        token_exchange_failed: {
          key: "allegro.connectErrorToken",
          defaultValue: "We couldn't complete the Allegro token exchange.",
        },
      };

      const errorConfig = errorDescriptions[error];
      const errorDescription = errorConfig
        ? t(errorConfig.key, { defaultValue: errorConfig.defaultValue })
        : errorDescriptionFromQuery ||
          t("allegro.connectErrorGeneric", {
            defaultValue: "Something went wrong while connecting to Allegro.",
          });

      toaster.error({
        title: t("allegro.connectErrorTitle", {
          defaultValue: "Allegro connection failed",
        }),
        description: errorDescription,
      });
    }

    const nextSearchParams = new URLSearchParams(window.location.search);
    nextSearchParams.delete("success");
    nextSearchParams.delete("error");
    nextSearchParams.delete("error_description");
    const nextSearch = nextSearchParams.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash || ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [t]);

  // ---------- auth ----------

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/allegro/status", {
        cache: "no-store",
      });
      const data = (await response.json()) as AllegroAuthStatus & {
        error?: string;
      };

      if (!response.ok) {
        console.error("Allegro auth status request failed:", data.error);
      }

      setAuthStatus(data);

      if (data.error) {
        toaster.error({
          title: t("allegro.connectErrorTitle", {
            defaultValue: "Allegro connection failed",
          }),
          description: data.error,
        });
      }

      return data.connected;
    } catch (error) {
      console.error("Failed to check Allegro auth status:", error);
      setAuthStatus({ connected: false, user: null });
      return false;
    } finally {
      setLoading(false);
    }
  }, [t]);

  // ---------- fetch orders ----------

  const fetchOrders = useCallback(
    async (pageOffset = 0) => {
      setLoadingOrders(true);
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(pageOffset),
          sort: "-lineItems.boughtAt",
        });
        if (statusFilter !== allSelectValue) {
          params.set("status", statusFilter);
        }
        if (fulfillmentStatusFilter !== allSelectValue) {
          params.set("fulfillment.status", fulfillmentStatusFilter);
        }
        if (fulfillmentProviderFilter !== allSelectValue) {
          params.set("fulfillment.provider.id", fulfillmentProviderFilter);
        }
        if (shipmentSummaryFilter !== allSelectValue) {
          params.set(
            "fulfillment.shipmentSummary.lineItemsSent",
            shipmentSummaryFilter,
          );
        }
        const response = await fetch(`/api/allegro/orders?${params}`);
        if (!response.ok) {
          if (response.status === 401) {
            setAuthStatus({ connected: false, user: null });
            return;
          }
          throw new Error("Failed to fetch orders");
        }
        const data: AllegroOrdersResponse = await response.json();
        setOrders(data.checkoutForms ?? []);
        setSelectedOrderIds(new Set());
        setTotalCount(data.totalCount ?? 0);
      } catch (error) {
        console.error("Failed to fetch Allegro orders:", error);
        toaster.error({
          title: t("allegro.orders.fetchError", {
            defaultValue: "Failed to fetch orders",
          }),
        });
      } finally {
        setLoadingOrders(false);
      }
    },
    [
      fulfillmentProviderFilter,
      fulfillmentStatusFilter,
      shipmentSummaryFilter,
      statusFilter,
      t,
    ],
  );

  // ---------- disconnect ----------

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/auth/allegro/status", { method: "DELETE" });
      setAuthStatus({ connected: false, user: null });
      setOrders([]);
      setTotalCount(0);
      setOffset(0);
      toaster.success({
        title: t("allegro.disconnected", {
          defaultValue: "Disconnected from Allegro",
        }),
      });
    } catch (error) {
      console.error("Failed to disconnect from Allegro:", error);
      toaster.error({
        title: t("allegro.disconnectError", {
          defaultValue: "Failed to disconnect",
        }),
      });
    }
  }, [t]);

  // ---------- init ----------

  useEffect(() => {
    const init = async () => {
      const isConnected = await checkAuthStatus();
      if (isConnected) {
        await fetchOrders(0);
      }
    };
    init();
  }, [checkAuthStatus, fetchOrders]);

  // ---------- pagination ----------

  const currentPage = useMemo(() => Math.floor(offset / limit) + 1, [offset]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / limit)),
    [totalCount],
  );
  const lastPageOffset = useMemo(
    () => Math.max(0, (totalPages - 1) * limit),
    [totalPages],
  );
  const canGoPrevious = offset > 0;
  const canGoNext = offset + limit < totalCount;

  const handleNextPage = useCallback(() => {
    const next = Math.min(lastPageOffset, offset + limit);
    setOffset(next);
    fetchOrders(next);
  }, [offset, fetchOrders, lastPageOffset]);

  const handlePrevPage = useCallback(() => {
    const prev = Math.max(0, offset - limit);
    setOffset(prev);
    fetchOrders(prev);
  }, [offset, fetchOrders]);

  const handleFirstPage = useCallback(() => {
    setOffset(0);
    fetchOrders(0);
  }, [fetchOrders]);

  const handleLastPage = useCallback(() => {
    setOffset(lastPageOffset);
    fetchOrders(lastPageOffset);
  }, [fetchOrders, lastPageOffset]);

  // ---------- format ----------

  const formatDate = useCallback(
    (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString(i18n.resolvedLanguage, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [i18n.resolvedLanguage],
  );

  const formatPrice = useCallback(
    (price?: AllegroPrice) => {
      if (!price) return "—";
      return new Intl.NumberFormat(i18n.resolvedLanguage, {
        style: "currency",
        currency: price.currency,
      }).format(Number(price.amount));
    },
    [i18n.resolvedLanguage],
  );

  const checkoutStatusOptions = useMemo(
    () => [
      {
        label: t("common.all", { defaultValue: "All" }),
        value: allSelectValue,
      },
      ...ALLEGRO_CHECKOUT_FORM_STATUSES.map((status) => ({
        label: formatAllegroStatus(status, t),
        value: status,
      })),
    ],
    [t],
  );

  const fulfillmentStatusOptions = useMemo(
    () => [
      {
        label: t("common.all", { defaultValue: "All" }),
        value: allSelectValue,
      },
      ...[
        ...ALLEGRO_ORDER_FULFILLMENT_STATUSES,
        ...ALLEGRO_READONLY_ORDER_FULFILLMENT_STATUSES,
      ].map((status) => ({
        label: formatAllegroStatus(status, t),
        value: status,
      })),
    ],
    [t],
  );

  const fulfillmentStatusActionOptions = useMemo(
    () =>
      ALLEGRO_ORDER_FULFILLMENT_STATUSES.map((status) => ({
        label: formatAllegroStatus(status, t),
        value: status,
      })),
    [t],
  );

  const fulfillmentProviderOptions = useMemo(
    () => [
      {
        label: t("common.all", { defaultValue: "All" }),
        value: allSelectValue,
      },
      {
        label: t("allegro.orders.fulfillmentProviderSeller", {
          defaultValue: "Seller fulfilled",
        }),
        value: "SELLER",
      },
      {
        label: t("allegro.orders.fulfillmentProviderAllegro", {
          defaultValue: "Allegro fulfilled",
        }),
        value: "ALLEGRO",
      },
    ],
    [t],
  );

  const shipmentSummaryOptions = useMemo(
    () => [
      {
        label: t("common.all", { defaultValue: "All" }),
        value: allSelectValue,
      },
      ...ALLEGRO_SHIPMENT_SUMMARY_STATUSES.map((status) => ({
        label: t(`allegro.shipmentSummary.${status}`, {
          defaultValue: status,
        }),
        value: status,
      })),
    ],
    [t],
  );

  const visibleOrders = useMemo(() => {
    const normalizedSearch = orderSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return orders;
    }

    return orders.filter((order) =>
      [
        order.id,
        order.payment?.id,
        order.buyer.login,
        order.buyer.email,
        order.buyer.firstName,
        order.buyer.lastName,
        order.buyer.companyName,
        order.messageToSeller,
        ...order.lineItems.flatMap((lineItem) => [
          lineItem.id,
          lineItem.offer.id,
          lineItem.offer.name,
          lineItem.offer.external?.id,
        ]),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
  }, [orderSearchTerm, orders]);

  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedOrderIds.has(order.id)),
    [orders, selectedOrderIds],
  );

  const selectedMutableOrders = useMemo(
    () => selectedOrders.filter(canChangeAllegroFulfillmentStatus),
    [selectedOrders],
  );

  const setOrderSelection = useCallback((orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(orderId);
      } else {
        next.delete(orderId);
      }
      return next;
    });
  }, []);

  const handleSelectVisibleOrders = useCallback(
    (checked: boolean) => {
      setSelectedOrderIds((current) => {
        const next = new Set(current);
        for (const order of visibleOrders) {
          if (checked) {
            next.add(order.id);
          } else {
            next.delete(order.id);
          }
        }
        return next;
      });
    },
    [visibleOrders],
  );

  const updateFulfillmentStatus = useCallback(
    async (
      updates: Array<{
        id: string;
        revision?: string;
        status: AllegroOrderFulfillmentStatus;
      }>,
    ) => {
      if (updates.length === 0) return false;

      setUpdatingOrderIds((current) => {
        const next = new Set(current);
        updates.forEach((fulfillmentUpdate) => next.add(fulfillmentUpdate.id));
        return next;
      });

      try {
        const response = await fetch("/api/allegro/orders/fulfillment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
        const payload =
          (await response.json()) as AllegroOrderFulfillmentUpdateResponse & {
            error?: string;
          };

        if (!response.ok && !payload.results) {
          throw new Error(payload.error ?? "Failed to update Allegro status");
        }

        const successfulUpdates = new Map(
          payload.results
            .filter((result) => result.ok && result.status)
            .map((result) => [result.id, result.status!]),
        );
        const failedResults = payload.results.filter((result) => !result.ok);

        if (successfulUpdates.size > 0) {
          setOrders((current) =>
            current.map((order) => {
              const nextStatus = successfulUpdates.get(order.id);
              if (!nextStatus) return order;
              return {
                ...order,
                fulfillment: {
                  ...order.fulfillment,
                  status: nextStatus,
                },
              };
            }),
          );
          setSelectedOrderIds(new Set());

          const processingCount = [...successfulUpdates.values()].filter(
            (status) => status === "PROCESSING",
          ).length;
          toaster.success({
            title: t("allegro.orders.statusUpdateSuccessTitle", {
              defaultValue: "Allegro status updated",
            }),
            description:
              processingCount > 0
                ? t("allegro.orders.processingInvoiceNotice", {
                    defaultValue:
                      "Allegro will create the invoice after the order is moved to in progress. Create only the receipt in Konfi if needed.",
                  })
                : t("allegro.orders.statusUpdateSuccessDescription", {
                    defaultValue: "Selected Allegro orders were updated.",
                  }),
          });
        }

        if (failedResults.length > 0) {
          toaster.error({
            title: t("allegro.orders.statusUpdatePartialErrorTitle", {
              defaultValue: "Some Allegro statuses were not updated",
            }),
            description: failedResults
              .map((result) => result.error)
              .filter((value): value is string => Boolean(value))
              .join("\n"),
          });
        }

        return successfulUpdates.size > 0;
      } catch (error) {
        console.error("Failed to update Allegro fulfillment status:", error);
        toaster.error({
          title: t("allegro.orders.statusUpdateErrorTitle", {
            defaultValue: "Failed to update Allegro status",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("allegro.orders.statusUpdateErrorDescription", {
                  defaultValue:
                    "Refresh the order list and try again. Allegro may have newer order data.",
                }),
        });
        return false;
      } finally {
        setUpdatingOrderIds((current) => {
          const next = new Set(current);
          updates.forEach((fulfillmentUpdate) =>
            next.delete(fulfillmentUpdate.id),
          );
          return next;
        });
      }
    },
    [t],
  );

  const handleBulkStatusUpdate = useCallback(() => {
    void updateFulfillmentStatus(
      selectedMutableOrders.map((order) => ({
        id: order.id,
        revision: order.revision,
        status: bulkStatus,
      })),
    );
  }, [bulkStatus, selectedMutableOrders, updateFulfillmentStatus]);

  const normalizeProductName = useCallback((value: string) => {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }, []);

  const resolveFallbackProduct =
    useCallback(async (): Promise<Product | null> => {
      if (channel) {
        const configuredProduct = await loadAllegroImportDefaultProduct(
          channel.id,
        );

        if (configuredProduct) {
          return configuredProduct;
        }
      }

      const searchTerms = [
        "Usługi poligraficzne",
        "uslugi poligraficzne",
        "poligraficzne",
      ];

      const normalizedTargetNames = new Set(
        searchTerms.map((searchTerm) => normalizeProductName(searchTerm)),
      );

      for (const searchTerm of searchTerms) {
        const results = await searchProductsInput(searchTerm);
        if (!results || results.length === 0) {
          continue;
        }

        const preferredExactMatch = results.find(
          (product) =>
            normalizedTargetNames.has(normalizeProductName(product.name)) &&
            canUseProductForAllegroImport(product),
        );

        if (preferredExactMatch) {
          return preferredExactMatch;
        }

        const preferredCustomPriceMatch = results.find((product) =>
          canUseProductForAllegroImport(product),
        );

        if (preferredCustomPriceMatch) {
          return preferredCustomPriceMatch;
        }

        const exactMatch = results.find((product) =>
          normalizedTargetNames.has(normalizeProductName(product.name)),
        );

        if (exactMatch) {
          return exactMatch;
        }

        const customPriceMatch = results.find(
          (product) => product.allowCustomPrice,
        );
        if (customPriceMatch) {
          return customPriceMatch;
        }

        return results[0] ?? null;
      }

      return null;
    }, [channel, normalizeProductName, searchProductsInput]);

  const handleImportOrder = useCallback(
    async (allegroOrder: AllegroOrder) => {
      if (!channel) {
        toaster.error({
          title: t("allegro.importMissingChannelTitle", {
            defaultValue: "Channel required",
          }),
          description: t("allegro.importMissingChannelDescription", {
            defaultValue: "Select a channel before importing an Allegro order.",
          }),
        });
        return;
      }

      if (!userInfo?.uid) {
        toaster.error({
          title: t("allegro.importMissingUserTitle", {
            defaultValue: "User required",
          }),
          description: t("allegro.importMissingUserDescription", {
            defaultValue: "Sign in again before importing an Allegro order.",
          }),
        });
        return;
      }

      setLoadingImportId(allegroOrder.id);

      try {
        const fallbackProduct = await resolveFallbackProduct();

        const draftOrder = mapAllegroOrderToDuplicateDraft({
          allegroOrder,
          fallbackProduct,
          channel: {
            id: channel.id,
            currency: channel.currency,
          },
        });

        setImportDraftOrder(draftOrder);
        setShowImportForm(true);

        if (!fallbackProduct) {
          toaster.warning({
            title: t("allegro.importMissingFallbackTitle", {
              defaultValue: "Fallback product not found",
            }),
            description: t("allegro.importMissingFallbackDescription", {
              defaultValue:
                "The import draft is ready, but choose a product for each imported line item before saving, or configure a default Allegro import product in settings.",
            }),
          });
        }
      } catch (error) {
        console.error("Failed to prepare Allegro import draft:", error);
        toaster.error({
          title: t("allegro.importPrepareErrorTitle", {
            defaultValue: "Failed to prepare import",
          }),
          description: t("allegro.importPrepareErrorDescription", {
            defaultValue:
              "We couldn't prepare the Allegro order for import. Try again.",
          }),
        });
      } finally {
        setLoadingImportId(null);
      }
    },
    [channel, resolveFallbackProduct, t, userInfo?.uid],
  );

  const handleImportCreateSuccess = useCallback(
    async ({ channelId, orderId }: { channelId: string; orderId: string }) => {
      if (
        !importDraftOrder ||
        !shouldAutoMoveImportedAllegroOrderToProcessing(importDraftOrder)
      ) {
        return;
      }

      const wasUpdated = await updateFulfillmentStatus([
        {
          id: importDraftOrder.id,
          revision: importDraftOrder.externalSource?.externalOrderRevision,
          status: "PROCESSING",
        },
      ]);

      if (!wasUpdated || !importDraftOrder.externalSource) {
        return;
      }

      await update<Partial<Order>>(
        {
          externalSource: {
            ...importDraftOrder.externalSource,
            externalFulfillmentStatus: "PROCESSING",
            lastSyncedAt: Timestamp.now(),
          },
        },
        db.doc<Partial<Order>>(
          firestore,
          `/channels/${channelId}/orders`,
          orderId,
        ),
      );
    },
    [importDraftOrder, updateFulfillmentStatus],
  );

  const currentDetailsOrder = detailsOrder
    ? (orders.find((order) => order.id === detailsOrder.id) ?? detailsOrder)
    : null;

  // ---------- loading ----------

  if (loading) {
    return (
      <Box>
        <CustomHeading
          heading={t("allegro.title", { defaultValue: "Allegro" })}
          mb="8"
          breadcrumb
          goBack
          t={t}
        />
        <VStack gap={4} align="stretch">
          <Skeleton height="60px" rounded="xl" />
          <Skeleton height="400px" rounded="xl" />
        </VStack>
      </Box>
    );
  }

  // ---------- not authenticated ----------

  if (!authStatus?.connected) {
    return (
      <Box>
        <CustomHeading
          heading={t("allegro.title", { defaultValue: "Allegro" })}
          mb="8"
          breadcrumb
          goBack
          t={t}
        />
        <Card.Root maxW="lg" mx="auto" mt="12">
          <Card.Body>
            <VStack gap={6} py={4}>
              <Box
                p={4}
                rounded="full"
                bg="primary.50"
                _dark={{ bg: "primary.900/20" }}
              >
                <Center>
                  <MaterialSymbol color="primary.solid">
                    storefront
                  </MaterialSymbol>
                </Center>
              </Box>
              <VStack gap={2}>
                <Text fontSize="xl" fontWeight="semibold">
                  {t("allegro.connectTitle", {
                    defaultValue: "Connect to Allegro",
                  })}
                </Text>
                <Text color="fg.muted" textAlign="center">
                  {t("allegro.connectDescription", {
                    defaultValue:
                      "Sign in with your Allegro account to manage orders and offers.",
                  })}
                </Text>
              </VStack>
              <Button
                colorPalette="primary"
                size="lg"
                onClick={() => (window.location.href = allegroAuthUrl)}
              >
                <MaterialSymbol>login</MaterialSymbol>
                {t("allegro.signIn", {
                  defaultValue: "Sign in with Allegro",
                })}
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>
      </Box>
    );
  }

  // ---------- connected ----------

  return (
    <Box>
      <CustomHeading
        heading={t("allegro.title", { defaultValue: "Allegro" })}
        breadcrumb
        goBack
        t={t}
      />

      <Flex mb={4} gap={4} align="center" flexWrap="wrap">
        <HStack gap={2}>
          <MaterialSymbol color="primary.solid">account_circle</MaterialSymbol>
          <Text fontWeight="medium">{authStatus.user?.login}</Text>
        </HStack>
        <Spacer />
        <HStack gap={2}>
          <ButtonLink
            lng={i18n.resolvedLanguage}
            href="/tools/allegro/settings"
            variant="outline"
            size="sm"
            ariaLabel={t("allegro.settings.openButton", {
              defaultValue: "Settings",
            })}
          >
            <MaterialSymbol>settings</MaterialSymbol>
            {t("allegro.settings.openButton", {
              defaultValue: "Settings",
            })}
          </ButtonLink>
          <RefreshButton
            label={t("allegro.orders.refresh", { defaultValue: "Refresh" })}
            refreshFunction={() => fetchOrders(offset)}
          />
          <Button variant="outline" size="sm" onClick={disconnect}>
            <MaterialSymbol>logout</MaterialSymbol>
            {t("allegro.disconnect", { defaultValue: "Disconnect" })}
          </Button>
        </HStack>
      </Flex>

      {hasMissingAllegroScopes && (
        <Alert.Root status="warning" mb={4}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("allegro.reconnectRequiredTitle", {
                defaultValue: "Reconnect Allegro",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("allegro.reconnectRequiredDescription", {
                defaultValue:
                  "This connection is missing permissions added for order status updates. Sign in with Allegro again before changing statuses.",
              })}
            </Alert.Description>
          </Alert.Content>
          <Button
            size="sm"
            colorPalette="primary"
            onClick={() => (window.location.href = allegroAuthUrl)}
          >
            <MaterialSymbol>login</MaterialSymbol>
            {t("allegro.signIn", {
              defaultValue: "Sign in with Allegro",
            })}
          </Button>
        </Alert.Root>
      )}

      <Tabs.Root
        value={activeTab}
        onValueChange={(e) => setActiveTab(e.value)}
        variant="enclosed"
        lazyMount
        unmountOnExit
      >
        <Tabs.List>
          <Tabs.Trigger value="orders">
            <MaterialSymbol>shopping_cart</MaterialSymbol>
            {t("allegro.tabs.orders", { defaultValue: "Orders" })}
            {totalCount > 0 && (
              <Badge size="sm" ml={1}>
                {totalCount}
              </Badge>
            )}
          </Tabs.Trigger>
          <Tabs.Trigger value="exports">
            <MaterialSymbol>ios_share</MaterialSymbol>
            {t("allegro.tabs.exports", { defaultValue: "Exports" })}
          </Tabs.Trigger>
          <Tabs.Indicator />
        </Tabs.List>

        {/* Orders tab */}
        <Tabs.Content value="orders" pt="6">
          <VStack gap={4} align="stretch">
            <Card.Root>
              <Card.Body>
                <VStack align="stretch" gap={4}>
                  <Flex gap={3} flexWrap="wrap" align="end">
                    <Field.Root flex="1" minW={{ base: "100%", md: "280px" }}>
                      <Field.Label>
                        {t("allegro.orders.searchLabel", {
                          defaultValue: "Search orders",
                        })}
                      </Field.Label>
                      <Input
                        value={orderSearchTerm}
                        onChange={(event) =>
                          setOrderSearchTerm(event.target.value)
                        }
                        name="allegro-order-search"
                        autoComplete="off"
                        placeholder={t("allegro.orders.searchPlaceholder", {
                          defaultValue: "Order, payment, buyer, or offer…",
                        })}
                      />
                    </Field.Root>
                    <AllegroSelectField
                      label={t("allegro.orders.checkoutStatusFilter", {
                        defaultValue: "Order status",
                      })}
                      items={checkoutStatusOptions}
                      value={statusFilter}
                      onChange={setStatusFilter}
                    />
                    <AllegroSelectField
                      label={t("allegro.orders.fulfillmentStatusFilter", {
                        defaultValue: "Fulfillment",
                      })}
                      items={fulfillmentStatusOptions}
                      value={fulfillmentStatusFilter}
                      onChange={setFulfillmentStatusFilter}
                    />
                    <AllegroSelectField
                      label={t("allegro.orders.fulfillmentProviderFilter", {
                        defaultValue: "Handled by",
                      })}
                      items={fulfillmentProviderOptions}
                      value={fulfillmentProviderFilter}
                      onChange={setFulfillmentProviderFilter}
                    />
                    <AllegroSelectField
                      label={t("allegro.orders.shipmentSummaryFilter", {
                        defaultValue: "Tracking",
                      })}
                      items={shipmentSummaryOptions}
                      value={shipmentSummaryFilter}
                      onChange={setShipmentSummaryFilter}
                    />
                    <Button
                      variant="outline"
                      loading={loadingOrders}
                      onClick={() => {
                        setOffset(0);
                        void fetchOrders(0);
                      }}
                    >
                      <MaterialSymbol>filter_alt</MaterialSymbol>
                      {t("actions.apply", { defaultValue: "Apply" })}
                    </Button>
                  </Flex>

                  <Alert.Root status="info">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        {t("allegro.orders.invoiceNoticeTitle", {
                          defaultValue: "Allegro invoices stay in Allegro",
                        })}
                      </Alert.Title>
                      <Alert.Description>
                        {t("allegro.orders.invoiceNoticeDescription", {
                          defaultValue:
                            "Moving an Allegro order to in progress creates the Allegro invoice automatically. Konfi should create only receipts for imported Allegro orders.",
                        })}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>

                  {selectedOrderIds.size > 0 && (
                    <Flex
                      gap={3}
                      align="end"
                      justify="space-between"
                      flexWrap="wrap"
                    >
                      <Text color="fg.muted" fontSize="sm">
                        {t("allegro.orders.selectedCount", {
                          defaultValue:
                            "{{count}} selected, {{mutableCount}} editable",
                          count: selectedOrderIds.size,
                          mutableCount: selectedMutableOrders.length,
                        })}
                      </Text>
                      <HStack gap={3} flexWrap="wrap">
                        <AllegroSelectField
                          disabled={selectedMutableOrders.length === 0}
                          label={t("allegro.orders.bulkStatusLabel", {
                            defaultValue: "New status",
                          })}
                          items={fulfillmentStatusActionOptions}
                          value={bulkStatus}
                          onChange={(value) => {
                            if (isAllegroOrderFulfillmentStatus(value)) {
                              setBulkStatus(value);
                            }
                          }}
                        />
                        <Button
                          colorPalette="primary"
                          disabled={selectedMutableOrders.length === 0}
                          loading={selectedMutableOrders.some((order) =>
                            updatingOrderIds.has(order.id),
                          )}
                          onClick={handleBulkStatusUpdate}
                        >
                          <MaterialSymbol>
                            published_with_changes
                          </MaterialSymbol>
                          {t("allegro.orders.changeSelectedStatus", {
                            defaultValue: "Change selected status",
                          })}
                        </Button>
                      </HStack>
                    </Flex>
                  )}
                </VStack>
              </Card.Body>
            </Card.Root>

            {loadingOrders && orders.length === 0 ? (
              <VStack gap={3} align="stretch">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} height="96px" rounded="xl" />
                ))}
              </VStack>
            ) : orders.length === 0 ? (
              <Empty
                icon="shopping_cart"
                title={t("allegro.orders.empty", {
                  defaultValue: "No orders",
                })}
                description={t("allegro.orders.emptyDescription", {
                  defaultValue: "No orders found on your Allegro account.",
                })}
              />
            ) : visibleOrders.length === 0 ? (
              <Empty
                icon="search_off"
                title={t("allegro.orders.noSearchResults", {
                  defaultValue: "No matching orders",
                })}
                description={t("allegro.orders.noSearchResultsDescription", {
                  defaultValue:
                    "Clear the search phrase or refresh with different filters.",
                })}
              />
            ) : (
              <VStack gap={3} align="stretch">
                <HStack justify="space-between" flexWrap="wrap">
                  <Checkbox.Root
                    checked={visibleOrders.every((order) =>
                      selectedOrderIds.has(order.id),
                    )}
                    onCheckedChange={(details) =>
                      handleSelectVisibleOrders(Boolean(details.checked))
                    }
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control />
                    <Checkbox.Label>
                      {t("allegro.orders.selectVisible", {
                        defaultValue: "Select visible orders",
                      })}
                    </Checkbox.Label>
                  </Checkbox.Root>
                  <Text color="fg.muted" fontSize="sm">
                    {t("allegro.orders.visibleCount", {
                      defaultValue: "{{visible}} visible from {{total}}",
                      visible: visibleOrders.length,
                      total: totalCount,
                    })}
                  </Text>
                </HStack>

                {visibleOrders.map((order) => {
                  const isAllegroFulfilled =
                    order.fulfillment?.provider?.id === "ALLEGRO";
                  const canChangeStatus =
                    canChangeAllegroFulfillmentStatus(order);
                  const fulfillmentStatus = getAllegroFulfillmentStatus(order);
                  const selectedStatus = fulfillmentStatus;
                  const currentStatusOption = {
                    label: formatAllegroStatus(fulfillmentStatus, t),
                    value: fulfillmentStatus,
                  };
                  const statusActionOptions =
                    fulfillmentStatusActionOptions.some(
                      (option) => option.value === selectedStatus,
                    )
                      ? fulfillmentStatusActionOptions
                      : [
                          currentStatusOption,
                          ...fulfillmentStatusActionOptions,
                        ];

                  return (
                    <Card.Root key={order.id} size="sm">
                      <Card.Body>
                        <Flex
                          justify="space-between"
                          align="flex-start"
                          wrap="wrap"
                          gap={4}
                        >
                          <HStack align="flex-start" gap={3} minW={0} flex="1">
                            <Checkbox.Root
                              checked={selectedOrderIds.has(order.id)}
                              onCheckedChange={(details) =>
                                setOrderSelection(
                                  order.id,
                                  Boolean(details.checked),
                                )
                              }
                              aria-label={t("allegro.orders.selectOrder", {
                                defaultValue: "Select Allegro order",
                              })}
                            >
                              <Checkbox.HiddenInput />
                              <Checkbox.Control />
                            </Checkbox.Root>
                            <VStack align="flex-start" gap={2} minW={0}>
                              <HStack gap={2} flexWrap="wrap">
                                <Text
                                  fontWeight="semibold"
                                  fontSize="sm"
                                  translate="no"
                                >
                                  #{order.id.slice(0, 8)}
                                </Text>
                                <Badge
                                  colorPalette={
                                    STATUS_COLORS[order.status] ?? "gray"
                                  }
                                  size="sm"
                                >
                                  {formatAllegroStatus(order.status, t)}
                                </Badge>
                                <Badge variant="outline" size="sm">
                                  {formatAllegroStatus(fulfillmentStatus, t)}
                                </Badge>
                                <Badge
                                  colorPalette={
                                    isAllegroFulfilled ? "orange" : "green"
                                  }
                                  size="sm"
                                >
                                  {isAllegroFulfilled
                                    ? t(
                                        "allegro.orders.fulfillmentProviderAllegro",
                                        {
                                          defaultValue: "Allegro fulfilled",
                                        },
                                      )
                                    : t(
                                        "allegro.orders.fulfillmentProviderSeller",
                                        {
                                          defaultValue: "Seller fulfilled",
                                        },
                                      )}
                                </Badge>
                                {order.invoice?.required && (
                                  <Badge colorPalette="blue" size="sm">
                                    {t("allegro.orders.invoiceRequested", {
                                      defaultValue: "Invoice requested",
                                    })}
                                  </Badge>
                                )}
                              </HStack>
                              <Text fontSize="sm" color="fg.muted">
                                {order.buyer.login}
                                {order.buyer.email && ` · ${order.buyer.email}`}
                              </Text>
                              <Text
                                fontSize="xs"
                                color="fg.muted"
                                lineClamp={2}
                                wordBreak="break-word"
                              >
                                {order.lineItems.length}{" "}
                                {order.lineItems.length === 1
                                  ? t("allegro.orders.item", {
                                      defaultValue: "item",
                                    })
                                  : t("allegro.orders.items", {
                                      defaultValue: "items",
                                    })}
                                {" · "}
                                {order.lineItems
                                  .map((li) => li.offer.name)
                                  .join(", ")}
                              </Text>
                              {order.messageToSeller && (
                                <Text
                                  fontSize="xs"
                                  color="fg.muted"
                                  lineClamp={2}
                                  wordBreak="break-word"
                                >
                                  {t("allegro.orders.messageToSeller", {
                                    defaultValue: "Message",
                                  })}
                                  {": "}
                                  {order.messageToSeller}
                                </Text>
                              )}
                            </VStack>
                          </HStack>
                          <VStack align="flex-end" gap={2}>
                            <Text fontWeight="semibold">
                              {formatPrice(order.summary?.totalToPay)}
                            </Text>
                            <Text fontSize="xs" color="fg.muted">
                              {formatDate(order.updatedAt)}
                            </Text>
                            <HStack gap={2} flexWrap="wrap" justify="flex-end">
                              <AllegroSelectField
                                disabled={!canChangeStatus}
                                label={t("allegro.orders.statusActionLabel", {
                                  defaultValue: "Status",
                                })}
                                items={statusActionOptions}
                                value={selectedStatus}
                                onChange={(value) => {
                                  if (isAllegroOrderFulfillmentStatus(value)) {
                                    void updateFulfillmentStatus([
                                      {
                                        id: order.id,
                                        revision: order.revision,
                                        status: value,
                                      },
                                    ]);
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDetailsOrder(order)}
                              >
                                <MaterialSymbol>visibility</MaterialSymbol>
                                {t("actions.preview", {
                                  defaultValue: "Preview",
                                })}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                loading={loadingImportId === order.id}
                                onClick={() => {
                                  void handleImportOrder(order);
                                }}
                              >
                                <MaterialSymbol>content_copy</MaterialSymbol>
                                {t("allegro.importOrder", {
                                  defaultValue: "Import",
                                })}
                              </Button>
                            </HStack>
                            {isAllegroFulfilled && (
                              <Text
                                color="fg.muted"
                                fontSize="xs"
                                textAlign="right"
                              >
                                {t("allegro.orders.allegroFulfilledReadonly", {
                                  defaultValue:
                                    "Status and shipping are managed by Allegro.",
                                })}
                              </Text>
                            )}
                          </VStack>
                        </Flex>
                      </Card.Body>
                    </Card.Root>
                  );
                })}

                {/* Pagination */}
                {totalCount > 0 && (
                  <HStack
                    w="100%"
                    justify="space-between"
                    pt={4}
                    gap={3}
                    flexWrap="wrap"
                  >
                    <Badge variant="surface" px={2}>
                      {t("pagination.itemsCount", {
                        defaultValue: "Count: {{itemCount}}",
                        itemCount: totalCount,
                      })}
                    </Badge>

                    <HStack>
                      <IconButton
                        aria-label={t("pagination.first", {
                          defaultValue: "First page",
                        })}
                        onClick={handleFirstPage}
                        disabled={!canGoPrevious}
                        loading={loadingOrders}
                        size="sm"
                        variant="outline"
                      >
                        <MaterialSymbol>
                          keyboard_double_arrow_left
                        </MaterialSymbol>
                      </IconButton>

                      <IconButton
                        aria-label={t("pagination.previous", {
                          defaultValue: "Previous",
                        })}
                        onClick={handlePrevPage}
                        disabled={!canGoPrevious}
                        loading={loadingOrders}
                        size="sm"
                        variant="outline"
                      >
                        <MaterialSymbol>chevron_left</MaterialSymbol>
                      </IconButton>

                      <Text>
                        {t("pagination.page", { defaultValue: "Page" })}
                        <strong>
                          {` ${currentPage} ${t("pagination.of", { defaultValue: "of" })} ${totalPages}`}
                        </strong>
                      </Text>

                      <IconButton
                        aria-label={t("pagination.next", {
                          defaultValue: "Next",
                        })}
                        onClick={handleNextPage}
                        disabled={!canGoNext}
                        loading={loadingOrders}
                        size="sm"
                        variant="outline"
                      >
                        <MaterialSymbol>chevron_right</MaterialSymbol>
                      </IconButton>

                      <IconButton
                        aria-label={t("pagination.last", {
                          defaultValue: "Last page",
                        })}
                        onClick={handleLastPage}
                        disabled={!canGoNext}
                        loading={loadingOrders}
                        size="sm"
                        variant="outline"
                      >
                        <MaterialSymbol>
                          keyboard_double_arrow_right
                        </MaterialSymbol>
                      </IconButton>
                    </HStack>

                    <Badge variant="surface" px={2}>
                      {t("pagination.perPage", {
                        defaultValue: "{{rowCount}}/Page",
                        rowCount: limit,
                      })}
                    </Badge>
                  </HStack>
                )}
              </VStack>
            )}
          </VStack>
        </Tabs.Content>

        <Tabs.Content value="exports" pt="6">
          <AllegroExportWizard />
        </Tabs.Content>
      </Tabs.Root>

      <Dialog.Root
        open={Boolean(currentDetailsOrder)}
        onOpenChange={(details) => {
          if (!details.open) setDetailsOrder(null);
        }}
        size="xl"
        placement="center"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              {currentDetailsOrder && (
                <>
                  <Dialog.Header>
                    <Dialog.Title>
                      {t("allegro.orders.detailsTitle", {
                        defaultValue: "Allegro order details",
                      })}
                    </Dialog.Title>
                  </Dialog.Header>
                  <Dialog.Body>
                    <VStack align="stretch" gap={4}>
                      <HStack flexWrap="wrap" gap={2}>
                        <Badge colorPalette="orange">
                          {t("allegro.badge", { defaultValue: "Allegro" })}
                        </Badge>
                        <Badge>
                          {formatAllegroStatus(currentDetailsOrder.status, t)}
                        </Badge>
                        {currentDetailsOrder.fulfillment?.status && (
                          <Badge variant="outline">
                            {formatAllegroStatus(
                              currentDetailsOrder.fulfillment.status,
                              t,
                            )}
                          </Badge>
                        )}
                      </HStack>

                      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                        <Box>
                          <Text color="fg.muted" fontSize="sm">
                            {t("allegro.sourceOrderIdLabel", {
                              defaultValue: "External order ID",
                            })}
                          </Text>
                          <Text fontWeight="medium" translate="no">
                            {currentDetailsOrder.id}
                          </Text>
                        </Box>
                        <Box>
                          <Text color="fg.muted" fontSize="sm">
                            {t("allegro.sourceRevisionLabel", {
                              defaultValue: "Revision",
                            })}
                          </Text>
                          <Text translate="no">
                            {currentDetailsOrder.revision ?? "—"}
                          </Text>
                        </Box>
                        <Box>
                          <Text color="fg.muted" fontSize="sm">
                            {t("allegro.sourceBuyerLabel", {
                              defaultValue: "Buyer login",
                            })}
                          </Text>
                          <Text>{currentDetailsOrder.buyer.login}</Text>
                          <Text color="fg.muted" fontSize="sm">
                            {currentDetailsOrder.buyer.email}
                          </Text>
                        </Box>
                        <Box>
                          <Text color="fg.muted" fontSize="sm">
                            {t("allegro.sourceDeliveryMethodLabel", {
                              defaultValue: "Delivery method",
                            })}
                          </Text>
                          <Text>
                            {currentDetailsOrder.delivery.method?.name ?? "—"}
                          </Text>
                        </Box>
                        <Box>
                          <Text color="fg.muted" fontSize="sm">
                            {t("allegro.orders.paymentId", {
                              defaultValue: "Payment ID",
                            })}
                          </Text>
                          <Text translate="no">
                            {currentDetailsOrder.payment.id}
                          </Text>
                        </Box>
                        <Box>
                          <Text color="fg.muted" fontSize="sm">
                            {t("allegro.orders.total", {
                              defaultValue: "Total",
                            })}
                          </Text>
                          <Text fontWeight="semibold">
                            {formatPrice(
                              currentDetailsOrder.summary.totalToPay,
                            )}
                          </Text>
                        </Box>
                      </SimpleGrid>

                      <Alert.Root status="info">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>
                            {t("allegro.orders.invoiceNoticeTitle", {
                              defaultValue: "Allegro invoices stay in Allegro",
                            })}
                          </Alert.Title>
                          <Alert.Description>
                            {t("allegro.orders.invoiceNoticeDescription", {
                              defaultValue:
                                "Moving an Allegro order to in progress creates the Allegro invoice automatically. Konfi should create only receipts for imported Allegro orders.",
                            })}
                          </Alert.Description>
                        </Alert.Content>
                      </Alert.Root>

                      {currentDetailsOrder.messageToSeller && (
                        <Box>
                          <Text color="fg.muted" fontSize="sm">
                            {t("allegro.orders.messageToSeller", {
                              defaultValue: "Message",
                            })}
                          </Text>
                          <Text whiteSpace="pre-wrap" wordBreak="break-word">
                            {currentDetailsOrder.messageToSeller}
                          </Text>
                        </Box>
                      )}

                      <Box>
                        <Text fontWeight="semibold" mb={2}>
                          {t("allegro.orders.lineItems", {
                            defaultValue: "Line items",
                          })}
                        </Text>
                        <VStack align="stretch" gap={2}>
                          {currentDetailsOrder.lineItems.map((lineItem) => (
                            <HStack
                              key={lineItem.id}
                              justify="space-between"
                              align="flex-start"
                              gap={3}
                            >
                              <Box minW={0}>
                                <Text fontWeight="medium" lineClamp={2}>
                                  {lineItem.offer.name}
                                </Text>
                                <Text
                                  color="fg.muted"
                                  fontSize="sm"
                                  translate="no"
                                >
                                  {lineItem.offer.id}
                                </Text>
                              </Box>
                              <VStack align="flex-end" gap={0}>
                                <Text>
                                  {t("allegro.orders.quantity", {
                                    defaultValue: "Qty {{count}}",
                                    count: lineItem.quantity,
                                  })}
                                </Text>
                                <Text fontWeight="semibold">
                                  {formatPrice(lineItem.price)}
                                </Text>
                              </VStack>
                            </HStack>
                          ))}
                        </VStack>
                      </Box>
                    </VStack>
                  </Dialog.Body>
                  <Dialog.Footer>
                    <Button
                      variant="outline"
                      onClick={() => setDetailsOrder(null)}
                    >
                      {t("actions.close", { defaultValue: "Close" })}
                    </Button>
                    <Button
                      colorPalette="primary"
                      loading={loadingImportId === currentDetailsOrder.id}
                      onClick={() => {
                        void handleImportOrder(currentDetailsOrder);
                      }}
                    >
                      <MaterialSymbol>content_copy</MaterialSymbol>
                      {t("allegro.importOrder", { defaultValue: "Import" })}
                    </Button>
                  </Dialog.Footer>
                  <Dialog.CloseTrigger />
                </>
              )}
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {importDraftOrder && (
        <OrderForm
          order={importDraftOrder}
          asDrawer
          type={"DUPLICATE"}
          open={showImportForm}
          setOpen={setShowImportForm}
          duplicateInitialOverrides={duplicateInitialOverrides}
          createOverrides={createOverrides}
          onCreateSuccess={handleImportCreateSuccess}
        />
      )}
    </Box>
  );
};

export default AllegroPage;
