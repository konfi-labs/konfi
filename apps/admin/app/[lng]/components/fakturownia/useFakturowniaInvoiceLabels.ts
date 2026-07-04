import { useT } from "@/i18n/client";
import { InvoiceKindObject } from "@konfi/fakturownia/client/models";
import type {
  Invoice_status,
  InvoiceKind,
} from "@konfi/fakturownia/out/client/models";
import { useMemo } from "react";
import { getPaymentTypeOption } from "@/lib/fakturownia/payment-type";
import {
  INVOICE_KIND_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PAYMENT_TERM_OPTIONS,
  getSubmitLabelConfig,
} from "./invoice-form-options";
import type { RecipientRoleOptionValue } from "./invoice-form-types";

interface UseFakturowniaInvoiceLabelsArgs {
  invoiceKind: InvoiceKind;
  buyerCompany: boolean;
  recipientRole: RecipientRoleOptionValue;
  selectedPaymentType: string;
  customPaymentTypeValue?: string;
  paymentTerm: string;
  paymentToValue?: string;
  statusValue: Invoice_status;
}

export function useFakturowniaInvoiceLabels({
  invoiceKind,
  buyerCompany,
  recipientRole,
  selectedPaymentType,
  customPaymentTypeValue,
  paymentTerm,
  paymentToValue,
  statusValue,
}: UseFakturowniaInvoiceLabelsArgs) {
  const { t } = useT(["fakturownia", "translation"]);
  const submitLabel = useMemo(() => {
    const kind = invoiceKind || InvoiceKindObject.Vat;
    const { key, defaultValue } = getSubmitLabelConfig(kind);
    return t(key, { defaultValue });
  }, [invoiceKind, t]);
  const kindLabel = useMemo(() => {
    const kind = invoiceKind || InvoiceKindObject.Vat;
    const option = INVOICE_KIND_OPTIONS.find((o) => o.value === kind);
    return t(option?.labelKey || "fakturownia.invoiceCreate.kindOptions.vat", {
      defaultValue: option?.fallback || "Invoice",
    });
  }, [invoiceKind, t]);
  const paymentTypeLabel = useMemo(() => {
    const option = getPaymentTypeOption(selectedPaymentType);
    if (!option) return selectedPaymentType || "";
    if (option.requiresCustom && customPaymentTypeValue) {
      return customPaymentTypeValue;
    }
    return t(option.labelKey, { defaultValue: option.fallback });
  }, [selectedPaymentType, customPaymentTypeValue, t]);
  const paymentTermLabel = useMemo(() => {
    const option = PAYMENT_TERM_OPTIONS.find((o) => o.value === paymentTerm);
    if (!option) return paymentTerm || "";
    if (option.value === "custom" && paymentToValue) {
      return paymentToValue;
    }
    return t(option.labelKey, { defaultValue: option.fallback });
  }, [paymentTerm, paymentToValue, t]);
  const statusLabel = useMemo(() => {
    const option = PAYMENT_STATUS_OPTIONS.find((o) => o.value === statusValue);
    return t(option?.labelKey || "fakturownia.invoiceCreate.status.issued", {
      defaultValue: option?.fallback || "Issued",
    });
  }, [statusValue, t]);

  return {
    submitLabel,
    kindLabel,
    paymentTypeLabel,
    paymentTermLabel,
    statusLabel,
    isBuyerNameRequired:
      invoiceKind !== InvoiceKindObject.Receipt && buyerCompany,
    isBuyerLastNameRequired:
      invoiceKind !== InvoiceKindObject.Receipt && !buyerCompany,
    recipientVatGroupEnabled: recipientRole === "vatGroupMember",
    shouldShowRecipientRoleDescription: recipientRole === "other",
  };
}
