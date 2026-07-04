"use client";

import { Button, CloseButton, Dialog, Portal, Text } from "@chakra-ui/react";
import {
  Customer,
  NestedCustomer,
  Order,
  type PaymentMethodId,
} from "@konfi/types";
import { canChangePaymentMethod, getAvailablePaymentTypes } from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { MaterialSymbol } from "../MaterialSymbol";
import { PaymentTypeSelector } from "../form/PaymentTypeSelector";

interface PaymentMethodChangerProps {
  order: Order;
  customer?: Customer | NestedCustomer;
  onPaymentMethodChange: (paymentType: PaymentMethodId) => Promise<void>;
  isLoading: boolean;
  shouldOpenDialog?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  t: TFunction;
  i18n: i18n;
}

export function PaymentMethodChanger({
  order,
  customer,
  onPaymentMethodChange,
  isLoading,
  shouldOpenDialog = false,
  onDialogOpenChange,
  trigger,
  t,
  i18n,
}: PaymentMethodChangerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] =
    useState<PaymentMethodId>(order.paymentType);

  const canChange = canChangePaymentMethod(
    order.paymentStatus,
    order.activities,
  );

  const availablePaymentTypes = getAvailablePaymentTypes(
    order.shippingOption!,
    order.isFromStore,
    customer?.allowedBankPayments,
    customer?.allowedDefferedPayments,
    customer?.allowedOnPickupPayments,
    order.totalPrice,
    order.anonymousPackageShipping,
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onDialogOpenChange?.(open);
  };

  const handleSubmit = async () => {
    if (selectedPaymentType === order.paymentType) {
      handleOpenChange(false);
      return;
    }

    try {
      await onPaymentMethodChange(selectedPaymentType);
      handleOpenChange(false);
    } catch (error) {
      console.error("Error changing payment method:", error);
    }
  };

  // Handle external dialog open state
  useEffect(() => {
    if (shouldOpenDialog && canChange) {
      setIsOpen(true);
    }
  }, [shouldOpenDialog, canChange]);

  useEffect(() => {
    if (isOpen || shouldOpenDialog) {
      return;
    }

    setSelectedPaymentType(order.paymentType);
  }, [isOpen, order.paymentType, shouldOpenDialog]);

  if (!canChange) {
    return null;
  }

  return (
    <Dialog.Root
      open={isOpen || shouldOpenDialog}
      onOpenChange={(e) => handleOpenChange(e.open)}
    >
      <Dialog.Trigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <MaterialSymbol>edit</MaterialSymbol>
            {t("orderPage.payment.changeMethod", {
              defaultValue: "Change payment method",
            })}
          </Button>
        )}
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("orderPage.payment.changeMethodTitle", {
                  defaultValue: "Change Payment Method",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text mb={4}>
                {t("orderPage.payment.selectNewMethod", {
                  defaultValue: "Select a new payment method for this order:",
                })}
              </Text>
              <PaymentTypeSelector
                availablePaymentTypes={availablePaymentTypes}
                selectedPaymentType={selectedPaymentType}
                onPaymentTypeChange={setSelectedPaymentType}
                t={t}
                i18n={i18n}
              />
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline">
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
              </Dialog.ActionTrigger>
              <Button
                onClick={handleSubmit}
                loading={isLoading}
                disabled={selectedPaymentType === order.paymentType}
                colorPalette="primary"
              >
                {t("orderPage.payment.updateMethod", {
                  defaultValue: "Update payment method",
                })}
              </Button>
              <Dialog.CloseTrigger asChild>
                <CloseButton />
              </Dialog.CloseTrigger>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
