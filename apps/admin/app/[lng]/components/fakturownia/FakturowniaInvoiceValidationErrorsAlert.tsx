"use client";

import { useT } from "@/i18n/client";
import { FakturowniaErrorsAlert } from "./FakturowniaErrors";

interface FakturowniaInvoiceValidationErrorsAlertProps {
  messages: string[];
}

export function FakturowniaInvoiceValidationErrorsAlert({
  messages,
}: FakturowniaInvoiceValidationErrorsAlertProps) {
  const { t } = useT(["fakturownia", "translation"]);
  return (
    <FakturowniaErrorsAlert
      messages={messages}
      title={t("fakturownia.invoiceCreate.validationErrorsTitle", {
        defaultValue: "Please fix the following errors:",
      })}
    />
  );
}
