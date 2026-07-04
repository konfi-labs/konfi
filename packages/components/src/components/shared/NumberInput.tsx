"use client";

import { NumberInputRoot, NumberInputField } from "../ui/number-input";

export const NumberInput = ({
  name,
  defaultValue,
  min,
  max,
  step,
  precision,
  onChange,
  ...rest
}: {
  name: string;
  defaultValue?: number;
  min: number;
  max: number;
  step?: number;
  precision?: number;
  onChange?: any;
  [x: string]: any;
}) => (
  <NumberInputRoot
    {...rest}
    defaultValue={defaultValue?.toString()}
    min={min}
    max={max}
    step={step}
    name={name}
  >
    <NumberInputField />
  </NumberInputRoot>
);
