"use client";

import { chakra, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { ApplicationMethodTypeEnum, Promotion } from "@konfi/types";
import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  ClipboardIconButton,
  ClipboardInput,
  ClipboardRoot,
} from "../../ui/clipboard";
import { InputGroup } from "../../ui/input-group";

class PromotionsBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Promotions render error:", error, info);
  }

  override render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function Promotions({
  promotions,
  t,
}: {
  promotions: Promotion[];
  t: (key: string, options?: Record<string, any>) => string;
}) {
  return (
    <PromotionsBoundary>
      <PromotionsContent promotions={promotions} t={t} />
    </PromotionsBoundary>
  );
}

function PromotionsContent({
  promotions,
  t,
}: {
  promotions: Promotion[];
  t: (key: string, options?: Record<string, any>) => string;
}) {
  return (
    <VStack w={"100%"} mt={4}>
      <Heading alignSelf={"flex-start"} fontSize={"xl"}>
        {t("promotions.availablePromotions")}:
      </Heading>
      {promotions.map((promotion, index) => (
        <PromotionCard key={index} promotion={promotion} t={t} />
      ))}
      <Text
        alignSelf={"flex-start"}
        fontWeight={"bold"}
        fontSize={"sm"}
        color={"primary.solid"}
      >
        {t("promotions.rememberToApply")}
      </Text>
    </VStack>
  );
}

const PromotionCard = ({
  promotion,
  t,
}: {
  promotion: Promotion;
  t: (key: string, options?: Record<string, any>) => string;
}) => {
  return (
    <HStack
      border={"2px dotted"}
      borderColor={"primary.solid"}
      w={"100%"}
      p={2}
      borderRadius={"3xl"}
      justify={"space-between"}
    >
      <Text ml={2} fontWeight={"bold"} color={"primary.solid"}>
        {promotion.code}{" "}
        <chakra.span fontWeight={"normal"}>
          -{promotion.applicationMethod?.value}
          {promotion.applicationMethod?.type ===
          ApplicationMethodTypeEnum.PERCENTAGE
            ? "%"
            : t(`CurrencyEnum.${promotion.applicationMethod?.currencyCode}`, {
                defaultValue: promotion.applicationMethod?.currencyCode,
              })}
        </chakra.span>
      </Text>
      <ClipboardRoot maxW="250px" value={promotion.code}>
        <InputGroup
          width="full"
          endElement={<ClipboardIconButton me="-2" colorPalette={"primary"} />}
        >
          <ClipboardInput />
        </InputGroup>
      </ClipboardRoot>
    </HStack>
  );
};
