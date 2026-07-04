import {
  Box,
  Container,
  Grid,
  GridItem,
  HStack,
  Separator,
  SimpleGrid,
  Skeleton,
  Stack,
  VStack,
  type StackProps,
} from "@chakra-ui/react";

const navigationItems = ["products", "contact", "cooperation", "about"];
const productCards = ["hero", "wide", "standard-a", "standard-b"];
const compactCards = ["first", "second", "third", "fourth"];
const cartRows = ["first", "second"];
const radioRows = ["first", "second", "third"];
const summaryRows = ["subtotal", "shipping", "discount", "total"];
const footerColumns = ["help", "find-us", "about", "brand"];

function SectionHeaderFallback({
  align = "start",
}: {
  align?: "center" | "start";
}) {
  return (
    <VStack
      align={align}
      gap={3}
      mb={{ base: 6, md: 8 }}
      textAlign={align === "center" ? "center" : "start"}
    >
      <Skeleton borderRadius={"full"} height={"14px"} width={"112px"} />
      <Skeleton
        borderRadius={"full"}
        height={{ base: "32px", md: "44px" }}
        width={{ base: "78%", md: "420px" }}
      />
      <Skeleton
        borderRadius={"full"}
        height={"18px"}
        maxW={"620px"}
        width={{ base: "92%", md: "52%" }}
      />
    </VStack>
  );
}

function ProductGridFallback() {
  return (
    <Grid templateColumns={["1fr", "1fr", "1fr 1fr", "repeat(4, 1fr)"]} gap={4}>
      {productCards.map((card, index) => (
        <GridItem
          key={card}
          colSpan={index === 0 ? [1, 1, 1, 2] : [1, 1, 1, 1]}
        >
          <Stack
            bg={"bg.panel"}
            border={"1px solid"}
            borderColor={"border.muted"}
            borderRadius={"3xl"}
            overflow={"hidden"}
            gap={0}
          >
            <Skeleton height={index === 0 ? ["180px", "220px"] : "180px"} />
            <Stack gap={3} p={4}>
              <Skeleton borderRadius={"full"} height={"18px"} width={"82%"} />
              <Skeleton borderRadius={"full"} height={"14px"} width={"48%"} />
            </Stack>
          </Stack>
        </GridItem>
      ))}
    </Grid>
  );
}

function FooterFallback() {
  return (
    <Box
      bgColor={{ base: "gray.50", _dark: "gray.900" }}
      display={{ base: "none", md: "block" }}
      h={"400px"}
      shadow={"xs"}
      w={"100%"}
    >
      <Container as={Stack} maxW={"7xl"} py={10}>
        <SimpleGrid
          templateColumns={{ sm: "1fr 1fr", md: "0.5fr 0.5fr 0.5fr 1fr" }}
          gap={8}
        >
          {footerColumns.map((column, columnIndex) => (
            <Stack key={column} align={"flex-start"} gap={3}>
              <Skeleton borderRadius={"full"} height={"22px"} width={"62%"} />
              <Skeleton borderRadius={"full"} height={"16px"} width={"78%"} />
              <Skeleton borderRadius={"full"} height={"16px"} width={"66%"} />
              {columnIndex < 3 ? (
                <Skeleton borderRadius={"full"} height={"16px"} width={"58%"} />
              ) : (
                <Skeleton
                  borderRadius={"2xl"}
                  height={"76px"}
                  width={"160px"}
                />
              )}
            </Stack>
          ))}
        </SimpleGrid>
        <HStack mt={8} gap={2}>
          <Skeleton borderRadius={"full"} height={"18px"} width={"180px"} />
          <Skeleton borderRadius={"md"} height={"28px"} width={"76px"} />
          <Skeleton borderRadius={"md"} height={"28px"} width={"76px"} />
          <Skeleton
            borderRadius={"full"}
            height={"28px"}
            ml={"auto"}
            width={"96px"}
          />
        </HStack>
      </Container>
    </Box>
  );
}

