import { defineSlotRecipe } from "@chakra-ui/react";
import { actionBarAnatomy } from "@chakra-ui/react/anatomy";

export const actionBarSlotRecipe = defineSlotRecipe({
  slots: actionBarAnatomy.keys(),
  base: {
    content: {
      border: "1px solid",
      borderColor: { base: "whiteAlpha.500", _dark: "blackAlpha.300" },
      backgroundColor: { base: "whiteAlpha.500", _dark: "blackAlpha.300" },
      backdropFilter: "saturate(125%) blur(40px)",
      shadow: "2xl",
      borderRadius: "3xl",
    },
    selectionTrigger: {
      borderRadius: "full",
    },
  },
});
