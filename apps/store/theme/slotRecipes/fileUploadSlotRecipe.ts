import { defineSlotRecipe } from "@chakra-ui/react";
import { fileUploadAnatomy } from "@chakra-ui/react/anatomy";

export const fileUploadSlotRecipe = defineSlotRecipe({
  slots: fileUploadAnatomy.keys(),
  base: {
    dropzone: {
      borderRadius: "3xl",
    },
    item: {
      borderRadius: "3xl",
    },
  },
});
