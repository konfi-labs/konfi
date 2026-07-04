"use client";

import type {
  AdminPaymentListItem,
  AdminRefundMutationResponse,
  PaymentProviderKey,
} from "@/lib/payments/admin-types";
import {
  Button,
  CloseButton,
  Dialog,
  Field,
  Input,
  Portal,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { toaster } from "@konfi/components";
import { useT } from "@/i18n/client";
import {
  formatMinorAmountInput,
  parseRefundAmountInput,
} from "@/lib/payments/refund-helpers";
import { useEffect, useState } from "react";

type RefundPaymentDialogProps = {
  provider: PaymentProviderKey;
  payment: AdminPaymentListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefunded: () => Promise<void>;
};

export default function RefundPaymentDialog({
  provider,
  payment,
  open,
  onOpenChange,
  onRefunded,
}: RefundPaymentDialogProps) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!payment || !open) {
      return;
    }

    setAmount(formatMinorAmountInput(payment.remainingRefundableAmount));
  }, [open, payment]);

  const close = () => {
    if (loading) {
      return;
    }

    setReason("");
    setAmount("");
    onOpenChange(false);
  };

  const submitRefund = async () => {
    if (!payment) {
      return;
    }

    const trimmedReason = reason.trim();
    const parsedAmount = parseRefundAmountInput(amount);
    if (trimmedReason.length < 5) {
      toaster.error({
        title: t("paymentIntegrations.refund.validationTitle", {
          defaultValue: "Reason required",
        }),
        description: t("paymentIntegrations.refund.validationDescription", {
          defaultValue:
            "Provide at least 5 characters so the refund is audited properly.",
        }),
      });
      return;
    }

    if (!parsedAmount || parsedAmount < 1) {
      toaster.error({
        title: t("paymentIntegrations.refund.amountValidationTitle", {
          defaultValue: "Amount required",
        }),
        description: t(
          "paymentIntegrations.refund.amountValidationDescription",
          {
            defaultValue:
              "Enter a valid refund amount with up to two decimal places.",
          },
        ),
      });
      return;
    }

    if (parsedAmount > payment.remainingRefundableAmount) {
      toaster.error({
        title: t("paymentIntegrations.refund.amountTooHighTitle", {
          defaultValue: "Amount too high",
        }),
        description: t("paymentIntegrations.refund.amountTooHighDescription", {
          defaultValue:
            "The refund amount cannot exceed the remaining balance.",
        }),
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/payments/admin/${provider}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderPath: payment.orderPath,
          reason: trimmedReason,
          refundAmount: parsedAmount,
        }),
      });
      const payload = (await response.json()) as
        | AdminRefundMutationResponse
        | { error?: string; };

      if (!response.ok) {
        throw new Error(
          ("error" in payload && payload.error) || "Failed to create refund",
        );
      }

      if ("error" in payload) {
        throw new Error(payload.error || "Failed to create refund");
      }

      toaster.success({
        title: t("paymentIntegrations.refund.successTitle", {
          defaultValue: "Refund requested",
        }),
        description: (payload as AdminRefundMutationResponse).message,
      });
      setReason("");
      setAmount("");
      onOpenChange(false);
      await onRefunded();
    } catch (error) {
      console.error("Failed to refund payment:", error);
      toaster.error({
        title: t("paymentIntegrations.refund.errorTitle", {
          defaultValue: "Refund failed",
        }),
        description:
          error instanceof Error
            ? error.message
            : t("paymentIntegrations.refund.errorDescription", {
              defaultValue: "We couldn't create the refund request.",
            }),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={({ open: nextOpen }) => {
        if (!nextOpen) {
          close();
          return;
        }
        onOpenChange(true);
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("paymentIntegrations.refund.dialogTitle", {
                  defaultValue: "Refund payment",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap={4}>
                <Text>
                  {t("paymentIntegrations.refund.dialogDescription", {
                    defaultValue:
                      "Refund up to {{remainingAmount}} for order #{{orderNumber}}. This action is audited and cannot be undone.",
                    remainingAmount: payment
                      ? formatMinorAmountInput(
                        payment.remainingRefundableAmount,
                      )
                      : "0.00",
                    orderNumber: payment?.orderNumber ?? "",
                  })}
                </Text>
                <Field.Root required>
                  <Field.Label>
                    {t("paymentIntegrations.refund.amountLabel", {
                      defaultValue: "Refund amount",
                    })}
                  </Field.Label>
                  <Input
                    type="number"
                    name="refundAmount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    min="0.01"
                    max={
                      payment
                        ? formatMinorAmountInput(
                          payment.remainingRefundableAmount,
                        )
                        : undefined
                    }
                    step="0.01"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={t(
                      "paymentIntegrations.refund.amountPlaceholder",
                      {
                        defaultValue: "0.00",
                      },
                    )}
                  />
                  <Field.HelperText>
                    {t("paymentIntegrations.refund.amountHelperText", {
                      defaultValue:
                        "Remaining refundable balance: {{remainingAmount}} {{currency}}.",
                      remainingAmount: payment
                        ? formatMinorAmountInput(
                          payment.remainingRefundableAmount,
                        )
                        : "0.00",
                      currency: payment?.currency ?? "PLN",
                    })}
                  </Field.HelperText>
                </Field.Root>
                <Field.Root required>
                  <Field.Label>
                    {t("paymentIntegrations.refund.reasonLabel", {
                      defaultValue: "Refund reason",
                    })}
                  </Field.Label>
                  <Textarea
                    name="refundReason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t(
                      "paymentIntegrations.refund.reasonPlaceholder",
                      {
                        defaultValue:
                          "Explain why this payment is being refunded",
                      },
                    )}
                    minH="120px"
                    autoComplete="off"
                    borderRadius="3xl"
                  />
                  <Field.HelperText>
                    {t("paymentIntegrations.refund.helperText", {
                      defaultValue:
                        "This reason is stored for internal auditing and troubleshooting.",
                    })}
                  </Field.HelperText>
                </Field.Root>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={loading}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="red"
                loading={loading}
                onClick={() => {
                  void submitRefund();
                }}
              >
                {t("paymentIntegrations.refund.confirm", {
                  defaultValue: "Refund payment",
                })}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
