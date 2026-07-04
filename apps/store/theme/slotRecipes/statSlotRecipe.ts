import { defineSlotRecipe } from "@chakra-ui/react";
import { statAnatomy } from "@chakra-ui/react/anatomy";

export const statSlotRecipe = defineSlotRecipe({
  slots: statAnatomy.keys(),
});
