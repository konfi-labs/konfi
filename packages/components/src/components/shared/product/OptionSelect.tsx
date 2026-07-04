"use client";

import { Skeleton } from "@chakra-ui/react";
import { Attribute, AttributeInputTypeEnum, Configuration } from "@konfi/types";
import { i18n, TFunction } from "i18next";
import { ReadonlyURLSearchParams } from "next/navigation";
import { memo, useMemo } from "react";
import { AdvancedFinishingSelect } from "./AdvancedFinishingSelect";
import { RadioGroup } from "../custom-radio/RadioGroup";
import { Select } from "../custom-select/Select";

const MemoizedSelect = memo(Select);
const MemoizedRadioGroup = memo(RadioGroup);

type Props = {
  attribute: Attribute;
  configuration: Configuration;
  updateConfiguration: React.Dispatch<Partial<Configuration>>;
  searchParams?: ReadonlyURLSearchParams;
  disabledOptions?: string[];
  t: TFunction;
  i18n: i18n;
};

export function ProductOptionSelect({
  attribute,
  configuration,
  updateConfiguration,
  searchParams,
  disabledOptions = [],
  t,
  i18n,
}: Props) {
  const options: {
    label: string;
    value: string;
    image?: string;
    color?: string;
    formatWidth?: number | null;
    formatHeight?: number | null;
    disabled?: boolean;
  }[] = useMemo(() => {
    return attribute.options.map((option) => ({
      label: option.label,
      value: option.value,
      image: option.image,
      color: option.color,
      formatWidth: option.formatWidth,
      formatHeight: option.formatHeight,
      disabled: disabledOptions.includes(option.value),
    }));
  }, [attribute, disabledOptions]);
  const selectedValue = configuration.selectedAttributeOptions?.[attribute.id];
  const radioValue =
    selectedValue === undefined || selectedValue === null
      ? undefined
      : String(selectedValue);
  const updateSelectedAttributeOptions = (value: unknown) => {
    if (typeof value !== "object" || value === null) {
      return;
    }

    updateConfiguration(value as Partial<Configuration>);
  };

  switch (attribute.type) {
    case AttributeInputTypeEnum.DROPDOWN:
    case AttributeInputTypeEnum.DROPDOWN_COLOR:
      return (
        <Skeleton loading={!configuration.selectedAttributeOptions}>
          <MemoizedSelect
            attributeId={attribute.id}
            attributeName={attribute.name}
            options={options}
            updateConfiguration={updateConfiguration}
            searchParams={searchParams}
            value={configuration.selectedAttributeOptions?.[
              attribute.id
            ]?.toString()}
            t={t}
          />
        </Skeleton>
      );
    case AttributeInputTypeEnum.RADIO_GROUP:
    case AttributeInputTypeEnum.RADIO_GROUP_IMAGE:
    case AttributeInputTypeEnum.RADIO_GROUP_COLOR:
      return (
        <Skeleton loading={!configuration.selectedAttributeOptions}>
          <MemoizedRadioGroup
            name={attribute.id}
            options={options}
            handleChange={updateSelectedAttributeOptions}
            value={radioValue}
            updateConfiguration
            t={t}
            i18n={i18n}
          />
        </Skeleton>
      );
    case AttributeInputTypeEnum.ADVANCED_FINISHING:
      return (
        <Skeleton loading={!configuration.selectedAttributeOptions}>
          <AdvancedFinishingSelect
            attribute={attribute}
            configuration={configuration}
            updateConfiguration={updateConfiguration}
            t={t}
            i18n={i18n}
          />
        </Skeleton>
      );
    default:
      return (
        <Skeleton loading={!configuration.selectedAttributeOptions}>
          <MemoizedRadioGroup
            name={attribute.id}
            options={options}
            handleChange={updateSelectedAttributeOptions}
            value={radioValue}
            updateConfiguration
            t={t}
            i18n={i18n}
          />
        </Skeleton>
      );
  }
}
