import { Box, Container, SimpleGrid, Skeleton, VStack } from "@chakra-ui/react";

export default function ProductLoading() {
  return (
    <Container maxW={"7xl"} py={{ base: 4, md: 6 }}>
      <SimpleGrid columns={[1, 1, 2]} w={"100%"} gap={{ base: 6, md: 8 }}>
        <Box minH={{ base: "420px", md: "760px" }} pr={{ base: 0, md: 6 }}>
          <Skeleton w={{ base: "60%", md: "40%" }} height={"28px"} mb={4} />
          <Skeleton borderRadius={"3xl"} height={{ base: "340px", md: "600px" }} />
          <SimpleGrid columns={4} gap={3} mt={4}>
            <Skeleton borderRadius={"2xl"} height={{ base: "64px", md: "88px" }} />
            <Skeleton borderRadius={"2xl"} height={{ base: "64px", md: "88px" }} />
            <Skeleton borderRadius={"2xl"} height={{ base: "64px", md: "88px" }} />
            <Skeleton borderRadius={"2xl"} height={{ base: "64px", md: "88px" }} />
          </SimpleGrid>
        </Box>

        <VStack align={"stretch"} minH={{ base: "420px", md: "760px" }} py={{ base: 0, md: 4 }}>
          <Skeleton w={{ base: "55%", md: "45%" }} height={"32px"} mb={2} />
          <Skeleton borderRadius={"3xl"} w={"100%"} height={"88px"} />
          <Skeleton borderRadius={"3xl"} w={"100%"} height={"88px"} />
          <Skeleton borderRadius={"3xl"} w={"100%"} height={"88px"} />
          <Skeleton borderRadius={"3xl"} w={"100%"} height={"88px"} />
          <Skeleton borderRadius={"3xl"} w={"100%"} height={"132px"} />
          <Skeleton borderRadius={"3xl"} w={"100%"} height={"168px"} />
        </VStack>
      </SimpleGrid>

      <VStack align={"stretch"} gap={4} mt={{ base: 8, md: 10 }}>
        <Skeleton borderRadius={"3xl"} w={{ base: "50%", md: "20%" }} height={"24px"} />
        <Skeleton borderRadius={"3xl"} w={"100%"} height={"220px"} />
        <Skeleton borderRadius={"3xl"} w={{ base: "45%", md: "18%" }} height={"24px"} />
        <Skeleton borderRadius={"3xl"} w={"100%"} height={"120px"} />
      </VStack>
    </Container>
  );
}
