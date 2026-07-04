import { themeColors } from "@konfi/components/theme";

// Admin-only palette overrides to align visually with konfi-cloud
// (shadcn/Tailwind tokens). The store keeps the default brand palette.
//
// - `primary` is neutralised to a near-black ramp matching cloud's
//   `oklch(0.205 0 0)` family so admin reads as a calm, professional surface.
// - `primaryAccent` remains the shared Konfi blue for informational accents
//   that should not inherit the black primary action color.
// - `success` is added as a dedicated palette so semantic `success.solid`
//   resolves to cloud's success green (`oklch(0.508 0.118 165.612)`).
const adminPrimary = {
  primary: {
    "50": { value: "oklch(0.985 0 0)" },
    "100": { value: "oklch(0.97 0 0)" },
    "200": { value: "oklch(0.922 0 0)" },
    "300": { value: "oklch(0.708 0 0)" },
    "400": { value: "oklch(0.556 0 0)" },
    "500": { value: "oklch(0.205 0 0)" },
    "600": { value: "oklch(0.18 0 0)" },
    "700": { value: "oklch(0.16 0 0)" },
    "800": { value: "oklch(0.13 0 0)" },
    "900": { value: "oklch(0.1 0 0)" },
  },
} as const;

const adminSuccess = {
  success: {
    "50": { value: "oklch(0.962 0.04 165.6)" },
    "100": { value: "oklch(0.92 0.07 165.6)" },
    "200": { value: "oklch(0.84 0.095 165.6)" },
    "300": { value: "oklch(0.74 0.11 165.6)" },
    "400": { value: "oklch(0.62 0.118 165.6)" },
    "500": { value: "oklch(0.508 0.118 165.6)" },
    "600": { value: "oklch(0.46 0.115 165.6)" },
    "700": { value: "oklch(0.4 0.105 165.6)" },
    "800": { value: "oklch(0.34 0.09 165.6)" },
    "900": { value: "oklch(0.26 0.07 165.6)" },
  },
} as const;

export default {
  ...themeColors,
  ...adminPrimary,
  ...adminSuccess,
};
