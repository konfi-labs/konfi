import { Address } from "@konfi/types";

export type LatLngLiteral = { lat: number; lng: number };

function isNonEmptyString(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildShippingAddressString(address?: Address | null) {
  if (!address) return undefined;

  const streetParts: string[] = [];
  if (address.street?.trim()) streetParts.push(address.street.trim());

  const numberSegment = [address.number, address.local]
    .filter((segment) => isNonEmptyString(segment))
    .join("/");

  if (numberSegment) {
    streetParts.push(numberSegment.trim());
  }

  const streetLine = streetParts.join(" ").trim();
  const cityLine = [address.zip, address.city]
    .filter((segment) => isNonEmptyString(segment))
    .join(" ")
    .trim();
  const country = address.country?.trim();
  const parts = [streetLine, cityLine, country].filter((part) =>
    isNonEmptyString(part),
  );

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function readCachedPosition(cacheKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const cachedValue = localStorage.getItem(cacheKey);
  if (!cachedValue) {
    return null;
  }

  try {
    return JSON.parse(cachedValue) as LatLngLiteral;
  } catch {
    return null;
  }
}

function writeCachedPosition(cacheKey: string, position: LatLngLiteral) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(cacheKey, JSON.stringify(position));
  } catch {
    // Ignore storage failures; geocoding can still succeed without caching.
  }
}

export async function geocodeAddress(
  geocoder: google.maps.Geocoder,
  address: string,
  cacheKey: string,
): Promise<LatLngLiteral | null> {
  const cachedPosition = readCachedPosition(cacheKey);
  if (cachedPosition) {
    return cachedPosition;
  }

  try {
    const { results } = await geocoder.geocode({ address });
    const location = results[0]?.geometry?.location;

    if (!location) {
      return null;
    }

    const position = { lat: location.lat(), lng: location.lng() };
    writeCachedPosition(cacheKey, position);

    return position;
  } catch (error) {
    console.warn("Geocoding failed:", error);
    return null;
  }
}
