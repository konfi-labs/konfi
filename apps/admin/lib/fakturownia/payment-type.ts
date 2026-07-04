import type { InvoiceKind } from "@konfi/fakturownia/out/client/models";
import { PaymentType } from "@konfi/types";
import { FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS } from "@konfi/utils";

export interface PaymentTypeOption {
  value: string;
  labelKey: string;
  fallback: string;
  requiresCustom?: boolean;
  presetCustomValue?: string;
}

export const PAYMENT_TYPES: PaymentTypeOption[] = [
  {
    value: "transfer",
    labelKey: "fakturownia.invoiceCreate.paymentType.transfer",
    fallback: "Bank transfer",
  },
  {
    value: "cash",
    labelKey: "fakturownia.invoiceCreate.paymentType.cash",
    fallback: "Cash",
  },
  {
    value: "card",
    labelKey: "fakturownia.invoiceCreate.paymentType.card",
    fallback: "Card",
  },
  {
    value: "cash_on_delivery",
    labelKey: "fakturownia.invoiceCreate.paymentType.cashOnDelivery",
    fallback: "Cash on delivery",
  },
  {
    value: "payu",
    labelKey: "fakturownia.invoiceCreate.paymentType.payu",
    fallback: "PayU",
  },
  {
    value: "paypal",
    labelKey: "fakturownia.invoiceCreate.paymentType.paypal",
    fallback: "PayPal",
  },
  {
    value: "barter",
    labelKey: "fakturownia.invoiceCreate.paymentType.barter",
    fallback: "Barter",
  },
  {
    value: "off",
    labelKey: "fakturownia.invoiceCreate.paymentType.off",
    fallback: "Do not display",
  },
  {
    value: "custom_przedplata",
    labelKey: "fakturownia.invoiceCreate.paymentType.przedplata",
    fallback: "Przedpłata",
    requiresCustom: true,
    presetCustomValue: FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS.PRZEDPLATA,
  },
  {
    value: "custom_przelewy24",
    labelKey: "fakturownia.invoiceCreate.paymentType.przelewy24",
    fallback: "Przelewy24",
    requiresCustom: true,
    presetCustomValue: FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS.PRZELEWY24,
  },
  {
    value: "custom_stripe",
    labelKey: "fakturownia.invoiceCreate.paymentType.stripe",
    fallback: "Stripe",
    requiresCustom: true,
    presetCustomValue: FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS.STRIPE,
  },
  {
    value: "custom_allegro",
    labelKey: "fakturownia.invoiceCreate.paymentType.allegro",
    fallback: "Allegro",
    requiresCustom: true,
    presetCustomValue: FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS.ALLEGRO,
  },
  {
    value: "custom_other",
    labelKey: "fakturownia.invoiceCreate.paymentType.custom",
    fallback: "Other (custom)",
    requiresCustom: true,
  },
];

export const IMMEDIATE_PAYMENT_TYPES = [
  "cash",
  "card",
  "cash_on_delivery",
  "payu",
  "paypal",
  "custom_przedplata",
  "custom_przelewy24",
  "custom_stripe",
] as const;

export const DEFAULT_FAKTUROWNIA_PAYMENT_TYPE = "transfer";
const DEFAULT_PAYMENT_TERM = "7";

const ORDER_PAYMENT_TYPE_ALIASES: Record<string, PaymentType> = {
  STRIPE: PaymentType.STRIPE,
  PRZELEWY24: PaymentType.PRZELEWY24,
  PRZELEWY_24: PaymentType.PRZELEWY24,
  P24: PaymentType.PRZELEWY24,
  ALLEGRO: PaymentType.ALLEGRO,
  PROFORMA: PaymentType.PROFORMA,
  DEFERRED: PaymentType.DEFERRED,
  BANK_TRANSFER: PaymentType.BANK_TRANSFER,
  BANKTRANSFER: PaymentType.BANK_TRANSFER,
  ON_DELIVERY: PaymentType.ON_DELIVERY,
  CASH_ON_DELIVERY: PaymentType.ON_DELIVERY,
  ON_PICKUP: PaymentType.ON_PICKUP,
};

const PAYMENT_TYPES_BY_VALUE = new Map(
  PAYMENT_TYPES.map((option) => [option.value, option]),
);

function toNonEmptyString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function getPaymentTypeOption(
  paymentType: string | null | undefined,
): PaymentTypeOption | undefined {
  const normalizedPaymentType = toNonEmptyString(paymentType);
  if (!normalizedPaymentType) {
    return undefined;
  }

  return PAYMENT_TYPES_BY_VALUE.get(normalizedPaymentType);
}

