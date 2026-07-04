import type {
  InvoiceKind,
  Invoice_status,
} from "@konfi/fakturownia/out/client/models";

export const CASH_NUMPAD_KEYS = [
  "7",
  "8",
  "9",
  "4",
  "5",
  "6",
  "1",
  "2",
  "3",
  ".",
  "0",
  "backspace",
] as const;

export const INVOICE_KIND_OPTIONS: Array<{
  value: InvoiceKind;
  labelKey: string;
  fallback: string;
}> = [
  {
    value: "vat",
    labelKey: "fakturownia.invoiceCreate.kindOptions.vat",
    fallback: "Invoice",
  },
  {
    value: "proforma",
    labelKey: "fakturownia.invoiceCreate.kindOptions.proforma",
    fallback: "Pro forma",
  },
  {
    value: "receipt",
    labelKey: "fakturownia.invoiceCreate.kindOptions.receipt",
    fallback: "Receipt",
  },
  {
    value: "estimate",
    labelKey: "fakturownia.invoiceCreate.kindOptions.estimate",
    fallback: "Estimate",
  },
];

export const getSubmitLabelConfig = (
  kind: InvoiceKind,
): { key: string; defaultValue: string } => {
  switch (kind) {
    case "proforma":
      return {
        key: "fakturownia.invoiceCreate.submitProforma",
        defaultValue: "Create pro forma",
      };
    case "receipt":
      return {
        key: "fakturownia.invoiceCreate.submitReceipt",
        defaultValue: "Create receipt",
      };
    case "estimate":
      return {
        key: "fakturownia.invoiceCreate.submitEstimate",
        defaultValue: "Create estimate",
      };
    case "vat":
    default:
      return {
        key: "fakturownia.invoiceCreate.submit",
        defaultValue: "Create invoice",
      };
  }
};

export const PAYMENT_STATUS_OPTIONS: Array<{
  value: Invoice_status;
  labelKey: string;
  fallback: string;
}> = [
  {
    value: "issued",
    labelKey: "fakturownia.invoiceCreate.status.issued",
    fallback: "Issued",
  },
  {
    value: "sent",
    labelKey: "fakturownia.invoiceCreate.status.sent",
    fallback: "Sent",
  },
  {
    value: "paid",
    labelKey: "fakturownia.invoiceCreate.status.paid",
    fallback: "Paid",
  },
  {
    value: "partial",
    labelKey: "fakturownia.invoiceCreate.status.partial",
    fallback: "Partially paid",
  },
  {
    value: "rejected",
    labelKey: "fakturownia.invoiceCreate.status.rejected",
    fallback: "Rejected",
  },
];

export const PAYMENT_TERM_OPTIONS = [
  {
    value: "0",
    days: 0,
    labelKey: "fakturownia.invoiceCreate.paymentTerm.immediate",
    fallback: "Due on issue",
  },
  {
    value: "1",
    days: 1,
    labelKey: "fakturownia.invoiceCreate.paymentTerm.oneDay",
    fallback: "1 day",
  },
  {
    value: "3",
    days: 3,
    labelKey: "fakturownia.invoiceCreate.paymentTerm.threeDays",
    fallback: "3 days",
  },
  {
    value: "7",
    days: 7,
    labelKey: "fakturownia.invoiceCreate.paymentTerm.sevenDays",
    fallback: "7 days",
  },
  {
    value: "14",
    days: 14,
    labelKey: "fakturownia.invoiceCreate.paymentTerm.fourteenDays",
    fallback: "14 days",
  },
  {
    value: "30",
    days: 30,
    labelKey: "fakturownia.invoiceCreate.paymentTerm.thirtyDays",
    fallback: "30 days",
  },
  {
    value: "custom",
    days: undefined,
    labelKey: "fakturownia.invoiceCreate.paymentTerm.custom",
    fallback: "Custom date",
  },
];

export const TAX_OPTIONS = [23, 8, 5, 0].map((rate) => ({
  value: rate.toString(),
  label: `${rate}%`,
}));
TAX_OPTIONS.push({ value: "zw", label: "ZW" }, { value: "np", label: "NP" });
