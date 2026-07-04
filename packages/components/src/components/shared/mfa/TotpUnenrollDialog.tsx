"use client";

import { Alert, Button, CloseButton, Dialog, Portal } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { MaterialSymbol } from "../MaterialSymbol";

interface TotpUnenrollDialogProps {
  isUnenrolling: boolean;
  t: TFunction;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const TotpUnenrollDialog = ({
  isUnenrolling,
  t,
  onConfirm,
  onOpenChange,
  open,
}: TotpUnenrollDialogProps) => {
  const handleClose = () => onOpenChange(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open }) => onOpenChange(open)}
      motionPreset="slide-in-bottom"
      lazyMount
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.CloseTrigger asChild>
              <CloseButton disabled={isUnenrolling} />
            </Dialog.CloseTrigger>
            <Dialog.Header>
              <Dialog.Title>
                {t("mfa.unenroll.title", {
                  defaultValue: "Disable Two-Factor Authentication",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Alert.Root
                colorPalette="red"
                borderStartWidth="4px"
                borderStartColor="red.solid"
                borderRadius="xl"
              >
                <Alert.Indicator>
                  <MaterialSymbol>warning</MaterialSymbol>
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {t("mfa.unenroll.warningTitle", {
                      defaultValue: "This will reduce your account security",
                    })}
                  </Alert.Title>
                  <Alert.Description>
                    {t("mfa.unenroll.warningDescription", {
                      defaultValue:
                        "After disabling two-factor authentication, your account will only be protected by your password.",
                    })}
                  </Alert.Description>
                </Alert.Content>
              </Alert.Root>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isUnenrolling}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                colorPalette="red"
                onClick={onConfirm}
                loading={isUnenrolling}
              >
                {t("mfa.unenroll.confirm", {
                  defaultValue: "Disable MFA",
                })}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default TotpUnenrollDialog;
