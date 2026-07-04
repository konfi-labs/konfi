"use client";

import { useT } from "@/i18n/client";
import { Dialog, Portal, VStack } from "@chakra-ui/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { DraftFakturowniaInvoiceDialogTrigger } from "./DraftFakturowniaInvoiceDialogTrigger";
import { FakturowniaInvoiceFormSkeleton } from "./FakturowniaInvoiceFormSkeleton";
import type { FakturowniaInvoiceOrderDraft } from "./FakturowniaInvoiceForm";

const FakturowniaInvoiceForm = dynamic(
  () =>
    import("./FakturowniaInvoiceForm").then(
      (module) => module.FakturowniaInvoiceForm,
    ),
  {
    ssr: false,
    loading: () => <FakturowniaInvoiceFormSkeleton compact />,
  },
);

export function DraftFakturowniaInvoiceDialog({
  draftOrder,
  disabled = false,
}: {
  draftOrder: FakturowniaInvoiceOrderDraft;
  disabled?: boolean;
}) {
  const { t } = useT(["fakturownia", "translation"]);
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={({ open: nextOpen }) => setOpen(nextOpen)}
      size="full"
    >
      <Dialog.Trigger asChild>
        <DraftFakturowniaInvoiceDialogTrigger disabled={disabled} />
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("fakturownia.invoiceCreate.createFromDraft", {
                  defaultValue: "Create invoice",
                })}
              </Dialog.Title>
              <Dialog.Description>
                {t("fakturownia.invoiceCreate.createFromDraftDescription", {
                  defaultValue:
                    "The invoice form uses the current items and customer details from this draft.",
                })}
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body overflowY="auto" pb={8}>
              <VStack align="stretch" gap={6}>
                {open && <FakturowniaInvoiceForm draftOrder={draftOrder} />}
              </VStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
