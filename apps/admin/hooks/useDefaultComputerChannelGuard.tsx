"use client";

import { useChannels } from "@/context/channels";
import { useT } from "@/i18n/client";
import { Alert, Button, Dialog, Portal } from "@chakra-ui/react";
import { useCallback, useMemo, useRef, useState } from "react";

type ConfirmAction = () => Promise<void> | void;

interface PendingConfirmation {
  targetChannelId: string;
  variant: "document" | "department";
}

export function useDefaultComputerChannelGuard() {
  const { t } = useT();
  const { defaultComputerChannel, getChannelById } = useChannels();
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const pendingActionRef = useRef<ConfirmAction | null>(null);

  const targetChannel = useMemo(() => {
    if (!pendingConfirmation) {
      return undefined;
    }

    return getChannelById(pendingConfirmation.targetChannelId);
  }, [getChannelById, pendingConfirmation]);

  const confirmDefaultComputerChannel = useCallback(
    async (
      targetChannelId: string | undefined,
      action: ConfirmAction,
      variant: "document" | "department" = "document",
    ) => {
      if (
        !targetChannelId ||
        !defaultComputerChannel ||
        defaultComputerChannel.id === targetChannelId
      ) {
        await action();
        return;
      }

      pendingActionRef.current = action;
      setPendingConfirmation({ targetChannelId, variant });
    },
    [defaultComputerChannel],
  );

  const closeConfirmation = useCallback(() => {
    pendingActionRef.current = null;
    setPendingConfirmation(null);
  }, []);

  const continueWithDifferentChannel = useCallback(async () => {
    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    setPendingConfirmation(null);

    if (pendingAction) {
      await pendingAction();
    }
  }, []);

  const defaultComputerChannelDialog = (
    <Dialog.Root
      open={pendingConfirmation !== null}
      onOpenChange={({ open }) => {
        if (!open) {
          closeConfirmation();
        }
      }}
      placement="center"
      role="alertdialog"
      size="md"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner px={{ base: 3, md: 6 }}>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {pendingConfirmation?.variant === "department"
                  ? t(
                      "channel.defaultComputerChannel.departmentMismatchTitle",
                      {
                        defaultValue: "Department Uses a Different Channel",
                      },
                    )
                  : t("channel.defaultComputerChannel.mismatchTitle", {
                      defaultValue: "Different Channel Selected",
                    })}
              </Dialog.Title>
              <Dialog.Description>
                {pendingConfirmation?.variant === "department"
                  ? t(
                      "channel.defaultComputerChannel.departmentMismatchDescription",
                      {
                        defaultValue:
                          "The selected Fakturownia department is connected to {{targetChannel}}, but this computer is assigned to {{defaultChannel}}.",
                        targetChannel: targetChannel?.name ?? "",
                        defaultChannel: defaultComputerChannel?.name ?? "",
                      },
                    )
                  : t("channel.defaultComputerChannel.mismatchDescription", {
                      defaultValue:
                        "This document will be created in {{targetChannel}}, but this computer is assigned to {{defaultChannel}}.",
                      targetChannel: targetChannel?.name ?? "",
                      defaultChannel: defaultComputerChannel?.name ?? "",
                    })}
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <Alert.Root status="warning" variant="subtle">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    {pendingConfirmation?.variant === "department"
                      ? t(
                          "channel.defaultComputerChannel.departmentMismatchWarning",
                          {
                            defaultValue:
                              "Continue only if this invoice should use the selected Fakturownia department.",
                          },
                        )
                      : t("channel.defaultComputerChannel.mismatchWarning", {
                          defaultValue:
                            "Continue only if this document should belong to the selected channel.",
                        })}
                  </Alert.Description>
                </Alert.Content>
              </Alert.Root>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={closeConfirmation}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                colorPalette="primary"
                onClick={continueWithDifferentChannel}
              >
                {pendingConfirmation?.variant === "department"
                  ? t("channel.defaultComputerChannel.continueWithDepartment", {
                      defaultValue: "Use Selected Department",
                    })
                  : t("channel.defaultComputerChannel.continue", {
                      defaultValue: "Create in Selected Channel",
                    })}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );

  return {
    confirmDefaultComputerChannel,
    defaultComputerChannelDialog,
  };
}
