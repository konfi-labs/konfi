import { HStack, Text, VStack } from "@chakra-ui/react";
import { Rating } from "@konfi/types";
import { MaterialSymbol } from "../MaterialSymbol";

export function RatingsList({ ratings }: { ratings: Rating[] }) {
  return (
    <VStack align={"start"}>
      {ratings.map((rating, index) => (
        <HStack key={index} gap={4} mb={4}>
          <HStack gap={0}>
            <MaterialSymbol color="primary.solid" pb={"2px"}>
              star
            </MaterialSymbol>
            <Text ml={2} fontWeight={"bold"} color="primary.solid">
              {" "}
              {rating.rating}
            </Text>
          </HStack>
          {rating.comment && <Text>{rating.comment}</Text>}
        </HStack>
      ))}
    </VStack>
  );
}
