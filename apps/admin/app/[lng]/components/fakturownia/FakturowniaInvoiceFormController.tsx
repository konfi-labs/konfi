"use client";

import { useChannels } from "@/context/channels";
import { useDefaultComputerChannelGuard } from "@/hooks/useDefaultComputerChannelGuard";
import { useT } from "@/i18n/client";
import { getNormalizedCountryCode } from "@/lib/fakturownia/country";
import { getFakturowniaInvoiceRecipientFromAddress } from "@/lib/fakturownia/invoice-payload";
import {
  getDefaultCustomPaymentType,
  getPaymentDefaultsForOrder,
  IMMEDIATE_PAYMENT_TYPES,
} from "@/lib/fakturownia/payment-type";
import { Separator, VStack } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import type { Product as FakturowniaClientProduct } from "@konfi/fakturownia/client/models";
import { InvoiceKindObject } from "@konfi/fakturownia/client/models";
import type {
  Invoice,
  Invoice_status,
  InvoiceKind,
  Product,
} from "@konfi/fakturownia/out/client/models";
import type {
  Order,
  OrderItem,
  PaymentMethodId,
  Warehouse,
} from "@konfi/types";
import {
  CurrencyEnum,
  DiscountTypeEnum,
  PaymentStatus,
  PaymentType,
  Unit,
} from "@konfi/types";
import {
  calculateQuantityForMultipleSizes,
  minorToMajorSafe,
  normalizeCurrencyCode,
  roundTotal,
  roundUnitPrice,
  toFiscalQuantity,
} from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { extractErrorMessages } from "./FakturowniaErrors";
import { FakturowniaInvoiceDialogs } from "./FakturowniaInvoiceDialogs";
import { FakturowniaInvoiceAdditionalSection } from "./FakturowniaInvoiceAdditionalSection";
import { FakturowniaInvoiceCreatedCard } from "./FakturowniaInvoiceCreatedCard";
import { FakturowniaInvoiceGeneralInfoSection } from "./FakturowniaInvoiceGeneralInfoSection";
import { FakturowniaInvoicePartiesSection } from "./FakturowniaInvoicePartiesSection";
import { FakturowniaInvoicePaymentSection } from "./FakturowniaInvoicePaymentSection";
import { FakturowniaInvoicePositionsSection } from "./FakturowniaInvoicePositionsSection";
import { FakturowniaInvoiceSubmitButton } from "./FakturowniaInvoiceSubmitButton";
import { FakturowniaInvoiceValidationErrorsAlert } from "./FakturowniaInvoiceValidationErrorsAlert";
import { FakturowniaProductPickerDrawer } from "./FakturowniaProductPickerDrawer";
import { useFakturowniaInvoicePositions } from "./useFakturowniaInvoicePositions";
import { useFakturowniaInvoicePayments } from "./useFakturowniaInvoicePayments";
import { useFakturowniaInvoiceClients } from "./useFakturowniaInvoiceClients";
import { useFakturowniaInvoiceSubmit } from "./useFakturowniaInvoiceSubmit";
import { useFakturowniaInvoiceDictionaries } from "./useFakturowniaInvoiceDictionaries";
import { useFakturowniaInvoiceLabels } from "./useFakturowniaInvoiceLabels";
import {
  buildProductSnapshot,
  calculateDiscountedTotals,
  calculateTotalDiscountAmount,
  calculateUndiscountedTotals,
  createPriceListPositionMap,
  hasDiscountedPosition,
  normalizeCurrencyNumber,
  toTaxDisplayValue,
  toTaxNumeric,
  toTaxString,
  type FakturowniaProductSnapshot,
} from "./invoice-helpers";

import { invoiceSchema } from "./invoice-form-schema";
import {
  areCurrencyEqual,
  buildPositionFromOrderItem,
  convertMinorToMajor,
  formatCurrencyValue,
  formatStreetLine,
  roundCurrency,
} from "./invoice-form-position-builder";
import {
  formatLocalDateOnly,
  getLastDayOfMonthDateOnly,
} from "./invoice-date-utils";
import type {
  InvoiceFormValues,
  InvoicePositionFormValue,
  PositionPriceAdjustment,
  PriceListOptionItem,
  PriceListWithMap,
  ProductOptionItem,
  RecipientRoleOptionValue,
} from "./invoice-form-types";

