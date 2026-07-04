import { DEFAULT_LOCALE } from "@konfi/types";

export function pickLocaleValue(
  values: Record<string, string>,
  locale: string,
): string {
  const normalized = locale?.split("-")[0] ?? locale;

  return (
    values[locale] ??
    values[normalized] ??
    values[DEFAULT_LOCALE] ??
    values[normalized?.toLowerCase() ?? ""] ??
    Object.values(values)[0] ??
    ""
  );
}