export function StorePageContentFallback({
  minH = "60svh",
  variant = "default",
}: {
  minH?: StackProps["minH"];
  variant?: "cart" | "default";
}) {
  if (variant === "cart") {
    return (
      <Stack minH={minH} py={{ base: 6, md: 10 }}>
        <Skeleton height={"40px"} mb={"8"} w={{ base: "42%", md: "180px" }} />
        <Grid templateColumns={"repeat(5, 1fr)"} gap={["8", "16"]}>
          <GridItem colSpan={[5, 3]} minW={"100%"}>
            <HStack mb={"4"} gap={3}>
              <Skeleton borderRadius={"full"} height={"24px"} width={"96px"} />
              <Skeleton borderRadius={"md"} height={"24px"} width={"190px"} />
            </HStack>
            <Separator mb={6} />
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={3} mb={"6"}>
              {radioRows.map((row) => (
                <Skeleton key={row} borderRadius={"2xl"} height={"72px"} />
              ))}
            </SimpleGrid>
          </GridItem>
          <GridItem colSpan={[5, 2]} minW={"100%"}>
            <Skeleton
              borderRadius={"full"}
              height={"24px"}
              mb={"4"}
              width={"112px"}
            />
            <Separator mb={6} />
            <Stack gap={3} mb={"6"}>
              <Skeleton borderRadius={"2xl"} height={"72px"} />
              <Skeleton borderRadius={"2xl"} height={"72px"} />
            </Stack>
          </GridItem>
        </Grid>
        <Grid templateColumns={"repeat(5, 1fr)"} gap={["8", "16"]}>
          <GridItem colSpan={[5, 3]} minW={"100%"}>
            <Skeleton
              borderRadius={"full"}
              height={"28px"}
              mb={"4"}
              width={"128px"}
            />
            <Stack gap={4}>
              {cartRows.map((row) => (
                <Grid
                  key={row}
                  alignItems={"center"}
                  borderBottom={"1px solid"}
                  borderColor={"border.muted"}
                  gap={4}
                  pb={4}
                  templateColumns={{ base: "88px 1fr", md: "112px 1fr 96px" }}
                >
                  <Skeleton borderRadius={"2xl"} height={"88px"} />
                  <Stack gap={3}>
                    <Skeleton
                      borderRadius={"full"}
                      height={"18px"}
                      width={"82%"}
                    />
                    <Skeleton
                      borderRadius={"full"}
                      height={"14px"}
                      width={"64%"}
                    />
                    <Skeleton
                      borderRadius={"full"}
                      height={"14px"}
                      width={"42%"}
                    />
                  </Stack>
                  <Skeleton
                    borderRadius={"full"}
                    display={{ base: "none", md: "block" }}
                    height={"18px"}
                    width={"88px"}
                  />
                </Grid>
              ))}
            </Stack>
          </GridItem>
          <GridItem colSpan={[5, 2]} minW={"100%"}>
            <Stack
              border={"1px solid"}
              borderColor={"border.muted"}
              borderRadius={"3xl"}
              gap={4}
              p={5}
            >
              <Skeleton borderRadius={"full"} height={"26px"} width={"58%"} />
              {summaryRows.map((row) => (
                <HStack key={row} justify={"space-between"}>
                  <Skeleton
                    borderRadius={"full"}
                    height={"16px"}
                    width={"42%"}
                  />
                  <Skeleton
                    borderRadius={"full"}
                    height={"16px"}
                    width={"72px"}
                  />
                </HStack>
              ))}
              <Separator />
              <Skeleton borderRadius={"full"} height={"44px"} width={"100%"} />
            </Stack>
          </GridItem>
        </Grid>
      </Stack>
    );
  }

  return (
    <Stack gap={{ base: 10, md: 14 }} minH={minH} py={{ base: 6, md: 10 }}>
      <Stack
        align={{ base: "stretch", lg: "center" }}
        bg={{ base: "gray.50", _dark: "gray.900" }}
        borderRadius={{ base: "0", md: "3xl" }}
        direction={{ base: "column", lg: "row" }}
        gap={{ base: 8, lg: 12 }}
        minH={{ base: "420px", md: "520px" }}
        px={{ base: 0, md: 8, lg: 12 }}
        py={{ base: 4, md: 10 }}
      >
        <VStack align={"start"} flex={"1"} gap={5}>
          <Skeleton borderRadius={"full"} height={"14px"} width={"128px"} />
          <Skeleton
            borderRadius={"full"}
            height={{ base: "44px", md: "64px" }}
            width={{ base: "92%", md: "82%" }}
          />
          <Skeleton
            borderRadius={"full"}
            height={{ base: "44px", md: "64px" }}
            width={{ base: "78%", md: "66%" }}
          />
          <Skeleton
            borderRadius={"full"}
            height={"20px"}
            width={{ base: "96%", md: "78%" }}
          />
          <Skeleton
            borderRadius={"full"}
            height={"20px"}
            width={{ base: "72%", md: "54%" }}
          />
          <HStack gap={3} pt={3}>
            <Skeleton borderRadius={"full"} height={"44px"} width={"148px"} />
            <Skeleton borderRadius={"full"} height={"44px"} width={"132px"} />
          </HStack>
        </VStack>
        <SimpleGrid
          columns={{ base: 2, md: 2 }}
          flex={"1"}
          gap={4}
          minW={0}
          w={"full"}
        >
          {compactCards.map((card, index) => (
            <Skeleton
              key={card}
              borderRadius={"3xl"}
              height={index === 0 ? ["132px", "176px"] : ["112px", "148px"]}
            />
          ))}
        </SimpleGrid>
      </Stack>
      <Box as={"section"}>
        <SectionHeaderFallback />
        <ProductGridFallback />
      </Box>
    </Stack>
  );
}

