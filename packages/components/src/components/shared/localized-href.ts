import { DEFAULT_LOCALE, Locale } from "@konfi/types";

const SUPPORTED_LOCALES = new Set<string>(Object.values(Locale));

export function getSupportedLocale(lng?: string): Locale {
  return lng && SUPPORTED_LOCALES.has(lng) ? (lng as Locale) : DEFAULT_LOCALE;
}

export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(href) || href.startsWith("//");
}

function hasSupportedLocalePrefix(href: string): boolean {
  const [firstSegment] = href.split("/").filter(Boolean);
  return !!firstSegment && SUPPORTED_LOCALES.has(firstSegment);
}

export function getLocalizedHref(
  href: string | URL,
  lng?: string,
): string | URL {
  if (href instanceof URL || !lng) {
    return href;
  }

  const normalizedHref = href.trim();

  if (
    !normalizedHref ||
    normalizedHref.startsWith("#") ||
    normalizedHref.startsWith("?") ||
    isExternalHref(normalizedHref) ||
    hasSupportedLocalePrefix(normalizedHref)
  ) {
    return normalizedHref;
  }

  const locale = getSupportedLocale(lng);

  return normalizedHref.startsWith("/")
    ? `/${locale}${normalizedHref}`
    : `/${locale}/${normalizedHref}`;
}
