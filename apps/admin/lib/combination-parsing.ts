import type { Attribute, Product } from "@konfi/types";
import {
  areAllDependencyRulesMet,
  getDisabledOptionsFromRules,
  normalizeAttributeDependency,
} from "@konfi/utils";

type CombinationOption = Pick<
  NonNullable<Attribute["options"]>[number],
  "customFormat" | "label" | "value"
>;

export type CombinationAttribute = Pick<
  Attribute,
  "calculated" | "id" | "name"
> & {
  unmatchedTokenMode?: "consume-single-token";
  options: CombinationOption[];
};

export type ParsedCombinationValue = {
  attributeId: string;
  customFormat: boolean;
  label: string;
  value: string;
};

export type ParsedCombination = {
  values: ParsedCombinationValue[];
  valuesByAttributeId: Record<string, string>;
};

type CombinationCandidate = ParsedCombinationValue & {
  tokens: string[];
};

function getOrderedAttributeOptions(options: {
  attribute: Attribute;
  optionValues?: string[];
}): CombinationOption[] {
  const { attribute, optionValues } = options;

  if (!Array.isArray(attribute.options) || attribute.options.length === 0) {
    return [];
  }

  if (!optionValues || optionValues.length === 0) {
    return attribute.options.map((option) => ({
      customFormat: Boolean(option.customFormat),
      label: option.label ?? String(option.value),
      value: String(option.value),
    }));
  }

  const optionsByValue = new Map(
    attribute.options.map((option) => [String(option.value), option] as const),
  );

  return optionValues
    .map((optionValue) => {
      const option = optionsByValue.get(String(optionValue));

      if (!option) {
        return undefined;
      }

      return {
        customFormat: Boolean(option.customFormat),
        label: option.label ?? String(option.value),
        value: String(option.value),
      };
    })
    .filter((option): option is CombinationOption => Boolean(option));
}

function buildCombinationCandidates(
  attribute: CombinationAttribute,
): CombinationCandidate[] {
  const uniqueOptions = new Map<string, CombinationCandidate>();

  for (const option of attribute.options) {
    const value = String(option.value);

    if (value.length === 0 || uniqueOptions.has(value)) {
      continue;
    }

    uniqueOptions.set(value, {
      attributeId: attribute.id,
      customFormat: Boolean(option.customFormat),
      label: option.label ?? value,
      tokens: value.split("-"),
      value,
    });
  }

  return Array.from(uniqueOptions.values()).toSorted((left, right) => {
    const tokenCountDifference = right.tokens.length - left.tokens.length;

    if (tokenCountDifference !== 0) {
      return tokenCountDifference;
    }

    const valueLengthDifference = right.value.length - left.value.length;

    if (valueLengthDifference !== 0) {
      return valueLengthDifference;
    }

    return left.value.localeCompare(right.value);
  });
}

export function buildCombinationAttributes(options: {
  attributeIds: string[];
  attributeOptions?: Record<string, string[]>;
  attributes: Attribute[];
  missingOptionMode?: "consume-single-token" | "use-all-options";
}): CombinationAttribute[] {
  const {
    attributeIds,
    attributeOptions,
    attributes,
    missingOptionMode = "use-all-options",
  } = options;
  const attributesById = new Map(
    attributes.map((attribute) => [attribute.id, attribute] as const),
  );

  return attributeIds.flatMap((attributeId) => {
    const attribute = attributesById.get(attributeId);

    if (!attribute) {
      return [];
    }

    const hasExplicitOptionSelection =
      attributeOptions !== undefined &&
      Object.prototype.hasOwnProperty.call(attributeOptions, attributeId);

    if (
      attributeOptions !== undefined &&
      !hasExplicitOptionSelection &&
      missingOptionMode === "consume-single-token"
    ) {
      return [
        {
          calculated: attribute.calculated,
          id: attribute.id,
          name: attribute.name,
          options: [],
          unmatchedTokenMode: "consume-single-token",
        },
      ];
    }

    const orderedOptions = getOrderedAttributeOptions({
      attribute,
      optionValues: attributeOptions?.[attributeId],
    });

    if (orderedOptions.length === 0) {
      return [];
    }

    return [
      {
        calculated: attribute.calculated,
        id: attribute.id,
        name: attribute.name,
        options: orderedOptions,
      },
    ];
  });
}

export function parseCombinationValues(options: {
  attributeDependencies?: Product["attributeDependencies"];
  attributes: CombinationAttribute[];
  combinationId: string;
}): ParsedCombination | null {
  const { attributeDependencies, attributes, combinationId } = options;
  const tokens = combinationId.length > 0 ? combinationId.split("-") : [];
  const candidatesByAttribute = attributes.map((attribute) =>
    buildCombinationCandidates(attribute),
  );

  const parseAttribute = (
    attributeIndex: number,
    tokenIndex: number,
    resolvedValues: Record<string, string>,
  ): ParsedCombination | null => {
    if (attributeIndex >= attributes.length) {
      return tokenIndex === tokens.length
        ? {
            values: [],
            valuesByAttributeId: resolvedValues,
          }
        : null;
    }

    const attribute = attributes[attributeIndex];
    const rules = normalizeAttributeDependency(
      attributeDependencies?.[attribute.id],
    );

    if (rules.length > 0 && !areAllDependencyRulesMet(rules, resolvedValues)) {
      return parseAttribute(attributeIndex + 1, tokenIndex, resolvedValues);
    }

    const disabledOptionValues =
      rules.length > 0
        ? new Set(
            getDisabledOptionsFromRules(
              rules,
              attribute.options.map((option) => String(option.value)),
              resolvedValues,
            ),
          )
        : new Set<string>();

    if (attribute.unmatchedTokenMode === "consume-single-token") {
      const unmatchedValue = tokens[tokenIndex];

      if (unmatchedValue === undefined) {
        return null;
      }

      const parsedRest = parseAttribute(attributeIndex + 1, tokenIndex + 1, {
        ...resolvedValues,
        [attribute.id]: unmatchedValue,
      });

      if (parsedRest) {
        return {
          values: [
            {
              attributeId: attribute.id,
              customFormat: false,
              label: unmatchedValue,
              value: unmatchedValue,
            },
            ...parsedRest.values,
          ],
          valuesByAttributeId: parsedRest.valuesByAttributeId,
        };
      }
    }

    for (const candidate of candidatesByAttribute[attributeIndex] ?? []) {
      if (disabledOptionValues.has(candidate.value)) {
        continue;
      }

      const nextTokenIndex = tokenIndex + candidate.tokens.length;

      if (nextTokenIndex > tokens.length) {
        continue;
      }

      const matchesCandidate = candidate.tokens.every(
        (token, index) => tokens[tokenIndex + index] === token,
      );

      if (!matchesCandidate) {
        continue;
      }

      const parsedRest = parseAttribute(attributeIndex + 1, nextTokenIndex, {
        ...resolvedValues,
        [attribute.id]: candidate.value,
      });

      if (parsedRest) {
        return {
          values: [
            {
              attributeId: candidate.attributeId,
              customFormat: candidate.customFormat,
              label: candidate.label,
              value: candidate.value,
            },
            ...parsedRest.values,
          ],
          valuesByAttributeId: parsedRest.valuesByAttributeId,
        };
      }
    }

    return null;
  };

  return parseAttribute(0, 0, {});
}
