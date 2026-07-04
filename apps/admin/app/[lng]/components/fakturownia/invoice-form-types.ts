import type {
  FakturowniaPriceList,
  FakturowniaPriceListPosition,
} from "@/actions/fakturownia";
import type {
  Client,
  InvoiceKind,
  Invoice_status,
} from "@konfi/fakturownia/out/client/models";
import type { FakturowniaProductSnapshot } from "./invoice-helpers";

export interface InvoicePositionFormValue {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  priceNet: number;
  priceGross: number;
  tax: string;
  totalNet?: number;
  totalGross?: number;
  productId?: string;
  code?: string;
  discountPercent?: number;

  /**
   * Optional metadata for positions initialized from an OrderItem.
   * These fields are not sent to Fakturownia (payload is constructed manually).
   */
  sourceTotalGross?: number;
  sourceQuantity?: number;
  sourceUnit?: string;
  sourceDiscountPercent?: number;
}

export interface PositionPriceAdjustment {
  positionIndex: number;
  name: string;
  originalQuantity: number;
  originalUnit: string;
  originalDiscountPercent: number;
  expectedTotalGross: number;
  calculatedTotalGross: number;
  strategy: "QUANTITY_TO_NAME" | "QUANTITY_AND_DISCOUNT_TO_NAME";
}

export const RECIPIENT_JST_ROLE = "JST – odbiorca";
export const RECIPIENT_VAT_GROUP_ROLE = "Członek GV – odbiorca";
export const FACTUROWNIA_RECIPIENT_JST_HELP_URL =
  "https://pomoc.fakturownia.pl/201969093-oznaczenia-jst-i-grupa-vat-po-stronie-nabywcy";
export const FACTUROWNIA_RECIPIENT_VAT_GROUP_HELP_URL =
  "https://pomoc.fakturownia.pl/201969093-Oznaczenia-JST-i-grupa-VAT-po-stronie-Nabywcy#grupa_VAT";

export type RecipientRoleOptionValue =
  | "recipient"
  | "additionalBuyer"
  | "payer"
  | "jst"
  | "vatGroupMember"
  | "employee"
  | "other";

export const RECIPIENT_ROLE_OPTIONS: ReadonlyArray<{
  value: RecipientRoleOptionValue;
  labelKey: string;
  fallback: string;
  apiValue?: string;
}> = [
  {
    value: "recipient",
    labelKey: "fakturownia.invoiceCreate.recipientRoleOptions.recipient",
    fallback: "Recipient",
  },
  {
    value: "additionalBuyer",
    labelKey: "fakturownia.invoiceCreate.recipientRoleOptions.additionalBuyer",
    fallback: "Additional buyer",
    apiValue: "Dodatkowy nabywca",
  },
  {
    value: "payer",
    labelKey: "fakturownia.invoiceCreate.recipientRoleOptions.payer",
    fallback: "Paying party",
    apiValue: "Dokonujący płatności",
  },
  {
    value: "jst",
    labelKey: "fakturownia.invoiceCreate.recipientRoleOptions.jst",
    fallback: "Local government unit",
    apiValue: RECIPIENT_JST_ROLE,
  },
  {
    value: "vatGroupMember",
    labelKey: "fakturownia.invoiceCreate.recipientRoleOptions.vatGroupMember",
    fallback: "VAT group member",
    apiValue: RECIPIENT_VAT_GROUP_ROLE,
  },
  {
    value: "employee",
    labelKey: "fakturownia.invoiceCreate.recipientRoleOptions.employee",
    fallback: "Employee",
    apiValue: "Pracownik",
  },
  {
    value: "other",
    labelKey: "fakturownia.invoiceCreate.recipientRoleOptions.other",
    fallback: "Other role",
  },
];

export interface InvoiceFormValues {
  kind: InvoiceKind;
  number?: string;
  issueDate: string;
  sellDate: string;
  paymentType: string;
  paymentTerm: string;
  paymentTo?: string;
  customPaymentType?: string;
  status: Invoice_status;
  paidAmount: number;
  currency: string;
  language: string;
  warehouseId?: string;
  departmentId?: string;
  priceListId?: string;
  clientId?: string;
  oid?: string;
  oidUnique?: string;
  notes: string;
  splitPayment: boolean;
  sendEmail: boolean;
  buyerCompany: boolean;
  buyerName: string;
  buyerFirstName?: string;
  buyerLastName?: string;
  buyerTaxNo?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerStreet?: string;
  buyerPostalCode?: string;
  buyerCity?: string;
  buyerCountry?: string;
  buyerPerson?: string;
  recipientId?: string;
  recipientEnabled: boolean;
  recipientRole: RecipientRoleOptionValue;
  recipientRoleDescription?: string;
  recipientName?: string;
  recipientStreet?: string;
  recipientPostalCode?: string;
  recipientCity?: string;
  recipientCountry?: string;
  recipientTaxNo?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientNote?: string;
  sellerName: string;
  sellerTaxNo?: string;
  sellerStreet?: string;
  sellerPostalCode?: string;
  sellerCity?: string;
  sellerCountry?: string;
  sellerPerson?: string;
  place?: string;
  issuerId?: number;
  positions: InvoicePositionFormValue[];
}

export interface RecipientRoleOptionItem {
  value: RecipientRoleOptionValue;
  label: string;
  apiValue?: string;
}

export interface ClientOptionItem {
  value: string;
  label: string;
  secondaryLabel?: string;
  client: Client;
}

export interface ProductOptionItem {
  value: string;
  label: string;
  secondaryLabel?: string;
  snapshot: FakturowniaProductSnapshot;
}

export interface PriceListOptionItem {
  value: string;
  label: string;
  secondaryLabel?: string;
  priceListId: string;
}

export interface PriceListWithMap extends FakturowniaPriceList {
  positionMap: Record<string, FakturowniaPriceListPosition>;
}
