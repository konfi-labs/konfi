"use client";

import {
  Dialog,
  HStack,
  Portal,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";

interface OrderPrintPreparingDialogProps {
  open: boolean;
  t: TFunction;
}

export function OrderPrintPreparingDialog({
  open,
  t,
}: OrderPrintPreparingDialogProps) {
  return (
    <Dialog.Root
      closeOnEscape={false}
      closeOnInteractOutside={false}
      lazyMount
      open={open}
      placement="center"
      size="sm"
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("orders.print.preparingTitle", {
                  defaultValue: "Preparing order print...",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb={6}>
              <HStack align="center" gap={4}>
                <Spinner color="primary.solid" size="md" />
                <VStack align="start" gap={1}>
                  <Text fontWeight="semibold">
                    {t("orders.print.preparingStatus", {
                      defaultValue: "Collecting order details",
                    })}
                  </Text>
                  <Text color="fg.muted" fontSize="sm">
                    {t("orders.print.preparingDescription", {
                      defaultValue:
                        "Loading files, notes, and customer details.",
                    })}
                  </Text>
                </VStack>
              </HStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
