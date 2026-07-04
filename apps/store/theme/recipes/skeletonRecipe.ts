import { defineRecipe } from "@chakra-ui/react";

export const skeletonRecipe = defineRecipe({
  variants: {
    loading: {
      true: {
        borderRadius: "3xl",
      },
    },
  },
  defaultVariants: {
    // @ts-expect-error Chakra UI types do not include the "shine" variant from skeletonRecipe — see docs/tech-debt/suppressions.md
    variant: "shine",
  },
});
