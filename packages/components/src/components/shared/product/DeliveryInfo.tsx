"use client";

import { Box, Heading, HStack, Skeleton, Text } from "@chakra-ui/react";
import { Product } from "@konfi/types";
import { getAvailableShippingOptions } from "@konfi/utils";
import { isNull } from "es-toolkit";
import { useMemo } from "react";

interface Props {
  shipping: Product["shipping"];
  t: (key: string, options?: Record<string, any>) => string;
}

export function DeliveryInfo({ shipping, t }: Props) {
  const availableShippingOptions = useMemo(
    () => getAvailableShippingOptions([shipping?.types], true),
    [shipping],
  );
  return (
    <Skeleton
      loading={isNull(availableShippingOptions)}
      mt={"8"}
      pl={[0, 6]}
      textAlign={"right"}
    >
      <Heading fontSize={"xl"} mb={"3"}>
        {t("deliveryInfo.heading", {
          defaultValue: "Available Delivery Options",
        })}
      </Heading>
      <Box>
        <HStack justify={"end"}>
          {availableShippingOptions &&
            availableShippingOptions.map((type, index) => (
              <Text
                key={index}
                fontSize={"sm"}
                fontWeight={"semibold"}
                color="primary.solid"
              >
                {t(`ShippingOptions.${type}`, {
                  defaultValue: type,
                })}
              </Text>
            ))}
        </HStack>
      </Box>
    </Skeleton>
  );
}
