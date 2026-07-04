import { defineSlotRecipe } from "@chakra-ui/react";
import { editableAnatomy } from "@chakra-ui/react/anatomy";

export const editableSlotRecipe = defineSlotRecipe({
  slots: editableAnatomy.keys(),
  base: {
    preview: {
      rounded: "full",
    },
    input: {
      rounded: "full",
    },
  },
});
