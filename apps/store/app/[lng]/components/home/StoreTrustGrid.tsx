"use client";

import { useT } from "@/i18n/client";
import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import {
  Box,
  Grid,
  Heading,
  HStack,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { StorefrontHomeBlockVariant } from "@konfi/types";

type StoreTrustGridVariant = Extract<
  StorefrontHomeBlockVariant,
  "cards" | "default" | "strip"
>;

const trustItems = [
  { key: "fastProduction", icon: "bolt" },
  { key: "securePayments", icon: "lock" },
  { key: "trackedShipping", icon: "local_shipping" },
  { key: "qualityGuarantee", icon: "verified" },
  { key: "freeFileCheck", icon: "preview" },
  { key: "ecoFriendly", icon: "eco" },
] as const;

export function StoreTrustGrid({
  lng,
  description,
  title,
  variant = "default",
}: {
  description?: string;
  lng: string;
  title?: string;
  variant?: StoreTrustGridVariant;
}) {
  const { t } = useT();
  const isStrip = variant === "strip";
  const isCards = variant === "cards";

  return (
    <Box as="section" position="relative">
      <Box
        bg={isStrip ? "transparent" : isCards ? "bg.subtle" : "bg.panel"}
        borderRadius={isStrip ? "none" : storefrontRadiusCssVar.block}
        border="1px solid"
        borderColor={isStrip ? "transparent" : "border.muted"}
        boxShadow={isStrip ? "none" : "0 24px 80px rgba(15, 23, 42, 0.08)"}
        p={isStrip ? 0 : [6, 8, 10]}
      >
        <Grid
          templateColumns={{
            base: "1fr",
            xl: isStrip ? "1fr" : "minmax(280px, 0.9fr) minmax(0, 1.1fr)",
          }}
          gap={[6, 8]}
          alignItems="start"
        >
          <VStack
            align={isStrip ? "center" : "start"}
            gap={4}
            pr={{ xl: isStrip ? 0 : 10 }}
            textAlign={isStrip ? "center" : "start"}
            mx={isStrip ? "auto" : undefined}
            maxW={isStrip ? "3xl" : undefined}
          >
            <Text
              fontSize="xs"
              letterSpacing="0.26em"
              textTransform="uppercase"
              color="fg.muted"
              fontFamily="mono"
            >
              {t("store.home.trustLabel", {
                defaultValue: "Why teams keep coming back",
                lng,
              })}
            </Text>
            <Heading
              as="h2"
              size={{ base: "2xl", md: "3xl" }}
              textWrap="balance"
            >
              {title ??
                t("store.home.trustHeading", {
                  defaultValue: "Built for demanding print jobs, not guesswork",
                  lng,
                })}
            </Heading>
            <Text
              fontSize={{ base: "md", md: "lg" }}
              color="fg.muted"
              maxW={isStrip ? "2xl" : "lg"}
            >
              {description ??
                t("store.home.trustDescription", {
                  defaultValue:
                    "From file check to finishing, every step is designed to keep the process clear, fast and production-ready.",
                  lng,
                })}
            </Text>
          </VStack>

          <SimpleGrid
            columns={{
              base: 1,
              md: isStrip ? 3 : 2,
              xl: isStrip ? 6 : 3,
            }}
            gap={isStrip ? [3, 4] : [4, 5, 6]}
          >
            {trustItems.map((item, index) => (
              <VStack
                key={item.key}
                align={isStrip ? "center" : "start"}
                gap={3}
                p={isStrip ? [3, 4] : [4, 5]}
                borderRadius={storefrontRadiusCssVar.card}
                border="1px solid"
                borderColor="border.muted"
                bg={isCards ? "bg.panel" : undefined}
                boxShadow={
                  isCards ? "0 18px 50px rgba(15, 23, 42, 0.08)" : undefined
                }
                minH="full"
                textAlign={isStrip ? "center" : "start"}
              >
                <HStack
                  justify={isStrip ? "center" : "space-between"}
                  align="center"
                  w="full"
                >
                  <Text
                    fontSize="xs"
                    letterSpacing="0.24em"
                    textTransform="uppercase"
                    color="fg.muted"
                    fontFamily="mono"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                  <MaterialSymbol color="primary.solid" aria-hidden="true">
                    {item.icon}
                  </MaterialSymbol>
                </HStack>
                <Text fontWeight="semibold">
                  {t(`store.home.trust.${item.key}.title`, {
                    defaultValue: item.key,
                    lng,
                  })}
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  {t(`store.home.trust.${item.key}.description`, {
                    defaultValue: item.key,
                    lng,
                  })}
                </Text>
              </VStack>
            ))}
          </SimpleGrid>
        </Grid>
      </Box>
    </Box>
  );
}
