"use client";

import { getAdminConfigFlags } from "@/actions";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { buildShippingAddressString, geocodeAddress } from "@/lib/maps/address";
import {
  Badge,
  Box,
  Button,
  Card,
  Grid,
  GridItem,
  HStack,
  ScrollArea,
  Stack,
  Status,
  Tabs,
  Text,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Empty,
  MaterialSymbol,
  useColorMode,
} from "@konfi/components";
import { db, getOrdersByIds } from "@konfi/firebase";
import {
  Channel,
  isNestedCustomer,
  Order,
  OrderStatus,
  ScanPayload,
  ShippingOptions,
  Warehouse,
} from "@konfi/types";
import { SCROLL_MASK_CSS } from "@konfi/utils";
import {
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useChannels } from "context/channels";
import { useConfigurationWarehouses } from "context/configuration";
import { isEmpty } from "es-toolkit/compat";
import { GeoPoint, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { Route } from "next";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { ClusterProperties } from "supercluster";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
import { CustomAdvancedMarker } from "../components/logistics/CustomAdvancedMarker";
import { ClusterMarker } from "../components/logistics/cluster-marker";
import Loading from "../loading";
import { useSupercluster } from "./hooks/use-supercluster";
import PolkurierOrdersTab from "./polkurier-orders-tab";

type CourierPresence = {
  id: string;
  uid: string;
  location?: GeoPoint | null;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  updatedAt?: Timestamp;
};

type CourierPresenceWithMeta = CourierPresence & {
  channelId: string | null;
  path: string;
  updatedAtMs: number;
};

type OrderMarker = {
  id: string;
  orderId: string;
  number: number;
  channelId: Order["channelId"];
  channelName?: string;
  shippingOption: Order["shippingOption"];
  shippingName?: string;
  addressLabel?: string;
  position?: { lat: number; lng: number };
  updatedAtMs: number;
  lastScanMs?: number;
  locationSource: "tracking" | "geocoded" | "none";
};

type WarehousePin = {
  id: string;
  name: string;
  address?: string;
  position?: { lat: number; lng: number };
};

type FirestoreTimestamp = Timestamp | Omit<Timestamp, "toJSON">;

// Constants moved outside component for better performance
const COURIER_STATUS_THRESHOLDS = {
  ONLINE: 30_000, // 30 seconds
  WARM: 120_000, // 2 minutes
} as const;

const DEFAULT_MAP_CENTER = { lat: 50, lng: 50 };
const GEOCODING_CACHE_PREFIX = "order-geo:" as const;
const WAREHOUSE_CACHE_PREFIX = "wh-geo:" as const;

const toMillis = (
  value?: FirestoreTimestamp | Date | number | string | null,
) => {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
};

export default function LogisticsPage() {
  const { t } = useT();
  if (!process.env.NEXT_PUBLIC_ADMIN_GOOGLE_MAPS_API_KEY) {
    return (
      <Empty
        title={t("logistics.apiKeyMissingTitle", {
          defaultValue: "Google Maps API key is not configured",
        })}
        description={t("logistics.apiKeyMissingDescription", {
          defaultValue: "Google Maps API key is not configured.",
        })}
        icon="map"
      />
    );
  }

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_ADMIN_GOOGLE_MAPS_API_KEY}>
      <Logistics />
    </APIProvider>
  );
}

