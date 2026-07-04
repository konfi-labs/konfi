import { defineSlotRecipe } from "@chakra-ui/react";

const tabsSlots = [
  "root",
  "list",
  "trigger",
  "indicator",
  "content",
  "contentGroup",
] as const;

export const tabsSlotRecipe = defineSlotRecipe({
  slots: tabsSlots,
  base: {
    root: {
      "--tabs-trigger-radius": "radii.full",
    },
    list: {
      borderRadius: "var(--tabs-trigger-radius)",
    },
    trigger: {
      borderRadius: "var(--tabs-trigger-radius)",
    },
    indicator: {
      borderRadius: "var(--tabs-trigger-radius)",
    },
  },
  variants: {
    variant: {
      enclosed: {
        list: {
          borderRadius: "var(--tabs-trigger-radius)",
        },
      },
    },
  },
  defaultVariants: {
    variant: "enclosed",
  },
});
