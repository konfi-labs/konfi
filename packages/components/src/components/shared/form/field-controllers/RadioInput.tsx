"use client";

import {
  Box,
  ChakraComponent,
  ConditionalValue,
  RadioCardRoot,
  SimpleGrid,
} from "@chakra-ui/react";
import { SelectOption } from "@konfi/types";
import { isEqual, isUndefined } from "es-toolkit";
import { i18n, TFunction } from "i18next";
import { useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { RadioCard } from "../../custom-radio/RadioCard";

interface RadioInputProps {
  name: string;
  options: SelectOption[];
  mb?: number | string;
  columns?: ConditionalValue<number>;
  isObject?: boolean;
  t: TFunction;
  i18n: i18n;
}

type RadioGroupComponent = ChakraComponent<"div", RadioInputProps>;

export const RadioInput = (({
  name,
  options,
  mb,
  columns,
  isObject,
  t,
  i18n,
}: RadioInputProps) => {
  const watchedValue = useWatch({ name });
  const checkedValue = useMemo(() => {
    return watchedValue;
  }, [watchedValue, options]);
  const {
    setValue,
    formState: { errors },
  } = useFormContext();
  const isInvalid = !!errors[name];

  useEffect(() => {
    if (isObject) {
      return;
    } else if (options && options.length > 0) {
      setValue(name, options[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOnChange(nextValue: string) {
    const option = options.find((option) => option.value === nextValue);

    if (isUndefined(option)) {
      console.error("option is undefined");
      return;
    }

    if (isObject) {
      setValue(name, option.object);
    } else setValue(name, option.value);
  }

  return (
    <Box
      w="100%"
      borderRadius="md"
      outline={isInvalid ? "2px solid" : undefined}
      outlineColor={isInvalid ? "border.error" : undefined}
      outlineOffset="2px"
    >
      <RadioCardRoot
        name={name}
        defaultValue={watchedValue}
        onValueChange={(details) => handleOnChange(details.value ?? "")}
      >
        <SimpleGrid mb={mb} columns={columns ? columns : 2} gap={"2"}>
          {options.map(({ label, value, object, image, color }) => {
            return (
              <RadioCard
                key={value}
                image={image}
                color={color}
                value={value ?? null}
                checked={isEqual(
                  checkedValue,
                  typeof checkedValue === "object" ? object : value,
                )}
                t={t}
                i18n={i18n}
              >
                {label}
              </RadioCard>
            );
          })}
        </SimpleGrid>
      </RadioCardRoot>
    </Box>
  );
}) as RadioGroupComponent;
