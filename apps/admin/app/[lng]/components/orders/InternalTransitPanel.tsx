"use client";

import {
  cancelInternalTransit,
  postponeInternalTransit,
} from "@/actions/order-updates";
import { useT } from "@/i18n/client";
import { Badge, Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import type { OrderInternalTransit } from "@konfi/types";
import { useTransition } from "react";

interface InternalTransitPanelProps {
  channelId: string;
  orderId: string;
  internalTransit?: OrderInternalTransit;
  language?: string;
  onChanged?: () => void;
  /**
   * True when the order's item warehouses differ from the pickup warehouse but
   * the order isn't (and never was) in a transit status — a soft hint, not a
   * gate.
   */
  showTransferHint?: boolean;
}

function toDate(value: OrderInternalTransit["expectedArrivalAt"]): Date | null {
  const candidate = value as { toDate?: () => Date } | undefined;
  if (candidate && typeof candidate.toDate === "function") {
    return candidate.toDate();
  }
  return null;
}

export function InternalTransitPanel({
  channelId,
  orderId,
  internalTransit,
  language,
  onChanged,
  showTransferHint,
}: InternalTransitPanelProps) {
  const { t } = useT();
  const [isPending, startTransition] = useTransition();

  if (!internalTransit) {
    if (showTransferHint) {
      return (
        <Badge colorPalette="orange" size="sm">
          <MaterialSymbol>local_shipping</MaterialSymbol>
          {t("internalTransit.order.transferHint", {
            defaultValue: "Likely needs internal transfer",
          })}
        </Badge>
      );
    }
    return null;
  }

  if (internalTransit.state === "CANCELED") {
    return null;
  }

  if (internalTransit.state === "ARRIVED") {
    return (
      <Badge colorPalette="green" size="sm">
        <MaterialSymbol>check_circle</MaterialSymbol>
        {t("internalTransit.order.arrived", {
          defaultValue: "Arrived at pickup warehouse",
        })}
      </Badge>
    );
  }

  const expectedArrivalAt = toDate(internalTransit.expectedArrivalAt);
  const arrivalLabel = expectedArrivalAt
    ? expectedArrivalAt.toLocaleString(language)
    : "—";

  const runAction = (
    action: () => Promise<{ ok: boolean; reason?: string }>,
    successTitle: string,
    failureTitle: string,
  ) => {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toaster.success({ title: successTitle });
          onChanged?.();
        } else {
          toaster.error({ title: failureTitle });
        }
      } catch (error) {
        console.error("Internal transit action failed:", error);
        toaster.error({ title: failureTitle });
      }
    });
  };

  return (
    <Box
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      p={3}
      className="noprint"
    >
      <Stack gap={2}>
        <HStack gap={2}>
          <MaterialSymbol>local_shipping</MaterialSymbol>
          <Text fontSize="sm" fontWeight="semibold">
            {t("internalTransit.order.inTransit", {
              arrival: arrivalLabel,
              defaultValue: "In transit — expected at pickup by {{arrival}}",
            })}
          </Text>
        </HStack>
        <HStack gap={2}>
          <Button
            size="xs"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              runAction(
                () => postponeInternalTransit(channelId, orderId),
                t("internalTransit.order.postponed", {
                  defaultValue: "Postponed to the next departure",
                }),
                t("internalTransit.order.postponeFailed", {
                  defaultValue: "Could not postpone transit",
                }),
              )
            }
          >
            {t("internalTransit.order.postpone", {
              defaultValue: "Postpone to next departure",
            })}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            colorPalette="red"
            disabled={isPending}
            onClick={() =>
              runAction(
                () => cancelInternalTransit(channelId, orderId),
                t("internalTransit.order.canceled", {
                  defaultValue: "Auto-arrival canceled",
                }),
                t("internalTransit.order.cancelFailed", {
                  defaultValue: "Could not cancel auto-arrival",
                }),
              )
            }
          >
            {t("internalTransit.order.cancel", {
              defaultValue: "Cancel auto-arrival",
            })}
          </Button>
        </HStack>
      </Stack>
    </Box>
  );
}
