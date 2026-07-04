import { defineSlotRecipe } from "@chakra-ui/react";
import { comboboxAnatomy } from "@chakra-ui/react/anatomy";

export const comboBoxSlotRecipe = defineSlotRecipe({
  slots: comboboxAnatomy.keys(),
  base: {
    input: {
      borderRadius: "full",
    },
    content: {
      borderRadius: "2xl",
      zIndex: "skipNav",
    },
    item: {
      borderRadius: "xl",
    },
  },
  variants: {
    size: {
      md: {
        content: {
          p: "2",
        },
      },
    },
  },
});
