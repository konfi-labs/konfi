"use client";

import { useT } from "@/i18n/client";
import {
  Box,
  Float,
  HoverCard,
  HStack,
  IconButton,
  Portal,
  Stack,
  Status,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { AdvancedMarker } from "@vis.gl/react-google-maps";
import * as React from "react";

type LatLngLiteral = { lat: number; lng: number; };

export interface CustomAdvancedMarkerProps {
  position: LatLngLiteral;
  title?: string;
  icon?: string; // material symbol name
  colorPalette?: "primary" | "orange" | "green" | "red" | "gray";
  size?: "sm" | "md" | "lg";
  showCardOnClick?: boolean;
  label?: string;
  description?: string;
  children?: React.ReactNode; // extra content inside card
  // Optional floating status indicator
  statusColorPalette?: "primary" | "orange" | "green" | "red" | "gray";
  statusPlacement?: "top-start" | "top-end" | "bottom-start" | "bottom-end";
  zIndex?: number;
}

const SIZE_PX: Record<
  NonNullable<CustomAdvancedMarkerProps["size"]>,
  number
> = {
  sm: 28,
  md: 36,
  lg: 44,
};

export function CustomAdvancedMarker(props: CustomAdvancedMarkerProps) {
  const { t } = useT();
  const {
    position,
    title,
    icon = "location_on",
    colorPalette = "primary",
    size = "md",
    showCardOnClick = true,
    label,
    description,
    children,
    statusColorPalette,
    statusPlacement = "bottom-end",
    zIndex,
  } = props;

  const [clicked, setClicked] = React.useState(false);
  const [hoverCardOpen, setHoverCardOpen] = React.useState(false);

  const base = SIZE_PX[size];
  const circleSize = base;

  const bg = "colorPalette.solid";
  const markerFallback = t("logistics.marker", { defaultValue: "Marker" });

  const hasInlineContent = Boolean(label || description || children);
  const showInlineLabel = hasInlineContent && !clicked;
  const inlineOpen = hoverCardOpen && showInlineLabel;
  const shouldElevate = hoverCardOpen || clicked;
  const markerZIndexValue = shouldElevate
    ? typeof zIndex === "number"
      ? Math.max(zIndex, 1000)
      : 1000
    : zIndex;
  const inlineLabelZIndex =
    typeof markerZIndexValue === "number" ? markerZIndexValue + 1 : 1001;

  const handleMouseEnter = React.useCallback(() => {
    if (!showInlineLabel) return;
    setHoverCardOpen(true);
  }, [showInlineLabel]);

  const handleMouseLeave = React.useCallback(() => {
    if (clicked) return;
    setHoverCardOpen(false);
  }, [clicked]);

  const renderPin = () => (
    <Box
      position="relative"
      transformOrigin="bottom center"
      colorPalette={colorPalette}
    >
      {/* Circle icon */}
      <Box
        w={`${circleSize}px`}
        h={`${circleSize}px`}
        borderRadius="full"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg={bg}
        color="white"
        boxShadow="md"
        transition="transform 0.15s ease, box-shadow 0.15s ease"
        transform={inlineOpen ? "scale(1.1)" : "scale(1)"}
      >
        <MaterialSymbol fontSize={circleSize * 0.6}>{icon}</MaterialSymbol>
      </Box>

      {/* Status dot */}
      {statusColorPalette && (
        <Float placement={statusPlacement}>
          <Status.Root colorPalette={statusColorPalette}>
            <Status.Indicator />
          </Status.Root>
        </Float>
      )}
    </Box>
  );

  const renderCard = () => (
    <Box position="relative">
      <Stack
        className="custom-pin"
        bg={{ base: "white", _dark: "gray.950" }}
        borderRadius="3xl"
        boxShadow="lg"
        overflow="hidden"
        minW="220px"
        px="4"
        py="4"
      >
        <Box position="absolute" top="2" right="2" zIndex={1}>
          <IconButton
            aria-label={t("common.close")}
            size="xs"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setClicked(false);
              setHoverCardOpen(false);
            }}
          >
            <MaterialSymbol>close</MaterialSymbol>
          </IconButton>
        </Box>

        <VStack align="start" gap="1" lineHeight={2}>
          {label && (
            <HStack gap="2">
              <MaterialSymbol>info</MaterialSymbol>
              <Text fontWeight="medium" fontSize="sm">
                {label}
              </Text>
            </HStack>
          )}
          {description && (
            <Text fontSize="xs" color="gray.muted">
              {description}
            </Text>
          )}
          {children}
        </VStack>
      </Stack>
    </Box>
  );

  const inlineLabel = showInlineLabel ? (
    <Portal>
      <HoverCard.Positioner style={{ zIndex: inlineLabelZIndex }}>
        <HoverCard.Content
          bg={{ base: "white", _dark: "gray.950" }}
          borderRadius="3xl"
          boxShadow="md"
          px="4"
          py="4"
          maxW="min-content"
        >
          <VStack align="start" gap="1">
            {label && (
              <HStack gap="2">
                <MaterialSymbol>info</MaterialSymbol>
                <Text fontWeight="medium" fontSize="sm">
                  {label}
                </Text>
              </HStack>
            )}
            {description && (
              <Text fontSize="xs" color="gray.muted">
                {description}
              </Text>
            )}
            {children}
          </VStack>
        </HoverCard.Content>
      </HoverCard.Positioner>
    </Portal>
  ) : null;

  return (
    <HoverCard.Root
      open={inlineOpen}
      onOpenChange={(details) => setHoverCardOpen(details.open)}
      openDelay={50}
      closeDelay={300}
      positioning={{ placement: "top" }}
    >
      <AdvancedMarker
        position={position}
        title={title}
        zIndex={markerZIndexValue}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          if (!showCardOnClick) return;
          setClicked((v) => !v);
          setHoverCardOpen(false);
        }}
      >
        <HoverCard.Trigger asChild>
          <Box>{clicked && showCardOnClick ? renderCard() : renderPin()}</Box>
        </HoverCard.Trigger>
      </AdvancedMarker>
      {inlineLabel}
    </HoverCard.Root>
  );
}
