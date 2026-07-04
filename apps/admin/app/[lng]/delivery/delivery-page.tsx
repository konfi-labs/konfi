"use client";

import { useAuth } from "@/context/auth";
import { useChannels } from "@/context/channels";
import { useBarcodeScanning } from "@/hooks/useBarcodeScanning";
import { useGeolocationTracking } from "@/hooks/useGeolocationTracking";
import { useServiceWorkerSync } from "@/hooks/useServiceWorkerSync";
import { useT } from "@/i18n/client";
import { Box } from "@chakra-ui/react";
import { EmptyState } from "@konfi/components";
import { useCallback, useEffect, useRef } from "react";
import BarcodeDetector from "../components/delivery/BarcodeDetector";
import { DELIVERY_CONFIG } from "./config";

export default function DeliveryPage() {
  const { channel } = useChannels();
  const { user, isCourierClient } = useAuth();
  const { t } = useT();
  const isMountedRef = useRef(true);

  const { persistBackgroundState, cleanup: swCleanup } = useServiceWorkerSync(
    channel,
    user,
    isCourierClient,
    DELIVERY_CONFIG.isDevelopment,
  );

  const persistBackgroundStateCallback = useCallback(
    (
      coords: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
        heading: number | null;
        speed: number | null;
      },
      timestamp: number,
    ) => {
      if (isMountedRef.current) {
        void persistBackgroundState(coords, timestamp);
      }
    },
    [persistBackgroundState],
  );

  const { getCurrentLocation, cleanup: geoCleanup } = useGeolocationTracking(
    channel,
    user,
    isCourierClient,
    DELIVERY_CONFIG.isDevelopment,
    persistBackgroundStateCallback,
  );

  const { handleBarcodeDetection, cleanup: scanCleanup } = useBarcodeScanning(
    channel,
    DELIVERY_CONFIG.isDevelopment,
    getCurrentLocation,
  );

  // Cleanup all hooks on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      swCleanup?.();
      geoCleanup?.();
      scanCleanup?.();
    };
  }, [swCleanup, geoCleanup, scanCleanup]);

  if (!isCourierClient) {
    return (
      <EmptyState
        title={t("deliveryPage.courierOnlyTitle", {
          defaultValue: "Courier access only",
        })}
        description={t("deliveryPage.courierOnlyDescription", {
          defaultValue:
            "You do not have courier access rights. Please contact your administrator if you believe this is an error.",
        })}
        icon="local_shipping"
      />
    );
  }

  return (
    <Box position="relative" w="100%" h="100%">
      {/* Barcode detector */}
      <BarcodeDetector
        key={`barcode-${isCourierClient}`}
        formats={["qr_code"]}
        onDetected={handleBarcodeDetection}
      />
    </Box>
  );
}
