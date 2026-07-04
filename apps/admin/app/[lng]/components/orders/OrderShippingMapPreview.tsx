"use client";

import { useT } from "@/i18n/client";
import {
  buildShippingAddressString,
  geocodeAddress,
  type LatLngLiteral,
} from "@/lib/maps/address";
import { Box, Flex, Skeleton, Text } from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol } from "@konfi/components";
import { Order } from "@konfi/types";
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  RenderingType,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useState } from "react";

const ADMIN_GOOGLE_MAP_ID = "f7ed1937d88606d216b06145";
const GEOCODING_CACHE_PREFIX = "order-address-preview:" as const;
const ORDER_PREVIEW_MAP_ZOOM = 15;
const ORDER_PREVIEW_MAP_HEIGHT = "220px";

interface OrderShippingMapPreviewProps {
  shipping?: Order["shipping"];
}

function buildGoogleMapsSearchUrl(addressQuery: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`;
}

function OrderShippingMapPreviewContent({
  shipping,
}: OrderShippingMapPreviewProps) {
  "use memo";

  const { t } = useT();
  const geocodingLib = useMapsLibrary("geocoding");
  const geocoder = useMemo(
    () => (geocodingLib ? new geocodingLib.Geocoder() : null),
    [geocodingLib],
  );
  const addressQuery = useMemo(
    () => buildShippingAddressString(shipping),
    [shipping],
  );
  const [position, setPosition] = useState<LatLngLiteral | null>(null);
  const [loading, setLoading] = useState(Boolean(addressQuery));

  useEffect(() => {
    let cancelled = false;

    if (!addressQuery) {
      setPosition(null);
      setLoading(false);
      return;
    }

    if (!geocoder) {
      setPosition(null);
      setLoading(true);
      return;
    }

    const cacheKey = `${GEOCODING_CACHE_PREFIX}${addressQuery}`;
    setLoading(true);

    void geocodeAddress(geocoder, addressQuery, cacheKey).then(
      (nextPosition) => {
        if (cancelled) {
          return;
        }

        setPosition(nextPosition);
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [addressQuery, geocoder]);

  if (!addressQuery) {
    return null;
  }

  return (
    <Box mt={4}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={3}>
        <Text fontWeight="semibold" fontSize="sm">
          {t("orderPage.customer.map", { defaultValue: "Map" })}
        </Text>
        <ButtonLink
          href={buildGoogleMapsSearchUrl(addressQuery)}
          isExternal
          size="sm"
          variant="outline"
          ariaLabel={t("orderPage.customer.openMap", {
            defaultValue: "Open in Google Maps",
          })}
        >
          {t("orderPage.customer.openMap", {
            defaultValue: "Open in Google Maps",
          })}
          <MaterialSymbol>open_in_new</MaterialSymbol>
        </ButtonLink>
      </Flex>
      <Box
        overflow="hidden"
        borderRadius="2xl"
        border="1px solid"
        borderColor="gray.muted"
        bg="bg.muted"
      >
        {loading ? (
          <Skeleton height={ORDER_PREVIEW_MAP_HEIGHT} />
        ) : position ? (
          <Box h={ORDER_PREVIEW_MAP_HEIGHT}>
            <GoogleMap
              center={position}
              zoom={ORDER_PREVIEW_MAP_ZOOM}
              mapId={ADMIN_GOOGLE_MAP_ID}
              renderingType={RenderingType.RASTER}
              disableDefaultUI={true}
              clickableIcons={false}
              keyboardShortcuts={false}
              gestureHandling="none"
            >
              <AdvancedMarker position={position} title={shipping?.name} />
            </GoogleMap>
          </Box>
        ) : (
          <Flex justify="center" align="center" minH={ORDER_PREVIEW_MAP_HEIGHT}>
            <Text fontSize="sm" color="gray.muted">
              {t("orderPage.customer.mapUnavailable", {
                defaultValue: "Map preview unavailable",
              })}
            </Text>
          </Flex>
        )}
      </Box>
    </Box>
  );
}

export function OrderShippingMapPreview({
  shipping,
}: OrderShippingMapPreviewProps) {
  "use memo";

  const apiKey = process.env.NEXT_PUBLIC_ADMIN_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return null;
  }

  return (
    <APIProvider apiKey={apiKey}>
      <OrderShippingMapPreviewContent shipping={shipping} />
    </APIProvider>
  );
}
