import { defineSlotRecipe } from "@chakra-ui/react";
import { menuAnatomy } from "@chakra-ui/react/anatomy";

export const menuSlotRecipe = defineSlotRecipe({
  slots: menuAnatomy.keys(),
  base: {
    content: {
      zIndex: "dropdown",
      border: "1px solid",
      borderColor: { base: "whiteAlpha.500", _dark: "blackAlpha.300" },
      backgroundColor: { base: "whiteAlpha.500", _dark: "blackAlpha.300" },
      backdropFilter: "saturate(125%) blur(40px)",
      shadow: "2xl",
      borderRadius: "2xl",
      px: "2",
    },
    item: {
      borderRadius: "xl",
      _hover: {
        bg: { base: "blackAlpha.100", _dark: "blackAlpha.300" },
      },
    },
  },
});
