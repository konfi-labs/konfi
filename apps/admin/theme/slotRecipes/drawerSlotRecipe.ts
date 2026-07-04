import { defineSlotRecipe } from "@chakra-ui/react";
import { drawerAnatomy } from "@chakra-ui/react/anatomy";
import { isElectron } from "@konfi/utils";

const insetPositioner = {
  padding: "4",
  paddingTop: isElectron() ? "12" : "4",
};

const insetContent = {
  borderRadius: "3xl",
  h: "auto",
  maxH: isElectron() ? "calc(100dvh - 4rem)" : "calc(100dvh - 2rem)",
};

const insetSize = {
  positioner: insetPositioner,
  content: insetContent,
};

const insetSizeWithMaxWidth = (maxW: string) => ({
  ...insetSize,
  content: {
    ...insetContent,
    maxW,
  },
});

const fullSize = {
  positioner: {
    padding: "0",
    paddingTop: "0",
  },
  content: {
    borderRadius: "0",
    h: "100dvh",
    maxH: "100dvh",
  },
};

export const drawerSlotRecipe = defineSlotRecipe({
  slots: drawerAnatomy.keys(),
  base: {
    ...insetSize,
  },
  variants: {
    size: {
      xs: insetSizeWithMaxWidth("xs"),
      sm: insetSizeWithMaxWidth("md"),
      md: insetSizeWithMaxWidth("lg"),
      lg: insetSizeWithMaxWidth("2xl"),
      xl: insetSizeWithMaxWidth("4xl"),
      full: fullSize,
    },
  },
});
