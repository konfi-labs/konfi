import { Product } from "@konfi/types";

export interface ProductAvailabilityStatus {
  isExpired: boolean;
  isExpiringSoon: boolean;
  isUnpublished: boolean;
  isUnavailable: boolean;
  isScheduled: boolean;
  hiddenByExpiration: boolean;
  daysUntilExpiration: number | null;
  expirationDate: Date | null;
}

function readDate(value: unknown): Date | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  return null;
}

export function classifyProductAvailability(
  product: Product,
  options?: { now?: Date; expiresSoonWithinDays?: number },
): ProductAvailabilityStatus {
  const now = options?.now ?? new Date();
  const withinDays = options?.expiresSoonWithinDays ?? 90;

  const expirationDate = readDate(
    product.availability.expiration ?? product.availability.expirationString,
  );
  const publicationDate = readDate(
    product.availability.publication ?? product.availability.publicationString,
  );

  const isExpired = expirationDate !== null && expirationDate < now;

  const daysUntilExpiration =
    expirationDate === null
      ? null
      : Math.floor((expirationDate.getTime() - now.getTime()) / 86400000);

  const isExpiringSoon =
    expirationDate !== null &&
    !isExpired &&
    daysUntilExpiration !== null &&
    daysUntilExpiration <= withinDays;

  const isUnpublished = !product.availability.published;

  const isUnavailable = !product.availability.availableForPurchase;

  const isScheduled = publicationDate !== null && publicationDate > now;

  const baseShoppableIgnoringExpiration =
    product.active === true &&
    product.availability.published === true &&
    product.availability.availableForPurchase === true &&
    publicationDate !== null &&
    publicationDate <= now;

  const hiddenByExpiration = baseShoppableIgnoringExpiration && isExpired;

  return {
    isExpired,
    isExpiringSoon,
    isUnpublished,
    isUnavailable,
    isScheduled,
    hiddenByExpiration,
    daysUntilExpiration,
    expirationDate,
  };
}
