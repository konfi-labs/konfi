"use client";

import type { ProductionCooperationRequestStatus } from "@sblyvwx/cloud-contracts";

export function getCooperationStatusColorPalette(
  status: ProductionCooperationRequestStatus,
) {
  switch (status) {
    case "PENDING":
      return "yellow";
    case "ACCEPTED":
    case "FULFILLED":
      return "success";
    case "DECLINED":
    case "CANCELLED":
      return "red";
    case "EXPIRED":
      return "gray";
  }
}

export function formatCooperationDate(
  value: string | undefined,
  formatter: Intl.DateTimeFormat,
  fallback: string,
) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return formatter.format(date);
}
