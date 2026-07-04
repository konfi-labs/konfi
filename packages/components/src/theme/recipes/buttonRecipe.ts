import { defineRecipe } from "@chakra-ui/react";
import { themeGradients, themeShadows } from "../gradients";

export const buttonRecipe = defineRecipe({
  base: {
    borderRadius: "full",
  },
  variants: {
    variant: {
      blurGlow: {
        colorPalette: "primary",
        bg: "colorPalette.solid",
        backgroundSize: "133%",
        color: "colorPalette.contrast",
        backdropFilter: "saturate(125%) blur(10px)",
        boxShadow: themeShadows.primaryGlow,
        _active: {
          bg: "colorPalette.solid/90",
          boxShadow: themeShadows.primaryGlowHover,
        },
        _hover: {
          bg: "colorPalette.solid/90",
          boxShadow: themeShadows.primaryGlowHover,
        },
      },
      ai: {
        colorPalette: "primary",
        color: "colorPalette.contrast",
        bg: "colorPalette.solid",
        backgroundSize: "133%",
        bgImage: themeGradients.aiButton,
        transition:
          "background-image 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
        _active: {
          bgImage: themeGradients.aiButtonActive,
          transform: "translateY(0)",
        },
        _hover: {
          bgImage: themeGradients.aiButtonHover,
          transform: "translateY(-1px)",
        },
      },
    },
  },
});
