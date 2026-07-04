import type { Locale } from "./enums";

export const STOREFRONT_HOME_BLOCK_TYPES = [
  "hero",
  "assistant",
  "trust-grid",
  "campaigns",
  "featured-products",
  "how-it-works",
  "popular-products",
  "testimonials",
  "newsletter",
  "rich-text-cta",
] as const;

export type StorefrontHomeBlockType =
  (typeof STOREFRONT_HOME_BLOCK_TYPES)[number];

export const STOREFRONT_HOME_BLOCK_VARIANTS = {
  assistant: ["default", "compact", "panel"],
  campaigns: ["default", "featured", "compact"],
  "featured-products": ["default", "spotlight", "compact"],
  hero: ["default", "fullscreen", "editorial"],
  "how-it-works": ["default", "timeline", "compact"],
  newsletter: ["default", "inline", "minimal"],
  "popular-products": ["default", "editorial", "compact"],
  "rich-text-cta": ["default", "centered", "split"],
  testimonials: ["default", "spotlight", "compact"],
  "trust-grid": ["default", "strip", "cards"],
} as const satisfies Record<StorefrontHomeBlockType, readonly string[]>;

type StorefrontHomeBlockVariantMap = typeof STOREFRONT_HOME_BLOCK_VARIANTS;

export type StorefrontHomeBlockVariant =
  StorefrontHomeBlockVariantMap[keyof StorefrontHomeBlockVariantMap][number];

export type StorefrontThemeRadius = "none" | "sm" | "md" | "lg" | "xl" | "3xl";

export const STOREFRONT_HOME_BLOCK_RADIUS_TARGETS = [
  "section",
  "cards",
  "media",
  "buttons",
] as const;

export type StorefrontHomeBlockRadiusTarget =
  (typeof STOREFRONT_HOME_BLOCK_RADIUS_TARGETS)[number];

export type StorefrontHomeBlockRadiusSettings = Partial<
  Record<StorefrontHomeBlockRadiusTarget, StorefrontThemeRadius>
>;

export type StorefrontButtonStyle = "solid" | "subtle" | "outline";

export interface StorefrontHomeBlock {
  body?: string;
  ctaHref?: string;
  ctaLabel?: string;
  enabled: boolean;
  id: string;
  imageUrl?: string;
  subtitle?: string;
  title?: string;
  radiusOverrides?: StorefrontHomeBlockRadiusSettings;
  translations?: Record<string, StorefrontHomeBlockTranslation>;
  type: StorefrontHomeBlockType;
  variant?: StorefrontHomeBlockVariant;
}

export interface StorefrontHomeBlockTranslation {
  body?: string;
  ctaLabel?: string;
  subtitle?: string;
  title?: string;
}

export interface StorefrontHomePage {
  blocks: StorefrontHomeBlock[];
  id: "home";
  removedDefaultBlockTypes?: StorefrontHomeBlockType[];
  sourceLocale?: Locale | string;
  updatedAt?: unknown;
  updatedByUid?: string;
}

export interface StorefrontThemeSettings {
  accentColor?: string;
  buttonStyle?: StorefrontButtonStyle;
  /** Render brand surfaces with a primary→accent gradient. */
  gradientEnabled?: boolean;
  id: "theme";
  logoUrl?: string;
  primaryColor?: string;
  radius?: StorefrontThemeRadius;
  updatedAt?: unknown;
  updatedByUid?: string;
}

export interface StorefrontSharingSettings {
  defaultOpenGraphImageUrl?: string;
  faviconUrl?: string;
  id: "sharing";
  updatedAt?: unknown;
  updatedByUid?: string;
}

export const DEFAULT_STOREFRONT_THEME = {
  buttonStyle: "solid",
  id: "theme",
} as const satisfies StorefrontThemeSettings;

export const DEFAULT_STOREFRONT_SHARING = {
  id: "sharing",
} as const satisfies StorefrontSharingSettings;

export const DEFAULT_STOREFRONT_HOME_BLOCKS = [
  { enabled: true, id: "hero", type: "hero" },
  { enabled: true, id: "assistant", type: "assistant" },
  { enabled: true, id: "trust-grid", type: "trust-grid" },
  { enabled: true, id: "campaigns", type: "campaigns" },
  { enabled: true, id: "featured-products", type: "featured-products" },
  { enabled: true, id: "how-it-works", type: "how-it-works" },
  { enabled: true, id: "popular-products", type: "popular-products" },
  { enabled: true, id: "testimonials", type: "testimonials" },
  { enabled: true, id: "newsletter", type: "newsletter" },
] as const satisfies readonly StorefrontHomeBlock[];

export const DEFAULT_STOREFRONT_HOME_PAGE = {
  blocks: [...DEFAULT_STOREFRONT_HOME_BLOCKS],
  id: "home",
} as const satisfies StorefrontHomePage;
