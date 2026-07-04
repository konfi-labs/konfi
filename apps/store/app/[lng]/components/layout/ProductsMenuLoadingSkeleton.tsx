"use client";

import { Box, Skeleton, VStack } from "@chakra-ui/react";

const CATEGORY_SKELETON_WIDTHS = ["76%", "92%", "68%", "84%"] as const;
const PRODUCT_SKELETON_WIDTHS = ["88%", "72%", "96%", "64%", "80%"] as const;

export function ProductsMenuCategorySkeleton({ label }: { label: string }) {
  return (
    <Box role={"status"} aria-label={label} w={"180px"}>
      <VStack align={"stretch"} gap={2} w={"full"} aria-hidden={true}>
        {CATEGORY_SKELETON_WIDTHS.map((width, index) => (
          <Skeleton key={index} h={"40px"} w={width} borderRadius={"full"} />
        ))}
      </VStack>
    </Box>
  );
}

export function ProductsMenuProductSkeleton() {
  return (
    <VStack align={"stretch"} gap={2} minW={"180px"} aria-hidden={true}>
      {PRODUCT_SKELETON_WIDTHS.map((width, index) => (
        <Skeleton key={index} h={"36px"} w={width} borderRadius={"full"} />
      ))}
    </VStack>
  );
}
