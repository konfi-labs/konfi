import { defineSlotRecipe } from "@chakra-ui/react";
import { datePickerAnatomy } from "@chakra-ui/react/anatomy";

export const datePickerSlotRecipe = defineSlotRecipe({
  slots: datePickerAnatomy.keys(),
  base: {
    input: {
      borderRadius: "full",
    },
    trigger: {
      borderRadius: "full",
    },
    clearTrigger: {
      borderRadius: "full",
    },
    content: {
      borderRadius: "2xl",
      p: "2",
    },
    viewTrigger: {
      borderRadius: "full",
    },
    prevTrigger: {
      borderRadius: "full",
    },
    nextTrigger: {
      borderRadius: "full",
    },
    monthSelect: {
      borderRadius: "full",
    },
    yearSelect: {
      borderRadius: "full",
    },
    tableCellTrigger: {
      borderRadius: "full",
    },
  },
});