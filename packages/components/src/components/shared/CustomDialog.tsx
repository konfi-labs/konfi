"use client";

import {
  CloseButton,
  ConditionalValue,
  Dialog,
  Portal,
} from "@chakra-ui/react";
import { Dispatch, SetStateAction } from "react";

type Props = {
  header: string;
  children?: React.ReactNode;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  size?: ConditionalValue<
    "sm" | "md" | "lg" | "xl" | "xs" | "cover" | "full" | undefined
  >;
};

export function CustomDialog({
  header,
  children,
  open,
  setOpen,
  size = "lg",
}: Props) {
  return (
    <Dialog.Root
      size={size}
      open={open}
      onOpenChange={({ open }) => setOpen(open)}
      motionPreset={"slide-in-bottom"}
      lazyMount
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.CloseTrigger asChild onClick={() => setOpen(false)}>
              <CloseButton />
            </Dialog.CloseTrigger>
            <Dialog.Header>
              <Dialog.Title>{header}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>{children}</Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
