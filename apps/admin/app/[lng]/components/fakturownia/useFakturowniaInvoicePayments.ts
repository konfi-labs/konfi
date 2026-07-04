import {
  getDefaultCustomPaymentType,
  getPaymentDefaultsForOrder,
  getPaymentTypeOption,
  IMMEDIATE_PAYMENT_TYPES,
} from "@/lib/fakturownia/payment-type";
import { InvoiceKindObject } from "@konfi/fakturownia/client/models";
import type { Invoice_status, InvoiceKind } from "@konfi/fakturownia/out/client/models";
import { PaymentStatus } from "@konfi/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UseFormGetValues, UseFormSetValue } from "react-hook-form";
import {
  calculateCashBaseAmount,
  calculateCashChangeDue,
  handleNumpadKey,
  parseCashReceivedInput,
  sanitizeCashReceivedInput,
  type CashNumpadKey,
} from "./cash-calculations";
import { PAYMENT_TERM_OPTIONS } from "./invoice-form-options";
import {
  areCurrencyEqual,
  convertMinorToMajor,
  roundCurrency,
} from "./invoice-form-position-builder";
import type { InvoiceFormValues } from "./invoice-form-types";
import {
  addDaysToDateOnly,
  getLastDayOfMonthDateOnly,
} from "./invoice-date-utils";

interface UseFakturowniaInvoicePaymentsArgs {
  getValues: UseFormGetValues<InvoiceFormValues>;
  setValue: UseFormSetValue<InvoiceFormValues>;
  selectedPaymentType: string;
  customPaymentTypeValue?: string;
  invoiceKind: InvoiceKind;
  buyerTaxNoValue?: string;
  primaryPaymentType?: string;
  paymentTerm: string;
  paidAmount: number;
  totals: {
    gross: number;
  };
  isConfirmDialogOpen: boolean;
  isCashPayment: boolean;
  inferredStatus: Invoice_status;
  issueDateValue: string;
  primaryPaymentStatus?: PaymentStatus;
  primaryTotalPrice?: number;
}

