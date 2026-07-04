import { themeColors } from "@konfi/components/theme";

type ColorMode = "light" | "dark";

function withAlpha(color: string, opacity: number) {
  return color.startsWith("oklch(")
    ? color.replace(")", ` / ${opacity})`)
    : color;
}

export function getAnalyticsChartPalette(colorMode: ColorMode) {
  const isDark = colorMode === "dark";
  const comparisonSeries = isDark
    ? themeColors.primary["900"].value
    : themeColors.primary["100"].value;

  return {
    comparisonSeries,
    gridStroke: isDark
      ? themeColors.gray["700"].value
      : themeColors.gray["200"].value,
    hoverFill: withAlpha(comparisonSeries, isDark ? 0.72 : 0.95),
    primarySeries: isDark
      ? themeColors.primary["300"].value
      : themeColors.primary["500"].value,
    tooltipBg: isDark
      ? withAlpha(themeColors.gray["900"].value, 0.96)
      : themeColors.gray["50"].value,
    tooltipBorder: isDark
      ? themeColors.gray["700"].value
      : themeColors.gray["200"].value,
    tooltipMutedText: isDark
      ? themeColors.gray["400"].value
      : themeColors.gray["600"].value,
    tooltipText: isDark
      ? themeColors.gray["100"].value
      : themeColors.gray["900"].value,
  };
}
