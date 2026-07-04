"use client";

import {
  ChakraComponent,
  ConditionalValue,
  SimpleGrid,
  SimpleGridProps,
} from "@chakra-ui/react";
import {
  type CurrencyCode,
  type CurrencySettings,
  type PaymentMethodId,
  type ShippingMethodId,
  type UnitId,
} from "@konfi/types";
import type { QuantityOptionPriceThreshold } from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import { Dispatch, SetStateAction, startTransition, useMemo } from "react";
import { RadioCardRoot } from "../../ui/radio-card";
import { RadioCard } from "./RadioCard";

interface RadioGroupProps extends SimpleGridProps {
  name: string;
  options: {
    label: string;
    value: string;
    image?: string;
    icon?: string;
    totalPrice?: number;
    currency?: CurrencyCode;
    unit?: UnitId;
    deliveryTime?: number;
    priceThreshold?: QuantityOptionPriceThreshold;
    disabled?: boolean;
    color?: string;
    formatWidth?: number | null;
    formatHeight?: number | null;
  }[];
  setShippingOption?: Dispatch<SetStateAction<ShippingMethodId>>;
  setPaymentType?: Dispatch<SetStateAction<PaymentMethodId>>;
  handleChange?: (value: unknown) => void;
  value?: string | null;
  updateConfiguration?: boolean;
  mb?: number | string;
  columns?: ConditionalValue<number> | undefined;
  displayCurrency?: CurrencyCode | null;
  currencySettings?: CurrencySettings | null;
  t: TFunction;
  i18n: i18n;
}

type RadioGroupComponent = ChakraComponent<"div", RadioGroupProps>;

export const RadioGroup = (({
  name,
  options,
  setShippingOption,
  setPaymentType,
  handleChange,
  value,
  updateConfiguration,
  mb,
  columns,
  displayCurrency,
  currencySettings,
  t,
  i18n,
}: RadioGroupProps) => {
  const checkedValue = useMemo(() => {
    return value ? value : options[0].value;
  }, [value, options]);

  function handleOnChange(nextValue: string) {
    const selectedOption = options.find((opt) => opt.value === nextValue);
    if (selectedOption?.disabled) {
      return;
    }

    startTransition(() => {
      if (setShippingOption) {
        setShippingOption(nextValue);
        return;
      }
      if (setPaymentType) {
        setPaymentType(nextValue);
        return;
      }
      if (handleChange) {
        handleChange(
          updateConfiguration
            ? { selectedAttributeOptions: { [name]: nextValue } }
            : nextValue,
        );
      }
    });
  }

  return (
    <RadioCardRoot
      name={name}
      value={checkedValue}
      onValueChange={(details) => handleOnChange(details.value ?? "")}
    >
      <SimpleGrid mb={mb} columns={columns ? columns : 2} gap={"2"}>
        {options.map(
          ({
            label,
            value,
            image,
            icon,
            totalPrice,
            currency,
            unit,
            deliveryTime,
            disabled,
            color,
            formatWidth,
            formatHeight,
          }) => {
            return (
              <RadioCard
                key={value}
                image={image}
                icon={icon}
                totalPrice={totalPrice}
                currency={currency}
                displayCurrency={displayCurrency}
                currencySettings={currencySettings}
                unit={unit}
                deliveryTime={deliveryTime}
                disabled={disabled}
                value={value}
                checked={checkedValue === value}
                color={color}
                formatWidth={formatWidth}
                formatHeight={formatHeight}
                showUnavailableLabel={disabled}
                t={t}
                i18n={i18n}
              >
                {label}
              </RadioCard>
            );
          },
        )}
      </SimpleGrid>
    </RadioCardRoot>
  );
}) as RadioGroupComponent;
