import { Price, Product, Volume } from "@konfi/types";
import {
  areAllDependencyRulesMet,
  getDisabledOptionsFromRules,
  normalizeAttributeDependency,
} from "@konfi/utils";
import {
  type CombinationAttribute,
  parseCombinationValues,
} from "./combination-parsing";

type GenerateDependencyAwareCombinationsInput = {
  attributeDependencies?: Product["attributeDependencies"];
  combinationAttributes: CombinationAttribute[];
};

/**
 * Generates combination ID strings that respect attribute dependency rules.
 *
 * Unlike `getCombinations` (which produces a fixed-length cross-product of all
 * option arrays), this function mirrors the logic used by
 * `parseCombinationValues`: when a dependency rule hides an attribute for a
 * given set of parent values, the attribute is *skipped* and no token is
 * emitted.  This produces variable-length combination IDs that the parser can
 * successfully validate.
 *
 * Use this instead of `getCombinations` when `attributeDependencies` are
 * present and no priced combination candidates exist yet.
 */
export const generateDependencyAwareCombinations = ({
  attributeDependencies,
  combinationAttributes,
}: GenerateDependencyAwareCombinationsInput): string[] => {
  const calculated = combinationAttributes.filter(
    (attribute) => attribute.calculated,
  );

  if (calculated.length === 0) {
    return [];
  }

  const results: string[] = [];

  const generate = (
    attributeIndex: number,
    tokens: string[],
    resolvedValues: Record<string, string>,
  ): void => {
    if (attributeIndex >= calculated.length) {
      if (tokens.length > 0) {
        results.push(tokens.join("-"));
      }

      return;
    }

    const attribute = calculated[attributeIndex];

    // Skip consume-single-token attributes — they have no predefined
    // options to enumerate during generation (only meaningful when
    // *parsing* existing price combination IDs).
    if (attribute.unmatchedTokenMode === "consume-single-token") {
      generate(attributeIndex + 1, tokens, resolvedValues);
      return;
    }

    const rules = normalizeAttributeDependency(
      attributeDependencies?.[attribute.id],
    );

    if (rules.length > 0 && !areAllDependencyRulesMet(rules, resolvedValues)) {
      generate(attributeIndex + 1, tokens, resolvedValues);
      return;
    }

    const optionValues = attribute.options
      .map((option) => String(option.value))
      .filter((value) => value.length > 0);
    const uniqueValues = [...new Set(optionValues)];

    const disabledValues =
      rules.length > 0
        ? new Set(
            getDisabledOptionsFromRules(rules, uniqueValues, resolvedValues),
          )
        : undefined;

    for (const value of uniqueValues) {
      if (disabledValues?.has(value)) {
        continue;
      }

      generate(attributeIndex + 1, [...tokens, value], {
        ...resolvedValues,
        [attribute.id]: value,
      });
    }
  };

  generate(0, [], {});

  return results;
};

type FilterValidMatrixCombinationsInput = {
  attributeDependencies?: Product["attributeDependencies"];
  combinationAttributes: CombinationAttribute[];
  combinations: string[];
};

export const filterValidMatrixCombinations = ({
  attributeDependencies,
  combinationAttributes,
  combinations,
}: FilterValidMatrixCombinationsInput): string[] => {
  if (combinationAttributes.length === 0) {
    return combinations;
  }

  const calculatedCombinationAttributes = combinationAttributes.filter(
    (attribute) => attribute.calculated,
  );

  if (calculatedCombinationAttributes.length === 0) {
    return combinations;
  }

  return combinations.filter((combination) =>
    Boolean(
      parseCombinationValues({
        attributeDependencies,
        attributes: calculatedCombinationAttributes,
        combinationId: combination,
      }),
    ),
  );
};

const hasUsableMatrixPrice = (price: Price): boolean => {
  return (
    price.combination?.active !== false &&
    typeof price.value === "number" &&
    Number.isFinite(price.value) &&
    price.value > 0
  );
};

type FilterPricedMatrixCombinationsInput = {
  combinations: string[];
  prices: Price[];
  volumes: Omit<Volume, "deliveryTime">[];
};

export const getPricedMatrixCombinationIds = ({
  prices,
  volumes,
}: Omit<FilterPricedMatrixCombinationsInput, "combinations">): string[] => {
  if (prices.length === 0 || volumes.length === 0) {
    return [];
  }

  const relevantVolumeValues = new Set(volumes.map((volume) => volume.value));
  const pricedCombinationIds = new Set<string>();

  for (const price of prices) {
    const combinationId = price.combination?.id;
    const volumeValue = price.volume?.value;

    if (
      !combinationId ||
      volumeValue === undefined ||
      !relevantVolumeValues.has(volumeValue) ||
      !hasUsableMatrixPrice(price)
    ) {
      continue;
    }

    pricedCombinationIds.add(combinationId);
  }

  return Array.from(pricedCombinationIds);
};

export const filterPricedMatrixCombinations = ({
  combinations,
  prices,
  volumes,
}: FilterPricedMatrixCombinationsInput): string[] => {
  if (
    combinations.length === 0 ||
    prices.length === 0 ||
    volumes.length === 0
  ) {
    return combinations;
  }

  const pricedCombinationIds = new Set(
    getPricedMatrixCombinationIds({
      prices,
      volumes,
    }),
  );

  const pricedCombinations = combinations.filter((combination) =>
    pricedCombinationIds.has(combination),
  );

  return pricedCombinations.length > 0 ? pricedCombinations : combinations;
};

type PartitionMatrixPricesInput = {
  prices: Price[];
  visibleCombinations: string[];
};

export const partitionMatrixPricesByVisibility = ({
  prices,
  visibleCombinations,
}: PartitionMatrixPricesInput): {
  hiddenPrices: Price[];
  visiblePrices: Price[];
} => {
  const visibleCombinationSet = new Set(visibleCombinations);

  return prices.reduce<{
    hiddenPrices: Price[];
    visiblePrices: Price[];
  }>(
    (accumulator, price) => {
      const combinationId = price.combination?.id;

      if (combinationId && visibleCombinationSet.has(combinationId)) {
        accumulator.visiblePrices.push(price);
      } else {
        accumulator.hiddenPrices.push(price);
      }

      return accumulator;
    },
    {
      hiddenPrices: [],
      visiblePrices: [],
    },
  );
};
