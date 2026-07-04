"use client";

import { FieldData } from "@konfi/types";
import { useFormContext, useWatch } from "react-hook-form";
import { Slider as ChakraSlider } from "../../../ui/slider";

export const Slider = ({ field }: { field: FieldData }) => {
  const {
    setValue,
    formState: { errors },
  } = useFormContext();
  const value = useWatch({ name: field.name });
  const isInvalid = !!errors[field.name];

  return (
    <ChakraSlider
      name={field.name}
      colorPalette={"primary"}
      width="full"
      defaultValue={Array.isArray(value) ? value : [value]}
      value={Array.isArray(value) ? value : [value]}
      onValueChange={({ value }) => {
        setValue(field.name, value[0]);
      }}
      min={field.min}
      max={field.max}
      invalid={isInvalid}
    />
  );
};
