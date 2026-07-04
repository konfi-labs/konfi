"use client";

import { useT } from "@/i18n/client";
import { recordOrderScan } from "@/actions/order-updates";
import { toaster } from "@konfi/components";
import type { Channel, ScanPayload } from "@konfi/types";
import { isScanPayload } from "@konfi/types";
import { isEmpty } from "es-toolkit/compat";
import { GeoPoint } from "firebase/firestore";
import { useCallback, useMemo } from "react";

type ScanError =
  | { type: "NO_CHANNEL"; message: string }
  | { type: "UNRECOGNIZED_CODE"; message: string }
  | { type: "INVALID_QR"; message: string }
  | { type: "SCAN_FAILED"; message: string };

type DetectedBarcode = {
  rawValue: string;
};

export const useBarcodeScanning = (
  channel: Channel | null,
  isDevelopment: boolean,
  getCurrentLocation: () => Promise<{
    gp: GeoPoint | null;
    accuracy: number | null;
  }>,
) => {
  const { t } = useT();

  const parsePayload = useMemo(
    () =>
      (raw: string): ScanPayload | null => {
        try {
          const trimmed = raw.trim();
          const json = trimmed.startsWith("{")
            ? trimmed
            : trimmed.startsWith("konfi://")
              ? trimmed.slice("konfi://".length)
              : trimmed;
          const parsed = JSON.parse(json);

          if (isScanPayload(parsed)) {
            return parsed;
          }
          return null;
        } catch {
          return null;
        }
      },
    [],
  );

  const handleError = useCallback(
    (error: ScanError, rawValue?: string) => {
      switch (error.type) {
        case "NO_CHANNEL":
          toaster.create({
            title: t("admin.noChannelSelected", {
              defaultValue: "No channel selected",
            }),
            type: "info",
          });
          break;
        case "UNRECOGNIZED_CODE":
          toaster.create({
            title: t("toasts.delivery.unrecognizedCode", {
              defaultValue: "Unrecognized code",
            }),
            description: rawValue?.slice(0, 120),
            type: "warning",
          });
          break;
        case "INVALID_QR":
          toaster.create({
            title: t("toasts.delivery.invalidQr", {
              defaultValue: "Invalid QR",
            }),
            description: error.message,
            type: "error",
          });
          break;
        case "SCAN_FAILED":
          toaster.create({
            title: t("toasts.delivery.failedToRecordScan", {
              defaultValue: "Failed to record scan",
            }),
            type: "error",
          });
          break;
      }
    },
    [t],
  );

  const processScanInDevelopment = useCallback(
    (barcodes: DetectedBarcode[]) => {
      for (const b of barcodes) {
        const parsed = parsePayload(b.rawValue);
        if (!parsed || parsed.t !== "ORDER_SCAN") {
          handleError(
            { type: "UNRECOGNIZED_CODE", message: "Unrecognized code" },
            b.rawValue,
          );
          continue;
        }

        const { oid } = parsed;
        toaster.create({
          title: t("toasts.delivery.devModeScan", {
            defaultValue: "Development mode: scan not recorded",
          }),
          description: oid
            ? t("toasts.delivery.devModeOrder", {
                defaultValue: `Order ${oid}`,
              })
            : undefined,
          type: "info",
        });
      }
    },
    [parsePayload, handleError, t],
  );

  const processScanInProduction = useCallback(
    async (barcodes: DetectedBarcode[]) => {
      if (!channel) {
        handleError({ type: "NO_CHANNEL", message: "No channel selected" });
        return;
      }

      const scanLoc = await getCurrentLocation();
      const successes: string[] = [];

      for (const b of barcodes) {
        const parsed = parsePayload(b.rawValue);
        if (!parsed || parsed.t !== "ORDER_SCAN") {
          handleError(
            { type: "UNRECOGNIZED_CODE", message: "Unrecognized code" },
            b.rawValue,
          );
          continue;
        }

        const { cid, oid, stage } = parsed;
        const channelId = cid || channel.id; // prefer payload, fallback to current channel
        const orderId = oid;

        if (!orderId) {
          handleError({
            type: "INVALID_QR",
            message: t("toasts.delivery.missingOrderId", {
              defaultValue: "Missing order ID",
            }),
          });
          continue;
        }

        try {
          const result = await recordOrderScan({
            raw: b.rawValue,
            parsed,
            stage: stage ?? "AUTO",
            channelId,
            orderId,
            location: scanLoc.gp
              ? {
                  latitude: scanLoc.gp.latitude,
                  longitude: scanLoc.gp.longitude,
                }
              : null,
            accuracy: scanLoc.accuracy,
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : null,
          });
          if (!result.ok) {
            handleError({
              type: "SCAN_FAILED",
              message: result.error.message,
            });
            continue;
          }

          successes.push(orderId);
        } catch (e) {
          console.error(e);
          handleError({
            type: "SCAN_FAILED",
            message: "Failed to record scan",
          });
        }
      }

      // Show batched success toast
      if (successes.length > 0) {
        toaster.create({
          title: t("toasts.delivery.scanRecorded", {
            defaultValue: "Scan recorded",
          }),
          description:
            successes.length > 1
              ? t("toasts.delivery.multipleScans", {
                  defaultValue: `${successes.length} orders scanned`,
                })
              : undefined,
          type: "success",
        });
      }
    },
    [channel, getCurrentLocation, parsePayload, handleError, t],
  );

  const handleBarcodeDetection = useCallback(
    async (barcodes: DetectedBarcode[]) => {
      if (isEmpty(barcodes)) return;

      if (isDevelopment) {
        processScanInDevelopment(barcodes);
      } else {
        await processScanInProduction(barcodes);
      }
    },
    [isDevelopment, processScanInDevelopment, processScanInProduction],
  );

  return {
    handleBarcodeDetection,
    parsePayload,
    cleanup: () => {},
  };
};
