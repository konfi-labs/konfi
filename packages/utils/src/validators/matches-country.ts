function normalizeCountryValue(country?: string | null): string | undefined {
  const normalizedCountry = country?.trim().toUpperCase();

  if (!normalizedCountry) {
    return undefined;
  }

  return normalizedCountry;
}

export const POLAND_COUNTRY_ALIASES = ["PL", "Polska", "Poland"] as const;

export function matchesCountry(
  country: string | null | undefined,
  allowedCountries: readonly string[],
): boolean {
  const normalizedCountry = normalizeCountryValue(country);

  if (!normalizedCountry) {
    return false;
  }

  return allowedCountries.some(
    (allowedCountry) =>
      normalizeCountryValue(allowedCountry) === normalizedCountry,
  );
}

export function isPolandCountryValue(
  country: string | null | undefined,
): boolean {
  return matchesCountry(country, POLAND_COUNTRY_ALIASES);
}

export function isAnonymousPackageShippingAllowedFor(
  country: string | null | undefined,
): boolean {
  return isPolandCountryValue(country);
}
