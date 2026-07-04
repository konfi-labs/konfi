import { Attribute, PriceTypeEnum, Product } from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";
import { ReadonlyURLSearchParams } from "next/navigation";
import { DEFAULT_COMBINATION } from "../constants";
import {
  areAllDependencyRulesMet,
  normalizeAttributeDependency,
} from "./normalize-attribute-dependency";

export function getCombination(
  memoAttributes: Attribute[],
  splitCombination?: string[],
  searchParams?: ReadonlyURLSearchParams | null,
  attributeDependencies?: Product["attributeDependencies"],
  includeAttributeNames?: boolean,
): [string, string, string, { [key: string]: string | number }] {
  const combinationValues: string[] = [];
  const calculatedCombinationValues: string[] = [];
  const descriptionCombinationValues: string[] = [];
  const attributeOptionsAccumulator: { [key: string]: string | number } = {};
  let splitIdx = 0;

  for (let i = 0; i < memoAttributes.length; i++) {
    const attribute = memoAttributes[i];
    const options = Array.isArray(attribute.options) ? attribute.options : [];

    const rules = normalizeAttributeDependency(
      attributeDependencies?.[attribute.id],
    );

    if (rules.length > 0) {
      const resolvedValues: Record<string, string> = {};

      for (const [key, value] of Object.entries(
        attributeOptionsAccumulator,
      )) {
        resolvedValues[key] = String(value);
      }

      if (!areAllDependencyRulesMet(rules, resolvedValues)) {
        continue;
      }
    }

    if (!options.length) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `Attribute with id ${attribute.id} has no options. Skipping in combination calculation.`,
        );
      }
      continue;
    }

    const splitVal =
      splitCombination && splitCombination.length > splitIdx
        ? splitCombination[splitIdx]
        : undefined;
    const queryValue = searchParams?.get(attribute.id);
    const hasQueryValue = !isUndefined(queryValue) && !isNull(queryValue);
    const findOption = (value: unknown) =>
      options.find(
        (opt: Attribute["options"][number]) =>
          String(opt.value) === String(value),
      );

    let option = splitVal !== undefined ? findOption(splitVal) : undefined;
    if (!option && hasQueryValue) {
      option = findOption(queryValue);
    }
    if (!option) {
      if (splitVal !== undefined || hasQueryValue) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `Falling back to default option for attribute ${attribute.id} due to invalid provided value.`,
          );
        }
      }
      option = options[0];
    }
    if (isUndefined(option)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `Unable to resolve option for attribute ${attribute.id}. Skipping in combination calculation.`,
        );
      }
      continue;
    }

    attributeOptionsAccumulator[attribute.id] = option.value;

    if (splitVal !== undefined) {
      splitIdx++;
    }

    const optionValueString = String(option.value);
    combinationValues.push(optionValueString);

    if (includeAttributeNames) {
      descriptionCombinationValues.push(`${attribute.name}: ${option.label}`);
    } else {
      descriptionCombinationValues.push(option.label);
    }

    if (attribute.calculated) {
      calculatedCombinationValues.push(optionValueString);
    }
  }

  return [
    combinationValues.join("-"),
    calculatedCombinationValues.join("-"),
    descriptionCombinationValues.join(", "),
    attributeOptionsAccumulator,
  ];
}

export function resolveCalculatedCombination({
  combination,
  calculatedCombination,
  priceType,
}: {
  combination?: string | null;
  calculatedCombination?: string | null;
  priceType: PriceTypeEnum;
}): string {
  if (priceType === PriceTypeEnum.DYNAMIC) {
    return calculatedCombination || combination || DEFAULT_COMBINATION;
  }

  return calculatedCombination || "";
}

export function getDescriptiveCombination(
  memoAttributes: Attribute[],
  splitCombination?: string[],
  searchParams?: ReadonlyURLSearchParams | null,
  attributeDependencies?: Product["attributeDependencies"],
): [string, string, string, { [key: string]: string | number }] {
  return getCombination(
    memoAttributes,
    splitCombination,
    searchParams,
    attributeDependencies,
    true,
  );
}