function DesktopNavigationFallback() {
  return (
    <Box
      as={"header"}
      display={{ base: "none", md: "block" }}
      position={"fixed"}
      w={"100%"}
      zIndex={"200"}
    >
      <HStack
        mt={"4"}
        minH={"80px"}
        px={"6"}
        maxW={"1296px"}
        mx={"auto"}
        justify={"space-between"}
        bg={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
        border={"1px solid"}
        borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
        borderRadius={"full"}
        _before={{
          backdropFilter: "saturate(125%) blur(10px)",
          borderRadius: "full",
          content: "''",
          h: "80px",
          height: "100%",
          left: "50%",
          maxW: "1296px",
          mt: 4,
          position: "absolute",
          top: 0,
          transform: "translateX(-50%)",
          width: "100%",
          zIndex: -1,
        }}
      >
        <HStack gap={8}>
          <Skeleton borderRadius={"xl"} height={"42px"} width={"80px"} />
          <HStack gap={2}>
            {navigationItems.map((item, index) => (
              <Skeleton
                key={item}
                borderRadius={"full"}
                height={"40px"}
                width={index === 0 ? "116px" : "94px"}
              />
            ))}
          </HStack>
        </HStack>
        <HStack gap={3}>
          <Skeleton borderRadius={"full"} height={"40px"} width={"40px"} />
          <Skeleton borderRadius={"full"} height={"40px"} width={"84px"} />
          <Skeleton borderRadius={"full"} height={"40px"} width={"96px"} />
          <Skeleton borderRadius={"full"} height={"40px"} width={"112px"} />
          <Skeleton borderRadius={"full"} height={"40px"} width={"40px"} />
          <Skeleton borderRadius={"full"} height={"40px"} width={"72px"} />
        </HStack>
      </HStack>
    </Box>
  );
}

function MobileNavigationFallback() {
  return (
    <Box
      as={"footer"}
      bottom={"0"}
      display={{ base: "block", md: "none" }}
      position={"fixed"}
      w={"100%"}
      zIndex={"200"}
    >
      <HStack
        mb={"4"}
        minH={"80px"}
        mx={"4"}
        px={"6"}
        justify={"space-between"}
        bg={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
        border={"1px solid"}
        borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
        borderRadius={"full"}
        _before={{
          backdropFilter: "saturate(125%) blur(10px)",
          borderRadius: "full",
          bottom: 4,
          content: "''",
          h: "80px",
          height: "100%",
          left: "50%",
          position: "absolute",
          transform: "translateX(-50%)",
          width: "calc(100% - 32px)",
          zIndex: -1,
        }}
      >
        <Skeleton borderRadius={"xl"} height={"42px"} width={"80px"} />
        <HStack gap={3}>
          <Skeleton borderRadius={"full"} height={"42px"} width={"42px"} />
          <Skeleton borderRadius={"full"} height={"42px"} width={"42px"} />
          <Skeleton borderRadius={"full"} height={"42px"} width={"42px"} />
        </HStack>
      </HStack>
    </Box>
  );
}

export function StoreRuntimeShellFallback() {
  return (
    <>
      <DesktopNavigationFallback />
      <MobileNavigationFallback />
      <Box
        as={"main"}
        bg={{ base: "gray.50", _dark: "gray.900" }}
        minH={"100svh"}
        pb={{ base: "112px", md: 0 }}
        pt={{ base: 0, md: "120px" }}
      >
        <Container maxW={"7xl"} pb={{ base: 12, md: 16 }}>
          <StorePageContentFallback
            minH={{ base: "100svh", md: "calc(100svh - 120px)" }}
          />
        </Container>
      </Box>
      <FooterFallback />
    </>
  );
}