export function useFakturowniaInvoicePayments({
  getValues,
  setValue,
  selectedPaymentType,
  customPaymentTypeValue,
  invoiceKind,
  buyerTaxNoValue,
  primaryPaymentType,
  paymentTerm,
  paidAmount,
  totals,
  isConfirmDialogOpen,
  isCashPayment,
  inferredStatus,
  issueDateValue,
  primaryPaymentStatus,
  primaryTotalPrice,
}: UseFakturowniaInvoicePaymentsArgs) {
  const cashReceivedInputRef = useRef<HTMLInputElement>(null);
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [lastNumpadKey, setLastNumpadKey] = useState<CashNumpadKey | null>(
    null,
  );
  const [paidAmountManuallyEdited, setPaidAmountManuallyEdited] =
    useState(false);
  const [statusManuallyEdited, setStatusManuallyEdited] = useState(false);

  const selectedPaymentTypeOption = useMemo(
    () => getPaymentTypeOption(selectedPaymentType),
    [selectedPaymentType],
  );

  useEffect(() => {
    const option = getPaymentTypeOption(selectedPaymentType);
    if (!option) {
      return;
    }

    if (!option.requiresCustom) {
      if (customPaymentTypeValue) {
        setValue("customPaymentType", undefined, {
          shouldDirty: true,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
      return;
    }

    const defaultCustomPaymentType =
      getDefaultCustomPaymentType(selectedPaymentType);

    if (defaultCustomPaymentType && !customPaymentTypeValue) {
      setValue("customPaymentType", defaultCustomPaymentType, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
  }, [customPaymentTypeValue, selectedPaymentType, setValue]);

  useEffect(() => {
    if (invoiceKind === InvoiceKindObject.Receipt) {
      const receiptPaymentDefaults = getPaymentDefaultsForOrder({
        initialKind: InvoiceKindObject.Receipt,
        orderPaymentType: primaryPaymentType,
      });

      setValue("paymentType", receiptPaymentDefaults.paymentType, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("paymentTerm", receiptPaymentDefaults.paymentTerm, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      const hasBuyerNip = Boolean(
        buyerTaxNoValue && buyerTaxNoValue.trim() !== "",
      );
      if (!hasBuyerNip) {
        setValue("buyerCountry", "", {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    }
  }, [invoiceKind, buyerTaxNoValue, primaryPaymentType, setValue]);

  const cashReceivedValue = parseCashReceivedInput(cashReceivedInput);
  const cashBaseAmount = calculateCashBaseAmount(paidAmount, totals.gross);
  const cashChangeDue = calculateCashChangeDue(
    cashReceivedValue,
    cashBaseAmount,
  );

  const handleCashReceivedInputChange = useCallback((value: string) => {
    setCashReceivedInput(sanitizeCashReceivedInput(value));
  }, []);

  const handleCashNumpadKey = useCallback((key: CashNumpadKey) => {
    setCashReceivedInput((current) => handleNumpadKey(current, key));
    setLastNumpadKey(key);
    cashReceivedInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!lastNumpadKey) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setLastNumpadKey(null);
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [lastNumpadKey]);

  useEffect(() => {
    if (!isConfirmDialogOpen || !isCashPayment) {
      setCashReceivedInput("");
      setLastNumpadKey(null);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      cashReceivedInputRef.current?.focus();
      cashReceivedInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isConfirmDialogOpen, isCashPayment]);

  useEffect(() => {
    if (!selectedPaymentType) {
      return;
    }

    const isImmediateType = IMMEDIATE_PAYMENT_TYPES.includes(
      selectedPaymentType as (typeof IMMEDIATE_PAYMENT_TYPES)[number],
    );

    if (isImmediateType) {
      const currentTerm = getValues("paymentTerm");
      if (currentTerm !== "0") {
        setValue("paymentTerm", "0", {
          shouldDirty: true,
          shouldTouch: false,
          shouldValidate: true,
        });
      }

      if (!statusManuallyEdited) {
        const currentStatus = getValues("status");
        if (currentStatus !== "paid") {
          setValue("status", "paid", {
            shouldDirty: true,
            shouldTouch: false,
            shouldValidate: true,
          });
        }
      }
    } else if (!statusManuallyEdited && inferredStatus !== "paid") {
      const currentStatus = getValues("status") as Invoice_status;
      if (currentStatus === "paid") {
        setValue("status", inferredStatus, {
          shouldDirty: true,
          shouldTouch: false,
          shouldValidate: true,
        });
      }
    }
  }, [
    selectedPaymentType,
    getValues,
    setValue,
    statusManuallyEdited,
    inferredStatus,
  ]);

  useEffect(() => {
    if (invoiceKind === "estimate") {
      const estimatePaymentDefaults = getPaymentDefaultsForOrder({
        initialKind: "estimate",
        orderPaymentType: primaryPaymentType,
      });

      setValue("paymentType", estimatePaymentDefaults.paymentType, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: true,
      });
      setValue("paymentTerm", estimatePaymentDefaults.paymentTerm, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: true,
      });
      const formatted = getLastDayOfMonthDateOnly(new Date());
      setValue("paymentTo", formatted, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: true,
      });
    }
  }, [invoiceKind, primaryPaymentType, setValue]);

  useEffect(() => {
    if (invoiceKind === InvoiceKindObject.Proforma) {
      const proformaPaymentDefaults = getPaymentDefaultsForOrder({
        initialKind: InvoiceKindObject.Proforma,
        orderPaymentType: primaryPaymentType,
      });

      setValue("paymentType", proformaPaymentDefaults.paymentType, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: true,
      });
      setValue("paymentTerm", proformaPaymentDefaults.paymentTerm, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: true,
      });
      if (!statusManuallyEdited) {
        setValue("status", "sent", {
          shouldDirty: true,
          shouldTouch: false,
          shouldValidate: true,
        });
      }
      if (!paidAmountManuallyEdited) {
        setValue("paidAmount", 0, {
          shouldDirty: true,
          shouldTouch: false,
          shouldValidate: true,
        });
      }
    }
  }, [
    invoiceKind,
    primaryPaymentType,
    setValue,
    statusManuallyEdited,
    paidAmountManuallyEdited,
  ]);

  const isImmediatePaymentContext = useMemo(() => {
    if (paymentTerm !== "0") {
      return false;
    }
    if (!selectedPaymentType) {
      return false;
    }
    return IMMEDIATE_PAYMENT_TYPES.includes(
      selectedPaymentType as (typeof IMMEDIATE_PAYMENT_TYPES)[number],
    );
  }, [paymentTerm, selectedPaymentType]);

  useEffect(() => {
    if (paidAmountManuallyEdited) {
      return;
    }

    if (isImmediatePaymentContext) {
      const grossTotal = totals?.gross ?? 0;
      if (!Number.isFinite(grossTotal) || grossTotal < 0) {
        return;
      }
      const target = roundCurrency(grossTotal);
      const current = getValues("paidAmount");
      if (!areCurrencyEqual(current, target)) {
        setValue("paidAmount", target, {
          shouldDirty: true,
          shouldTouch: false,
          shouldValidate: true,
        });
      }
    } else {
      const defaultForOrder =
        primaryPaymentStatus === PaymentStatus.COMPLETED &&
        typeof primaryTotalPrice === "number"
          ? convertMinorToMajor(primaryTotalPrice)
          : 0;

      const current = getValues("paidAmount");
      if (!areCurrencyEqual(current, defaultForOrder)) {
        setValue("paidAmount", defaultForOrder, {
          shouldDirty: true,
          shouldTouch: false,
          shouldValidate: true,
        });
      }
    }
  }, [
    getValues,
    isImmediatePaymentContext,
    paidAmountManuallyEdited,
    setValue,
    totals,
    primaryPaymentStatus,
    primaryTotalPrice,
  ]);

  useEffect(() => {
    if (!issueDateValue) {
      return;
    }
    const selected = PAYMENT_TERM_OPTIONS.find(
      (option) => option.value === paymentTerm,
    );
    if (
      !selected ||
      selected.value === "custom" ||
      selected.days === undefined
    ) {
      return;
    }
    const nextPaymentTo = addDaysToDateOnly(issueDateValue, selected.days);
    if (!nextPaymentTo) {
      return;
    }
    setValue("paymentTo", nextPaymentTo, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [issueDateValue, paymentTerm, setValue]);

  return {
    selectedPaymentTypeOption,
    cashReceivedInputRef,
    cashReceivedInput,
    lastNumpadKey,
    cashChangeDue,
    paidAmountManuallyEdited,
    setPaidAmountManuallyEdited,
    statusManuallyEdited,
    setStatusManuallyEdited,
    handleCashReceivedInputChange,
    handleCashNumpadKey,
  };
}
