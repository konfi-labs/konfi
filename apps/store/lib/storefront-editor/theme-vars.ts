import type {
  StorefrontThemeRadius,
  StorefrontThemeSettings,
} from "@konfi/types";

export const storefrontRadiusByRecipe = {
  "3xl": "32px",
  lg: "16px",
  md: "12px",
  none: "0px",
  sm: "8px",
  xl: "24px",
} as const satisfies Record<StorefrontThemeRadius, string>;

export const storefrontRadiusCssVar = {
  block:
    "var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-3xl)))",
  button:
    "var(--konfi-store-button-radius, var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-full))))",
  card: "var(--konfi-store-card-radius, var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-3xl))))",
  media:
    "var(--konfi-store-media-radius, var(--konfi-store-card-radius, var(--konfi-store-block-radius, var(--konfi-store-radius, var(--chakra-radii-3xl)))))",
} as const;

export const storefrontScopedRadiusCssVariables = [
  "--konfi-store-radius",
  "--chakra-radii-lg",
  "--chakra-radii-xl",
  "--chakra-radii-2xl",
  "--chakra-radii-3xl",
  "--chakra-radii-4xl",
] as const;

export type StorefrontScopedRadiusCssVariable =
  (typeof storefrontScopedRadiusCssVariables)[number];

export const storefrontRadiusCssValue = (radius: StorefrontThemeRadius) =>
  storefrontRadiusByRecipe[radius];

export const storefrontGradientCssVar = "--konfi-store-gradient";

const chakraPaletteVariables = (palette: string, color: string) => ({
  [`--chakra-colors-${palette}-contrast`]: "#ffffff",
  [`--chakra-colors-${palette}-emphasized`]: `color-mix(in oklch, ${color} 78%, black)`,
  [`--chakra-colors-${palette}-fg`]: color,
  [`--chakra-colors-${palette}-focus-ring`]: `color-mix(in srgb, ${color} 40%, transparent)`,
  [`--chakra-colors-${palette}-muted`]: `color-mix(in srgb, ${color} 22%, transparent)`,
  [`--chakra-colors-${palette}-solid`]: color,
  [`--chakra-colors-${palette}-subtle`]: `color-mix(in srgb, ${color} 12%, transparent)`,
});

/**
 * CSS custom properties that make the storefront theme visible: brand colors
 * are mapped onto the Chakra `primary`/`primaryAccent` palette variables, the
 * optional brand gradient is exposed as `--konfi-store-gradient`, and the
 * global radius is fanned out to the scoped radius variables.
 */
export const storefrontThemeCssVariables = (
  theme: Pick<
    StorefrontThemeSettings,
    "accentColor" | "gradientEnabled" | "primaryColor" | "radius"
  >,
): Record<string, string> => {
  const radius = theme.radius
    ? storefrontRadiusCssValue(theme.radius)
    : undefined;

  return {
    ...(theme.primaryColor
      ? {
          "--konfi-store-primary": theme.primaryColor,
          ...chakraPaletteVariables("primary", theme.primaryColor),
        }
      : {}),
    ...(theme.accentColor
      ? {
          "--konfi-store-accent": theme.accentColor,
          ...chakraPaletteVariables("primary-accent", theme.accentColor),
        }
      : {}),
    ...(theme.gradientEnabled && theme.primaryColor && theme.accentColor
      ? {
          [storefrontGradientCssVar]: `linear-gradient(135deg in oklch, ${theme.primaryColor} 0%, ${theme.accentColor} 100%)`,
        }
      : {}),
    ...(radius
      ? storefrontScopedRadiusCssVariables.reduce<Record<string, string>>(
          (result, variable) => ({ ...result, [variable]: radius }),
          {},
        )
      : {}),
  };
};
