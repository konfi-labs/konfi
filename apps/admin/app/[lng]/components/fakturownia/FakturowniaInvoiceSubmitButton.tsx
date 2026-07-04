"use client";

import { Button } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";

interface FakturowniaInvoiceSubmitButtonProps {
  isCreatingInvoice: boolean;
  isSubmitting: boolean;
  shouldBlockSubmit: boolean;
  submitLabel: string;
}

export function FakturowniaInvoiceSubmitButton({
  isCreatingInvoice,
  isSubmitting,
  shouldBlockSubmit,
  submitLabel,
}: FakturowniaInvoiceSubmitButtonProps) {
  return (
    <Button
      w="100%"
      colorPalette="primary"
      type="submit"
      disabled={isCreatingInvoice || shouldBlockSubmit}
      loading={isSubmitting || isCreatingInvoice}
      alignSelf="start"
      size="xl"
    >
      <MaterialSymbol>save</MaterialSymbol>
      {submitLabel}
    </Button>
  );
}
