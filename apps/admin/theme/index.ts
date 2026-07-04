import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { DARK_ALPHA, isElectron } from "@konfi/utils";
import colors from "./colors";
import { recipes } from "./recipes";
import { slotRecipes } from "./slotRecipes";

type ModeValue = { base: string; _dark: string };
type SemanticColorEntry = {
  solid: { value: ModeValue };
  contrast: { value: ModeValue };
  fg: { value: ModeValue };
  muted: { value: ModeValue };
  subtle: { value: ModeValue };
  emphasized: { value: ModeValue };
  focusRing: { value: ModeValue };
};

const isNeutralInvertedSolidPalette = (name: string) =>
  name === "primary" || name === "gray";

// Build semantic tokens for a given palette name
const buildSemanticFor = (name: string): SemanticColorEntry => ({
  solid: {
    value: {
      base: `{colors.${name}.500}`,
      _dark: isNeutralInvertedSolidPalette(name)
        ? `{colors.${name}.50}`
        : `{colors.${name}.500}`,
    },
  },
  contrast: {
    value: {
      base: `{colors.${name}.100}`,
      _dark: isNeutralInvertedSolidPalette(name)
        ? `{colors.${name}.900}`
        : "white",
    },
  },
  fg: {
    value: { base: `{colors.${name}.500}`, _dark: `{colors.${name}.300}` },
  },
  muted: {
    value: {
      base: `{colors.${name}.200}`,
      _dark: name === "gray" ? `{colors.${name}.700}` : `{colors.${name}.800}`,
    },
  },
  subtle: {
    value: {
      base: `{colors.${name}.100}`,
      _dark: `{colors.${name}.900${DARK_ALPHA}}`,
    },
  },
  emphasized: {
    value: { base: `{colors.${name}.300}`, _dark: `{colors.${name}.700}` },
  },
  focusRing: {
    value: { base: `{colors.${name}.100}`, _dark: `{colors.${name}.300}` },
  },
});

// Generate semantic color tokens for all palettes defined in colors
const semanticColorTokens = Object.keys(
  colors as Record<string, unknown>,
).reduce<Record<string, ReturnType<typeof buildSemanticFor>>>(
  (acc, name) => {
    acc[name] = buildSemanticFor(name);
    return acc;
  },
  {} as Record<string, ReturnType<typeof buildSemanticFor>>,
);

const appBackground = {
  base: "{colors.gray.50}",
  _dark: "{colors.gray.950}",
} as const;

const config = defineConfig({
  globalCss: {
    html: {
      margin: "0",
      padding: "0",
      minHeight: "100%",
      backgroundColor: appBackground,
    },
    body: {
      margin: "0",
      marginTop: isElectron() ? 6 : 0,
      padding: "0",
      minHeight: "100dvh",
      focusRingWidth: "4px",
      backgroundColor: appBackground,
    },
    "::selection": {
      backgroundColor: "{colors.primary.muted}",
    },
    "&::-webkit-scrollbar": {
      width: "10px",
      height: "10px",
      backgroundColor: appBackground,
    },
    "&::-webkit-scrollbar-track": {
      borderRadius: "24px",
      backgroundColor: appBackground,
      marginTop: isElectron() ? "30px" : "0",
    },
    "&::-webkit-scrollbar-track-piece": {
      backgroundColor: appBackground,
    },
    "&::-webkit-scrollbar-button": {
      width: "0",
      height: "0",
      display: "none",
      backgroundColor: appBackground,
    },
    "&::-webkit-scrollbar-thumb": {
      border: "3px solid transparent",
      backgroundColor: {
        base: "{colors.gray.300}",
        _dark: "{colors.gray.600}",
      },
      backgroundClip: "padding-box",
      borderRadius: "24px",
    },
    "&::-webkit-scrollbar-corner": {
      backgroundColor: appBackground,
    },
    main: {
      paddingTop: { base: "10", md: "4" },
      paddingBottom: { base: "0px", md: "340px" }, // Footer height + 40px
    },
    p: {
      lineHeight: "1.5",
    },
    ".titleBar": {
      h: "30px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      userSelect: "none",
      //@ts-expect-error - desktop app specific
      appRegion: "drag",
    },
  },
});

export const system = createSystem(defaultConfig, config, {
  theme: {
    keyframes: {
      glow: {
        "0%": {
          backgroundPosition: "0 0",
        },
        "50%": {
          backgroundPosition: "100% 0",
        },
        "100%": {
          backgroundPosition: "0 0",
        },
      },
      shimmerText: {
        "0%": { backgroundPosition: "-200% 0" },
        "100%": { backgroundPosition: "200% 0" },
      },
      pulseSize: {
        "0%": {
          transform: "scale(.33)",
        },
        "50%": {
          transform: "scale(.66)",
        },
        "100%": {
          transform: "scale(.33)",
        },
      },
      pulseOpacity: {
        "0%": {
          opacity: 1,
        },
        "50%": {
          opacity: 0,
        },
        "100%": {
          opacity: 1,
        },
      },
      "slide-from-right": {
        "0%": {
          transform: "translateX(100%)",
          opacity: 0,
        },
        "100%": {
          transform: "translateX(0)",
          opacity: 1,
        },
      },
      "slide-to-right": {
        "0%": {
          transform: "translateX(0)",
          opacity: 1,
        },
        "100%": {
          transform: "translateX(100%)",
          opacity: 0,
        },
      },
      float: {
        "0%": {
          transform: "translate3d(0, 0, 0) scale(1)",
        },
        "25%": {
          transform: "translate3d(10px, -16px, 0) scale(1.03)",
        },
        "50%": {
          transform: "translate3d(-15px, -6px, 0) scale(0.97)",
        },
        "75%": {
          transform: "translate3d(-6px, 15px, 0) scale(1.02)",
        },
        "100%": {
          transform: "translate3d(0, 0, 0) scale(1)",
        },
      },
      floatSmall: {
        "0%": {
          transform: "translate3d(0, 0, 0)",
        },
        "33%": {
          transform: "translate3d(3px, -4px, 0)",
        },
        "100%": {
          transform: "translate3d(0, 0, 0)",
        },
      },
    },
    tokens: {
      fonts: {
        heading: { value: "var(--font-geist-sans)" },
        body: { value: "var(--font-geist-sans)" },
        mono: { value: "var(--font-geist-mono)" },
      },
      colors,
      animations: {
        glow: { value: "glow 20s linear infinite" },
        shimmerText: { value: "shimmerText 2.5s linear infinite" },
        pulseSize: { value: "pulseSize 0.8s linear infinite" },
        pulseOpacity: { value: "pulseOpacity 3s ease-in-out infinite" },
        "slide-from-right": { value: "slide-from-right 300ms ease-out" },
        "slide-to-right": { value: "slide-to-right 300ms ease-out" },
        float: { value: "float 8s ease-in-out infinite alternate" },
        floatSmall: { value: "floatSmall 6s ease-in-out infinite alternate" },
      },
    },
    semanticTokens: {
      colors: semanticColorTokens,
    },
    recipes,
    slotRecipes,
  },
});
