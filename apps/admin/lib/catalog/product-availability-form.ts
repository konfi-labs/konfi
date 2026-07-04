import { Timestamp } from "firebase/firestore";
import type { Product } from "@konfi/types";

export function isPublicationBeforeExpirationValid(availability: {
  publicationString?: string;
  expirationString?: string;
}): boolean {
  if (!availability.expirationString) {
    return true;
  }
  const publicationDate = new Date(availability.publicationString ?? "");
  const expirationDate = new Date(availability.expirationString);
  publicationDate.setUTCHours(2, 0, 0, 0);
  expirationDate.setUTCHours(2, 0, 0, 0);
  if (Number.isNaN(publicationDate.getTime()) || Number.isNaN(expirationDate.getTime())) {
    return true;
  }
  return publicationDate <= expirationDate;
}

export function buildAvailabilityPayload(availability: {
  published: boolean;
  publicationString?: string;
  availableForPurchase: boolean;
  expirationString?: string;
}): Product["availability"] {
  const publicationDate = new Date(availability.publicationString ?? "");
  publicationDate.setUTCHours(2, 0, 0, 0);
  const expirationDate = new Date(availability.expirationString ?? "");
  expirationDate.setUTCHours(2, 0, 0, 0);
  return {
    published: availability.published,
    publicationString: availability.publicationString,
    publication: availability.publicationString
      ? Timestamp.fromDate(publicationDate)
      : null,
    availableForPurchase: availability.availableForPurchase,
    expirationString: availability.expirationString,
    expiration: availability.expirationString
      ? Timestamp.fromDate(expirationDate)
      : null,
  };
}
