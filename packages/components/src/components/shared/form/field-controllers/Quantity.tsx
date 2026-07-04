"use client";

import { Text } from "@chakra-ui/react";
import { OrderItem } from "@konfi/types";
import { Controller, useFormContext } from "react-hook-form";
import { FieldData } from "@konfi/types";
import { NumberInputField, NumberInputRoot } from "../../../ui/number-input";

export const QuantityInput = ({
  fieldData,
  orderItem,
}: {
  fieldData: FieldData;
  orderItem: OrderItem | undefined;
}) => {
  const { control, setValue } = useFormContext();
  return (
    <>
      {orderItem?.product?.spec && (
        <Controller
          name={fieldData.name}
          control={control}
          render={({ field }) => (
            <NumberInputRoot
              name={field.name}
              value={field.value}
              defaultValue={Number(
                orderItem.product?.spec.defaultOrder ?? 0,
              ).toString()}
              step={orderItem.product?.spec.step}
              min={orderItem.product?.spec.minimumOrder}
              max={orderItem.product?.spec.maximumOrder}
              onValueChange={({ value }) => {
                field.onChange(value);
              }}
            >
              <NumberInputField />
            </NumberInputRoot>
          )}
        />
      )}
      {orderItem?.product?.spec && (
        <Text>
          Minimalnie: {orderItem.product.spec.minimumOrder}, maksymalnie:{" "}
          {orderItem.product.spec.maximumOrder}
        </Text>
      )}
    </>
  );
};