export function getDefaultCustomPaymentType(
  paymentType: string | null | undefined,
): string | undefined {
  return getPaymentTypeOption(paymentType)?.presetCustomValue;
}

export function normalizeOrderPaymentType(
  paymentType: PaymentType | string | null | undefined,
): PaymentType | undefined {
  const normalizedValue = toNonEmptyString(paymentType);
  if (!normalizedValue) {
    return undefined;
  }

  if (Object.values(PaymentType).includes(normalizedValue as PaymentType)) {
    return normalizedValue as PaymentType;
  }

  const aliasKey = normalizedValue.toUpperCase().replace(/[\s-]+/g, "_");
  return ORDER_PAYMENT_TYPE_ALIASES[aliasKey];
}

export function getPaymentDefaultsForOrder(params: {
  initialKind: InvoiceKind;
  orderPaymentType?: PaymentType | string | null;
}): { paymentType: string; paymentTerm: string; } {
  const normalizedOrderPaymentType = normalizeOrderPaymentType(
    params.orderPaymentType,
  );

  if (params.initialKind === "receipt") {
    switch (normalizedOrderPaymentType) {
      case PaymentType.STRIPE:
        return { paymentType: "custom_stripe", paymentTerm: "0" };
      case PaymentType.PRZELEWY24:
        return { paymentType: "custom_przelewy24", paymentTerm: "0" };
      case PaymentType.ALLEGRO:
        return { paymentType: "custom_allegro", paymentTerm: "0" };
      case PaymentType.ON_DELIVERY:
        return { paymentType: "cash_on_delivery", paymentTerm: "0" };
      case PaymentType.BANK_TRANSFER:
        return { paymentType: "transfer", paymentTerm: "0" };
      case PaymentType.ON_PICKUP:
        return { paymentType: "cash", paymentTerm: "0" };
      default:
        return { paymentType: "card", paymentTerm: "0" };
    }
  }

  if (params.initialKind === "estimate") {
    return { paymentType: "off", paymentTerm: "custom" };
  }

  if (params.initialKind === "proforma") {
    return { paymentType: "custom_przedplata", paymentTerm: "7" };
  }

  switch (normalizedOrderPaymentType) {
    case PaymentType.STRIPE:
      return { paymentType: "custom_stripe", paymentTerm: "0" };
    case PaymentType.PRZELEWY24:
      return { paymentType: "custom_przelewy24", paymentTerm: "0" };
    case PaymentType.ALLEGRO:
      return { paymentType: "custom_allegro", paymentTerm: "0" };
    case PaymentType.PROFORMA:
      return { paymentType: "custom_przedplata", paymentTerm: "3" };
    case PaymentType.DEFERRED:
      return { paymentType: "off", paymentTerm: "0" };
    case PaymentType.BANK_TRANSFER:
      return { paymentType: "transfer", paymentTerm: "" };
    case PaymentType.ON_DELIVERY:
      return { paymentType: "cash_on_delivery", paymentTerm: "0" };
    case PaymentType.ON_PICKUP:
      return { paymentType: "", paymentTerm: "0" };
    default:
      return {
        paymentType: DEFAULT_FAKTUROWNIA_PAYMENT_TYPE,
        paymentTerm: DEFAULT_PAYMENT_TERM,
      };
  }
}

export function resolveFakturowniaPaymentType(params: {
  paymentType?: string | null;
  customPaymentType?: string | null;
  fallbackPaymentType?: string;
}): string {
  const option = getPaymentTypeOption(params.paymentType);
  if (!option) {
    return (
      toNonEmptyString(params.paymentType) ??
      params.fallbackPaymentType ??
      DEFAULT_FAKTUROWNIA_PAYMENT_TYPE
    );
  }

  if (!option.requiresCustom) {
    return option.value;
  }

  return (
    toNonEmptyString(params.customPaymentType) ??
    option.presetCustomValue ??
    params.fallbackPaymentType ??
    DEFAULT_FAKTUROWNIA_PAYMENT_TYPE
  );
}

export function getFakturowniaPaymentTypeForOrder(params: {
  invoiceKind: InvoiceKind;
  orderPaymentType?: PaymentType | string | null;
}): string {
  const { paymentType } = getPaymentDefaultsForOrder({
    initialKind: params.invoiceKind,
    orderPaymentType: params.orderPaymentType,
  });

  return resolveFakturowniaPaymentType({
    paymentType,
    customPaymentType: getDefaultCustomPaymentType(paymentType),
  });
}