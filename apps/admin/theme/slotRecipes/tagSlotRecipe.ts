import { defineSlotRecipe } from "@chakra-ui/react";
import { tagSlotRecipe as chakraTagSlotRecipe } from "@chakra-ui/react/theme";
import { tagAnatomy } from "@chakra-ui/react/anatomy";

export const tagSlotRecipe = defineSlotRecipe({
  ...chakraTagSlotRecipe,
  slots: tagAnatomy.keys(),
  base: {
    ...chakraTagSlotRecipe.base,
    root: {
      ...chakraTagSlotRecipe.base?.root,
      borderRadius: "full",
    },
  },
  defaultVariants: {
    ...chakraTagSlotRecipe.defaultVariants,
    variant: "surface",
  },
});
