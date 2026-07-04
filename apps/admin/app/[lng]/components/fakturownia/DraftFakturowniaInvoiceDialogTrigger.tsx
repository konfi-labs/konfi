"use client";

import { useT } from "@/i18n/client";
import { Button, type ButtonProps } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { forwardRef } from "react";

interface DraftFakturowniaInvoiceDialogTriggerProps extends ButtonProps {
  disabled?: boolean;
}

export const DraftFakturowniaInvoiceDialogTrigger = forwardRef<
  HTMLButtonElement,
  DraftFakturowniaInvoiceDialogTriggerProps
>(function DraftFakturowniaInvoiceDialogTrigger(
  { disabled = false, children, ...props },
  ref,
) {
  const { t } = useT(["fakturownia", "translation"]);

  return (
    <Button
      ref={ref}
      w="100%"
      colorPalette="primary"
      variant="outline"
      disabled={disabled}
      {...props}
    >
      <MaterialSymbol>receipt_long</MaterialSymbol>
      {children ??
        t("fakturownia.invoiceCreate.createFromDraft", {
          defaultValue: "Create invoice",
        })}
    </Button>
  );
});
