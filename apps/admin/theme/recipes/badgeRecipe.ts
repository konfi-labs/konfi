import { defineRecipe } from "@chakra-ui/react";
import { badgeRecipe as chakraBadgeRecipe } from "@chakra-ui/react/theme";

export const badgeRecipe = defineRecipe({
  ...chakraBadgeRecipe,
  base: {
    ...chakraBadgeRecipe.base,
    rounded: "full",
    py: "1",
    px: "3",
    fontWeight: "medium",
  },
  defaultVariants: {
    ...chakraBadgeRecipe.defaultVariants,
    variant: "surface",
  },
});
