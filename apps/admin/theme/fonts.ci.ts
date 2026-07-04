// Fallback fonts for CI/build environments without network access
export const fonts = {
  sans: {
    variable: "--font-geist-sans",
    className: "",
    style: { fontFamily: "system-ui, -apple-system, sans-serif" },
  },
  mono: {
    variable: "--font-geist-mono",
    className: "",
    style: { fontFamily: "ui-monospace, SFMono-Regular, monospace" },
  },
};
