import {
  Card,
  Grid,
  GridItem,
  HStack,
  Skeleton,
  Table,
  VStack,
} from "@chakra-ui/react";

export type AdminLoadingSkeletonVariant =
  | "cards"
  | "fields"
  | "form"
  | "list"
  | "table";

type AdminLoadingSkeletonProps = {
  actionCount?: number;
  rows?: number;
  showHeader?: boolean;
  variant?: AdminLoadingSkeletonVariant;
};

const widthCycle = ["100%", "92%", "76%", "88%", "64%"];

function HeaderSkeleton({ actionCount }: { actionCount: number }) {
  return (
    <HStack justify="space-between" align="start" gap={4} w="100%">
      <VStack align="stretch" gap={3} flex="1" maxW="lg">
        <Skeleton h="9" w={{ base: "72%", md: "320px" }} />
        <Skeleton h="4" w={{ base: "48%", md: "180px" }} />
      </VStack>
      {/* pr keeps the placeholders clear of the floating AI assistant avatar (ChatButton, absolute top/right) */}
      <HStack gap={2} display={{ base: "none", md: "flex" }} pr={16}>
        {Array.from({ length: actionCount }).map((_, index) => (
          <Skeleton key={index} h="10" w="32" borderRadius="lg" />
        ))}
      </HStack>
    </HStack>
  );
}

function FieldsSkeleton({ rows }: { rows: number }) {
  return (
    <Card.Root borderRadius="3xl" borderWidth="0">
      <Card.Body gap={5}>
        {Array.from({ length: rows }).map((_, index) => (
          <VStack key={index} align="stretch" gap={2}>
            <Skeleton h="4" w="32" />
            <Skeleton
              h={index % 4 === 3 ? "28" : "11"}
              w={widthCycle[index % widthCycle.length]}
              borderRadius="xl"
            />
          </VStack>
        ))}
        <HStack justify="end" pt={2}>
          <Skeleton h="10" w="36" borderRadius="lg" />
        </HStack>
      </Card.Body>
    </Card.Root>
  );
}

function FormSkeleton({ rows }: { rows: number }) {
  return (
    <Grid
      templateColumns={{ base: "repeat(1, 1fr)", "2xl": "repeat(5, 1fr)" }}
      gap={{ base: 6, "2xl": 12 }}
      w="100%"
    >
      <GridItem minW="100%" colSpan={{ base: 5, "2xl": 3 }}>
        <FieldsSkeleton rows={rows} />
      </GridItem>
      <GridItem minW="100%" colSpan={{ base: 5, "2xl": 2 }}>
        <VStack align="stretch" gap={4}>
          <Skeleton h="10" w="100%" borderRadius="lg" />
          <Skeleton h="10" w="100%" borderRadius="lg" />
          <Card.Root borderRadius="3xl" borderWidth="0">
            <Card.Body gap={4}>
              <Skeleton h="5" w="48%" />
              <Skeleton h="4" w="100%" />
              <Skeleton h="4" w="84%" />
              <Skeleton h="28" w="100%" borderRadius="2xl" />
            </Card.Body>
          </Card.Root>
        </VStack>
      </GridItem>
    </Grid>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <VStack align="stretch" gap={4} w="100%">
      <HStack justify="space-between" gap={3} wrap="wrap">
        <Skeleton h="10" w={{ base: "100%", md: "280px" }} borderRadius="lg" />
        <HStack gap={2} w={{ base: "100%", md: "auto" }}>
          <Skeleton
            h="10"
            flex={{ base: "1", md: "initial" }}
            w="32"
            borderRadius="lg"
          />
          <Skeleton
            h="10"
            flex={{ base: "1", md: "initial" }}
            w="32"
            borderRadius="lg"
          />
        </HStack>
      </HStack>
      <Table.ScrollArea
        borderWidth="1px"
        borderColor="border.muted"
        rounded="2xl"
      >
        <Table.Root size="sm" variant="line">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>
                <Skeleton h="4" w="48" />
              </Table.ColumnHeader>
              <Table.ColumnHeader display={{ base: "none", md: "table-cell" }}>
                <Skeleton h="4" w="32" />
              </Table.ColumnHeader>
              <Table.ColumnHeader display={{ base: "none", lg: "table-cell" }}>
                <Skeleton h="4" w="36" />
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                <Skeleton h="4" w="28" />
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                <Skeleton h="4" ml="auto" w="20" />
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <Table.Row key={rowIndex}>
                <Table.Cell>
                  <Skeleton
                    h="5"
                    w={widthCycle[rowIndex % widthCycle.length]}
                  />
                </Table.Cell>
                <Table.Cell display={{ base: "none", md: "table-cell" }}>
                  <Skeleton h="5" w="80%" />
                </Table.Cell>
                <Table.Cell display={{ base: "none", lg: "table-cell" }}>
                  <Skeleton h="5" w="72%" />
                </Table.Cell>
                <Table.Cell>
                  <Skeleton h="6" w="24" borderRadius="full" />
                </Table.Cell>
                <Table.Cell>
                  <Skeleton h="8" ml="auto" w="20" borderRadius="lg" />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </VStack>
  );
}

function CardsSkeleton({ rows }: { rows: number }) {
  return (
    <Grid templateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap={4}>
      {Array.from({ length: rows }).map((_, index) => (
        <Card.Root key={index} borderRadius="2xl" borderWidth="0">
          <Card.Body gap={3}>
            <Skeleton h="5" w="72%" />
            <Skeleton h="4" w="100%" />
            <Skeleton h="4" w="82%" />
            <Skeleton h="10" w="100%" borderRadius="lg" />
          </Card.Body>
        </Card.Root>
      ))}
    </Grid>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <VStack align="stretch" gap={3} w="100%">
      {Array.from({ length: rows }).map((_, index) => (
        <Card.Root
          key={index}
          borderRadius="2xl"
          borderWidth="0"
          overflow="hidden"
        >
          <Card.Body p={0}>
            <HStack px={5} py={4} bg="gray.subtle" gap={4}>
              <Skeleton boxSize="10" borderRadius="full" />
              <VStack align="stretch" gap={2} flex="1">
                <Skeleton h="5" w="42%" />
                <Skeleton h="4" w="66%" />
              </VStack>
              <Skeleton h="8" w="24" borderRadius="full" />
            </HStack>
            <VStack align="stretch" gap={3} p={5}>
              <Skeleton h="4" w="100%" />
              <Skeleton h="4" w="84%" />
              <Skeleton
                h="10"
                w={{ base: "100%", md: "220px" }}
                borderRadius="lg"
              />
            </VStack>
          </Card.Body>
        </Card.Root>
      ))}
    </VStack>
  );
}

export default function AdminLoadingSkeleton({
  actionCount = 2,
  rows = 6,
  showHeader = true,
  variant = "form",
}: AdminLoadingSkeletonProps) {
  const content = {
    cards: <CardsSkeleton rows={rows} />,
    fields: <FieldsSkeleton rows={rows} />,
    form: <FormSkeleton rows={rows} />,
    list: <ListSkeleton rows={rows} />,
    table: <TableSkeleton rows={rows} />,
  }[variant];

  return (
    <VStack align="stretch" gap={6} w="100%" aria-busy="true">
      {showHeader && <HeaderSkeleton actionCount={actionCount} />}
      {content}
    </VStack>
  );
}
