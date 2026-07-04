"use client";

import { useT } from "@/i18n/client";
import type { ProductionPrintTypeCompletionGroup } from "@/lib/orders/production-view";
import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { Tooltip } from "@konfi/components/ui/tooltip";
import type { PrintingMethodsSettings } from "@konfi/types";
import {
  getPrintingMethodColorPalette,
  getPrintingMethodLabel,
} from "@konfi/utils/printing-methods";

interface PrintTypeCompletionBadgesProps {
  groups: readonly ProductionPrintTypeCompletionGroup[];
  maxLabelWidth?: string;
  onMarkFulfilled?: (group: ProductionPrintTypeCompletionGroup) => void;
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null;
}

export function PrintTypeCompletionBadges({
  groups,
  maxLabelWidth = "8rem",
  onMarkFulfilled,
  printingMethodsSettings,
}: PrintTypeCompletionBadgesProps) {
  const { t, i18n } = useT(["orders", "translation"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  if (groups.length === 0) {
    return null;
  }

  return (
    <HStack align="center" gap={1} minW={0} wrap="wrap">
      {groups.map((group) => {
        const printTypeLabel = getPrintingMethodLabel(
          group.methodId,
          printingMethodsSettings,
          t,
          locale,
        );
        const progressLabel = t(
          "orders.productionView.printTypeCompletion.progress",
          {
            defaultValue: "{{done}}/{{total}} completed",
            done: group.completedCount,
            total: group.totalCount,
          },
        );
        const tooltipLabel = group.complete
          ? t("orders.productionView.printTypeCompletion.completedTooltip", {
              defaultValue: "{{printType}} completed",
              printType: printTypeLabel,
            })
          : t("orders.productionView.printTypeCompletion.markFulfilled", {
              defaultValue: "Mark {{printType}} items fulfilled",
              printType: printTypeLabel,
            });
        const disabled = group.complete || !onMarkFulfilled;

        return (
          <Tooltip key={group.methodId} content={tooltipLabel}>
            <Box
              data-production-row-action
              display="inline-flex"
              maxW="100%"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Button
                aria-label={tooltipLabel}
                colorPalette={getPrintingMethodColorPalette(
                  group.methodId,
                  printingMethodsSettings,
                )}
                cursor={disabled ? "default" : "pointer"}
                disabled={disabled}
                fontSize="xs"
                fontWeight={group.complete ? "medium" : undefined}
                gap={1}
                h="20px"
                maxW="100%"
                minW={0}
                px={1.25}
                size="2xs"
                variant={group.complete ? "subtle" : "surface"}
                onClick={() => {
                  if (!disabled) {
                    onMarkFulfilled?.(group);
                  }
                }}
              >
                <Text as="span" maxW={maxLabelWidth} minW={0} truncate>
                  {printTypeLabel}
                </Text>
                {!group.complete && (
                  <Text
                    aria-label={progressLabel}
                    as="span"
                    color="fg.muted"
                    flexShrink={0}
                    fontVariantNumeric="tabular-nums"
                  >
                    {group.completedCount}/{group.totalCount}
                  </Text>
                )}
              </Button>
            </Box>
          </Tooltip>
        );
      })}
    </HStack>
  );
}
