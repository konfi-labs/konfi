import { SimpleGrid, Skeleton } from "@chakra-ui/react";

export default function ProductsLoading() {
  return (
    <>
      <Skeleton w={"50%"} height={"50px"} mb={4} />
      <SimpleGrid columns={[1, 2, 4]} gap={4} w={"100%"}>
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
        <Skeleton height={"300px"} />
      </SimpleGrid>
    </>
  );
}
