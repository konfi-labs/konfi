import { defineRecipe } from "@chakra-ui/react";

export const skeletonRecipe = defineRecipe({
  variants: {
    loading: {
      true: {
        borderRadius: "2xl",
      },
    },
  },
  defaultVariants: {
    // @ts-expect-error This is a bug in the Chakra UI types, it should accept "shine" as a variant
    variant: "shine",
  },
});
