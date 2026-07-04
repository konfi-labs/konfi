import { defineSlotRecipe } from "@chakra-ui/react";
import { drawerAnatomy } from "@chakra-ui/react/anatomy";

export const drawerSlotRecipe = defineSlotRecipe({
  slots: drawerAnatomy.keys(),
  base: {
    positioner: {
      padding: "4",
    },
    content: {
      borderRadius: "3xl",
    },
  },
  variants: {
    size: {
      full: {
        positioner: {
          padding: "0",
        },
        content: {
          borderRadius: "0",
        },
      },
    },
  },
});
