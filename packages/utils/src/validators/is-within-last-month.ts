import { isUndefined } from "es-toolkit";

export function isWithinLastMonth(publicationDate?: Date): boolean {
  if (isUndefined(publicationDate)) {
    return false;
  }

  const currentDateTime = new Date();
  const lastMonthDateTime = new Date(
    currentDateTime.getFullYear(),
    currentDateTime.getMonth() - 1,
    currentDateTime.getDate(),
  );

  return publicationDate >= lastMonthDateTime;
}
