"use client";

import type {
  StorefrontHomeBlockType,
  StorefrontHomeBlockVariant,
} from "@konfi/types";

type VariantIconKind =
  | "banner"
  | "cards"
  | "center"
  | "compact"
  | "framed"
  | "full"
  | "grid"
  | "inline"
  | "minimal"
  | "split"
  | "spotlight"
  | "steps"
  | "strip"
  | "textBlock"
  | "timeline";

const variantIconKinds: Record<
  StorefrontHomeBlockType,
  Partial<Record<StorefrontHomeBlockVariant, VariantIconKind>>
> = {
  assistant: { compact: "compact", default: "banner", panel: "framed" },
  campaigns: { compact: "compact", default: "banner", featured: "framed" },
  "featured-products": {
    compact: "strip",
    default: "grid",
    spotlight: "spotlight",
  },
  hero: { default: "banner", editorial: "split", fullscreen: "full" },
  "how-it-works": { compact: "compact", default: "steps", timeline: "timeline" },
  newsletter: { default: "banner", inline: "inline", minimal: "minimal" },
  "popular-products": { compact: "strip", default: "grid", editorial: "split" },
  "rich-text-cta": { centered: "center", default: "textBlock", split: "split" },
  testimonials: { compact: "compact", default: "cards", spotlight: "spotlight" },
  "trust-grid": { cards: "cards", default: "grid", strip: "strip" },
};

const iconShapes: Record<VariantIconKind, React.ReactNode> = {
  banner: (
    <>
      <rect height="22" rx="2" width="36" x="2" y="2" />
      <line x1="6" x2="20" y1="10" y2="10" />
      <line x1="6" x2="15" y1="15" y2="15" />
    </>
  ),
  cards: (
    <>
      <rect height="16" rx="2" width="10" x="2" y="5" />
      <rect height="16" rx="2" width="10" x="15" y="5" />
      <rect height="16" rx="2" width="10" x="28" y="5" />
    </>
  ),
  center: (
    <>
      <rect height="22" rx="2" width="36" x="2" y="2" />
      <line x1="13" x2="27" y1="9" y2="9" />
      <line x1="15" x2="25" y1="13" y2="13" />
      <rect height="3.5" rx="1.75" width="10" x="15" y="17" />
    </>
  ),
  compact: (
    <>
      <rect height="10" rx="2" width="36" x="2" y="8" />
      <line x1="6" x2="22" y1="13" y2="13" />
    </>
  ),
  framed: (
    <>
      <rect height="22" rx="3" width="36" x="2" y="2" />
      <rect height="12" rx="2" width="26" x="7" y="7" />
    </>
  ),
  full: <rect height="24" rx="2" width="38" x="1" y="1" />,
  grid: (
    <>
      <rect height="9" rx="1.5" width="10" x="2" y="3" />
      <rect height="9" rx="1.5" width="10" x="15" y="3" />
      <rect height="9" rx="1.5" width="10" x="28" y="3" />
      <rect height="9" rx="1.5" width="10" x="2" y="15" />
      <rect height="9" rx="1.5" width="10" x="15" y="15" />
      <rect height="9" rx="1.5" width="10" x="28" y="15" />
    </>
  ),
  inline: (
    <>
      <rect height="12" rx="2" width="36" x="2" y="7" />
      <line x1="6" x2="18" y1="13" y2="13" />
      <rect height="5" rx="2" width="9" x="25" y="10.5" />
    </>
  ),
  minimal: (
    <>
      <line x1="4" x2="22" y1="13" y2="13" />
      <rect height="5" rx="2" width="10" x="26" y="10.5" />
    </>
  ),
  split: (
    <>
      <rect height="22" rx="2" width="17" x="2" y="2" />
      <rect height="22" rx="2" width="17" x="21" y="2" />
    </>
  ),
  spotlight: (
    <>
      <rect height="22" rx="2" width="22" x="2" y="2" />
      <rect height="9.5" rx="1.5" width="11" x="27" y="2" />
      <rect height="9.5" rx="1.5" width="11" x="27" y="14.5" />
    </>
  ),
  steps: (
    <>
      <circle cx="7" cy="10" r="4" />
      <circle cx="20" cy="10" r="4" />
      <circle cx="33" cy="10" r="4" />
      <line x1="4" x2="10" y1="20" y2="20" />
      <line x1="17" x2="23" y1="20" y2="20" />
      <line x1="30" x2="36" y1="20" y2="20" />
    </>
  ),
  strip: (
    <>
      <rect height="8" rx="1.5" width="7" x="2" y="9" />
      <rect height="8" rx="1.5" width="7" x="12" y="9" />
      <rect height="8" rx="1.5" width="7" x="22" y="9" />
      <rect height="8" rx="1.5" width="7" x="32" y="9" />
    </>
  ),
  textBlock: (
    <>
      <line x1="3" x2="24" y1="5" y2="5" />
      <line x1="3" x2="30" y1="10" y2="10" />
      <line x1="3" x2="27" y1="15" y2="15" />
      <rect height="4.5" rx="2" width="12" x="3" y="19" />
    </>
  ),
  timeline: (
    <>
      <line x1="20" x2="20" y1="2" y2="24" />
      <circle cx="20" cy="5" r="2.5" />
      <circle cx="20" cy="13" r="2.5" />
      <circle cx="20" cy="21" r="2.5" />
      <line x1="6" x2="15" y1="5" y2="5" />
      <line x1="25" x2="34" y1="13" y2="13" />
      <line x1="6" x2="15" y1="21" y2="21" />
    </>
  ),
};

export const StorefrontBlockVariantIcon = ({
  type,
  variant,
}: {
  type: StorefrontHomeBlockType;
  variant: StorefrontHomeBlockVariant;
}) => (
  <svg
    aria-hidden
    fill="none"
    height="26"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.5"
    viewBox="0 0 40 26"
    width="40"
  >
    {iconShapes[variantIconKinds[type][variant] ?? "banner"]}
  </svg>
);
