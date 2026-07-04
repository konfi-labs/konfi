import "server-only";

import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";
import type { ExternalAttribute, ExternalProduct } from "@konfi/types";

/**
 * Internal logging and configuration-summarization helpers extracted from
 * `price-fetch-system.ts`. These are pure helpers with no I/O beyond
 * `console.log/warn/error` and are safe to share across the price-fetch
 * orchestration modules.
 */

export function summarizeConfiguration(
  configuration: Record<string, string>,
): string {
  const entries = Object.entries(configuration).toSorted(([keyA], [keyB]) =>
    keyA.localeCompare(keyB),
  );

  if (entries.length === 0) {
    return "(default)";
  }

  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

export function describeConfigurationForLog(options: {
  configuration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
}): Record<string, string> {
  const { configuration, externalAttributes } = options;
  const attributeByKey = new Map<string, ExternalAttribute>();

  for (const attribute of externalAttributes) {
    attributeByKey.set(getExternalAttributeKey(attribute), attribute);
  }

  return Object.fromEntries(
    Object.entries(configuration)
      .toSorted(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => {
        const attribute = attributeByKey.get(key);
        const label =
          attribute && attribute.id && attribute.id !== attribute.name
            ? `${attribute.name} (${attribute.id})`
            : (attribute?.name ?? key);
        return [label, value];
      }),
  );
}

export function logStructured(
  level: "log" | "warn" | "error",
  message: string,
  details?: unknown,
) {
  if (details === undefined) {
    console[level](message);
    return;
  }

  try {
    console[level](`${message} ${JSON.stringify(details)}`);
  } catch {
    console[level](message, details);
  }
}

export function hasOnlyZeroPrices(
  priceInfo: ExternalProduct["priceInfo"] | null | undefined,
): boolean {
  const priceRanges = priceInfo?.priceRanges ?? [];
  return (
    priceRanges.length > 0 && priceRanges.every((range) => range.price === 0)
  );
}

export function summarizePriceInfo(
  priceInfo: ExternalProduct["priceInfo"] | null | undefined,
): Record<string, unknown> {
  if (!priceInfo) {
    return { hasPriceInfo: false };
  }

  const priceRanges = priceInfo.priceRanges ?? [];
  const firstRange = priceRanges[0];

  return {
    hasPriceInfo: true,
    currency: priceInfo.currency,
    priceText: priceInfo.priceText,
    priceRangeCount: priceRanges.length,
    zeroPriceRangeCount: priceRanges.filter((range) => (range.price ?? 0) === 0)
      .length,
    nonZeroPriceRangeCount: priceRanges.filter(
      (range) => (range.price ?? 0) > 0,
    ).length,
    firstRange: firstRange
      ? {
          quantity: firstRange.quantity,
          price: firstRange.price,
          unit: firstRange.unit,
          deliveryTime: firstRange.deliveryTime,
        }
      : undefined,
  };
}
