"use client";

import { TFunction } from "i18next";
import { RadioCard, SimpleGrid, Text, VStack } from "@chakra-ui/react";

export type ProductImageGenerationStyleOption = {
  value: string;
  label: string;
  description: string;
  icon: string;
};

type ProductImageGenerationStylePickerProps = {
  t: TFunction;
  value: string;
  options: ProductImageGenerationStyleOption[];
  onChangeAction: (value: string) => void;
};

export function ProductImageGenerationStylePicker({
  t,
  value,
  options,
  onChangeAction,
}: ProductImageGenerationStylePickerProps) {
  return (
    <VStack align="stretch" gap={2.5}>
      <Text fontWeight="semibold">
        {t("products.imageGeneration.styleLabel", {
          defaultValue: "Choose a style direction",
        })}
      </Text>

      <RadioCard.Root
        value={value}
        onValueChange={(details) => {
          if (details.value) {
            onChangeAction(details.value);
          }
        }}
      >
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={2}>
          {options.map((option) => (
            <RadioCard.Item
              key={option.value}
              value={option.value}
              borderRadius="2xl"
              colorPalette="primary"
            >
              <RadioCard.ItemHiddenInput />
              <RadioCard.ItemControl p={3}>
                <RadioCard.ItemContent alignItems="center" gap={0}>
                  <RadioCard.ItemText
                    fontWeight="semibold"
                    fontSize="sm"
                    textAlign="center"
                  >
                    {option.label}
                  </RadioCard.ItemText>
                </RadioCard.ItemContent>
              </RadioCard.ItemControl>
            </RadioCard.Item>
          ))}
        </SimpleGrid>
      </RadioCard.Root>
    </VStack>
  );
}
