import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { DARK_ALPHA } from "@konfi/utils";
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

const buildSemanticFor = (name: string): SemanticColorEntry => ({
  solid: {
    value: { base: `{colors.${name}.500}`, _dark: `{colors.${name}.300}` },
  },
  contrast: {
    value: { base: `{colors.${name}.100}`, _dark: `{colors.${name}.900}` },
  },
  fg: {
    value: { base: `{colors.${name}.500}`, _dark: `{colors.${name}.300}` },
  },
  muted: {
    value: {
      base: `{colors.${name}.100}`,
      _dark:
        name === "gray"
          ? `{colors.${name}.800}`
          : `{colors.${name}.900${DARK_ALPHA}}`,
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
  base: "{colors.white}",
  _dark: "{colors.gray.950}",
} as const;

const config = defineConfig({
  globalCss: {
    "html, body": {
      margin: "0",
      padding: "0",
      minHeight: "100vh",
      focusRingWidth: "4px",
      backgroundColor: appBackground,
    },
    "::selection": {
      backgroundColor: "{colors.primary.muted}",
    },
    "&::-webkit-scrollbar": {
      width: "10px",
      backgroundColor: appBackground,
    },
    "&::-webkit-scrollbar-track": {
      borderRadius: "24px",
      backgroundColor: appBackground,
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
      paddingTop: { base: "8", md: "36" },
    },
    p: {
      lineHeight: "1.5",
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
    },
    tokens: {
      fonts: {
        heading: { value: "var(--font-unbounded)" },
        body: { value: "var(--font-montserrat)" },
      },
      colors,
      animations: {
        glow: { value: "glow 20s linear infinite" },
        shimmerText: { value: "shimmerText 2.5s linear infinite" },
        pulseSize: { value: "pulseSize 0.8s linear infinite" },
      },
    },
    semanticTokens: {
      colors: semanticColorTokens,
    },
    recipes,
    slotRecipes,
  },
});
