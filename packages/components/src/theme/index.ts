import { createSystem, defaultConfig } from "@chakra-ui/react";
import { recipes } from "./recipes";

export const system = createSystem(defaultConfig, {
  theme: {
    recipes,
  },
});
