"use client";

import {
  Box,
  ChakraComponent,
  ConditionalValue,
  Flex,
  RadioCard,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  isAddress,
  isContact,
  type Address,
  type Contact,
  type SelectOption,
} from "@konfi/types";
import { formatStreetLine } from "@konfi/utils";
import { isEqual, isObject } from "es-toolkit/compat";
import { useEffect, useMemo, useState } from "react";
import { Image } from "../../Image";

type RadioGridOption = RadioGridControllerProps["options"][number];

const normalizeAddressOptionSegment = (value?: string | null) =>
  (value ?? "").trim().toLocaleLowerCase();

const getAddressOptionIdentity = (address: Address) =>
  [
    address.type,
    address.name,
    address.companyName,
    address.nip,
    address.street,
    address.number,
    address.local,
    address.zip,
    address.city,
    address.country,
  ]
    .map(normalizeAddressOptionSegment)
    .join("|");

const isSameAddress = (left: Address, right: Address) =>
  getAddressOptionIdentity(left) === getAddressOptionIdentity(right);

const isSameContact = (left: Contact, right: Contact) => isEqual(left, right);

const findOptionValue = (
  options: RadioGridOption[],
  value: string | object | null | undefined,
): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (!isObject(value)) {
    return undefined;
  }

  const matchingOption = options.find((option) => {
    if (!option.object) {
      return false;
    }

    if (option.object === value) {
      return true;
    }

    if (isAddress(option.object) && isAddress(value)) {
      return isSameAddress(option.object, value);
    }

    if (isContact(option.object) && isContact(value)) {
      return isSameContact(option.object, value);
    }

    return false;
  });

  if (matchingOption) {
    return matchingOption.value;
  }

  const namedValue = value as { name?: unknown };

  if (typeof namedValue.name !== "string") {
    return undefined;
  }

  return options.find((option) => option.value === namedValue.name)?.value;
};

interface RadioGridControllerProps {
  name: string;
  options: SelectOption[];
  // Incoming value acts as an initial / external value (e.g. form default)
  // Component now manages its own internal selection state.
  value: string | object | null | undefined;
  onChange: (value: string | object) => void;
  gridColumns?: number | number[];
  showImages?: boolean;
  imageUrlTemplate?: string;
  mb?: number | string;
  invalid?: boolean;
}

type RadioGridControllerComponent = ChakraComponent<
  "div",
  RadioGridControllerProps
>;

export const RadioGridController = ((props: RadioGridControllerProps) => {
  const {
    name,
    options,
    value,
    onChange,
    gridColumns = [1, 1, 2],
    showImages = false,
    imageUrlTemplate,
    mb,
    invalid,
  } = props;

  // Internal state which truly controls the RadioCard group.
  const [_value, setValueState] = useState<string>(
    () => findOptionValue(options, value) ?? "",
  );

  // Sync internal state if external value changes (e.g., form reset)
  useEffect(() => {
    const next = findOptionValue(options, value) ?? "";
    setValueState(next);
  }, [options, value]);

  function handleOnChange(nextValue: string) {
    setValueState(nextValue);
    const objectOption = options.find((option) => option.value === nextValue);
    if (objectOption?.object) {
      onChange(objectOption.object);
      return;
    }
    onChange(nextValue);
  }

  // Calculate responsive columns
  const columns: ConditionalValue<number> = useMemo(() => {
    if (typeof gridColumns === "number") {
      return gridColumns;
    }
    return gridColumns;
  }, [gridColumns]);

  // Process image URL if template is provided
  const getImageUrl = (option: Pick<SelectOption, "value" | "image">) => {
    if (option.image) return option.image;
    if (imageUrlTemplate && showImages) {
      return imageUrlTemplate.replace("${value}", option.value);
    }
    return undefined;
  };

  return (
    <Box
      w="100%"
      borderRadius="md"
      outline={invalid ? "2px solid" : undefined}
      outlineColor={invalid ? "border.error" : undefined}
      outlineOffset="2px"
    >
      <RadioCard.Root
        w={"100%"}
        name={name}
        value={_value}
        onValueChange={(details) => {
          handleOnChange(details.value ?? "");
        }}
      >
        <SimpleGrid mb={mb} columns={columns} gap="2">
          {options.map(({ label, value: optionValue, image, object }) => {
            const imageUrl = getImageUrl({ value: optionValue, image });
            return (
              <RadioCard.Item
                key={optionValue}
                value={optionValue}
                pl={1}
                borderRadius="3xl"
                colorPalette={"primary"}
              >
                <RadioCard.ItemHiddenInput />
                <RadioCard.ItemControl>
                  <RadioCard.ItemContent maxW={"100%"}>
                    {showImages && imageUrl && (
                      <Image
                        ratio={1}
                        width={200}
                        height={100}
                        objectFit="contain"
                        src={imageUrl}
                        alt={label}
                        priority={false}
                        transparentBackground
                      />
                    )}
                    <Flex maxW={"80%"}>
                      <RadioCard.ItemText fontWeight={600} truncate>
                        {label || "-"}
                      </RadioCard.ItemText>
                    </Flex>
                    {object && (
                      <RadioCard.ItemDescription mt={2}>
                        {isAddress(object) && (
                          <VStack align="start" gap={1}>
                            {object.street && (
                              <Text>
                                {formatStreetLine(
                                  object.street,
                                  object.number,
                                  object.local,
                                )}
                              </Text>
                            )}
                            {object.city && (
                              <Text>
                                {object.zip ? `${object.zip} ` : ""}
                                {object.city}
                              </Text>
                            )}
                            {object.country && <Text>{object.country}</Text>}
                          </VStack>
                        )}
                        {isContact(object) && (
                          <VStack align="start" gap={1}>
                            {object.email && <Text>{object.email}</Text>}
                            {object.phone && <Text>{object.phone}</Text>}
                          </VStack>
                        )}
                      </RadioCard.ItemDescription>
                    )}
                  </RadioCard.ItemContent>
                  <RadioCard.ItemIndicator pos={"absolute"} top={3} right={3} />
                </RadioCard.ItemControl>
              </RadioCard.Item>
            );
          })}
        </SimpleGrid>
      </RadioCard.Root>
    </Box>
  );
}) as RadioGridControllerComponent;