function Logistics() {
  const { t, i18n } = useT();
  const { getChannelById } = useChannels();
  const { warehouses } = useConfigurationWarehouses();
  const { colorMode } = useColorMode();
  const { data: configFlags } = useSWRImmutable("admin-config-flags", () =>
    getAdminConfigFlags(),
  );
  const hasPolkurierKey = configFlags?.polkurierApiKeyProvided === true;

  // Prevent browser zoom gestures on this page (but allow map zoom)
  useEffect(() => {
    const preventBrowserZoom = (e: WheelEvent) => {
      // Only prevent zoom if it's a browser zoom attempt (Ctrl/Cmd + wheel)
      // but allow normal wheel events to reach the map
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    const preventKeyboardZoom = (e: KeyboardEvent) => {
      // Prevent browser zoom shortcuts
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "+" ||
          e.key === "-" ||
          e.key === "0" ||
          e.key === "=" ||
          e.key === "_")
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener("wheel", preventBrowserZoom, { passive: false });
    document.addEventListener("keydown", preventKeyboardZoom, {
      passive: false,
    });

    return () => {
      document.removeEventListener("wheel", preventBrowserZoom);
      document.removeEventListener("keydown", preventKeyboardZoom);
    };
  }, []);

  type CourierScanEvent = {
    id: string;
    raw: string;
    parsed?: ScanPayload;
    stage?: "AUTO" | "PICKUP" | "DELIVERY";
    scannedAt?: Timestamp;
    by?: string;
    location?: GeoPoint;
    accuracy?: number;
    userAgent?: string;
    targetRef?: string;
  };

  type CourierScanEventWithMeta = CourierScanEvent & {
    channelId: string | null;
    orderId: string | null;
    path: string;
    scannedAtMs: number;
  };

  type OrderWithMeta = Order & {
    path: string;
    updatedAtMs: number;
  };

  const [couriers, setCouriers] = useState<CourierPresenceWithMeta[]>([]);
  const [scanEvents, setScanEvents] = useState<CourierScanEventWithMeta[]>([]);
  const [orders, setOrders] = useState<OrderWithMeta[]>([]);
  const [orderPins, setOrderPins] = useState<OrderMarker[]>([]);
  const [warehousePins, setWarehousePins] = useState<WarehousePin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const geocodingLib = useMapsLibrary("geocoding");
  const geocoder = useMemo(
    () => geocodingLib && new geocodingLib.Geocoder(),
    [geocodingLib],
  );
  const router = useRouter();

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.resolvedLanguage],
  );
  const buildOrderHref = (orderId: string, channelId: string | null) => {
    const base = `/${i18n.resolvedLanguage}/orders/${orderId}`;
    return channelId ? `${base}?channelId=${channelId}` : base;
  };
  const handleOpenOrder = (orderId: string, channelId: string | null) => {
    router.push(buildOrderHref(orderId, channelId) as Route);
  };
  const formatScanTimestamp = (ms: number) => {
    if (!ms)
      return t("logistics.scanTimeUnknown", { defaultValue: "Time unknown" });
    try {
      return dateFormatter.format(new Date(ms));
    } catch {
      return new Date(ms).toLocaleString();
    }
  };

  const shouldDisplayOrderMarker = useCallback(
    (
      order: Order,
      channelData: Channel | undefined,
      warehouseList: Warehouse[] | null,
    ) => {
      if (order.shippingOption === ShippingOptions.COMPANY_COURIER) {
        return true;
      }
      if (!warehouseList || !channelData || isEmpty(channelData.warehouses)) {
        return false;
      }
      const shippingName = order.shipping?.name;
      if (!shippingName) {
        return false;
      }
      return warehouseList.some(
        (warehouse) =>
          warehouse.address?.name === shippingName &&
          !channelData.warehouses.includes(warehouse.id),
      );
    },
    [],
  );

  // Compute status color from last update time
  const getCourierStatusPalette = useCallback((updatedAt?: Timestamp) => {
    if (!updatedAt) return "gray" as const;
    const ts = toMillis(updatedAt);
    if (!ts) return "gray" as const;
    const diff = Date.now() - ts;
    if (diff < COURIER_STATUS_THRESHOLDS.ONLINE) return "green" as const;
    if (diff < COURIER_STATUS_THRESHOLDS.WARM) return "orange" as const;
    return "red" as const;
  }, []);

  const mapCenter = useMemo(() => {
    const firstCourier = couriers.find((c) => c.location);
    if (firstCourier?.location) {
      return {
        lat: firstCourier.location.latitude,
        lng: firstCourier.location.longitude,
      };
    }
    const firstOrder = orderPins.find((order) => order.position);
    if (firstOrder?.position) {
      return firstOrder.position;
    }
    const firstWarehouse = warehousePins.find(
      (warehouse) => warehouse.position,
    );
    if (firstWarehouse?.position) {
      return firstWarehouse.position;
    }
    return DEFAULT_MAP_CENTER;
  }, [couriers, orderPins, warehousePins]);

  // Subscribe to live courier positions across all channels
  useEffect(() => {
    const query = db.collectionGroup<
      CourierPresence & { [key: string]: unknown }
    >(firestore, "couriers", 200, [orderBy("updatedAt", "desc")]);
    const unsubscribe = onSnapshot(query, (snap) => {
      try {
        const deduped = new globalThis.Map<string, CourierPresenceWithMeta>();
        snap.docs.forEach((doc) => {
          const raw = doc.data() as CourierPresence & {
            [key: string]: unknown;
          };
          const channelId = doc.ref.parent?.parent?.id ?? null;
          const updatedAtMs = toMillis(raw.updatedAt) ?? 0;
          const base: CourierPresence = {
            ...raw,
            id: doc.id,
          };
          const courier: CourierPresenceWithMeta = {
            ...base,
            channelId,
            path: doc.ref.path,
            updatedAtMs,
          };
          const key = courier.uid ?? courier.id;
          const current = deduped.get(key);
          if (!current || updatedAtMs >= current.updatedAtMs) {
            deduped.set(key, courier);
          }
        });
        const next = Array.from(deduped.values()).sort(
          (a, b) => b.updatedAtMs - a.updatedAtMs,
        );
        setCouriers(next);
        setLoading(false);
      } catch (error) {
        console.error("Error loading couriers:", error);
        setError("Failed to load courier data");
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const query = db.collectionGroup<Order & { [key: string]: unknown }>(
      firestore,
      "orders",
      100,
      [orderBy("updatedAt", "desc")],
    );
    const unsubscribe = onSnapshot(query, (snap) => {
      const next = snap.docs
        .map((doc) => {
          const raw = doc.data() as Order & { [key: string]: unknown };
          const updatedAtMs = toMillis(raw.updatedAt) ?? 0;
          const orderWithMeta: OrderWithMeta = {
            ...raw,
            path: raw.path ?? doc.ref.path,
            updatedAtMs,
          };
          return orderWithMeta;
        })
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      setOrders(next);
    });
    return () => unsubscribe();
  }, []);

  const ordersRequiringQr = useMemo(() => {
    if (!orders.length) return [] as OrderWithMeta[];
    return orders
      .filter((order) => {
        // Don't display fulfilled (delivered) or canceled orders on the map
        if (
          order.status === OrderStatus.FULFILLED ||
          order.status === OrderStatus.CANCELED
        )
          return false;

        const channelData = order.channelId
          ? getChannelById(order.channelId)
          : undefined;
        return shouldDisplayOrderMarker(order, channelData, warehouses);
      })
      .slice(0, 50);
  }, [orders, warehouses, getChannelById]);

  useEffect(() => {
    if (!geocoder) {
      setOrderPins([]);
      return;
    }
    if (!ordersRequiringQr.length) {
      setOrderPins([]);
      return;
    }

    let cancelled = false;

    const resolveMarkers = async () => {
      try {
        const markers = await Promise.all(
          ordersRequiringQr.map(async (order) => {
            const channelData = order.channelId
              ? getChannelById(order.channelId)
              : undefined;
            const marker: OrderMarker = {
              id: order.id,
              orderId: order.id,
              number: order.number,
              channelId: order.channelId,
              channelName: channelData?.name,
              shippingOption: order.shippingOption,
              shippingName: order.shipping?.name,
              addressLabel: buildShippingAddressString(order.shipping),
              position: undefined,
              updatedAtMs: order.updatedAtMs,
              lastScanMs:
                toMillis(order.tracking?.lastScan?.scannedAt ?? null) ??
                undefined,
              locationSource: "none",
            };

            // Check for tracking location first
            const trackingLocation = order.tracking?.lastScan?.location as
              | GeoPoint
              | undefined;
            if (trackingLocation) {
              marker.position = {
                lat: trackingLocation.latitude,
                lng: trackingLocation.longitude,
              };
              marker.locationSource = "tracking";
              return marker;
            }

            // Try geocoding the address
            const addressString = marker.addressLabel;
            if (addressString && geocoder) {
              const cacheKey = `${GEOCODING_CACHE_PREFIX}${order.id}:${addressString}`;
              const position = await geocodeAddress(
                geocoder,
                addressString,
                cacheKey,
              );
              if (position) {
                marker.position = position;
                marker.locationSource = "geocoded";
              }
            }

            return marker;
          }),
        );

        if (!cancelled) {
          const withPositions = markers.filter((marker) => marker.position);
          withPositions.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
          setOrderPins(withPositions);
        }
      } catch (error) {
        console.error("Error resolving order markers:", error);
        if (!cancelled) {
          setError("Failed to load order locations");
        }
      }
    };

    void resolveMarkers();

    return () => {
      cancelled = true;
    };
  }, [ordersRequiringQr, geocoder, getChannelById]);

  // Subscribe to latest scan events across all channels
  useEffect(() => {
    const query = db.collectionGroup<
      CourierScanEvent & { [key: string]: unknown }
    >(firestore, "scanEvents", 10, [orderBy("scannedAt", "desc")]);
    const unsubscribe = onSnapshot(query, (snap) => {
      const next = snap.docs
        .map((doc) => {
          const raw = doc.data() as CourierScanEvent & {
            [key: string]: unknown;
          };
          const channelId = doc.ref.parent?.parent?.parent?.parent?.id ?? null;
          const orderIdFromPath = doc.ref.parent?.parent?.id ?? null;
          const parsed = raw.parsed as ScanPayload | undefined;
          const scannedAtMs = toMillis(raw.scannedAt) ?? 0;
          const resolvedOrderId = parsed?.oid ?? orderIdFromPath ?? null;
          const event: CourierScanEventWithMeta = {
            ...raw,
            id: doc.id,
            parsed,
            channelId,
            orderId: resolvedOrderId,
            path: doc.ref.path,
            scannedAtMs,
          };
          return event;
        })
        .sort((a, b) => b.scannedAtMs - a.scannedAtMs);
      setScanEvents(next);
    });
    return () => unsubscribe();
  }, []);

  // Extract unique order IDs and channel IDs from scan events for fetching
  const uniqueOrderKeys = useMemo(() => {
    const seen = new Set<string>();
    const keys: Array<{ orderId: string; channelId: string }> = [];

    scanEvents.forEach((event) => {
      if (event.orderId && event.channelId) {
        const key = `${event.channelId}/${event.orderId}`;
        if (!seen.has(key)) {
          seen.add(key);
          keys.push({ orderId: event.orderId, channelId: event.channelId });
        }
      }
    });

    return keys;
  }, [scanEvents]);

  // Fetch orders based on unique order IDs from scan events
  const { data: scannedOrders } = useSWR<
    Map<string, Order>,
    Error,
    readonly [string, Array<{ orderId: string; channelId: string }>] | null
  >(
    uniqueOrderKeys.length > 0 ? ["scanned-orders", uniqueOrderKeys] : null,
    async ([, keys]: readonly [
      string,
      Array<{ orderId: string; channelId: string }>,
    ]) => {
      if (!keys || keys.length === 0) return new Map<string, Order>();

      const orderIds = keys.map((k) => k.orderId);
      const orders = await getOrdersByIds(firestore, orderIds);

      // Create a map for quick lookup
      const orderMap = new Map<string, Order>();
      orders.forEach((order) => {
        orderMap.set(order.id, order);
      });

      return orderMap;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 10000,
    },
  );

  // Build warehouse markers (geocode if needed)
  useEffect(() => {
    if (!warehouses || !geocoder) return;
    let cancelled = false;

    const geocodeWarehouseAddress = async (w: {
      id: string;
      name: string;
      address?: string;
    }) => {
      if (!w.address) return { id: w.id, name: w.name, address: w.address };

      const cacheKey = `${WAREHOUSE_CACHE_PREFIX}${w.id}:${w.address}`;
      const position = await geocodeAddress(geocoder, w.address, cacheKey);

      return position ? { ...w, position } : w;
    };

    (async () => {
      try {
        const list = warehouses.map((w) => {
          const addrParts = [
            w.address?.street,
            w.address?.number,
            w.address?.zip,
            w.address?.city,
            w.address?.country,
          ]
            .filter(Boolean)
            .join(" ");
          return { id: w.id, name: w.name, address: addrParts || undefined };
        });
        const withPositions = await Promise.all(
          list.map(geocodeWarehouseAddress),
        );
        if (!cancelled) setWarehousePins(withPositions);
      } catch (error) {
        console.error("Error geocoding warehouses:", error);
        if (!cancelled) {
          setError("Failed to load warehouse locations");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [warehouses, geocoder]);

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <Empty
        title={t("logistics.errorTitle", {
          defaultValue: "Failed to load logistics data",
        })}
        description={error}
        icon="error"
      />
    );
  }

  if (isEmpty(couriers) && isEmpty(orderPins) && isEmpty(warehousePins)) {
    return (
      <Empty
        title={t("logistics.noDataTitle", {
          defaultValue: "No logistics data available",
        })}
        description={t("logistics.noDataDescription", {
          defaultValue:
            "No couriers, orders, or warehouses to display on the map.",
        })}
        icon="map"
      />
    );
  }

  return (
    <Box>
      <CustomHeading
        heading={t("logistics.title", { defaultValue: "Logistics" })}
        mb={"8"}
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Tabs.Root defaultValue="live-tracking" variant="enclosed">
        <Tabs.List>
          <Tabs.Trigger value="live-tracking">
            <MaterialSymbol>map</MaterialSymbol>
            {t("logistics.liveTracking", { defaultValue: "Live Tracking" })}
          </Tabs.Trigger>
          {hasPolkurierKey && (
            <Tabs.Trigger value="polkurier">
              <MaterialSymbol>local_shipping</MaterialSymbol>
              {t("logistics.polkurierOrders", {
                defaultValue: "Polkurier Orders",
              })}
            </Tabs.Trigger>
          )}
          <Tabs.Indicator />
        </Tabs.List>

        <Tabs.Content value="live-tracking" pt="4">
          <Grid
            templateColumns={{ base: "repeat(1, 1fr)", md: "repeat(2, 1fr)" }}
            gap="4"
          >
            <GridItem>
              <Box>
                {isEmpty(scanEvents) ? (
                  <Text
                    fontSize="sm"
                    color={{ base: "gray.600", _dark: "gray.300" }}
                  >
                    {t("logistics.scanNoEvents", {
                      defaultValue: "No scan events yet.",
                    })}
                  </Text>
                ) : (
                  <ScrollArea.Root h="78vh">
                    <ScrollArea.Viewport css={SCROLL_MASK_CSS} tabIndex={-1}>
                      <ScrollArea.Content spaceY="4" tabIndex={-1}>
                        {scanEvents.map((event) => {
                          const isOrderEvent = event.parsed?.t === "ORDER_SCAN";
                          const orderId = event.orderId ?? undefined;
                          const channelName = event.channelId
                            ? getChannelById(event.channelId)?.name
                            : undefined;
                          const stageLabel = event.stage
                            ? t(`TrackingScanStage.${event.stage}`, {
                                defaultValue: event.stage,
                              })
                            : t("logistics.stageUnknown", {
                                defaultValue: "Stage unknown",
                              });
                          const eventTypeLabel =
                            event.parsed?.t ??
                            t("logistics.scanUnknownType", {
                              defaultValue: "Unknown type",
                            });
                          const scannedAtLabel = formatScanTimestamp(
                            event.scannedAtMs,
                          );

                          // Get the fetched order data if available
                          const fetchedOrder =
                            orderId && scannedOrders
                              ? scannedOrders.get(orderId)
                              : undefined;
                          const orderNumber = fetchedOrder?.number;
                          const orderStatus = fetchedOrder?.status;
                          const customerName = isNestedCustomer(
                            fetchedOrder?.customer,
                          )
                            ? fetchedOrder?.customer?.name
                            : fetchedOrder?.customer;
                          const shippingName = fetchedOrder?.shipping?.name;

                          return (
                            <Card.Root
                              key={event.id}
                              borderWidth="1px"
                              borderRadius="3xl"
                              size="sm"
                            >
                              <Card.Body gap="2">
                                <Card.Title fontWeight="semibold">
                                  <HStack
                                    gap="2"
                                    justify={"space-between"}
                                    w="100%"
                                  >
                                    {orderNumber ? (
                                      <HStack gap="2">
                                        <Text>{`${t("logistics.scanOrder", { defaultValue: "Order" })} #${orderNumber}`}</Text>
                                        {channelName ? (
                                          <Badge
                                            colorPalette="cyan"
                                            variant="subtle"
                                          >
                                            {channelName}
                                          </Badge>
                                        ) : null}
                                      </HStack>
                                    ) : orderId ? (
                                      `${t("logistics.scanOrder", { defaultValue: "Order" })} ${orderId}`
                                    ) : (
                                      t("logistics.scanNoOrder", {
                                        defaultValue: "No linked order",
                                      })
                                    )}
                                    <HStack gap="2">
                                      {event.stage ? (
                                        <Badge
                                          colorPalette="orange"
                                          variant="outline"
                                        >
                                          {stageLabel}
                                        </Badge>
                                      ) : null}
                                      <Badge
                                        colorPalette="primary"
                                        variant="subtle"
                                      >
                                        {eventTypeLabel}
                                      </Badge>
                                    </HStack>
                                  </HStack>
                                </Card.Title>
                                <Card.Description flexWrap="wrap">
                                  {orderStatus ? (
                                    <span>{`${t("logistics.orderStatus", { defaultValue: "Status" })}: ${t(`OrderStatus.${orderStatus}`, { defaultValue: orderStatus })}`}</span>
                                  ) : null}
                                  {customerName ? (
                                    <span>
                                      ,{" "}
                                      {`${t("logistics.customer", { defaultValue: "Customer" })}: ${customerName}`}
                                    </span>
                                  ) : null}
                                  {shippingName ? (
                                    <span>
                                      ,{" "}
                                      {`${t("logistics.shippingRecipient", { defaultValue: "Recipient" })}: ${shippingName}`}
                                    </span>
                                  ) : null}
                                </Card.Description>
                              </Card.Body>
                              <Card.Footer justifyContent="space-between">
                                <Text
                                  fontSize="sm"
                                  color={{
                                    base: "gray.600",
                                    _dark: "gray.300",
                                  }}
                                >
                                  {scannedAtLabel}
                                </Text>
                                {isOrderEvent && orderId ? (
                                  <Stack gap="2" direction={["column", "row"]}>
                                    <Button
                                      size="xs"
                                      colorPalette="primary"
                                      onClick={() =>
                                        handleOpenOrder(
                                          orderId,
                                          event.channelId,
                                        )
                                      }
                                    >
                                      {t("logistics.openOrder", {
                                        defaultValue: "Open order",
                                      })}
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="surface"
                                      onClick={() => {
                                        const href = buildOrderHref(
                                          orderId,
                                          event.channelId,
                                        );
                                        if (typeof window !== "undefined") {
                                          window.open(
                                            href,
                                            "_blank",
                                            "noopener,noreferrer",
                                          );
                                        }
                                      }}
                                    >
                                      {t("logistics.openOrderNewTab", {
                                        defaultValue: "Open in new tab",
                                      })}
                                      <MaterialSymbol>
                                        open_in_new
                                      </MaterialSymbol>
                                    </Button>
                                  </Stack>
                                ) : null}
                              </Card.Footer>
                            </Card.Root>
                          );
                        })}
                      </ScrollArea.Content>
                    </ScrollArea.Viewport>
                  </ScrollArea.Root>
                )}
              </Box>
            </GridItem>
            <GridItem>
              <Box
                w="100%"
                h="78vh"
                position="relative"
                borderRadius={"3xl"}
                overflow="hidden"
              >
                <GoogleMap
                  defaultCenter={mapCenter}
                  defaultZoom={12}
                  mapId="f7ed1937d88606d216b06145"
                  disableDefaultUI={true}
                  colorScheme={colorMode === "dark" ? "DARK" : "LIGHT"}
                >
                  <LogisticsMapContent
                    couriers={couriers}
                    orderPins={orderPins}
                    warehousePins={warehousePins}
                    getChannelById={getChannelById}
                    getCourierStatusPalette={getCourierStatusPalette}
                    formatScanTimestamp={formatScanTimestamp}
                    handleOpenOrder={handleOpenOrder}
                    buildOrderHref={buildOrderHref}
                    t={t}
                  />
                </GoogleMap>

                {/* Legend Component */}
                <MapLegend t={t} />
              </Box>
            </GridItem>
          </Grid>
        </Tabs.Content>

        {hasPolkurierKey && (
          <Tabs.Content value="polkurier" pt="4">
            <PolkurierOrdersTab />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </Box>
  );
}

type CourierFeatureProperties = {
  entity: "courier";
  courierId: string;
};

type OrderFeatureProperties = {
  entity: "order";
  orderId: string;
};

type LogisticsMapContentProps = {
  couriers: CourierPresenceWithMeta[];
  orderPins: OrderMarker[];
  warehousePins: WarehousePin[];
  getChannelById: (channelId: string) => Channel | undefined;
  getCourierStatusPalette: (
    updatedAt?: Timestamp,
  ) => "gray" | "green" | "orange" | "red";
  formatScanTimestamp: (ms: number) => string;
  handleOpenOrder: (orderId: string, channelId: string | null) => void;
  buildOrderHref: (orderId: string, channelId: string | null) => string;
  t: ReturnType<typeof useT>["t"];
};

type AccuracyCircleProps = {
  map: google.maps.Map | null | undefined;
  center: google.maps.LatLngLiteral;
  radius: number;
  zIndex?: number;
  color?: string;
};

const AccuracyCircle = ({
  map,
  center,
  radius,
  zIndex = 450,
  color = "#3182CE",
}: AccuracyCircleProps) => {
  const { lat, lng } = center;
  useEffect(() => {
    if (!map || !Number.isFinite(radius) || radius <= 0) return;
    const circle = new google.maps.Circle({
      map,
      center: { lat, lng },
      radius,
      strokeColor: color,
      strokeOpacity: 0.4,
      strokeWeight: 1,
      fillColor: color,
      fillOpacity: 0.12,
      zIndex,
    });
    return () => {
      circle.setMap(null);
    };
  }, [map, lat, lng, radius, color, zIndex]);
  return null;
};

const METERS_PER_DEGREE_LAT = 111_320;

const metersToLongitudeDegrees = (meters: number, latitude: number) => {
  const denominator =
    METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);
  if (Math.abs(denominator) < 1e-6) {
    return 0;
  }
  return meters / denominator;
};

const offsetLatLng = (
  lat: number,
  lng: number,
  radiusMeters: number,
  angleRadians: number,
) => {
  const dx = radiusMeters * Math.cos(angleRadians);
  const dy = radiusMeters * Math.sin(angleRadians);
  const nextLat = lat + dy / METERS_PER_DEGREE_LAT;
  const nextLng = lng + metersToLongitudeDegrees(dx, lat);
  return { lat: nextLat, lng: nextLng };
};

const getOrderFeatureKey = (
  feature: GeoJSON.Feature<GeoJSON.Point, Partial<OrderFeatureProperties>>,
  index: number,
) => {
  if (feature.id !== undefined && feature.id !== null) {
    return String(feature.id);
  }
  const orderId = feature.properties?.orderId;
  if (orderId !== undefined && orderId !== null) {
    return String(orderId);
  }
  const [lng, lat] = feature.geometry.coordinates;
  return `${lat}:${lng}:${index}`;
};

const LogisticsMapContent = ({
  couriers,
  orderPins,
  warehousePins,
  getChannelById,
  getCourierStatusPalette,
  formatScanTimestamp,
  handleOpenOrder,
  buildOrderHref,
  t,
}: LogisticsMapContentProps) => {
  const map = useMap();

  const Z_INDICES = {
    orderCluster: 200,
    orderMarker: 300,
    warehouse: 400,
    courierCluster: 500,
    courierMarker: 600,
  } as const;

  const courierLookup = useMemo(() => {
    const lookup = new Map<string, CourierPresenceWithMeta>();
    couriers
      .filter((courier) => courier.location)
      .forEach((courier) => lookup.set(courier.id, courier));
    return lookup;
  }, [couriers]);

  const courierFeatures = useMemo(() => {
    const features: Array<
      GeoJSON.Feature<GeoJSON.Point, CourierFeatureProperties>
    > = [];
    couriers.forEach((courier) => {
      if (!courier.location) return;
      const point = courier.location as GeoPoint;
      features.push({
        type: "Feature",
        id: courier.id,
        geometry: {
          type: "Point",
          coordinates: [point.longitude, point.latitude],
        },
        properties: {
          entity: "courier",
          courierId: courier.id,
        },
      });
    });
    return features;
  }, [couriers]);

  const orderLookup = useMemo(() => {
    const lookup = new Map<string, OrderMarker>();
    orderPins.forEach((order) => {
      if (order.position) lookup.set(order.id, order);
    });
    return lookup;
  }, [orderPins]);

  const orderFeatures = useMemo(() => {
    const features: Array<
      GeoJSON.Feature<GeoJSON.Point, OrderFeatureProperties>
    > = [];
    orderPins.forEach((order) => {
      if (!order.position) return;
      features.push({
        type: "Feature",
        id: order.id,
        geometry: {
          type: "Point",
          coordinates: [order.position.lng, order.position.lat],
        },
        properties: {
          entity: "order",
          orderId: order.id,
        },
      });
    });
    return features;
  }, [orderPins]);

  const courierGeojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: courierFeatures,
    }),
    [courierFeatures],
  ) as GeoJSON.FeatureCollection<GeoJSON.Point, CourierFeatureProperties>;

  const orderGeojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: orderFeatures,
    }),
    [orderFeatures],
  ) as GeoJSON.FeatureCollection<GeoJSON.Point, OrderFeatureProperties>;

  const clusterOptions = useMemo(
    () => ({ radius: 80, maxZoom: 19, minPoints: 2 }),
    [],
  );
  const orderClusterConfig = useMemo(
    () => ({ disableClusteringAtZoom: 17 }),
    [],
  );

  const {
    clusters: courierClusters,
    getClusterExpansionZoom: getCourierClusterExpansionZoom,
  } = useSupercluster<CourierFeatureProperties>(courierGeojson, clusterOptions);
  const {
    clusters: orderClusters,
    getClusterExpansionZoom: getOrderClusterExpansionZoom,
  } = useSupercluster<OrderFeatureProperties>(
    orderGeojson,
    clusterOptions,
    orderClusterConfig,
  );

  const orderSpreadPositions = useMemo(() => {
    const positionMap = new Map<string, google.maps.LatLngLiteral>();
    const groups = new Map<
      string,
      Array<{
        feature: GeoJSON.Feature<
          GeoJSON.Point,
          Partial<OrderFeatureProperties>
        >;
        index: number;
      }>
    >();
    orderClusters.forEach((feature, index) => {
      const properties = feature.properties as ClusterProperties &
        Partial<OrderFeatureProperties>;
      if (properties.cluster) {
        return;
      }
      const pointFeature = feature as GeoJSON.Feature<
        GeoJSON.Point,
        Partial<OrderFeatureProperties>
      >;
      const [lng, lat] = pointFeature.geometry.coordinates;
      const groupKey = `${lat.toFixed(6)}:${lng.toFixed(6)}`;
      const entry = { feature: pointFeature, index };
      const bucket = groups.get(groupKey);
      if (bucket) {
        bucket.push(entry);
      } else {
        groups.set(groupKey, [entry]);
      }
    });

    groups.forEach((entries) => {
      if (entries.length === 0) {
        return;
      }
      const baseCoordinates = entries[0].feature.geometry.coordinates;
      const baseLat = baseCoordinates[1];
      const baseLng = baseCoordinates[0];
      if (entries.length === 1) {
        const entry = entries[0];
        positionMap.set(getOrderFeatureKey(entry.feature, entry.index), {
          lat: baseLat,
          lng: baseLng,
        });
        return;
      }
      const count = entries.length;
      const baseRadius = 1;
      const radius = baseRadius + Math.min(count, 6);
      entries.forEach((entry, entryIndex) => {
        const angle = (2 * Math.PI * entryIndex) / count;
        positionMap.set(
          getOrderFeatureKey(entry.feature, entry.index),
          offsetLatLng(baseLat, baseLng, radius, angle),
        );
      });
    });

    return positionMap;
  }, [orderClusters]);

  const handleClusterClick = useCallback(
    (
      clusterId: number,
      position: google.maps.LatLngLiteral,
      getZoom: (clusterId: number) => number,
    ) => {
      if (!map) return;
      const targetZoom = Math.min(getZoom(clusterId), 20);
      map.panTo(position);
      map.setZoom(targetZoom);
    },
    [map],
  );

  return (
    <>
      {courierClusters.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        const position = { lat, lng };
        const props = feature.properties as ClusterProperties &
          Partial<CourierFeatureProperties>;
        if (props.cluster) {
          return (
            <ClusterMarker
              key={`courier-cluster-${props.cluster_id}`}
              clusterId={props.cluster_id}
              position={position}
              count={props.point_count}
              onClusterClick={(clusterId, clusterPosition) =>
                handleClusterClick(
                  clusterId,
                  clusterPosition,
                  getCourierClusterExpansionZoom,
                )
              }
              color="primary"
              zIndex={Z_INDICES.courierCluster}
            />
          );
        }

        const courierId = props.courierId ?? (feature.id as string);
        const courier = courierId ? courierLookup.get(courierId) : undefined;
        if (!courier || !courier.location) return null;
        const accuracy = courier.accuracy ?? undefined;
        const channelName = courier.channelId
          ? getChannelById(courier.channelId)?.name
          : undefined;
        const lastUpdateMs = courier.updatedAt
          ? toMillis(courier.updatedAt)
          : courier.updatedAtMs;
        const lastUpdateLabel = lastUpdateMs
          ? formatScanTimestamp(lastUpdateMs)
          : undefined;
        return (
          <Fragment key={`courier-${courier.id}`}>
            {typeof accuracy === "number" && accuracy > 0 ? (
              <AccuracyCircle
                map={map}
                center={{
                  lat: (courier.location as GeoPoint).latitude,
                  lng: (courier.location as GeoPoint).longitude,
                }}
                radius={accuracy}
                zIndex={Z_INDICES.courierCluster - 25}
              />
            ) : null}
            <CustomAdvancedMarker
              key={courier.id}
              position={{
                lat: (courier.location as GeoPoint).latitude,
                lng: (courier.location as GeoPoint).longitude,
              }}
              title={t("logistics.courier", { defaultValue: "Courier" })}
              icon="local_shipping"
              colorPalette="primary"
              label={t("logistics.courier", { defaultValue: "Courier" })}
              description={(($accuracy, $channelName, $lastUpdate) => {
                const parts: string[] = [];
                if ($accuracy)
                  parts.push(
                    `${t("logistics.accuracy", { defaultValue: "Accuracy" })}: ±${$accuracy}m`,
                  );
                if ($channelName)
                  parts.push(
                    `${t("logistics.channel", { defaultValue: "Channel" })}: ${$channelName}`,
                  );
                if ($lastUpdate)
                  parts.push(
                    `${t("logistics.lastUpdate", { defaultValue: "Last update" })}: ${$lastUpdate}`,
                  );
                return parts.length > 0 ? parts.join(" • ") : undefined;
              })(accuracy, channelName, lastUpdateLabel)}
              statusColorPalette={getCourierStatusPalette(courier.updatedAt)}
              statusPlacement="bottom-end"
              zIndex={Z_INDICES.courierMarker}
            />
          </Fragment>
        );
      })}

      {orderClusters.map((feature, index) => {
        const [lng, lat] = feature.geometry.coordinates;
        const position = { lat, lng };
        const props = feature.properties as ClusterProperties &
          Partial<OrderFeatureProperties>;
        if (props.cluster) {
          return (
            <ClusterMarker
              key={`order-cluster-${props.cluster_id}`}
              clusterId={props.cluster_id}
              position={position}
              count={props.point_count}
              onClusterClick={(clusterId, clusterPosition) =>
                handleClusterClick(
                  clusterId,
                  clusterPosition,
                  getOrderClusterExpansionZoom,
                )
              }
              color="green"
              zIndex={Z_INDICES.orderCluster}
            />
          );
        }

        const orderId = props.orderId ?? (feature.id as string);
        const order = orderId ? orderLookup.get(orderId) : undefined;
        if (!order || !order.position) return null;
        const spreadKey = getOrderFeatureKey(
          feature as GeoJSON.Feature<
            GeoJSON.Point,
            Partial<OrderFeatureProperties>
          >,
          index,
        );
        const markerPosition =
          orderSpreadPositions.get(spreadKey) ?? order.position;
        const descriptionParts: string[] = [];
        if (order.addressLabel) descriptionParts.push(order.addressLabel);
        if (order.channelName)
          descriptionParts.push(
            `${t("logistics.channel", { defaultValue: "Channel" })}: ${order.channelName}`,
          );
        if (order.shippingName)
          descriptionParts.push(
            `${t("logistics.shippingRecipient", { defaultValue: "Recipient" })}: ${order.shippingName}`,
          );
        const description =
          descriptionParts.length > 0
            ? descriptionParts.join(" • ")
            : undefined;
        const lastTimestamp = order.lastScanMs ?? order.updatedAtMs;
        return (
          <CustomAdvancedMarker
            key={`order-${order.id}`}
            position={markerPosition}
            title={`${t("logistics.scanOrder", { defaultValue: "Order" })} ${order.orderId}`}
            icon={"orders"}
            colorPalette="green"
            label={`${t("logistics.scanOrder", { defaultValue: "Order" })} ${order.number}`}
            description={description}
            zIndex={Z_INDICES.orderMarker}
          >
            <Stack gap="2">
              <Stack gap="1" fontSize="xs">
                {order.channelName ? (
                  <Text>{`${t("logistics.channel", { defaultValue: "Channel" })}: ${order.channelName}`}</Text>
                ) : null}
                {order.shippingName ? (
                  <Text>{`${t("logistics.shippingRecipient", { defaultValue: "Recipient" })}: ${order.shippingName}`}</Text>
                ) : null}
                {order.addressLabel ? <Text>{order.addressLabel}</Text> : null}
                <Text color={{ base: "gray.600", _dark: "gray.300" }}>
                  {`${t("logistics.lastUpdate", { defaultValue: "Last update" })}: ${formatScanTimestamp(lastTimestamp)}`}
                </Text>
              </Stack>
              <HStack gap="2">
                <Button
                  size="2xs"
                  colorPalette="primary"
                  onClick={() =>
                    handleOpenOrder(order.orderId, order.channelId)
                  }
                >
                  {t("logistics.openOrder", { defaultValue: "Open order" })}
                </Button>
                <Button
                  size="2xs"
                  variant="surface"
                  onClick={() => {
                    const href = buildOrderHref(order.orderId, order.channelId);
                    if (typeof window !== "undefined") {
                      window.open(href, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  {t("logistics.openOrderNewTab", {
                    defaultValue: "Open in new tab",
                  })}
                  <MaterialSymbol>open_in_new</MaterialSymbol>
                </Button>
              </HStack>
            </Stack>
          </CustomAdvancedMarker>
        );
      })}

      {warehousePins
        .filter((w) => !!w.position)
        .map((w) => (
          <CustomAdvancedMarker
            key={w.id}
            position={w.position!}
            title={`${t("logistics.warehouse", { defaultValue: "Warehouse" })}: ${w.name}`}
            icon="warehouse"
            colorPalette="orange"
            label={w.name}
            description={w.address}
            zIndex={Z_INDICES.warehouse}
          />
        ))}
    </>
  );
};

// Extracted Legend Component for better maintainability
const MapLegend = ({ t }: { t: ReturnType<typeof useT>["t"] }) => (
  <Box
    position="absolute"
    top="3"
    left="3"
    borderRadius="3xl"
    boxShadow="md"
    px="3"
    py="2"
    bg={{ base: "gray.50", _dark: "black" }}
  >
    <HStack gap="4">
      <HStack>
        <Status.Root colorPalette={"primary"}>
          <Status.Indicator />
          {t("logistics.couriers", { defaultValue: "Couriers" })}
        </Status.Root>
      </HStack>
      <HStack>
        <Status.Root colorPalette={"green"}>
          <Status.Indicator />
          {t("logistics.orders", { defaultValue: "Orders" })}
        </Status.Root>
      </HStack>
      <HStack>
        <Status.Root colorPalette={"orange"}>
          <Status.Indicator />
          {t("logistics.warehouses", { defaultValue: "Warehouses" })}
        </Status.Root>
      </HStack>
    </HStack>
  </Box>
);
