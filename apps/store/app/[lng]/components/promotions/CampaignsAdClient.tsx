"use client";

import { useT } from "@/i18n/client";
import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import {
  Box,
  Card,
  Container,
  Heading,
  HStack,
  Show,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { ButtonLink } from "@konfi/components";
import {
  ApplicationMethodTargetTypeEnum,
  Campaign,
  type StorefrontButtonStyle,
} from "@konfi/types";
import { getAvailabilityMessage, STORE_PROMOTION_PRODUCTS } from "@konfi/utils";
import { useMemo } from "react";

interface CampaignsAdClientProps {
  buttonStyle?: StorefrontButtonStyle;
  campaigns: string;
  lng: string;
}

export default function CampaignsAdClient({
  buttonStyle = "solid",
  campaigns,
  lng,
}: CampaignsAdClientProps) {
  const parsedCampaigns: Campaign[] = useMemo(
    () => JSON.parse(campaigns) as Campaign[],
    [campaigns],
  );
  const { t } = useT();

  return (
    <Container maxW={"7xl"}>
      <Heading size={"2xl"} my={8}>
        {t("promotions.heading", { lng })}
      </Heading>
      <SimpleGrid gap={4} templateColumns="repeat(auto-fill, min(200px, 1fr))">
        {parsedCampaigns.map((campaign) => {
          return (
            <Card.Root
              key={campaign.id}
              borderRadius={storefrontRadiusCssVar.card}
              bgColor={"gray.50"}
              overflow={"hidden"}
            >
              <Card.Header>
                <Heading fontSize={{ base: "2xl", md: "4xl" }}>
                  {campaign.name}
                </Heading>
                {campaign.description && (
                  <Text color={"gray.emphasized"} maxW={"66%"}>
                    {campaign.description}
                  </Text>
                )}
              </Card.Header>
              <Card.Body>
                {campaign.promotions?.map((promotion, _index) => {
                  const targetType = promotion.applicationMethod?.targetType;
                  let targetKey = "selectedProducts";
                  if (
                    targetType ===
                    ApplicationMethodTargetTypeEnum.SHIPPING_METHODS
                  )
                    targetKey = "shipping";
                  else if (targetType === ApplicationMethodTargetTypeEnum.ORDER)
                    targetKey = "entireOrder";
                  const targetTypeText = t(`promotions.targets.${targetKey}`, {
                    lng,
                  });
                  const discountSuffix =
                    promotion.applicationMethod?.type === "PERCENTAGE"
                      ? t("promotions.discountSuffix.percentage", { lng })
                      : t("promotions.discountSuffix.currency", { lng });
                  return (
                    <Box key={promotion.id} position={"relative"}>
                      <Heading as={"h3"}>
                        {t("promotions.codeLabel", { lng })}
                        {`"${promotion.code}"`}
                      </Heading>
                      <HStack>
                        <Text
                          fontSize={"lg"}
                          fontWeight={"bold"}
                          color={"primary.solid"}
                        >
                          {t("promotions.discountOn", {
                            target: targetTypeText,
                            lng,
                          })}
                        </Text>
                        <Show
                          when={
                            promotion.applicationMethod?.targetType ===
                            ApplicationMethodTargetTypeEnum.ITEMS
                          }
                        >
                          <ButtonLink
                            lng={lng}
                            href={STORE_PROMOTION_PRODUCTS(
                              promotion.campaignId ?? "",
                            )}
                            ariaLabel={t("promotions.promotionalProducts", {
                              lng,
                            })}
                            rel={"nofollow"}
                            borderRadius={storefrontRadiusCssVar.button}
                            colorPalette={"primary"}
                            variant={buttonStyle}
                          >
                            {t("promotions.seeProducts", { lng })}
                          </ButtonLink>
                        </Show>
                      </HStack>
                      <Text
                        position={"absolute"}
                        right={"0"}
                        bottom={"0"}
                        fontSize={{ md: "144px" }}
                        hideBelow={"md"}
                        fontWeight={"bold"}
                        color={"gray.100"}
                        transform={"rotate(-45deg)"}
                      >
                        -{promotion.applicationMethod?.value}
                        {discountSuffix}
                      </Text>
                      <Text fontSize={"sm"} mt={4}>
                        {getAvailabilityMessage(campaign, t)}
                      </Text>
                    </Box>
                  );
                })}
              </Card.Body>
            </Card.Root>
          );
        })}
      </SimpleGrid>
    </Container>
  );
}
