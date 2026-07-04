"use client";

import { useT } from "@/i18n/client";
import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import { Box, Grid, Heading, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { ProductCard } from "@konfi/components";
import type { CardProduct, StorefrontHomeBlockVariant } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { Analytics, logEvent } from "firebase/analytics";
import { useEffect } from "react";

interface Props {
  products: CardProduct[];
  analytics?: Analytics;
  title?: string;
  eyebrow?: string;
  description?: string;
  itemListId?: string;
  itemListName?: string;
  lng: string;
  variant?: ProductRecommendationsVariant;
}

type ProductRecommendationsVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "editorial"
>;

export function ProductRecommendations({
  products,
  analytics,
  title,
  eyebrow,
  description,
  itemListId,
  itemListName,
  lng,
  variant = "default",
}: Props) {
  const { t } = useT();
  const isCompact = variant === "compact";
  const isEditorial = variant === "editorial";
  useEffect(() => {
    if (products.length === 0) return;
    if (!isUndefined(analytics)) {
      logEvent(analytics, "view_item_list", {
        item_list_id: itemListId || "recommended",
        item_list_name:
          itemListName ||
          t("store.recommendations.title", {
            defaultValue: "Recommended products",
            lng,
          }),
        items: products.map((product, index) => ({
          item_id: product.id,
          item_name: product.name,
          index,
        })),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box
      w={"100%"}
      data-nosnippet
      bg={isEditorial ? "bg.subtle" : undefined}
      borderRadius={isEditorial ? storefrontRadiusCssVar.block : undefined}
      p={isEditorial ? [5, 8, 10] : undefined}
    >
      <Grid
        templateColumns={{
          base: "1fr",
          xl: isEditorial ? "minmax(260px, 0.7fr) minmax(0, 1.3fr)" : "1fr",
        }}
        gap={isEditorial ? [6, 8] : 0}
        alignItems="start"
      >
        <VStack
          align={isCompact ? "center" : "start"}
          gap={isCompact ? 3 : 4}
          mb={isEditorial ? 0 : isCompact ? 5 : 8}
          textAlign={isCompact ? "center" : "start"}
        >
          {eyebrow && (
            <Text
              fontSize="xs"
              letterSpacing="0.26em"
              textTransform="uppercase"
              color="fg.muted"
              fontFamily="mono"
            >
              {eyebrow}
            </Text>
          )}
          <Heading
            size={{ base: "2xl", md: isCompact ? "2xl" : "3xl" }}
            textWrap="balance"
          >
            {title ||
              t("store.recommendations.title", {
                defaultValue: "Recommended products",
                lng,
              })}
          </Heading>
          {description && (
            <Text
              fontSize={{ base: "md", md: isCompact ? "md" : "lg" }}
              color="fg.muted"
              maxW="2xl"
            >
              {description}
            </Text>
          )}
        </VStack>
        <SimpleGrid
          columns={isCompact ? [1, 2, 3, 5] : [1, 2, 4]}
          gap={isCompact ? 3 : 4}
        >
          {products.map((product, index) => (
            <ProductCard key={index} cardProduct={product} t={t} lng={lng} />
          ))}
        </SimpleGrid>
      </Grid>
    </Box>
  );
}
