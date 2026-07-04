import { Badge, HStack, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "../MaterialSymbol";

export function AverageRating({
  averageRating,
  ratingsCount,
  t,
}: {
  averageRating: number;
  ratingsCount: number;
  t: (key: string, options?: any) => string;
}) {
  return (
    <HStack gap={0}>
      {Array.from({ length: Math.floor(averageRating) }).map((_, index) => (
        <MaterialSymbol key={index} color="primary.solid" pb={"2px"}>
          star
        </MaterialSymbol>
      ))}
      <Text ml={2} fontWeight={"bold"} color="primary.solid">
        {averageRating}
      </Text>{" "}
      <Badge colorPalette="primary" variant="solid" ml={2}>
        {t
          ? t("RATINGS_COUNT", {
              count: ratingsCount,
              defaultValue:
                ratingsCount === 1 ? "{{count}} Rating" : "{{count}} Ratings",
            })
          : `${ratingsCount === 1 ? `${ratingsCount} Rating` : `${ratingsCount} Ratings`}`}
      </Badge>
    </HStack>
  );
}
