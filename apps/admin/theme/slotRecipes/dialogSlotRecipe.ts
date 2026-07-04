import { defineSlotRecipe } from "@chakra-ui/react";
import { dialogAnatomy } from "@chakra-ui/react/anatomy";

export const dialogSlotRecipe = defineSlotRecipe({
  slots: dialogAnatomy.keys(),
  base: {
    content: {
      border: "1px solid",
      borderColor: { base: "whiteAlpha.500", _dark: "whiteAlpha.300" },
      borderRadius: "3xl",
      shadow: "2xl",
    },
    backdrop: {
      backdropFilter: "saturate(125%) blur(8px)",
    },
  },
});
