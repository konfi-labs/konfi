import { Price } from "@konfi/types";
import { isEqual } from "es-toolkit";
import { DEFAULT_COMBINATION } from "./constants";

/**
 * Compare two price arrays to determine if they are identical
 */
export function comparePrices(original: Price[], current: Price[]): boolean {
  if (original.length !== current.length) return false;

  // Sort both arrays by combination id for consistent comparison
  const sortedOriginal = [...original].sort((a, b) =>
    (a.combination?.id || DEFAULT_COMBINATION).localeCompare(
      b.combination?.id || DEFAULT_COMBINATION,
    ),
  );
  const sortedCurrent = [...current].sort((a, b) =>
    (a.combination?.id || DEFAULT_COMBINATION).localeCompare(
      b.combination?.id || DEFAULT_COMBINATION,
    ),
  );

  return isEqual(sortedOriginal, sortedCurrent);
}

/**
 * Detect changes between original and current price groups
 */
export function detectPriceChanges(
  originalPrices: Map<string, Price[]>,
  currentPrices: Map<string, Price[]>,
): Map<string, "created" | "updated" | "deleted"> {
  const changes = new Map<string, "created" | "updated" | "deleted">();

  // Check for created and updated combinations
  for (const [calculatedCombination, currentPriceArray] of currentPrices) {
    const originalPriceArray = originalPrices.get(calculatedCombination);

    if (!originalPriceArray) {
      // New combination created
      changes.set(calculatedCombination, "created");
    } else if (!comparePrices(originalPriceArray, currentPriceArray)) {
      // Existing combination updated
      changes.set(calculatedCombination, "updated");
    }
  }

  // Check for deleted combinations
  for (const [calculatedCombination] of originalPrices) {
    if (!currentPrices.has(calculatedCombination)) {
      changes.set(calculatedCombination, "deleted");
    }
  }

  return changes;
}

/**
 * Group prices by their calculated combination ID
 */
export function groupPricesByCalculatedCombination(
  prices: Price[],
): Map<string, Price[]> {
  const groups = new Map<string, Price[]>();

  prices.forEach((price) => {
    const calculatedCombination = price.combination?.id || DEFAULT_COMBINATION;
    if (!groups.has(calculatedCombination)) {
      groups.set(calculatedCombination, []);
    }
    groups.get(calculatedCombination)!.push(price);
  });

  return groups;
}

/**
 * Convert price groups map back to flat array
 */
export function flattenPriceGroups(priceGroups: Map<string, Price[]>): Price[] {
  return Array.from(priceGroups.values()).flat();
}
