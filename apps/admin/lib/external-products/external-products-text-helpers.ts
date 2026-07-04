import { fallbackLng, headerName } from "@/i18n/settings";
import { normalizeExternalDeliveryTime } from "@/lib/external-products/delivery-time";
import { headers } from "next/headers";

export async function getCurrentAdminLanguage(): Promise<string> {
  const headersList = await headers();
  return headersList.get(headerName) || fallbackLng;
}

export function detectTextLanguage(value: string): "pl" | "en" | "unknown" {
  if (/[ąćęłńóśźż]/i.test(value)) {
    return "pl";
  }

  if (
    /\b(flyers?|leaflets?|brochures?|cards?|posters?|paper|printing|sides?)\b/i.test(
      value,
    )
  ) {
    return "en";
  }

  if (
    /\b(ulotki|broszury|wizytówki|plakaty|papier|druk|strony?)\b/i.test(value)
  ) {
    return "pl";
  }

  return "unknown";
}

export function selectLocalizedTitle(title: string, language: string): string {
  const trimmed = title.trim();
  const bilingualMatch = trimmed.match(/^(.*?)\s*\(([^()]+)\)\s*$/);

  if (!bilingualMatch) {
    return trimmed;
  }

  const primary = bilingualMatch[1]?.trim();
  const secondary = bilingualMatch[2]?.trim();

  if (!primary || !secondary) {
    return trimmed;
  }

  const wantsPolish = language.toLowerCase().startsWith("pl");
  const primaryLanguage = detectTextLanguage(primary);
  const secondaryLanguage = detectTextLanguage(secondary);

  if (wantsPolish) {
    if (primaryLanguage === "pl") return primary;
    if (secondaryLanguage === "pl") return secondary;
    return primary;
  }

  if (primaryLanguage === "en") return primary;
  if (secondaryLanguage === "en") return secondary;
  return secondary;
}

export function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const MINOR_UNITS_MULTIPLIER = 100;
const DEFAULT_IMPORTED_DELIVERY_TIME_DAYS = 2;

export function toMinorUnits(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON) * MINOR_UNITS_MULTIPLIER);
}

export function getResolvedImportedDeliveryTime(deliveryTime?: number): number {
  return (
    normalizeExternalDeliveryTime(deliveryTime) ??
    DEFAULT_IMPORTED_DELIVERY_TIME_DAYS
  );
}
