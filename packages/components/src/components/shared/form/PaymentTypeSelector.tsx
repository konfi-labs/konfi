"use client";

import type { PaymentMethodId } from "@konfi/types";
import { i18n, TFunction } from "i18next";
import { RadioGroup } from "../custom-radio/RadioGroup";

interface PaymentTypeSelectorProps {
  availablePaymentTypes: PaymentMethodId[];
  selectedPaymentType: PaymentMethodId;
  onPaymentTypeChange: (paymentType: PaymentMethodId) => void;
  t: TFunction;
  i18n: i18n;
}

export function PaymentTypeSelector({
  availablePaymentTypes,
  selectedPaymentType,
  onPaymentTypeChange,
  t,
  i18n,
}: PaymentTypeSelectorProps) {
  const availablePaymentTypesAsOptions = availablePaymentTypes.map(
    (option) => ({
      value: option,
      label: t(`PaymentType.${option}`),
      image: `https://${process.env.NEXT_PUBLIC_CDN_URL}/paymentTypes/${option}.png?fit=max&auto=format`,
    }),
  );

  return (
    <RadioGroup
      mb={"6"}
      columns={[1, 1, availablePaymentTypesAsOptions.length === 2 ? 1 : 2]}
      name={"paymentType"}
      options={availablePaymentTypesAsOptions}
      handleChange={(value) => {
        if (typeof value === "string") {
          onPaymentTypeChange(value);
        }
      }}
      value={selectedPaymentType}
      t={t}
      i18n={i18n}
    />
  );
}
