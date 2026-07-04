"use client";

import { useT } from "@/i18n/client";
import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import {
  Box,
  Card,
  Carousel,
  Em,
  Grid,
  Heading,
  HStack,
  IconButton,
  RatingGroup,
  Text,
  useBreakpointValue,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, Tooltip } from "@konfi/components";
import { GoogleReview } from "@konfi/google";
import type {
  StorefrontButtonStyle,
  StorefrontHomeBlockVariant,
} from "@konfi/types";

type TestimonialsVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "spotlight"
>;

interface Props {
  buttonStyle?: StorefrontButtonStyle;
  description?: string;
  reviews: GoogleReview[];
  lng: string;
  title?: string;
  variant?: TestimonialsVariant;
}

export function Testimonials({
  buttonStyle = "outline",
  description,
  reviews,
  lng,
  title,
  variant = "default",
}: Props) {
  const { t } = useT();
  const isCompact = variant === "compact";
  const isSpotlight = variant === "spotlight";
  const slidesPerPage =
    useBreakpointValue(
      { base: 1, md: isCompact ? 3 : 2 },
      { fallback: "base" },
    ) ?? 1;

  return (
    <Box
      as="section"
      w="full"
      maxW="full"
      overflow="hidden"
      bg={isSpotlight ? "bg.subtle" : undefined}
      borderRadius={isSpotlight ? storefrontRadiusCssVar.block : undefined}
      p={isSpotlight ? [5, 8, 10] : undefined}
    >
      <Grid
        templateColumns={{
          base: "1fr",
          xl: isCompact ? "1fr" : "minmax(280px, 0.78fr) minmax(0, 1.22fr)",
        }}
        gap={isCompact ? [5, 6] : [8, 10]}
        alignItems="start"
        w="full"
        maxW="full"
        minW={0}
      >
        <VStack
          align={isCompact ? "center" : "start"}
          gap={isCompact ? 3 : 4}
          maxW={isCompact ? "3xl" : "lg"}
          textAlign={isCompact ? "center" : "start"}
          mx={isCompact ? "auto" : undefined}
        >
          <Text
            fontSize="xs"
            letterSpacing="0.26em"
            textTransform="uppercase"
            color="fg.muted"
            fontFamily="mono"
          >
            {t("store.home.testimonials.eyebrow", {
              defaultValue: "Google reviews",
              lng,
            })}
          </Text>
          <Heading as="h2" size={{ base: "2xl", md: "3xl" }} textWrap="balance">
            {title ??
              t("store.home.testimonials.title", {
                defaultValue: "What our customers say",
                lng,
              })}
          </Heading>
          <Text
            fontSize={{ base: "md", md: isCompact ? "md" : "lg" }}
            color="fg.muted"
          >
            {description ??
              t("store.home.testimonials.description", {
                defaultValue:
                  "Real feedback from customers who ordered, uploaded and received finished print.",
                lng,
              })}
          </Text>
        </VStack>

        <VStack align="stretch" gap={4} w="full" maxW="full" minW={0}>
          <Carousel.Root
            autoplay={{ delay: 5000 }}
            slideCount={reviews.length}
            slidesPerPage={slidesPerPage}
            gap={[4, 6]}
            loop
            w="full"
            maxW="full"
            minW={0}
          >
            <Carousel.ItemGroup w="full" maxW="full" minW={0}>
              {reviews.map((review, index) => (
                <Carousel.Item key={index} index={index} minW={0}>
                  <Card.Root
                    variant={isSpotlight ? "elevated" : "subtle"}
                    h="full"
                    minW={0}
                    borderRadius={storefrontRadiusCssVar.card}
                  >
                    <Card.Body gap={isCompact ? 3 : 4}>
                      <RatingGroup.Root
                        colorPalette={"primary"}
                        count={5}
                        defaultValue={5}
                        size="sm"
                      >
                        <RatingGroup.HiddenInput />
                        <RatingGroup.Control />
                      </RatingGroup.Root>
                      <Tooltip
                        content={review.text}
                        showArrow={true}
                        disabled={review.text.length <= 100}
                      >
                        <Card.Description lineClamp={isCompact ? 3 : 5}>
                          <Em>{review.text}</Em>
                        </Card.Description>
                      </Tooltip>
                      <Card.Footer p={0}>
                        <VStack align={"start"} gap={0}>
                          <Text fontWeight={"semibold"} fontSize={"sm"}>
                            {review.authorName}
                          </Text>
                          {review.relativePublishTimeDescription && (
                            <Text fontSize={"xs"} color={"fg.muted"}>
                              {review.relativePublishTimeDescription}
                            </Text>
                          )}
                        </VStack>
                      </Card.Footer>
                    </Card.Body>
                  </Card.Root>
                </Carousel.Item>
              ))}
            </Carousel.ItemGroup>

            <HStack justify={"flex-end"} mt={4} gap={2}>
              <Carousel.PrevTrigger asChild>
                <IconButton
                  size={"sm"}
                  variant={buttonStyle}
                  borderRadius={storefrontRadiusCssVar.button}
                  aria-label={t("store.home.testimonials.prev", {
                    defaultValue: "Previous review",
                    lng,
                  })}
                >
                  <MaterialSymbol>chevron_left</MaterialSymbol>
                </IconButton>
              </Carousel.PrevTrigger>
              <Carousel.NextTrigger asChild>
                <IconButton
                  size={"sm"}
                  variant={buttonStyle}
                  borderRadius={storefrontRadiusCssVar.button}
                  aria-label={t("store.home.testimonials.next", {
                    defaultValue: "Next review",
                    lng,
                  })}
                >
                  <MaterialSymbol>chevron_right</MaterialSymbol>
                </IconButton>
              </Carousel.NextTrigger>
            </HStack>
          </Carousel.Root>
        </VStack>
      </Grid>
    </Box>
  );
}
