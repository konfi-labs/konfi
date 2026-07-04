import { defineSlotRecipe } from "@chakra-ui/react";
import { numberInputAnatomy } from "@chakra-ui/react/anatomy";

export const numberInputSlotRecipe = defineSlotRecipe({
  slots: numberInputAnatomy.keys(),
  base: {
    input: {
      borderRadius: "full",
      colorPalette: "primary",
    },
    control: {
      display: "none",
    },
  },
});
