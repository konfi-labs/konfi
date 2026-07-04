import { defineSlotRecipe } from "@chakra-ui/react";
import { toastAnatomy } from "@chakra-ui/react/anatomy";

export const toastSlotRecipe = defineSlotRecipe({
  slots: toastAnatomy.keys(),
  base: {
    root: {
      borderRadius: "xl",
    },
  },
});
