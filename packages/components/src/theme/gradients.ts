const primarySolid = "var(--chakra-colors-primary-solid)";
const primaryEmphasized = "var(--chakra-colors-primary-emphasized)";

export const themeGradients = {
  aiButton: `linear-gradient(
    48deg in oklch,
    color-mix(in oklch, ${primarySolid} 88%, black) 0%,
    ${primaryEmphasized} 100%
  )`,
  aiButtonHover: `linear-gradient(
    48deg in oklch,
    color-mix(in oklch, ${primarySolid} 78%, black) 0%,
    ${primarySolid} 100%
  )`,
  aiButtonActive: `linear-gradient(
    48deg in oklch,
    color-mix(in oklch, ${primarySolid} 68%, black) 0%,
    color-mix(in oklch, ${primarySolid} 92%, black) 100%
  )`,
  aiGlow: `linear-gradient(
    45deg in oklch,
    oklch(1 0 0) 0%,
    ${primarySolid} 18%,
    oklch(1 0 0) 36%,
    ${primarySolid} 54%,
    oklch(1 0 0) 72%,
    ${primarySolid} 100%
  )`,
  topShine:
    "linear-gradient(90deg in oklch, oklch(1 0 0 / 0) 20%, oklch(1 0 0 / 0.96) 50%, oklch(1 0 0 / 0) 80%)",
  primarySurfaceHover: `linear-gradient(
    180deg in oklch,
    transparent 0%,
    color-mix(in oklch, ${primarySolid} 8%, transparent) 100%
  )`,
  cardImageOverlay:
    "linear-gradient(0deg in oklch, oklch(0 0 0 / 0.08) 0%, oklch(0 0 0 / 0) 33%)",
  heroFallback: `linear-gradient(
    135deg in oklch,
    var(--chakra-colors-gray-950) 0%,
    color-mix(in oklch, ${primarySolid} 58%, black) 100%
  )`,
  newsletterSection: `linear-gradient(
    90deg in oklch,
    color-mix(in oklch, ${primarySolid} 78%, black) 0%,
    ${primarySolid} 100%
  )`,
  workflowSection: `linear-gradient(
    135deg in oklch,
    var(--chakra-colors-gray-950) 0%,
    color-mix(in oklch, ${primarySolid} 42%, black) 100%
  )`,
  chatShimmer:
    "linear-gradient(90deg in oklch, var(--chakra-colors-gray-200) 0%, var(--chakra-colors-gray-400) 50%, var(--chakra-colors-gray-200) 100%)",
} as const;

export const themeShadows = {
  primaryGlow: `0 20px 40px 0 color-mix(in oklch, ${primarySolid} 30%, transparent)`,
  primaryGlowHover: `0 10px 20px 0 color-mix(in oklch, ${primarySolid} 30%, transparent)`,
  primaryGlowStrong: `0 10px 20px 0 color-mix(in oklch, ${primarySolid} 50%, transparent)`,
} as const;
