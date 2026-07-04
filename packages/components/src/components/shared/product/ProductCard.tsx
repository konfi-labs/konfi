"use client";

import {
  Badge,
  Box,
  chakra,
  Portal,
  SimpleGrid,
  useBreakpointValue,
} from "@chakra-ui/react";
import { CardProduct } from "@konfi/types";
import { STORE_PRODUCTS } from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { Analytics } from "firebase/analytics";
import { TFunction } from "i18next";
import React, { useRef, useState } from "react";
import { themeGradients } from "../../../theme/gradients";
import { Image } from "../Image";
import { LinkOverlay } from "../LinkOverlay";

interface Props {
  cardProduct: CardProduct;
  ratio?: number | number[];
  analytics?: Analytics;
  prioritizeImage?: boolean;
  t: TFunction;
  lng: string;
}

const storefrontCardRadius =
  "var(--konfi-store-card-radius, var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-3xl))))";
const storefrontMediaRadius =
  "var(--konfi-store-media-radius, var(--konfi-store-card-radius, var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-3xl)))))";

function getProductImageUrl({
  imageFile,
  cardProduct,
  width,
  height,
  fit = "crop",
  auto = "format,compress",
}: {
  imageFile: string;
  cardProduct: CardProduct;
  width?: number;
  height?: number;
  fit?: string;
  auto?: string;
}) {
  const channelId =
    cardProduct.channelId || process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;
  let url = `https://${process.env.NEXT_PUBLIC_CDN_URL}/channels/${channelId}/products/${cardProduct.id}/${imageFile}?fit=${fit}&auto=${auto}`;
  if (width) url += `&w=${width}`;
  if (height) url += `&h=${height}`;
  return url.replaceAll(" ", "%20");
}

