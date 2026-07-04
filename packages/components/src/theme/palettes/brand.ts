const primary = {
  "50": {
    value: "oklch(0.97 0.02 260)",
  },
  "100": {
    value: "oklch(0.93 0.05 260)",
  },
  "200": {
    value: "oklch(0.86 0.09 260)",
  },
  "300": {
    value: "oklch(0.78 0.14 261)",
  },
  "400": {
    value: "oklch(0.7 0.18 261)",
  },
  "500": {
    value: "oklch(0.62 0.21 261)",
  },
  "600": {
    value: "oklch(0.55 0.21 261)",
  },
  "700": {
    value: "oklch(0.47 0.18 261)",
  },
  "800": {
    value: "oklch(0.39 0.14 261)",
  },
  "900": {
    value: "oklch(0.31 0.1 261)",
  },
} as const;

export const brandColors = {
  primary,
  primaryAccent: primary,
} as const;
