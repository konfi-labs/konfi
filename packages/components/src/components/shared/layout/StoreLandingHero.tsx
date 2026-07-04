"use client";

import {
  Box,
  Container,
  Grid,
  Heading,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import type {
  HeroCard,
  StorefrontButtonStyle,
  StorefrontHomeBlockVariant,
} from "@konfi/types";
import NextImage from "next/image";
import { useEffect, useMemo, useState } from "react";
import { themeGradients } from "../../../theme/gradients";
import { ButtonLink } from "../ButtonLink";
import { MaterialSymbol } from "../MaterialSymbol";

export interface StoreLandingHeroLabels {
  fallbackTitle?: string;
  fallbackDescription?: string;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
}

type StoreLandingHeroVariant = Extract<
  StorefrontHomeBlockVariant,
  "default" | "editorial" | "fullscreen"
>;

const storefrontBlockRadius =
  "var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-none)))";
const storefrontButtonRadius =
  "var(--konfi-store-button-radius, var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-full))))";
const storefrontMediaRadius =
  "var(--konfi-store-media-radius, var(--konfi-store-card-radius, var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-3xl)))))";
const storefrontHeroFallbackBackground = `var(--konfi-store-gradient, ${themeGradients.heroFallback})`;

function getHeroImageUrl(image?: string) {
  if (image?.startsWith("http://") || image?.startsWith("https://")) {
    return image;
  }

  if (image?.startsWith("/")) {
    return image;
  }

  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  const channelId = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;

  if (!image || !cdnUrl || !channelId) {
    return undefined;
  }

  return `https://${cdnUrl}/channels/${channelId}/cms/hero/${image}?fit=max&auto=format,compress`;
}

export function StoreLandingHero({
  buttonStyle = "solid",
  heroCards,
  lng,
  labels,
  variant = "default",
}: {
  buttonStyle?: StorefrontButtonStyle;
  heroCards?: HeroCard[];
  lng: string;
  labels?: StoreLandingHeroLabels;
  variant?: StoreLandingHeroVariant;
}) {
  const hasMultipleCards = !!heroCards?.length && heroCards.length > 1;
  const [page, setPage] = useState(0);
  const isFullscreen = variant === "fullscreen";
  const isEditorial = variant === "editorial";

  const fallbackTitle =
    labels?.fallbackTitle ??
    "Print work that looks premium before it reaches the press";
  const fallbackDescription =
    labels?.fallbackDescription ??
    "Upload, proof, produce and ship in one clean flow — with real materials, clear pricing and tracked delivery.";
  const fallbackCard = {
    title: fallbackTitle,
    subtitle: fallbackDescription,
  } as HeroCard;

  const cards: HeroCard[] = heroCards?.length ? heroCards : [fallbackCard];

  const activeCard = cards[page] ?? fallbackCard;
  const activeImageUrl = getHeroImageUrl(activeCard?.image);

  useEffect(() => {
    setPage((currentPage) =>
      currentPage >= cards.length ? Math.max(cards.length - 1, 0) : currentPage,
    );
  }, [cards.length]);

  useEffect(() => {
    if (!hasMultipleCards) {
      return;
    }

    const interval = window.setInterval(() => {
      setPage((currentPage) => (currentPage + 1) % cards.length);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [cards.length, hasMultipleCards]);

  return (
    <Box
      as="section"
      position="relative"
      overflow="hidden"
      bg={
        isFullscreen
          ? "gray.950"
          : isEditorial
            ? { base: "bg.panel", _dark: "gray.950" }
            : { base: "gray.50", _dark: "gray.900" }
      }
      color={isFullscreen ? "white" : undefined}
      borderRadius={isFullscreen ? undefined : storefrontBlockRadius}
      minH={
        isFullscreen ? "100svh" : { base: "calc(100svh - 3.5rem)", lg: "39rem" }
      }
      pt={isFullscreen ? [32, 36, 40] : [6, 8, 12]}
      pb={isFullscreen ? [16, 20, 24] : [10, 12, 16]}
    >
      {isFullscreen && activeImageUrl ? (
        <NextImage
          fill
          style={{ objectFit: "cover" }}
          src={activeImageUrl}
          alt=""
          fetchPriority="high"
          loading="eager"
          sizes="100vw"
        />
      ) : null}
      {isFullscreen ? (
        <Box
          aria-hidden="true"
          position="absolute"
          inset={0}
          bg="linear-gradient(90deg, rgba(3, 7, 18, 0.86), rgba(3, 7, 18, 0.48), rgba(3, 7, 18, 0.2))"
        />
      ) : null}
      <Box
        display={{ base: "none", lg: isFullscreen ? "none" : "block" }}
        position="absolute"
        top={0}
        right={0}
        bottom={0}
        w={isEditorial ? "44%" : "50%"}
        overflow="hidden"
        borderTopLeftRadius={isEditorial ? storefrontMediaRadius : 0}
        borderBottomLeftRadius={isEditorial ? storefrontMediaRadius : 0}
        my={isEditorial ? 8 : 0}
      >
        {activeImageUrl ? (
          <NextImage
            fill
            style={{ objectFit: "cover" }}
            src={activeImageUrl}
            alt={activeCard?.title || fallbackTitle}
            fetchPriority="high"
            loading="eager"
            sizes="50vw"
          />
        ) : (
          <VStack
            align="stretch"
            justify="end"
            h="100%"
            p={[6, 8, 10]}
            bg="gray.950"
            bgImage={storefrontHeroFallbackBackground}
          >
            <Heading size={{ base: "lg", md: "xl" }} maxW="sm">
              {fallbackTitle}
            </Heading>
          </VStack>
        )}
      </Box>

      <Container
        maxW="7xl"
        position="relative"
        minH={isFullscreen ? "calc(100svh - 14rem)" : undefined}
        display={isFullscreen ? "flex" : undefined}
        alignItems={isFullscreen ? "center" : undefined}
      >
        <Box
          aria-roledescription={hasMultipleCards ? "carousel" : undefined}
          role={hasMultipleCards ? "region" : undefined}
        >
          <HeroSlide
            key={`${activeCard.title}-${page}`}
            card={activeCard}
            fallbackTitle={fallbackTitle}
            fallbackDescription={fallbackDescription}
            hasMultipleCards={hasMultipleCards}
            lng={lng}
            buttonStyle={buttonStyle}
            labels={labels}
            onPageChange={setPage}
            page={page}
            slideCount={cards.length}
            variant={variant}
          />
        </Box>
      </Container>
    </Box>
  );
}

function HeroSlide({
  card,
  buttonStyle,
  fallbackTitle,
  fallbackDescription,
  hasMultipleCards,
  lng,
  labels,
  onPageChange,
  page,
  slideCount,
  variant,
}: {
  card: HeroCard;
  buttonStyle: StorefrontButtonStyle;
  fallbackTitle: string;
  fallbackDescription: string;
  hasMultipleCards: boolean;
  lng: string;
  labels?: StoreLandingHeroLabels;
  onPageChange: (page: number) => void;
  page: number;
  slideCount: number;
  variant: StoreLandingHeroVariant;
}) {
  const imageUrl = useMemo(() => getHeroImageUrl(card.image), [card.image]);
  const isFullscreen = variant === "fullscreen";
  const isEditorial = variant === "editorial";

  const title = card.title || fallbackTitle;
  const subtitle = card.subtitle || fallbackDescription;
  const primaryCtaLabel =
    labels?.primaryCtaLabel ?? card.buttonLabel ?? "All products";
  const secondaryCtaLabel = labels?.secondaryCtaLabel ?? "Browse all products";
  const prevLabel = labels?.prevLabel ?? "Previous slide";
  const nextLabel = labels?.nextLabel ?? "Next slide";
  const primaryCtaHref = card.buttonUrl || "/products";
  const previousPage = page === 0 ? slideCount - 1 : page - 1;
  const nextPage = page === slideCount - 1 ? 0 : page + 1;

  return (
    <Grid
      templateColumns={{
        base: "1fr",
        lg: isFullscreen
          ? "minmax(0, 0.72fr) minmax(0, 0.28fr)"
          : isEditorial
            ? "minmax(0, 0.58fr) minmax(0, 0.42fr)"
            : "minmax(0, 0.45fr) minmax(0, 0.55fr)",
      }}
      gap={[6, 8, 10]}
      alignItems="center"
      w="full"
    >
      <VStack
        align="start"
        gap={0}
        w="full"
        maxW={isFullscreen ? "3xl" : "2xl"}
        minH={
          isFullscreen
            ? { base: "auto", lg: "30rem", xl: "34rem" }
            : hasMultipleCards
              ? { base: "auto", lg: "28rem", xl: "32rem" }
              : undefined
        }
      >
        <VStack align="start" gap={[5, 6, 7]} w="full">
          <Heading
            as="h1"
            fontSize={
              isFullscreen
                ? { base: "5xl", md: "7xl", xl: "8xl" }
                : { base: "4xl", md: "6xl", xl: "7xl" }
            }
            lineHeight={{ base: "1.02", md: "0.98" }}
            letterSpacing="0"
            textWrap="balance"
          >
            {title}
          </Heading>

          <Text
            fontSize={{ base: "md", md: "lg", xl: "xl" }}
            maxW="xl"
            color={isFullscreen ? "whiteAlpha.850" : undefined}
          >
            {subtitle}
          </Text>

          <HStack gap={3} flexWrap="wrap">
            <ButtonLink
              lng={lng}
              href={primaryCtaHref}
              ariaLabel={primaryCtaLabel}
              size="lg"
              variant={buttonStyle}
              colorPalette="primary"
              px={6}
              bg={isFullscreen && buttonStyle === "solid" ? "white" : undefined}
              color={
                isFullscreen && buttonStyle === "solid" ? "gray.950" : undefined
              }
              borderRadius={storefrontButtonRadius}
              _hover={{
                transform: "translateY(-2px)",
              }}
              transitionProperty="transform, box-shadow"
              transitionDuration="fast"
            >
              <HStack gap={2}>
                <span>{primaryCtaLabel}</span>
                <MaterialSymbol aria-hidden="true">
                  arrow_outward
                </MaterialSymbol>
              </HStack>
            </ButtonLink>

            <ButtonLink
              lng={lng}
              href="/products"
              ariaLabel={secondaryCtaLabel}
              size="lg"
              colorPalette="primary"
              variant={
                buttonStyle === "solid"
                  ? isFullscreen
                    ? "outline"
                    : "surface"
                  : buttonStyle
              }
              px={6}
              borderRadius={storefrontButtonRadius}
              borderColor={isFullscreen ? "whiteAlpha.600" : undefined}
              color={isFullscreen ? "white" : undefined}
            >
              {secondaryCtaLabel}
            </ButtonLink>
          </HStack>
        </VStack>

        {hasMultipleCards && (
          <HStack gap={3} mt="auto" pt={[8, 10, 12]}>
            <IconButton
              size="sm"
              variant="ghost"
              borderRadius={storefrontButtonRadius}
              aria-label={prevLabel}
              onClick={() => onPageChange(previousPage)}
            >
              <MaterialSymbol>chevron_left</MaterialSymbol>
            </IconButton>

            <HStack
              gap={2}
              role="group"
              aria-label={`${page + 1} / ${slideCount}`}
            >
              {Array.from({ length: slideCount }, (_, slideIndex) => {
                const active = slideIndex === page;

                return (
                  <Box
                    key={slideIndex}
                    aria-current={active ? "true" : undefined}
                    aria-label={`${slideIndex + 1} / ${slideCount}`}
                    as="button"
                    alignItems="center"
                    display="inline-flex"
                    h="4"
                    justifyContent="center"
                    w="7"
                    onClick={() => onPageChange(slideIndex)}
                  >
                    <Box
                      as="span"
                      bg={active ? "primary.solid" : "fg.muted"}
                      borderRadius={storefrontButtonRadius}
                      h="2.5"
                      opacity={active ? 1 : 0.4}
                      w={active ? "7" : "2.5"}
                    />
                  </Box>
                );
              })}
            </HStack>

            <IconButton
              size="sm"
              variant="ghost"
              borderRadius={storefrontButtonRadius}
              aria-label={nextLabel}
              onClick={() => onPageChange(nextPage)}
            >
              <MaterialSymbol>chevron_right</MaterialSymbol>
            </IconButton>
          </HStack>
        )}
      </VStack>

      <Box
        display={{ base: isFullscreen ? "none" : "block", lg: "none" }}
        position="relative"
        minH={[300, 400]}
        overflow="hidden"
        borderRadius={storefrontMediaRadius}
      >
        {imageUrl ? (
          <NextImage
            fill
            style={{ objectFit: "cover" }}
            src={imageUrl}
            alt={title}
            fetchPriority="high"
            loading="eager"
            sizes="(min-width: 1024px) 0px, 100vw"
          />
        ) : (
          <VStack
            align="stretch"
            justify="end"
            h="100%"
            minH={[300, 400]}
            p={[6, 8]}
            bg="gray.950"
            bgImage={storefrontHeroFallbackBackground}
          >
            <Heading size={{ base: "lg", md: "xl" }} maxW="sm">
              {fallbackTitle}
            </Heading>
          </VStack>
        )}
      </Box>
    </Grid>
  );
}