export interface FakturowniaInvoiceOrderDraft {
  customer?: Order["customer"];
  contact?: Order["contact"];
  email?: Order["email"];
  shipping?: Order["shipping"];
  shippingOption?: Order["shippingOption"];
  shippingPrice?: Order["shippingPrice"];
  invoice?: Order["invoice"];
  billing?: Order["billing"];
  totalPrice?: Order["totalPrice"];
  currency?: Order["currency"];
  items?: Order["items"];
  paymentType?: Order["paymentType"];
  paymentStatus?: Order["paymentStatus"];
  channelId?: Order["channelId"];
  specialNotes?: Order["specialNotes"];
  invoiceNotes?: Order["invoiceNotes"];
}

type FakturowniaInvoiceOrderSource = FakturowniaInvoiceOrderDraft &
  Partial<Pick<Order, "id" | "number" | "path">>;

interface FakturowniaInvoiceFormProps {
  order?: Order;
  orders?: Order[];
  draftOrder?: FakturowniaInvoiceOrderDraft;
  initialKind?: InvoiceKind;
}

export function FakturowniaInvoiceForm({
  order,
  orders,
  draftOrder,
  initialKind: initialKindOverride,
}: FakturowniaInvoiceFormProps) {
  const { t, i18n } = useT(["fakturownia", "translation"]);
  const { filteredMembers, loadingMembers, warehouses } = useConfiguration();
  const { channel, channels } = useChannels();
  const { confirmDefaultComputerChannel, defaultComputerChannelDialog } =
    useDefaultComputerChannelGuard();
  const primaryInvoiceSource = useMemo<
    FakturowniaInvoiceOrderSource | undefined
  >(() => order ?? orders?.[0] ?? draftOrder, [draftOrder, order, orders]);
  const invoiceSources = useMemo<FakturowniaInvoiceOrderSource[]>(() => {
    if (orders && orders.length > 0) {
      return orders.filter((entry): entry is Order => Boolean(entry));
    }
    if (order) {
      return [order];
    }
    if (draftOrder) {
      return [draftOrder];
    }
    return [];
  }, [draftOrder, order, orders]);
  const aggregatedOrders = useMemo(() => {
    if (orders && orders.length > 0) {
      return orders.filter((entry): entry is Order => Boolean(entry));
    }
    return order ? [order] : [];
  }, [order, orders]);
  const defaultInvoiceNotes = useMemo(
    () =>
      invoiceSources
        .map((source) => source.invoiceNotes?.trim())
        .filter((note): note is string => Boolean(note))
        .join("\n\n"),
    [invoiceSources],
  );
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const successMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (createdInvoice && successMessageRef.current) {
      successMessageRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [createdInvoice]);

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [pendingFormValues, setPendingFormValues] =
    useState<InvoiceFormValues | null>(null);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const lastNonSpecialRecipientRoleRef =
    useRef<RecipientRoleOptionValue>("recipient");
  const previousSellerPersonFallbackRef = useRef<string | undefined>(undefined);
  const isMountedRef = useRef(true);
  const resolvedOrderChannelId = useMemo(() => {
    if (!primaryInvoiceSource) {
      return undefined;
    }
    if (
      typeof primaryInvoiceSource.channelId === "string" &&
      primaryInvoiceSource.channelId.trim() !== ""
    ) {
      return primaryInvoiceSource.channelId.trim();
    }
    if (primaryInvoiceSource.path) {
      const segments = primaryInvoiceSource.path.split("/").filter(Boolean);
      const channelIndex = segments.indexOf("channels");
      if (channelIndex >= 0 && segments.length > channelIndex + 1) {
        return segments[channelIndex + 1];
      }
    }
    return undefined;
  }, [primaryInvoiceSource]);

  const sellerDefaultName =
    process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME ||
    process.env.NEXT_PUBLIC_SHORT_COMPANY_NAME ||
    "";
  const sellerDefaultStreet =
    process.env.NEXT_PUBLIC_COMPANY_STREET_ADDRESS || "";
  const sellerDefaultPostalCode =
    process.env.NEXT_PUBLIC_COMPANY_POSTAL_CODE || "";
  const sellerDefaultCity = process.env.NEXT_PUBLIC_COMPANY_CITY || "";
  const sellerDefaultTaxNo = process.env.NEXT_PUBLIC_VAT_ID || "";

  const { defaultPositions, defaultPositionAdjustments } = useMemo(() => {
    const positions: InvoicePositionFormValue[] = [];
    const adjustments: PositionPriceAdjustment[] = [];
    const hasMultipleOrders = invoiceSources.length > 1;

    invoiceSources.forEach((currentOrder) => {
      if (currentOrder?.items && currentOrder.items.length > 0) {
        currentOrder.items.forEach((item) => {
          const { position, adjustment } = buildPositionFromOrderItem(item, t);
          positions.push(position);
          if (adjustment) {
            adjustments.push({
              positionIndex: positions.length - 1,
              ...adjustment,
            });
          }
        });
      }

      if (currentOrder?.shippingPrice && currentOrder.shippingPrice > 0) {
        const shippingGross = convertMinorToMajor(currentOrder.shippingPrice);
        const defaultTax = 23;
        const shippingNet = roundTotal(shippingGross / (1 + defaultTax / 100));
        const shippingName = t("fakturownia.invoiceCreate.delivery", {
          defaultValue: "Delivery",
        });

        positions.push({
          name: shippingName,
          description: "",
          quantity: 1,
          unit: Unit.PCS,
          priceNet: shippingNet,
          priceGross: shippingGross,
          tax: defaultTax.toString(),
          totalNet: shippingNet,
          totalGross: shippingGross,
          discountPercent: 0,
        });
      }
    });

    if (positions.length === 0) {
      return {
        defaultPositions: [
          {
            name: "",
            description: "",
            quantity: 1,
            unit: Unit.PCS,
            priceNet: 0,
            priceGross: 0,
            tax: "23",
            discountPercent: 0,
          },
        ],
        defaultPositionAdjustments: [],
      };
    }

    // keep the variable to avoid large diff; could be used later (e.g. prefixing with order number)
    void hasMultipleOrders;

    return {
      defaultPositions: positions,
      defaultPositionAdjustments: adjustments,
    };
  }, [invoiceSources, t]);

  const defaultBuyerStreet =
    formatStreetLine(
      primaryInvoiceSource?.billing?.street,
      primaryInvoiceSource?.billing?.number,
      primaryInvoiceSource?.billing?.local,
    ) ||
    formatStreetLine(
      primaryInvoiceSource?.shipping?.street,
      primaryInvoiceSource?.shipping?.number,
      primaryInvoiceSource?.shipping?.local,
    );
  const defaultBillingInvoiceRecipient =
    getFakturowniaInvoiceRecipientFromAddress(primaryInvoiceSource?.billing);
  const defaultRecipientStreet = defaultBillingInvoiceRecipient
    ? defaultBillingInvoiceRecipient.street || ""
    : formatStreetLine(
        primaryInvoiceSource?.shipping?.street,
        primaryInvoiceSource?.shipping?.number,
        primaryInvoiceSource?.shipping?.local,
      );
  const defaultRecipientName = defaultBillingInvoiceRecipient
    ? defaultBillingInvoiceRecipient.name || ""
    : primaryInvoiceSource?.shipping?.companyName ||
      primaryInvoiceSource?.shipping?.name ||
      primaryInvoiceSource?.contact?.name ||
      "";
  const defaultRecipientPostalCode = defaultBillingInvoiceRecipient
    ? defaultBillingInvoiceRecipient.postCode || undefined
    : primaryInvoiceSource?.shipping?.zip || undefined;
  const defaultRecipientCity = defaultBillingInvoiceRecipient
    ? defaultBillingInvoiceRecipient.city || undefined
    : primaryInvoiceSource?.shipping?.city || undefined;
  const defaultRecipientCountry =
    defaultBillingInvoiceRecipient?.country ||
    getNormalizedCountryCode(primaryInvoiceSource?.shipping?.country, "PL");
  const defaultRecipientEmail =
    primaryInvoiceSource?.contact?.email || undefined;
  const defaultRecipientPhone =
    primaryInvoiceSource?.contact?.phone || undefined;

  const issueDate = new Date();
  const sellDate = issueDate;
  const defaultPaidAmount =
    primaryInvoiceSource?.paymentStatus === PaymentStatus.COMPLETED &&
    typeof primaryInvoiceSource.totalPrice === "number"
      ? convertMinorToMajor(primaryInvoiceSource.totalPrice)
      : 0;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize input values from default values
  useEffect(() => {
    const buyerName = defaultValues.buyerName || "";
    const recipientName = defaultValues.recipientName || "";
    setBuyerNameInputValue(buyerName);
    setRecipientNameInputValue(recipientName);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional mount-only initialization of the buyer/recipient name inputs from defaultValues.
  }, []);

  // Build OID using channel name and order number (e.g., W33#1234)
  const buildOid = () => {
    if (!primaryInvoiceSource?.number) {
      return undefined;
    }

    // Try to get channel name from the resolved channel
    let channelName = "";
    if (resolvedOrderChannelId && channels) {
      const orderChannel = channels.find(
        (ch) => ch.id === resolvedOrderChannelId,
      );
      if (orderChannel?.name) {
        channelName = orderChannel.name;
      }
    }

    // Fallback to current channel if no channel found for order
    if (!channelName && channel?.name) {
      channelName = channel.name;
    }

    // If we have a channel name, use format: ChannelName#OrderNumber
    if (channelName) {
      return `${channelName}#${primaryInvoiceSource.number}`;
    }

    // Fallback to just order number if no channel name available
    return String(primaryInvoiceSource.number);
  };

  function getKindFromOrderPaymentType(
    paymentType?: PaymentMethodId,
  ): InvoiceKind {
    if (!paymentType) {
      return InvoiceKindObject.Vat;
    }

    if (!primaryInvoiceSource?.billing) {
      return InvoiceKindObject.Receipt;
    }

    switch (paymentType) {
      case PaymentType.PROFORMA:
        return InvoiceKindObject.Proforma;
      case PaymentType.DEFERRED:
        return InvoiceKindObject.Estimate;
      default:
        return InvoiceKindObject.Vat;
    }
  }

  const inferredKindFromPayment = getKindFromOrderPaymentType(
    primaryInvoiceSource?.paymentType,
  );
  const initialKind = initialKindOverride ?? inferredKindFromPayment;

  // Infer default invoice status from order/payment context
  const inferredStatus: Invoice_status = (() => {
    // Receipts are paid at the time of issue
    if (initialKind === InvoiceKindObject.Receipt) {
      return "paid";
    }
    if (initialKind === InvoiceKindObject.Estimate) {
      return "issued";
    }
    // Proforma invoices default to "sent" status
    if (initialKind === InvoiceKindObject.Proforma) {
      return "sent";
    }
    switch (primaryInvoiceSource?.paymentStatus) {
      case PaymentStatus.COMPLETED:
        return "paid";
      case PaymentStatus.PARTIALLY_PAID:
        return "partial";
      default:
        return "sent";
    }
  })();

  const hasBillingNip = Boolean(
    primaryInvoiceSource?.billing?.nip &&
    primaryInvoiceSource.billing.nip.trim() !== "",
  );

  const paymentDefaults = getPaymentDefaultsForOrder({
    initialKind,
    orderPaymentType: primaryInvoiceSource?.paymentType,
  });

  const defaultValues: InvoiceFormValues = {
    kind: initialKind,
    number: "",
    issueDate: formatLocalDateOnly(issueDate),
    sellDate: formatLocalDateOnly(sellDate),
    paymentType: paymentDefaults.paymentType,
    paymentTerm: paymentDefaults.paymentTerm,
    paymentTo:
      initialKind === "estimate"
        ? getLastDayOfMonthDateOnly(issueDate)
        : undefined,
    customPaymentType: undefined,
    status: inferredStatus,
    // Proforma invoices always start with 0 paid amount
    paidAmount:
      initialKind === InvoiceKindObject.Proforma ? 0 : defaultPaidAmount,
    currency: primaryInvoiceSource?.currency || CurrencyEnum.PLN,
    language: i18n.resolvedLanguage === "pl" ? "pl" : "en",
    warehouseId: undefined,
    departmentId: undefined,
    clientId: undefined,
    oid: buildOid(),
    oidUnique: buildOid() ? "yes" : undefined,
    notes: defaultInvoiceNotes,
    splitPayment: false,
    sendEmail: false,
    buyerCompany: true,
    // For receipts without a provided NIP, start with an empty buyer section so the receipt
    // is issued without buyer details by default. When a NIP is present (invoice receipt),
    // pre-fill buyer data from the order as before.
    buyerName:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : primaryInvoiceSource?.billing?.companyName ||
          primaryInvoiceSource?.billing?.name ||
          (typeof primaryInvoiceSource?.customer === "string"
            ? primaryInvoiceSource.customer
            : primaryInvoiceSource?.contact?.name) ||
          "",
    buyerFirstName:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip ? "" : "",
    buyerLastName:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip ? "" : "",
    buyerTaxNo:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : primaryInvoiceSource?.billing?.nip || "",
    buyerEmail:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : primaryInvoiceSource?.contact?.email || "",
    buyerPhone:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : primaryInvoiceSource?.contact?.phone || "",
    buyerStreet:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : defaultBuyerStreet || "",
    buyerPostalCode:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : primaryInvoiceSource?.billing?.zip ||
          primaryInvoiceSource?.shipping?.zip ||
          "",
    buyerCity:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : primaryInvoiceSource?.billing?.city ||
          primaryInvoiceSource?.shipping?.city ||
          "",
    buyerCountry:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : getNormalizedCountryCode(
            primaryInvoiceSource?.billing?.country ||
              primaryInvoiceSource?.shipping?.country,
            "PL",
          ),
    buyerPerson:
      initialKind === InvoiceKindObject.Receipt && !hasBillingNip
        ? ""
        : primaryInvoiceSource?.contact?.name || "",
    recipientId: undefined,
    recipientEnabled: Boolean(defaultBillingInvoiceRecipient),
    recipientRole: defaultBillingInvoiceRecipient?.formRole ?? "recipient",
    recipientRoleDescription:
      defaultBillingInvoiceRecipient?.roleDescription ?? "",
    recipientName: defaultRecipientName || "",
    recipientStreet: defaultRecipientStreet || "",
    recipientPostalCode: defaultRecipientPostalCode || "",
    recipientCity: defaultRecipientCity || "",
    recipientCountry: defaultRecipientCountry || "PL",
    recipientTaxNo:
      defaultBillingInvoiceRecipient?.taxNo ||
      primaryInvoiceSource?.shipping?.nip ||
      "",
    recipientEmail: defaultRecipientEmail || "",
    recipientPhone: defaultRecipientPhone || "",
    recipientNote: "",
    sellerName: sellerDefaultName,
    sellerTaxNo: sellerDefaultTaxNo,
    sellerStreet: sellerDefaultStreet,
    sellerPostalCode: sellerDefaultPostalCode,
    sellerCity: sellerDefaultCity,
    sellerCountry: "PL",
    place: sellerDefaultCity,
    issuerId: undefined,
    positions: defaultPositions,
  };

  const methods = useForm<InvoiceFormValues>({
    resolver: yupResolver(invoiceSchema),
    defaultValues,
  });

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = methods;
  const errorMessages = useMemo(() => extractErrorMessages(errors), [errors]);
  const currencyOptions = useMemo(() => {
    const currencyCodes = [
      normalizeCurrencyCode(defaultValues.currency),
      normalizeCurrencyCode(primaryInvoiceSource?.currency),
      CurrencyEnum.PLN,
    ].filter((code): code is string => Boolean(code));

    return [...new Set(currencyCodes)].map((code) => ({
      value: code,
      label: code,
    }));
  }, [defaultValues.currency, primaryInvoiceSource?.currency]);

  const paymentTerm = useWatch({ control, name: "paymentTerm" });
  const issueDateValue = useWatch({ control, name: "issueDate" });
  const positions = useWatch({ control, name: "positions" });
  const paidAmount = useWatch({ control, name: "paidAmount" });
  const invoiceKind = useWatch({ control, name: "kind" });
  const priceListIdValue = useWatch({ control, name: "priceListId" });
  const invoiceCurrency = useWatch({ control, name: "currency" });
  const clientId = useWatch({ control, name: "clientId" });
  const departmentIdValue = useWatch({ control, name: "departmentId" });
  const recipientEnabled = useWatch({ control, name: "recipientEnabled" });
  const recipientRole = useWatch({ control, name: "recipientRole" });
  const recipientId = useWatch({ control, name: "recipientId" });
  const recipientNameValue = useWatch({ control, name: "recipientName" });
  const buyerNameValue = useWatch({ control, name: "buyerName" });
  const selectedPaymentType = useWatch({ control, name: "paymentType" });
  const customPaymentTypeValue = useWatch({
    control,
    name: "customPaymentType",
  });
  const isCashPayment = selectedPaymentType === "cash";
  const paymentToValue = useWatch({ control, name: "paymentTo" });
  const statusValue = useWatch({ control, name: "status" });
  const sellerPersonValue = useWatch({ control, name: "sellerPerson" });
  const buyerCompany = useWatch({ control, name: "buyerCompany" });
  const buyerTaxNoValue = useWatch({ control, name: "buyerTaxNo" });
  const recipientJstEnabled = recipientRole === "jst";
  const {
    hasRoundingAdjustments,
    productSuggestionsByPosition,
    isProductComboboxLoadingByPosition,
    priceListOptions,
    priceListInputValue,
    setPriceListInputValue,
    isPriceListLoading,
    priceListError,
    isProductPickerOpen,
    closeProductPicker,
    positionFields,
    appendPosition,
    hasAnyPositionWithDiscount,
    recalculatePositionValues,
    resetPositionPricesToProductDefaults,
    scheduleProductSearch,
    applyProductSelection,
    handleOpenProductPicker,
    handleProductPickerSelect,
    handleRemovePosition,
  } = useFakturowniaInvoicePositions({
    control,
    getValues,
    setValue,
    positions,
    priceListIdValue,
    primaryInvoiceCurrency: primaryInvoiceSource?.currency,
    isMountedRef,
  });
  const {
    buyerClientSuggestions,
    recipientClientSuggestions,
    isBuyerComboboxLoading,
    isRecipientComboboxLoading,
    isBuyerNipLookupLoading,
    isRecipientNipLookupLoading,
    isBuyerDetailsOpen,
    setIsBuyerDetailsOpen,
    isRecipientDetailsOpen,
    setIsRecipientDetailsOpen,
    buyerChoiceOpen,
    setBuyerChoiceOpen,
    buyerChoiceNip,
    recipientChoiceOpen,
    setRecipientChoiceOpen,
    recipientChoiceNip,
    buyerDialogClients,
    recipientDialogClients,
    buyerClientDescription,
    setBuyerClientDescription,
    buyerDescriptionDialogOpen,
    pendingBuyerClient,
    sellerPersonFilterTerm,
    setSellerPersonFilterTerm,
    buyerNameInputValue,
    setBuyerNameInputValue,
    recipientNameInputValue,
    setRecipientNameInputValue,
    applyRecipientClientData,
    handleBuyerClientSelection,
    confirmBuyerClientSelection,
    cancelBuyerClientSelection,
    handleSearchBuyerByNip,
    handleSearchRecipientByNip,
    fillMissingRecipientTaxNoFromFakturowniaRecipient,
  } = useFakturowniaInvoiceClients({
    getValues,
    setValue,
    primaryInvoiceSource,
    clientId,
    recipientId,
    buyerNameValue,
    recipientNameValue,
    recipientEnabled: Boolean(recipientEnabled),
    recipientJstEnabled,
    isMountedRef,
  });
  const {
    submitLabel,
    kindLabel,
    paymentTypeLabel,
    paymentTermLabel,
    statusLabel,
    isBuyerNameRequired,
    isBuyerLastNameRequired,
    recipientVatGroupEnabled,
    shouldShowRecipientRoleDescription,
  } = useFakturowniaInvoiceLabels({
    invoiceKind,
    buyerCompany,
    recipientRole,
    selectedPaymentType,
    customPaymentTypeValue,
    paymentTerm,
    paymentToValue,
    statusValue,
  });
  useEffect(() => {
    if (recipientRole === "jst" || recipientRole === "vatGroupMember") {
      return;
    }

    lastNonSpecialRecipientRoleRef.current = recipientRole;
  }, [recipientRole]);
  const {
    fakturowniaWarehouses,
    fakturowniaDepartments,
    fakturowniaIssuers,
    isDictionariesLoading,
    shouldBlockSubmit,
    shouldShowDepartmentAlert,
    getDepartmentChannelId,
    handleRefreshDictionaries,
  } = useFakturowniaInvoiceDictionaries({
    getValues,
    setValue,
    departmentIdValue,
    warehouses,
    channels,
    currentChannelId: channel?.id,
    resolvedOrderChannelId,
    isMountedRef,
  });

  const undiscountedTotals = useMemo(
    () => calculateUndiscountedTotals(positions),
    [positions],
  );
  const totals = useMemo(
    () => calculateDiscountedTotals(positions),
    [positions],
  );
  const totalDiscountAmount = useMemo(
    () => calculateTotalDiscountAmount(undiscountedTotals.gross, totals.gross),
    [totals.gross, undiscountedTotals.gross],
  );
  const hasAnyDiscount = useMemo(
    () => hasDiscountedPosition(positions),
    [positions],
  );

  const {
    selectedPaymentTypeOption,
    cashReceivedInputRef,
    cashReceivedInput,
    lastNumpadKey,
    cashChangeDue,
    setPaidAmountManuallyEdited,
    setStatusManuallyEdited,
    handleCashReceivedInputChange,
    handleCashNumpadKey,
  } = useFakturowniaInvoicePayments({
    getValues,
    setValue,
    selectedPaymentType,
    customPaymentTypeValue,
    invoiceKind,
    buyerTaxNoValue,
    primaryPaymentType: primaryInvoiceSource?.paymentType,
    paymentTerm,
    paidAmount: paidAmount || 0,
    totals,
    isConfirmDialogOpen,
    isCashPayment,
    inferredStatus,
    issueDateValue,
    primaryPaymentStatus: primaryInvoiceSource?.paymentStatus,
    primaryTotalPrice: primaryInvoiceSource?.totalPrice,
  });

  const { handleFormSubmit, handleConfirmedSubmit } =
    useFakturowniaInvoiceSubmit({
      pendingFormValues,
      setPendingFormValues,
      isCreatingInvoice,
      setIsCreatingInvoice,
      setIsConfirmDialogOpen,
      setCreatedInvoice,
      shouldBlockSubmit,
      setError,
      confirmDefaultComputerChannel,
      getDepartmentChannelId,
      order,
      aggregatedOrders,
      resolvedOrderChannelId,
      defaultValues,
      reset,
      setBuyerNameInputValue,
      setRecipientNameInputValue,
      setBuyerClientDescription,
      setPaidAmountManuallyEdited,
      setStatusManuallyEdited,
    });
  return (
    <FormProvider {...methods}>
      <VStack
        as="form"
        gap={6}
        align="stretch"
        onSubmit={handleSubmit(handleFormSubmit)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const target = e.target as HTMLElement;
            // Allow Enter in Textarea
            if (target.tagName === "TEXTAREA") {
              return;
            }
            // Allow Enter on Buttons (to click them)
            if (target.tagName === "BUTTON") {
              return;
            }
            // Prevent form submission for other inputs
            e.preventDefault();
          }
        }}
      >
        <FakturowniaInvoiceValidationErrorsAlert messages={errorMessages} />

        {createdInvoice && (
          <FakturowniaInvoiceCreatedCard
            invoice={createdInvoice}
            successMessageRef={successMessageRef}
          />
        )}

        <FakturowniaInvoiceGeneralInfoSection />

        <Separator my={4} />
        <FakturowniaInvoicePartiesSection
          filteredMembers={filteredMembers}
          sellerPersonFilterTerm={sellerPersonFilterTerm}
          setSellerPersonFilterTerm={setSellerPersonFilterTerm}
          loadingMembers={loadingMembers}
          sellerDefaultName={sellerDefaultName}
          sellerDefaultTaxNo={sellerDefaultTaxNo}
          sellerDefaultStreet={sellerDefaultStreet}
          sellerDefaultPostalCode={sellerDefaultPostalCode}
          sellerDefaultCity={sellerDefaultCity}
          buyerCompany={buyerCompany}
          isBuyerNameRequired={isBuyerNameRequired}
          isBuyerLastNameRequired={isBuyerLastNameRequired}
          buyerClientSuggestions={buyerClientSuggestions}
          buyerNameInputValue={buyerNameInputValue}
          setBuyerNameInputValue={setBuyerNameInputValue}
          clientId={clientId}
          setBuyerClientDescription={setBuyerClientDescription}
          handleBuyerClientSelection={handleBuyerClientSelection}
          buyerClientDescription={buyerClientDescription}
          isBuyerComboboxLoading={isBuyerComboboxLoading}
          isBuyerNipLookupLoading={isBuyerNipLookupLoading}
          handleSearchBuyerByNip={handleSearchBuyerByNip}
          isBuyerDetailsOpen={isBuyerDetailsOpen}
          setIsBuyerDetailsOpen={setIsBuyerDetailsOpen}
          recipientJstEnabled={recipientJstEnabled}
          recipientVatGroupEnabled={recipientVatGroupEnabled}
          recipientEnabled={recipientEnabled}
          recipientRole={recipientRole}
          shouldShowRecipientRoleDescription={
            shouldShowRecipientRoleDescription
          }
          recipientClientSuggestions={recipientClientSuggestions}
          recipientNameInputValue={recipientNameInputValue}
          setRecipientNameInputValue={setRecipientNameInputValue}
          recipientId={recipientId}
          applyRecipientClientData={applyRecipientClientData}
          isRecipientComboboxLoading={isRecipientComboboxLoading}
          isRecipientNipLookupLoading={isRecipientNipLookupLoading}
          handleSearchRecipientByNip={handleSearchRecipientByNip}
          isRecipientDetailsOpen={isRecipientDetailsOpen}
          setIsRecipientDetailsOpen={setIsRecipientDetailsOpen}
          fillMissingRecipientTaxNoFromFakturowniaRecipient={
            fillMissingRecipientTaxNoFromFakturowniaRecipient
          }
          lastNonSpecialRecipientRoleRef={lastNonSpecialRecipientRoleRef}
        />

        <Separator my={4} />
        <FakturowniaInvoicePositionsSection
          hasAnyPositionWithDiscount={hasAnyPositionWithDiscount}
          hasRoundingAdjustments={hasRoundingAdjustments}
          priceListOptions={priceListOptions}
          priceListInputValue={priceListInputValue}
          setPriceListInputValue={setPriceListInputValue}
          isPriceListLoading={isPriceListLoading}
          priceListError={priceListError}
          resetPositionPricesToProductDefaults={
            resetPositionPricesToProductDefaults
          }
          defaultPositionAdjustments={defaultPositionAdjustments}
          invoiceCurrency={invoiceCurrency}
          positionFields={positionFields}
          positions={positions}
          productSuggestionsByPosition={productSuggestionsByPosition}
          isProductComboboxLoadingByPosition={
            isProductComboboxLoadingByPosition
          }
          handleOpenProductPicker={handleOpenProductPicker}
          handleRemovePosition={handleRemovePosition}
          scheduleProductSearch={scheduleProductSearch}
          applyProductSelection={applyProductSelection}
          recalculatePositionValues={recalculatePositionValues}
          appendPosition={appendPosition}
        />

        <Separator my={4} />

        <FakturowniaInvoicePaymentSection
          selectedPaymentTypeOption={selectedPaymentTypeOption}
          paymentTerm={paymentTerm}
          currencyOptions={currencyOptions}
          setStatusManuallyEdited={setStatusManuallyEdited}
          setPaidAmountManuallyEdited={setPaidAmountManuallyEdited}
        />

        <Separator my={4} />

        <FakturowniaInvoiceAdditionalSection
          fakturowniaWarehouses={fakturowniaWarehouses}
          fakturowniaDepartments={fakturowniaDepartments}
          shouldShowDepartmentAlert={shouldShowDepartmentAlert}
          handleRefreshDictionaries={handleRefreshDictionaries}
          isDictionariesLoading={isDictionariesLoading}
          defaultOid={defaultValues.oid}
          hasAnyDiscount={hasAnyDiscount}
          undiscountedTotals={undiscountedTotals}
          totals={totals}
          paidAmount={paidAmount || 0}
          totalDiscountAmount={totalDiscountAmount}
        />

        <FakturowniaInvoiceValidationErrorsAlert messages={errorMessages} />

        <FakturowniaInvoiceSubmitButton
          isCreatingInvoice={isCreatingInvoice}
          isSubmitting={isSubmitting}
          shouldBlockSubmit={shouldBlockSubmit}
          submitLabel={submitLabel}
        />

        <FakturowniaProductPickerDrawer
          open={isProductPickerOpen}
          onClose={closeProductPicker}
          onSelect={handleProductPickerSelect}
        />

        {defaultComputerChannelDialog}

        <FakturowniaInvoiceDialogs
          buyerChoiceOpen={buyerChoiceOpen}
          setBuyerChoiceOpen={setBuyerChoiceOpen}
          buyerChoiceNip={buyerChoiceNip}
          buyerDialogClients={buyerDialogClients}
          recipientChoiceOpen={recipientChoiceOpen}
          setRecipientChoiceOpen={setRecipientChoiceOpen}
          recipientChoiceNip={recipientChoiceNip}
          recipientDialogClients={recipientDialogClients}
          handleBuyerClientSelection={handleBuyerClientSelection}
          applyRecipientClientData={applyRecipientClientData}
          buyerDescriptionDialogOpen={buyerDescriptionDialogOpen}
          pendingBuyerClient={pendingBuyerClient}
          confirmBuyerClientSelection={confirmBuyerClientSelection}
          cancelBuyerClientSelection={cancelBuyerClientSelection}
          isConfirmDialogOpen={isConfirmDialogOpen}
          setIsConfirmDialogOpen={setIsConfirmDialogOpen}
          setPendingFormValues={setPendingFormValues}
          kindLabel={kindLabel}
          paymentTypeLabel={paymentTypeLabel}
          paymentTermLabel={paymentTermLabel}
          paymentToValue={paymentToValue}
          paymentTerm={paymentTerm}
          statusLabel={statusLabel}
          paidAmount={paidAmount || 0}
          isCashPayment={isCashPayment}
          cashReceivedInputRef={cashReceivedInputRef}
          cashReceivedInput={cashReceivedInput}
          handleCashReceivedInputChange={handleCashReceivedInputChange}
          cashChangeDue={cashChangeDue}
          lastNumpadKey={lastNumpadKey}
          handleCashNumpadKey={handleCashNumpadKey}
          totals={totals}
          handleConfirmedSubmit={handleConfirmedSubmit}
          isCreatingInvoice={isCreatingInvoice}
        />
      </VStack>
    </FormProvider>
  );
}
