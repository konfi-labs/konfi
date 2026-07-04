"use client";

import { auth } from "@/lib/firebase/clientApp";
import type { PaymentMethodId } from "@konfi/types";
import { useState } from "react";

import type { ChangeStoreOrderPaymentMethodResult } from "../orders/types";

export function useChangePaymentMethod() {
  const [isLoading, setIsLoading] = useState(false);

  const changePaymentMethod = async (
    orderId: string,
    paymentType: PaymentMethodId,
  ): Promise<ChangeStoreOrderPaymentMethodResult> => {
    setIsLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return {
          success: false,
          message: "UNAUTHENTICATED",
          error: "User is not authenticated",
        };
      }

      const idToken = await currentUser.getIdToken();
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/payment-method`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentType,
          }),
        },
      );

      const payload =
        (await response.json()) as Partial<ChangeStoreOrderPaymentMethodResult>;

      return {
        success: payload.success ?? false,
        message: payload.message ?? "CHANGE_PAYMENT_METHOD_FAILED",
        checkoutSessionUrl: payload.checkoutSessionUrl,
        error:
          payload.error ??
          (!response.ok ? "CHANGE_PAYMENT_METHOD_FAILED" : undefined),
      };
    } catch (error) {
      console.error("Error changing payment method:", error);
      return {
        success: false,
        message: "CHANGE_PAYMENT_METHOD_FAILED",
        error:
          error instanceof Error
            ? error.message
            : "Failed to change payment method",
      };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    changePaymentMethod,
    isLoading,
  };
}
