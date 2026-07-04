"use client";

import { Box, Text } from "@chakra-ui/react";
import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { useCallback } from "react";

export type ClusterMarkerColor = "primary" | "green" | "orange";

interface ClusterMarkerProps {
  clusterId: number;
  position: google.maps.LatLngLiteral;
  count: number;
  onClusterClick: (
    clusterId: number,
    position: google.maps.LatLngLiteral,
  ) => void;
  color?: ClusterMarkerColor;
  zIndex?: number;
}

const COLOR_TOKEN: Record<ClusterMarkerColor, string> = {
  primary: "var(--chakra-colors-primary-500)",
  green: "var(--chakra-colors-green-500)",
  orange: "var(--chakra-colors-orange-500)",
};

const CLUSTER_SHADOW: Record<ClusterMarkerColor, string> = {
  primary: "0 0 0 4px var(--chakra-colors-primary-200)",
  green: "0 0 0 4px var(--chakra-colors-green-200)",
  orange: "0 0 0 4px var(--chakra-colors-orange-200)",
};

export const ClusterMarker = ({
  clusterId,
  position,
  count,
  onClusterClick,
  color = "primary",
  zIndex,
}: ClusterMarkerProps) => {
  const handleClick = useCallback(() => {
    onClusterClick(clusterId, position);
  }, [clusterId, onClusterClick, position]);

  const size = Math.min(
    64,
    Math.max(32, Math.floor(28 + Math.sqrt(count) * 4)),
  );

  const markerZIndex = zIndex ?? size;

  return (
    <AdvancedMarker
      position={position}
      onClick={handleClick}
      zIndex={markerZIndex}
    >
      <Box
        w={`${size}px`}
        h={`${size}px`}
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius="full"
        bg={COLOR_TOKEN[color]}
        color="white"
        fontWeight="bold"
        boxShadow={CLUSTER_SHADOW[color]}
      >
        <Text fontSize="sm" lineHeight="1">
          {count}
        </Text>
      </Box>
    </AdvancedMarker>
  );
};

export default ClusterMarker;
