"use client";

import { Button, CloseButton, Dialog, Portal } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Dispatch, SetStateAction } from "react";

type AlertDialogProps = {
  children?: React.ReactNode;
  header: string;
  handle: () => void;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  t: TFunction;
};

export function AlertDialog({
  children,
  header,
  handle,
  open = false,
  setOpen,
  t,
}: AlertDialogProps) {
  const onAccept = () => {
    if (setOpen) {
      handle();
      setOpen(false);
    } else {
      console.error("AlertDialog component requires an 'setOpen' function.");
    }
  };

  if (!setOpen) {
    throw new Error("AlertDialog component requires an 'setOpen' function.");
  }

  return (
    <>
      <Dialog.Root
        open={open}
        motionPreset={"slide-in-bottom"}
        role={"alertdialog"}
        lazyMount
      >
        <Portal>
          <Dialog.Positioner>
            <Dialog.Backdrop />
            <Dialog.Content p={"4"}>
              <Dialog.Header>
                <Dialog.Title>{header}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>{children}</Dialog.Body>
              <Dialog.Footer mt={"6"}>
                <Dialog.ActionTrigger asChild>
                  <Button
                    variant={"ghost"}
                    mr={4}
                    onClick={() => setOpen(false)}
                  >
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </Button>
                </Dialog.ActionTrigger>
                <Button colorPalette={"primary"} onClick={onAccept}>
                  {t("common.accept", { defaultValue: "Accept" })}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" onClick={() => setOpen(false)} />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
