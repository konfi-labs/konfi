import { Flex, HStack, Text } from "@chakra-ui/react";
import { Tag, Tooltip } from "@konfi/components";
import { Attribute } from "@konfi/types";
import { useT } from "@/i18n/client";

const AttributeInfo = ({ attribute }: { attribute: Attribute }) => {
  const { t } = useT();

  return (
    <>
      <HStack wrap={"wrap"} gap={"2"} mb="4">
        <Flex align={"flex-start"}>
          <Tooltip
            content={attribute.options.map((option) => option.label).join(", ")}
          >
            <Text
              width={"150px"}
              overflow={"hidden"}
              whiteSpace={"nowrap"}
              textOverflow={"ellipsis"}
            >
              {attribute.options.map((option, index) =>
                index ? ", " + option.label : option.label,
              )}
            </Text>
          </Tooltip>
        </Flex>
      </HStack>
      <HStack wrap={"wrap"} gap={"2"} mb="4">
        <Flex align={"flex-start"}>
          <Tag
            variant={"outline"}
            colorPalette={attribute.calculated ? "success" : "red"}
          >
            Atrybut wpływa na cenę
          </Tag>
        </Flex>
        <Flex align={"flex-start"}>
          <Tag
            variant={"outline"}
            colorPalette={attribute.required ? "success" : "red"}
          >
            Wymagaj tego atrybutu
          </Tag>
        </Flex>
        <Flex align={"flex-start"}>
          <Tag
            variant={"outline"}
            colorPalette={attribute.format ? "success" : "red"}
          >
            Format
          </Tag>
        </Flex>
        <Flex align={"flex-start"}>
          <Tag
            variant={"outline"}
            colorPalette={attribute.pages ? "success" : "red"}
          >
            Strony
          </Tag>
        </Flex>
      </HStack>
      <HStack wrap={"wrap"} gap={"2"} mb="4">
        <Flex>
          <Tag variant={"outline"}>
            {t(`AttributeInputTypeEnum.${attribute.type}`)}
          </Tag>
        </Flex>
      </HStack>
    </>
  );
};

export default AttributeInfo;
