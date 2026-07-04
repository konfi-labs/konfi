import { defineSlotRecipe } from "@chakra-ui/react";
import { tagsInputAnatomy } from "@chakra-ui/react/anatomy";

export const tagsInputSlotRecipe = defineSlotRecipe({
  slots: tagsInputAnatomy.keys(),
  base: {
    control: {
      borderRadius: "full",
      background: "transparent",
      _focusWithin: {
        focusRing: "outside",
        focusRingWidth: "4px",
      },
    },
    input: {
      borderRadius: "full",
      background: "transparent",
    },
    clearTrigger: {
      borderRadius: "full",
    },
    itemPreview: {
      minH: "6",
      ps: 3,
      pe: 1,
      py: 0.5,
      gap: 0,
      borderRadius: "full",
    },
    itemInput: {
      borderRadius: "full",
    },
    itemText: {
      color: "primary.fg",
      fontWeight: "medium",
    },
    itemDeleteTrigger: {
      mr: "1px",
      borderRadius: "full",
    },
  },
});