export const ProductCard = ({
  cardProduct,
  ratio,
  analytics,
  prioritizeImage = false,
  t,
  lng,
}: Props) => {
  "use memo";

  const globalHoverZRef = useRef<number>(100);
  const rafRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [shouldElevate, setShouldElevate] = useState(false);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [overlayRotateX, setOverlayRotateX] = useState(0);
  const [overlayRotateY, setOverlayRotateY] = useState(0);
  const [zIndex, setZIndex] = useState<number>(1);

  const [overlayPos, setOverlayPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  // Disable all perspective / 3D tilt effects on mobile (base -> below md)
  const enableTilt = useBreakpointValue({ base: false, md: true }) ?? false;
  const updateOverlayPosition = React.useCallback(() => {
    if (!cardRef.current || typeof window === "undefined") return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();

      const cols = Math.min(cardProduct.images.length, 4);
      const thumbSize = 80;
      const gap = 8;
      const padding = 24;
      const estimatedOverlayWidth =
        cols * thumbSize + (cols - 1) * gap + padding;
      const estimatedOverlayHeight = thumbSize + padding;

      const leftCenter = rect.left + rect.width / 2;
      const halfWidth = estimatedOverlayWidth / 2;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      const left = Math.max(
        8 + halfWidth,
        Math.min(viewportW - 8 - halfWidth, leftCenter),
      );

      const belowTop = rect.bottom + 8;
      const aboveTop = Math.max(8, rect.top - 8 - estimatedOverlayHeight);
      const top =
        belowTop + estimatedOverlayHeight > viewportH ? aboveTop : belowTop;

      setOverlayPos({ left, top });
      rafRef.current = null;
    });
  }, [cardProduct.images.length]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enableTilt || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const cardCenterX = rect.width / 2;
    const cardCenterY = rect.height / 2;

    const mouseX = e.clientX - rect.left - cardCenterX;
    const mouseY = e.clientY - rect.top - cardCenterY;

    const normalizedX = Math.max(-1, Math.min(1, mouseX / cardCenterX));
    const normalizedY = Math.max(-1, Math.min(1, mouseY / cardCenterY));

    const maxRotation = 12;
    const rotateXValue = -(normalizedY * maxRotation);
    const rotateYValue = normalizedX * maxRotation;

    setRotateX(rotateXValue);
    setRotateY(rotateYValue);

    const OVERLAY_TILT_FACTOR = 0.66;
    setOverlayRotateX(rotateXValue * OVERLAY_TILT_FACTOR);
    setOverlayRotateY(rotateYValue * OVERLAY_TILT_FACTOR);

    updateOverlayPosition();
  };

  const handleMouseEnter = () => {
    if (!enableTilt) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsFadingOut(false);
    setIsHovered(true);
    setShouldElevate(true);
    globalHoverZRef.current += 1;
    setZIndex(globalHoverZRef.current);
    updateOverlayPosition();
    updateOverlayPosition();
  };

  const beginFadeOut = () => {
    setIsHovered(false);
    setRotateX(0);
    setRotateY(0);
    setIsFadingOut(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShouldElevate(false);
      setIsFadingOut(false);
      setZIndex(1);
      setOverlayRotateX(0);
      setOverlayRotateY(0);
      timeoutRef.current = null;
    }, 240);
  };

  const handleMouseLeave = () => {
    if (!enableTilt) return;
    setRotateX(0);
    setRotateY(0);
    beginFadeOut();
  };

  const handleThumbnailClick = (index: number) => {
    setSelectedImageIndex(index);
  };

  React.useEffect(() => {
    if (!enableTilt) return; // skip listeners entirely on mobile
    if (!window || !cardRef.current) return;
    if (isHovered || isFadingOut) {
      updateOverlayPosition();
      window.addEventListener("scroll", updateOverlayPosition, true);
      window.addEventListener("resize", updateOverlayPosition);
      return () => {
        window.removeEventListener("scroll", updateOverlayPosition, true);
        window.removeEventListener("resize", updateOverlayPosition);
      };
    }
  }, [enableTilt, isHovered, isFadingOut, updateOverlayPosition]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    if (selectedImageIndex >= cardProduct.images.length) {
      setSelectedImageIndex(0);
    }
  }, [cardProduct.images.length, selectedImageIndex]);

  React.useEffect(() => {
    if (!isHovered) {
      setRotateX(0);
      setRotateY(0);
    }
  }, [isHovered]);

  // Ensure rotations are zeroed when tilt disabled (e.g., on resize from desktop -> mobile)
  React.useEffect(() => {
    if (!enableTilt) {
      setRotateX(0);
      setRotateY(0);
      setOverlayRotateX(0);
      setOverlayRotateY(0);
    }
  }, [enableTilt]);

  return (
    <>
      {/* Base card content */}
      <Box
        ref={cardRef}
        position={"relative"}
        role={"group"}
        borderRadius={storefrontCardRadius}
        transition={"transform 0.1s ease-out"}
        cursor={"pointer"}
        h={"100%"}
        zIndex={zIndex}
        onMouseEnter={enableTilt ? handleMouseEnter : undefined}
        onMouseMove={enableTilt ? handleMouseMove : undefined}
        onMouseLeave={enableTilt ? handleMouseLeave : undefined}
        style={{
          perspective: enableTilt ? "600px" : undefined,
          perspectiveOrigin: enableTilt ? "50% 50%" : undefined,
          transform: enableTilt
            ? `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
            : "none",
          transformStyle: enableTilt ? "preserve-3d" : undefined,
          isolation: shouldElevate ? "isolate" : "auto",
        }}
        _hover={{
          transform: enableTilt
            ? `translateY(-5px) scale(1.02) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
            : undefined,
          boxShadow: enableTilt ? "0 0 0 3px rgba(0, 102, 255, .3)" : undefined,
        }}
        _active={{
          transform: enableTilt
            ? `scale(0.96) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
            : undefined,
        }}
        animationName="fade-in"
        animationDuration="0.4s"
        animationTimingFunction="ease-out"
      >
        <BaseCard
          cardProduct={cardProduct}
          ratio={ratio}
          analytics={analytics}
          prioritizeImage={prioritizeImage}
          selectedImageIndex={selectedImageIndex}
          t={t}
          lng={lng}
        />

        {enableTilt &&
          isMounted &&
          cardProduct.images.length > 1 &&
          (isHovered || isFadingOut) && (
            <Portal>
              <Box
                position="fixed"
                left={overlayPos ? `${overlayPos.left}px` : "0px"}
                top={overlayPos ? `${overlayPos.top}px` : "0px"}
                transform={overlayPos ? "translateX(-50%)" : "none"}
                pointerEvents={"auto"}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                  }
                  setIsFadingOut(false);
                  setIsHovered(true);
                  setShouldElevate(true);
                  setRotateX(0);
                  setRotateY(0);
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  beginFadeOut();
                }}
                zIndex={1500}
                style={{
                  isolation: "isolate",
                }}
              >
                <Box
                  borderRadius={storefrontCardRadius}
                  boxShadow="0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                  border="1px solid"
                  p={3}
                  borderColor={{
                    base: "whiteAlpha.500",
                    _dark: "whiteAlpha.200",
                  }}
                  backgroundColor={"transparent"}
                  backdropFilter={"saturate(125%) blur(40px)"}
                  opacity={isHovered ? 1 : 0}
                  style={
                    enableTilt
                      ? {
                          transform: `perspective(600px) rotateX(${overlayRotateX}deg) rotateY(${overlayRotateY}deg)`,
                          transformOrigin: "top center",
                          willChange: "transform, opacity",
                        }
                      : undefined
                  }
                  transition={"opacity 0.2s ease-out, transform 0.2s ease-out"}
                >
                  <SimpleGrid
                    columns={Math.min(cardProduct.images.length, 4)}
                    gap={2}
                    justifyItems="center"
                    w="100%"
                  >
                    {cardProduct.images.slice(0, 4).map((imageFile, index) => {
                      const thumbnailSrc = getProductImageUrl({
                        imageFile,
                        cardProduct,
                        width: 80,
                        height: 80,
                      });
                      return (
                        <Box
                          key={index}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleThumbnailClick(index);
                          }}
                          cursor="pointer"
                          border={
                            selectedImageIndex === index
                              ? "2px solid"
                              : "2px solid"
                          }
                          borderColor={
                            selectedImageIndex === index
                              ? "primary.200"
                              : "transparent"
                          }
                          borderRadius={storefrontMediaRadius}
                          overflow="hidden"
                          transition="transform 0.2s ease-out, border-color 0.2s ease-out"
                          _hover={{
                            transform: "scale(1.05)",
                          }}
                          bg={{ base: "white", _dark: "gray.800" }}
                        >
                          <Image
                            src={thumbnailSrc}
                            alt={`${cardProduct.name} ${index + 1}`}
                            width={80}
                            height={80}
                            ratio={[1, 1]}
                            priority={false}
                            transparentBackground={false}
                            objectFit="contain"
                          />
                        </Box>
                      );
                    })}
                  </SimpleGrid>
                </Box>
              </Box>
            </Portal>
          )}
      </Box>
    </>
  );
};

interface BaseCardProps {
  cardProduct: CardProduct;
  ratio?: number | number[];
  analytics?: Analytics;
  prioritizeImage: boolean;
  selectedImageIndex: number;
  t: TFunction;
  lng: string;
}

function BaseCard({
  cardProduct,
  ratio,
  analytics,
  prioritizeImage,
  selectedImageIndex,
  t,
  lng,
}: BaseCardProps) {
  "use memo";

  const selectedImage =
    cardProduct.images[selectedImageIndex] || cardProduct.images[0];

  return (
    <LinkOverlay
      lng={lng}
      onClick={async () => {
        if (isUndefined(analytics)) return;

        const logEvent = (await import("firebase/analytics")).logEvent;
        logEvent(analytics, "select_content", {
          content_type: "produkt",
          content_id: cardProduct.id,
        });
      }}
      href={
        cardProduct?.slug?.startsWith("/")
          ? cardProduct.slug
          : `${STORE_PRODUCTS}/${cardProduct?.slug}`
      }
      rel={"canonical"}
    >
      <Box
        position={"relative"}
        borderRadius={storefrontCardRadius}
        overflow={"hidden"}
        border={"1px solid"}
        borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
        transition={"box-shadow 0.15s ease-out, border-color 0.15s ease-out"}
      >
        {(() => {
          const baseWidth = 400;
          const r = Array.isArray(ratio) ? ratio[0] || 2 : ratio || 2;
          const computedHeight = Math.max(
            1,
            Math.round(baseWidth / (typeof r === "number" && r > 0 ? r : 2)),
          );

          const src = selectedImage
            ? getProductImageUrl({
                imageFile: selectedImage,
                cardProduct,
              })
            : "/assets/empty.avif";

          return (
            <Image
              ratio={ratio ? ratio : [2, 1]}
              width={baseWidth}
              height={computedHeight}
              src={src}
              alt={cardProduct.name}
              priority={false}
              fetchPriority={prioritizeImage ? "high" : undefined}
              transparentBackground={false}
              style={{ borderRadius: storefrontMediaRadius }}
            />
          );
        })()}

        {/* gradient overlay */}
        <Box
          position={"absolute"}
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={1}
          borderRadius={storefrontCardRadius}
          pointerEvents={"none"}
          bgImage={themeGradients.cardImageOverlay}
        />

        <chakra.header
          w={"100%"}
          zIndex={2}
          borderRadius={storefrontCardRadius}
          position={"absolute"}
          left={2}
          maxW={"calc(100% - 1rem)"}
          bottom={2}
          px={4}
          py={2}
          border={"1px solid"}
          borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
          backgroundColor={{ base: "whiteAlpha.700", _dark: "blackAlpha.700" }}
          backdropFilter={"saturate(125%) blur(40px)"}
        >
          <chakra.h1
            fontSize={["xl", "md"]}
            fontWeight={"600"}
            color={{ base: "black", _dark: "white" }}
            overflow={"hidden"}
            whiteSpace={"nowrap"}
            textOverflow={"ellipsis"}
          >
            {cardProduct.name}
          </chakra.h1>
          {cardProduct.startingFrom && (
            <Box>
              <Box
                color={{ base: "gray.500", _dark: "gray.400" }}
                fontSize={["sm", "xs"]}
                data-nosnippet
              >
                {t("productCard.from", { defaultValue: "From", lng })}{" "}
                {cardProduct.startingFrom.formattedPrice}/
                {t(`Unit.${cardProduct.startingFrom.unit}`, { lng })}
              </Box>
            </Box>
          )}
        </chakra.header>

        {(cardProduct.categoryName || cardProduct.isNew) && (
          <Box
            position={"absolute"}
            left={"4"}
            top={"4"}
            display={"flex"}
            gap={2}
          >
            {cardProduct.categoryName && (
              <Badge
                variant={"outline"}
                fontSize={["xs", "10px"]}
                bgColor={{ base: "white", _dark: "gray.800" }}
                color={{ base: "black", _dark: "white" }}
              >
                {cardProduct.categoryName}
              </Badge>
            )}
            {cardProduct.isNew && (
              <Badge
                fontSize={["xs", "10px"]}
                bgColor={"green.500"}
                color={"white"}
              >
                {t("productCard.new", { defaultValue: "New", lng })}
              </Badge>
            )}
          </Box>
        )}
      </Box>
    </LinkOverlay>
  );
}
