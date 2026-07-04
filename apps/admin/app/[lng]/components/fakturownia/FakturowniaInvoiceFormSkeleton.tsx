"use client";

import {
  Box,
  Fieldset,
  HStack,
  Separator,
  SimpleGrid,
  Skeleton,
  VStack,
} from "@chakra-ui/react";
import type { ReactNode } from "react";

type FakturowniaInvoiceFormSkeletonProps = {
  compact?: boolean;
};

const fieldWidths = ["100%", "92%", "78%", "86%"] as const;

function FieldSkeleton({ index = 0 }: { index?: number }) {
  return (
    <VStack align="stretch" gap={2} minW={0}>
      <Skeleton h="4" w={index % 3 === 0 ? "36%" : "48%"} />
      <Skeleton
        h="10"
        w={fieldWidths[index % fieldWidths.length]}
        borderRadius="lg"
      />
    </VStack>
  );
}

function SectionSkeleton({
  children,
  titleWidth = "180px",
}: {
  children: ReactNode;
  titleWidth?: string;
}) {
  return (
    <Fieldset.Root>
      <Fieldset.Legend>
        <Skeleton h="6" w={titleWidth} />
      </Fieldset.Legend>
      <Fieldset.Content>{children}</Fieldset.Content>
    </Fieldset.Root>
  );
}

function PartySkeleton() {
  return (
    <SectionSkeleton titleWidth="120px">
      <VStack align="stretch" gap={4}>
        {Array.from({ length: 5 }).map((_, index) => (
          <FieldSkeleton key={index} index={index} />
        ))}
        <HStack gap={4} align="stretch">
          <Box flex="0 0 34%" minW={0}>
            <FieldSkeleton index={5} />
          </Box>
          <Box flex="1" minW={0}>
            <FieldSkeleton index={6} />
          </Box>
        </HStack>
      </VStack>
    </SectionSkeleton>
  );
}

function PositionsSkeleton() {
  return (
    <SectionSkeleton titleWidth="150px">
      <VStack align="stretch" gap={3}>
        <HStack justify="space-between" gap={3}>
          <Skeleton h="9" w={{ base: "46%", md: "180px" }} borderRadius="lg" />
          <Skeleton h="9" w={{ base: "36%", md: "140px" }} borderRadius="lg" />
        </HStack>
        <Box borderWidth="1px" borderColor="border" borderRadius="xl" p={3}>
          <VStack align="stretch" gap={3}>
            {Array.from({ length: 3 }).map((_, rowIndex) => (
              <HStack
                key={rowIndex}
                borderBottomWidth={rowIndex === 2 ? "0" : "1px"}
                borderColor="border"
                gap={3}
                pb={rowIndex === 2 ? 0 : 3}
              >
                <Skeleton h="4" flex="1.4" />
                <Skeleton
                  h="4"
                  flex="1"
                  display={{ base: "none", md: "block" }}
                />
                <Skeleton
                  h="4"
                  flex="1"
                  display={{ base: "none", lg: "block" }}
                />
                <Skeleton h="7" w="20" borderRadius="lg" />
              </HStack>
            ))}
          </VStack>
        </Box>
      </VStack>
    </SectionSkeleton>
  );
}

function PaymentSkeleton() {
  return (
    <SectionSkeleton titleWidth="170px">
      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={4}>
        {Array.from({ length: 8 }).map((_, index) => (
          <FieldSkeleton key={index} index={index} />
        ))}
      </SimpleGrid>
    </SectionSkeleton>
  );
}

export function FakturowniaInvoiceFormSkeleton({
  compact = false,
}: FakturowniaInvoiceFormSkeletonProps) {
  return (
    <VStack align="stretch" gap={compact ? 5 : 6} w="full" aria-busy="true">
      <SectionSkeleton titleWidth="190px">
        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={4}>
          {Array.from({ length: 4 }).map((_, index) => (
            <FieldSkeleton key={index} index={index} />
          ))}
        </SimpleGrid>
      </SectionSkeleton>

      <Separator />

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={6}>
        <PartySkeleton />
        <PartySkeleton />
      </SimpleGrid>

      <Separator />

      <PositionsSkeleton />
      <PaymentSkeleton />

      {!compact && (
        <SectionSkeleton titleWidth="180px">
          <VStack align="stretch" gap={4}>
            <Skeleton h="24" w="full" borderRadius="xl" />
            <HStack gap={6} align="start" flexWrap="wrap">
              <VStack align="stretch" gap={2} minW="220px">
                <Skeleton h="5" w="120px" />
                <Skeleton h="4" w="180px" />
                <Skeleton h="4" w="160px" />
              </VStack>
              <VStack align="stretch" gap={2} minW="220px">
                <Skeleton h="5" w="140px" />
                <Skeleton h="4" w="190px" />
                <Skeleton h="4" w="170px" />
              </VStack>
            </HStack>
          </VStack>
        </SectionSkeleton>
      )}

      <Skeleton h="12" w="full" borderRadius="xl" />
    </VStack>
  );
}
