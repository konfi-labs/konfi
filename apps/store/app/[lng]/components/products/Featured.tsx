"use client";

import {
  Box,
  Grid,
  GridItem,
  Heading,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import { MaterialSymbol, ProductCard } from "@konfi/components";
import type { CardProduct, StorefrontHomeBlockVariant } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { logEvent } from "firebase/analytics";
import { analytics } from "@/lib/firebase/clientApp";
import { useEffect } from "react";
import { useT } from "@/i18n/client";

interface Props {
  description?: string;
  featuredProducts?: CardProduct[];
  lng: string;
  title?: string;
  variant?: FeaturedProductsVariant;
}

type FeaturedProductsVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "spotlight"
>;

export default function Featured({
  description,
  featuredProducts,
  lng,
  title,
  variant = "default",
}: Props) {
  const { t } = useT();
  const isCompact = variant === "compact";
  const isSpotlight = variant === "spotlight";
  useEffect(() => {
    if (!isUndefined(analytics) && !isEmpty(featuredProducts)) {
      logEvent(analytics, "view_item_list", {
        item_list_id: "featured",
        item_list_name: "Polecane Produkty",
        items: featuredProducts?.map((product, index) => ({
          item_id: product.id,
          item_name: product.name,
          index,
        })),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isEmpty(featuredProducts)) return null;

  return (
    <Box
      as="section"
      bg={isSpotlight ? "bg.subtle" : undefined}
      borderRadius={isSpotlight ? storefrontRadiusCssVar.block : undefined}
      p={isSpotlight ? [5, 8, 10] : undefined}
    >
      <VStack
        align={isCompact ? "center" : "start"}
        gap={isCompact ? 3 : 4}
        mb={isCompact ? [5, 6] : [8, 10]}
        textAlign={isCompact ? "center" : "start"}
      >
        <Text
          fontSize="xs"
          letterSpacing="0.26em"
          textTransform="uppercase"
          color="fg.muted"
          fontFamily="mono"
        >
          {t("store.home.featuredEyebrow", {
            defaultValue: "Curated picks",
            lng,
          })}
        </Text>
        <HStack gap={3} align="center" justify={isCompact ? "center" : "start"}>
          <Heading
            size={{ base: "2xl", md: isCompact ? "2xl" : "3xl" }}
            textWrap="balance"
          >
            {title ??
              t("store.home.featured", {
                defaultValue: "Check what we recommend",
                lng,
              })}
          </Heading>
          <MaterialSymbol
            color="primary.solid"
            fontSize={28}
            aria-hidden="true"
          >
            arrow_outward
          </MaterialSymbol>
        </HStack>
        <Text
          fontSize={{ base: "md", md: isCompact ? "md" : "lg" }}
          color="fg.muted"
          maxW="2xl"
        >
          {description ??
            t("store.home.featuredDescription", {
              defaultValue:
                "Flexible formats, reliable finishes and products that make a strong first impression.",
              lng,
            })}
        </Text>
      </VStack>

      <Grid
        templateColumns={
          isCompact
            ? ["1fr", "1fr 1fr", "repeat(3, 1fr)", "repeat(5, 1fr)"]
            : ["1fr", "1fr", "1fr 1fr", "1fr 1fr 1fr 1fr"]
        }
        gap={isCompact ? 3 : 4}
      >
        {featuredProducts?.map((cardProduct: CardProduct, i: number) => (
          <GridItem
            colSpan={
              isCompact
                ? 1
                : isSpotlight && i === 0
                  ? [1, 1, 2, 2]
                  : i % 4 === 0
                    ? [1, 1, 1, 2]
                    : [1, 1, 1, 1]
            }
            key={i}
          >
            <ProductCard
              cardProduct={cardProduct}
              ratio={
                isCompact
                  ? [1.4, 1.2, 1]
                  : i % 4 === 0
                    ? [2, 2, 1, 2.05]
                    : [2, 2, 1, 1]
              }
              analytics={analytics}
              t={t}
              lng={lng}
            />
          </GridItem>
        ))}
      </Grid>
    </Box>
  );
}
