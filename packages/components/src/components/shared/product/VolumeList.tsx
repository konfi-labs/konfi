"use client";

import { Box, Text } from "@chakra-ui/react";
import {
  type CurrencyCode,
  type CurrencySettings,
  SelectOption,
  type UnitId,
} from "@konfi/types";
import {
  formatConvertedPrice,
  type QuantityOptionPriceThreshold,
} from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { TFunction, i18n } from "i18next";
import { RadioGroup } from "../custom-radio/RadioGroup";
import { Tooltip } from "../../ui/tooltip";

interface Props {
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
  }[];
  handleOnChange: (option: SelectOption | null) => void;
  value: SelectOption | null;
  displayCurrency?: CurrencyCode | null;
  currencySettings?: CurrencySettings | null;
  t: TFunction;
  i18n: i18n;
}

type ThresholdSummaryItem = {
  value: number;
  unitPrice: number;
  currency: CurrencyCode;
  unit: UnitId;
};

function getThresholdSummaryItems(options: Props["options"]) {
  const thresholds = new Map<number, ThresholdSummaryItem>();

  for (const option of options) {
    const current = option.priceThreshold;
    if (current?.tiers.length) {
      for (const tier of current.tiers) {
        thresholds.set(tier.value, tier);
      }

      continue;
    }

    if (current) {
      thresholds.set(current.value, {
        value: current.value,
        unitPrice: current.unitPrice,
        currency: current.currency,
        unit: current.unit,
      });
    }

    if (current?.next) {
      thresholds.set(current.next.value, {
        value: current.next.value,
        unitPrice: current.next.unitPrice,
        currency: current.next.currency,
        unit: current.next.unit,
      });
    }
  }

  return [...thresholds.values()].sort(
    (left, right) => left.value - right.value,
  );
}

export function VolumeList({
  options,
  handleOnChange,
  value,
  displayCurrency,
  currencySettings,
  t,
  i18n,
}: Props) {
  const thresholdSummaryItems = getThresholdSummaryItems(options);
  const numberFormatter = new Intl.NumberFormat(i18n.resolvedLanguage, {
    maximumFractionDigits: 3,
  });
  const thresholdSummary = thresholdSummaryItems.map((threshold) => {
    const unitLabel = t(`Unit.${threshold.unit}`);
    const unitPrice = formatConvertedPrice(
      threshold.unitPrice,
      displayCurrency ?? threshold.currency,
      currencySettings,
      undefined,
      unitLabel,
      i18n.resolvedLanguage,
      threshold.currency,
    );

    return t("price.thresholdSummaryItem", {
      defaultValue: "> {{threshold}} {{unit}} {{unitPrice}}",
      interpolation: { escapeValue: false },
      threshold: numberFormatter.format(threshold.value),
      unit: unitLabel,
      unitPrice,
    });
  });
  const thresholdSummaryText = thresholdSummary.join(" · ");

  function _handleChange(value: string) {
    const option = options.find((option) => option.value === value);
    if (isUndefined(option)) return;
    handleOnChange(option);
  }

  if (isEmpty(options)) return null;

  return (
    <Box>
      {thresholdSummary.length > 1 && (
        <Tooltip
          content={thresholdSummaryText}
          contentProps={{
            maxW: "min(32rem, calc(100vw - 2rem))",
            whiteSpace: "normal",
          }}
        >
          <Box
            aria-label={`${t("price.thresholdSummaryLabel", {
              defaultValue: "Price tiers",
            })}: ${thresholdSummaryText}`}
            tabIndex={0}
            mb="2"
            px="3"
            py="2"
            borderWidth="1px"
            borderColor={{ base: "gray.200", _dark: "gray.700" }}
            borderRadius="2xl"
            bg={{ base: "gray.50", _dark: "gray.900" }}
          >
            <Text
              color={{ base: "gray.600", _dark: "gray.300" }}
              fontSize="xs"
              lineClamp={2}
            >
              <Text
                as="span"
                color={{ base: "gray.700", _dark: "gray.200" }}
                fontWeight="600"
              >
                {t("price.thresholdSummaryLabel", {
                  defaultValue: "Price tiers",
                })}
                :{" "}
              </Text>
              {thresholdSummaryText}
            </Text>
          </Box>
        </Tooltip>
      )}
      <RadioGroup
        name="volume"
        options={options}
        handleChange={(value) => {
          if (typeof value === "string") {
            _handleChange(value);
          }
        }}
        value={value && value.value}
        displayCurrency={displayCurrency}
        currencySettings={currencySettings}
        columns={1}
        t={t}
        i18n={i18n}
      />
    </Box>
  );
}
