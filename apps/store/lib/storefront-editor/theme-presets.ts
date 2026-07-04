import type { StorefrontThemeSettings } from "@konfi/types";

export type StorefrontThemePresetValues = Pick<
  StorefrontThemeSettings,
  "accentColor" | "buttonStyle" | "gradientEnabled" | "primaryColor" | "radius"
>;

export interface StorefrontThemePreset {
  key: string;
  /** Fallback English name; translated via store.editor.theme.presets.<key>. */
  name: string;
  values: StorefrontThemePresetValues;
}

export const STOREFRONT_THEME_PRESETS: readonly StorefrontThemePreset[] = [
  {
    key: "classic",
    name: "Classic",
    values: {
      accentColor: undefined,
      buttonStyle: "solid",
      gradientEnabled: undefined,
      primaryColor: undefined,
      radius: undefined,
    },
  },
  {
    key: "ink",
    name: "Ink",
    values: {
      accentColor: "#0f766e",
      buttonStyle: "outline",
      gradientEnabled: undefined,
      primaryColor: "#1f2937",
      radius: "none",
    },
  },
  {
    key: "ocean",
    name: "Ocean",
    values: {
      accentColor: "#6366f1",
      buttonStyle: "solid",
      gradientEnabled: true,
      primaryColor: "#0369a1",
      radius: "xl",
    },
  },
  {
    key: "forest",
    name: "Forest",
    values: {
      accentColor: "#65a30d",
      buttonStyle: "subtle",
      gradientEnabled: undefined,
      primaryColor: "#166534",
      radius: "md",
    },
  },
  {
    key: "sunset",
    name: "Sunset",
    values: {
      accentColor: "#db2777",
      buttonStyle: "solid",
      gradientEnabled: true,
      primaryColor: "#c2410c",
      radius: "3xl",
    },
  },
  {
    key: "plum",
    name: "Plum",
    values: {
      accentColor: "#a21caf",
      buttonStyle: "solid",
      gradientEnabled: undefined,
      primaryColor: "#6d28d9",
      radius: "xl",
    },
  },
];

export const applyStorefrontThemePreset = (
  theme: StorefrontThemeSettings,
  preset: StorefrontThemePreset,
): StorefrontThemeSettings => ({
  ...theme,
  ...preset.values,
});

export const storefrontThemePresetIsActive = (
  theme: StorefrontThemeSettings,
  preset: StorefrontThemePreset,
): boolean =>
  theme.accentColor === preset.values.accentColor &&
  (theme.buttonStyle ?? "solid") === (preset.values.buttonStyle ?? "solid") &&
  Boolean(theme.gradientEnabled) === Boolean(preset.values.gradientEnabled) &&
  theme.primaryColor === preset.values.primaryColor &&
  theme.radius === preset.values.radius;
