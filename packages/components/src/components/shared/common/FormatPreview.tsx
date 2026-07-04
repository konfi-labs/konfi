"use client";

import { Box, HStack, Text, VisuallyHidden } from "@chakra-ui/react";

type FormatPreviewProps = {
  formatWidth?: number | null;
  formatHeight?: number | null;
  showDimensions?: boolean;
  previewBoxSize?: number | string;
  textAlign?: "start" | "center";
};

const MIN_PREVIEW_PERCENT = 20;

type FormatPreviewDimensions = {
  formatWidth: number;
  formatHeight: number;
};

function calculatePreviewDimensions(formatWidth: number, formatHeight: number) {
  const aspectRatio = formatWidth / formatHeight;
  const isLandscape = aspectRatio >= 1;

  return {
    previewWidth: isLandscape
      ? "100%"
      : `${Math.max(aspectRatio * 100, MIN_PREVIEW_PERCENT)}%`,
    previewHeight: isLandscape
      ? `${Math.max((1 / aspectRatio) * 100, MIN_PREVIEW_PERCENT)}%`
      : "100%",
  };
}

export function hasFormatPreviewDimensions(
  formatWidth?: number | null,
  formatHeight?: number | null,
) {
  return (
    typeof formatWidth === "number" &&
    typeof formatHeight === "number" &&
    Number.isFinite(formatWidth) &&
    Number.isFinite(formatHeight) &&
    formatWidth > 0 &&
    formatHeight > 0
  );
}

function getFormatPreviewDimensions(
  formatWidth?: number | null,
  formatHeight?: number | null,
): FormatPreviewDimensions | null {
  if (!hasFormatPreviewDimensions(formatWidth, formatHeight)) {
    return null;
  }

  return {
    formatWidth: Number(formatWidth),
    formatHeight: Number(formatHeight),
  };
}

export function FormatPreview({
  formatWidth,
  formatHeight,
  showDimensions = true,
  previewBoxSize = 12,
  textAlign = "center",
}: FormatPreviewProps) {
  const dimensions = getFormatPreviewDimensions(formatWidth, formatHeight);

  if (!dimensions) {
    return null;
  }

  const { previewWidth, previewHeight } = calculatePreviewDimensions(
    dimensions.formatWidth,
    dimensions.formatHeight,
  );

  return (
    <HStack gap="2" align="center">
      <Box
        boxSize={previewBoxSize}
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <Box
          data-format-preview="true"
          aria-hidden="true"
          width={previewWidth}
          height={previewHeight}
          borderRadius="md"
          borderWidth="1px"
          borderColor="primary.solid"
          bg="primary.subtle"
          maxW="100%"
          maxH="100%"
        />
      </Box>
      {!showDimensions && (
        <VisuallyHidden>
          {dimensions.formatWidth} × {dimensions.formatHeight} mm
        </VisuallyHidden>
      )}
      {showDimensions && (
        <Text
          fontSize="xs"
          color="fg.muted"
          lineHeight="shorter"
          textAlign={textAlign}
        >
          {dimensions.formatWidth} × {dimensions.formatHeight} mm
        </Text>
      )}
    </HStack>
  );
}
