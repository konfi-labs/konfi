"use client";

import { Button, Dialog, Portal, Text } from "@chakra-ui/react";
import type { TranslateFn } from "./types";

type ConnectedExternalProductSyncConfirmationDialogProps = {
  loading: boolean;
  open: boolean;
  confirmAction: () => void;
  openChangeAction: (open: boolean) => void;
  t: TranslateFn;
};

export default function ConnectedExternalProductSyncConfirmationDialog({
  loading,
  open,
  confirmAction,
  openChangeAction,
  t,
}: ConnectedExternalProductSyncConfirmationDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => openChangeAction(details.open)}
      placement="center"
      size="md"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("externalProducts.syncImportConfirmTitle", {
                  defaultValue:
                    "Sync mapped attributes & stage applied prices?",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text color="fg.muted">
                {t("externalProducts.syncImportConfirmDescription", {
                  defaultValue:
                    "This updates the current form with the mapped external attributes and applied supplier prices. Review the local changes and save the product to persist them.",
                })}
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                variant="outline"
                onClick={() => openChangeAction(false)}
                disabled={loading}
              >
                {t("common.cancel", {
                  defaultValue: "Cancel",
                })}
              </Button>
              <Button
                colorPalette="primary"
                onClick={confirmAction}
                loading={loading}
              >
                {t("externalProducts.syncImportConfirmAction", {
                  defaultValue: "Sync & stage",
                })}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
