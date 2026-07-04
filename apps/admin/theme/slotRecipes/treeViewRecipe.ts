import { treeViewAnatomy } from "@chakra-ui/react/anatomy";
import { defineSlotRecipe } from "@chakra-ui/react";

export const treeViewSlotRecipe = defineSlotRecipe({
  slots: treeViewAnatomy.keys(),
  base: {
    branchControl: {
      borderRadius: "full",
    },
    item: {
      borderRadius: "full",
    }
  }
});