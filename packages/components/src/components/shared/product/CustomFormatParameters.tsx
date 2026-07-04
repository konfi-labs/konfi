import { Box, FormatNumber, HStack, Text } from "@chakra-ui/react";
import { calculateQuantity } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { TFunction } from "i18next";

export function CustomFormatParameters({
  customFormat,
  customSizes,
  width,
  height,
  bleed,
  t,
}: {
  customFormat?: boolean;
  customSizes?: { width: number; height: number; quantity: number }[];
  width?: number;
  height?: number;
  bleed?: number;
  t: TFunction;
}) {
  if (!customFormat) {
    return null;
  }

  return (
    <Box>
      <Text fontWeight={"600"}>{t(`CUSTOM_FORMAT_PARAMETERS`)}</Text>
      {!isEmpty(customSizes)
        ? customSizes?.map((size, index) => (
            <HStack key={index}>
              <Text fontSize="sm">
                {size.width} × {size.height} mm
              </Text>
              <Text
                fontSize="sm"
                color={{ base: "gray.600", _dark: "gray.400" }}
              >
                × {size.quantity} {t("Unit.PCS")}
              </Text>
              <Text
                fontSize="sm"
                color={{ base: "gray.500", _dark: "gray.400" }}
              >
                <FormatNumber
                  value={calculateQuantity(
                    true,
                    size.quantity,
                    size.width,
                    size.height,
                    bleed,
                  )}
                  style={"unit"}
                  unit={"meter"}
                />
                ²
              </Text>
            </HStack>
          ))
        : customFormat && (
            <Text mt={0} fontSize={"sm"}>
              {width ?? 0} x {height ?? 0} mm
            </Text>
          )}
    </Box>
  );
}
