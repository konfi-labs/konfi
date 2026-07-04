"use client";

import { useT } from "@/i18n/client";
import { analytics } from "@/lib/firebase/clientApp";
import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import { Box, Button, Grid, VStack } from "@chakra-ui/react";
import { Image, StoreLandingHero } from "@konfi/components";
import type { GoogleReview } from "@konfi/google";
import {
  type CardProduct,
  type HeroCard,
  type StorefrontButtonStyle,
  type StorefrontHomeBlock,
  type StorefrontHomeBlockVariant,
} from "@konfi/types";
import { isEmpty } from "es-toolkit/compat";
import { StorefrontAssistantHero } from "../assistant/StorefrontAssistantHero";
import Newsletter from "../layout/Newsletter";
import Featured from "../products/Featured";
import { ProductRecommendations } from "../products/Recommendations";
import CampaignsAdClient from "../promotions/CampaignsAdClient";
import { HowItWorks } from "./HowItWorks";
import { StoreTrustGrid } from "./StoreTrustGrid";
import { Testimonials } from "./Testimonials";

const getBlockText = (
  block: StorefrontHomeBlock,
  lng: string,
  field: "body" | "ctaLabel" | "subtitle" | "title",
) => block.translations?.[lng]?.[field] ?? block[field];

type HeroVariant = Extract<
  StorefrontHomeBlockVariant,
  "default" | "editorial" | "fullscreen"
>;
type AssistantVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "panel"
>;
type TrustGridVariant = Extract<
  StorefrontHomeBlockVariant,
  "cards" | "default" | "strip"
>;
type CampaignsVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "featured"
>;
type FeaturedProductsVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "spotlight"
>;
type HowItWorksVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "timeline"
>;
type ProductRecommendationsVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "editorial"
>;
type TestimonialsVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "spotlight"
>;
type NewsletterVariant = Extract<
  StorefrontHomeBlockVariant,
  "default" | "inline" | "minimal"
>;
type RichTextCtaVariant = Extract<
  StorefrontHomeBlockVariant,
  "centered" | "default" | "split"
>;

const heroVariant = (variant: StorefrontHomeBlock["variant"]): HeroVariant =>
  variant === "editorial" || variant === "fullscreen" ? variant : "default";

const assistantVariant = (
  variant: StorefrontHomeBlock["variant"],
): AssistantVariant =>
  variant === "compact" || variant === "panel" ? variant : "default";

const trustGridVariant = (
  variant: StorefrontHomeBlock["variant"],
): TrustGridVariant =>
  variant === "cards" || variant === "strip" ? variant : "default";

const campaignsVariant = (
  variant: StorefrontHomeBlock["variant"],
): CampaignsVariant =>
  variant === "compact" || variant === "featured" ? variant : "default";

const featuredProductsVariant = (
  variant: StorefrontHomeBlock["variant"],
): FeaturedProductsVariant =>
  variant === "compact" || variant === "spotlight" ? variant : "default";

const howItWorksVariant = (
  variant: StorefrontHomeBlock["variant"],
): HowItWorksVariant =>
  variant === "compact" || variant === "timeline" ? variant : "default";

const productRecommendationsVariant = (
  variant: StorefrontHomeBlock["variant"],
): ProductRecommendationsVariant =>
  variant === "compact" || variant === "editorial" ? variant : "default";

const testimonialsVariant = (
  variant: StorefrontHomeBlock["variant"],
): TestimonialsVariant =>
  variant === "compact" || variant === "spotlight" ? variant : "default";

const newsletterVariant = (
  variant: StorefrontHomeBlock["variant"],
): NewsletterVariant =>
  variant === "inline" || variant === "minimal" ? variant : "default";

const richTextCtaVariant = (
  variant: StorefrontHomeBlock["variant"],
): RichTextCtaVariant =>
  variant === "centered" || variant === "split" ? variant : "default";

interface StorefrontHomeBlockRendererProps {
  campaignsAd?: string;
  featuredProducts?: CardProduct[];
  googleReviews?: GoogleReview[];
  heroCards?: HeroCard[];
  lng: string;
  block: StorefrontHomeBlock;
  buttonStyle?: StorefrontButtonStyle;
  popularProducts?: CardProduct[];
}

