import { defineSlotRecipe } from "@chakra-ui/react";
import { selectAnatomy } from "@chakra-ui/react/anatomy";

export const selectSlotRecipe = defineSlotRecipe({
  slots: selectAnatomy.keys(),
  base: {
    trigger: {
      borderRadius: "full",
      px: 3,
    },
    control: {
      rounded: "full",
    },
    content: {
      borderRadius: "2xl",
      padding: "2",
    },
    item: {
      borderRadius: "xl",
      _highlighted: {
        bg: "blackAlpha.100",
      },
    },
  },
});