export const storefrontHomeBlockCanRender = ({
  block,
  campaignsAd,
  googleReviews,
  popularProducts,
}: Pick<
  StorefrontHomeBlockRendererProps,
  "block" | "campaignsAd" | "googleReviews" | "popularProducts"
>) => {
  if (!block.enabled) {
    return false;
  }

  if (block.type === "campaigns") {
    return Boolean(campaignsAd);
  }

  if (block.type === "popular-products") {
    return !isEmpty(popularProducts);
  }

  if (block.type === "testimonials") {
    return Boolean(googleReviews && googleReviews.length > 0);
  }

  return true;
};

export function StorefrontHomeBlockRenderer({
  block,
  buttonStyle = "solid",
  campaignsAd,
  featuredProducts,
  googleReviews,
  heroCards,
  lng,
  popularProducts,
}: StorefrontHomeBlockRendererProps) {
  const { t } = useT();

  if (!block.enabled) {
    return null;
  }

  switch (block.type) {
    case "hero":
      return (
        <StoreLandingHero
          heroCards={heroCards}
          lng={lng}
          buttonStyle={buttonStyle}
          variant={heroVariant(block.variant)}
          labels={{
            fallbackTitle: t("store.home.hero.fallbackTitle", {
              defaultValue:
                "Print work that looks premium before it reaches the press",
              lng,
            }),
            fallbackDescription: t("store.home.hero.fallbackDescription", {
              defaultValue:
                "Upload, proof, produce and ship in one clean flow - with real materials, clear pricing and tracked delivery.",
              lng,
            }),
            primaryCtaLabel: t("store.navigation.allProducts", {
              defaultValue: "All products",
              lng,
            }),
            secondaryCtaLabel: t("store.home.hero.secondaryCta", {
              defaultValue: "Browse all products",
              lng,
            }),
            prevLabel: t("store.home.hero.prev", {
              defaultValue: "Previous slide",
              lng,
            }),
            nextLabel: t("store.home.hero.next", {
              defaultValue: "Next slide",
              lng,
            }),
          }}
        />
      );
    case "assistant": {
      const assistantLayout = assistantVariant(block.variant);

      if (assistantLayout === "compact") {
        return (
          <Box maxW="3xl" mx="auto">
            <StorefrontAssistantHero buttonStyle={buttonStyle} />
          </Box>
        );
      }

      if (assistantLayout === "panel") {
        return (
          <Box
            bg="bg.panel"
            border="1px solid"
            borderColor="border.muted"
            borderRadius={storefrontRadiusCssVar.block}
            boxShadow="0 20px 70px rgba(15, 23, 42, 0.1)"
            p={[5, 8, 10]}
          >
            <StorefrontAssistantHero buttonStyle={buttonStyle} />
          </Box>
        );
      }

      return <StorefrontAssistantHero buttonStyle={buttonStyle} />;
    }
    case "trust-grid":
      return (
        <StoreTrustGrid
          description={
            getBlockText(block, lng, "subtitle") ??
            getBlockText(block, lng, "body")
          }
          lng={lng}
          title={getBlockText(block, lng, "title")}
          variant={trustGridVariant(block.variant)}
        />
      );
    case "campaigns": {
      const promotionsLayout = campaignsVariant(block.variant);

      return campaignsAd ? (
        <Box
          bg={promotionsLayout === "featured" ? "bg.subtle" : undefined}
          border={promotionsLayout === "featured" ? "1px solid" : undefined}
          borderColor={
            promotionsLayout === "featured" ? "border.muted" : undefined
          }
          borderRadius={
            promotionsLayout === "compact"
              ? storefrontRadiusCssVar.block
              : promotionsLayout === "featured"
                ? storefrontRadiusCssVar.block
                : undefined
          }
          overflow="hidden"
          p={
            promotionsLayout === "compact"
              ? [2, 3]
              : promotionsLayout === "featured"
                ? [3, 5]
                : undefined
          }
        >
          <CampaignsAdClient
            buttonStyle={buttonStyle}
            campaigns={campaignsAd}
            lng={lng}
          />
        </Box>
      ) : null;
    }
    case "featured-products":
      return (
        <Featured
          description={
            getBlockText(block, lng, "subtitle") ??
            getBlockText(block, lng, "body")
          }
          featuredProducts={featuredProducts}
          lng={lng}
          title={getBlockText(block, lng, "title")}
          variant={featuredProductsVariant(block.variant)}
        />
      );
    case "how-it-works":
      return (
        <HowItWorks
          description={
            getBlockText(block, lng, "subtitle") ??
            getBlockText(block, lng, "body")
          }
          lng={lng}
          title={getBlockText(block, lng, "title")}
          variant={howItWorksVariant(block.variant)}
        />
      );
    case "popular-products":
      return !isEmpty(popularProducts) ? (
        <ProductRecommendations
          products={popularProducts ?? []}
          analytics={analytics}
          variant={productRecommendationsVariant(block.variant)}
          title={
            getBlockText(block, lng, "title") ??
            t("store.home.popular", {
              defaultValue: "Most often chosen",
              lng,
            })
          }
          description={
            getBlockText(block, lng, "subtitle") ??
            getBlockText(block, lng, "body") ??
            t("store.home.popularDescription", {
              defaultValue:
                "The formats customers reorder most when they need dependable results fast.",
              lng,
            })
          }
          eyebrow={t("store.home.popularEyebrow", {
            defaultValue: "Repeat favorites",
            lng,
          })}
          itemListId={"popular"}
          itemListName={t("store.home.popular", {
            defaultValue: "Most often chosen",
            lng,
          })}
          lng={lng}
        />
      ) : null;
    case "testimonials":
      return googleReviews && googleReviews.length > 0 ? (
        <Testimonials
          buttonStyle={buttonStyle}
          description={
            getBlockText(block, lng, "subtitle") ??
            getBlockText(block, lng, "body")
          }
          reviews={googleReviews}
          lng={lng}
          title={getBlockText(block, lng, "title")}
          variant={testimonialsVariant(block.variant)}
        />
      ) : null;
    case "newsletter":
      return (
        <Newsletter
          buttonStyle={buttonStyle}
          buttonLabel={getBlockText(block, lng, "ctaLabel")}
          description={getBlockText(block, lng, "subtitle")}
          disclaimer={getBlockText(block, lng, "body")}
          title={getBlockText(block, lng, "title")}
          variant={newsletterVariant(block.variant)}
        />
      );
    case "rich-text-cta": {
      const title = getBlockText(block, lng, "title");
      const body = getBlockText(block, lng, "body");
      const ctaLabel = getBlockText(block, lng, "ctaLabel");
      const layout = richTextCtaVariant(block.variant);
      const hasMedia = Boolean(block.imageUrl);

      return (
        <Box
          borderWidth="1px"
          borderColor={{ base: "gray.200", _dark: "gray.700" }}
          borderRadius={storefrontRadiusCssVar.block}
          bg={layout === "centered" ? "bg.subtle" : undefined}
          p={layout === "centered" ? [6, 8, 10] : [5, 6, 8]}
        >
          <Grid
            templateColumns={{
              base: "1fr",
              lg: hasMedia
                ? "minmax(0, 0.85fr) minmax(0, 1.15fr)"
                : layout === "split"
                  ? "minmax(0, 0.8fr) minmax(0, 1.2fr)"
                  : "1fr",
            }}
            gap={[4, 6, 8]}
            alignItems="center"
          >
            <VStack
              align={layout === "centered" ? "center" : "start"}
              gap={3}
              textAlign={layout === "centered" ? "center" : "start"}
              maxW={layout === "centered" ? "3xl" : undefined}
              mx={layout === "centered" ? "auto" : undefined}
            >
              {title && (
                <Box fontSize={["xl", "2xl"]} fontWeight="semibold">
                  {title}
                </Box>
              )}
              {(layout !== "split" || hasMedia) && body ? (
                <Box color="fg.muted">{body}</Box>
              ) : null}
              {(layout !== "split" || hasMedia) && block.ctaHref && ctaLabel ? (
                <Button
                  asChild
                  borderRadius={storefrontRadiusCssVar.button}
                  colorPalette="primary"
                  variant={buttonStyle}
                >
                  <a href={block.ctaHref}>{ctaLabel}</a>
                </Button>
              ) : null}
            </VStack>
            {hasMedia && block.imageUrl ? (
              <Box
                borderRadius={storefrontRadiusCssVar.media}
                overflow="hidden"
              >
                <Image
                  alt={title ?? ""}
                  objectFit="cover"
                  priority={false}
                  ratio={16 / 9}
                  height={540}
                  src={block.imageUrl}
                  w="full"
                  width={960}
                />
              </Box>
            ) : layout === "split" ? (
              <VStack align="start" gap={4}>
                {body ? <Box color="fg.muted">{body}</Box> : null}
                {block.ctaHref && ctaLabel ? (
                  <Button
                    asChild
                    borderRadius={storefrontRadiusCssVar.button}
                    colorPalette="primary"
                    variant={buttonStyle}
                  >
                    <a href={block.ctaHref}>{ctaLabel}</a>
                  </Button>
                ) : null}
              </VStack>
            ) : null}
          </Grid>
        </Box>
      );
    }
    default:
      return null;
  }
}
