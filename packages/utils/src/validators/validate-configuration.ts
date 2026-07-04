import {
  Attribute,
  AttributeInputTypeEnum,
  Configuration,
  PriceTypeEnum,
  Product,
} from "@konfi/types";
import { ReadonlyURLSearchParams } from "next/navigation";
import { createSelectionFromPreset } from "../advanced-finishing";
import { DEFAULT_COMBINATION } from "../constants";
import {
  getCombination,
  resolveCalculatedCombination,
} from "../getters/get-combination";
import {
  areAllDependencyRulesMet,
  normalizeAttributeDependency,
} from "../getters/normalize-attribute-dependency";
import { getEnabledPageCountConfig, normalizePageCount } from "../page-count";
import { isMatrixLikePriceType } from "../price-types";

/**
 * Validates if dependent attributes are properly configured based on their dependencies
 */
export function validateDependentAttributes(
  selectedAttributeOptions: { [key: string]: string } | undefined,
  attributeDependencies: Product["attributeDependencies"] | undefined,
): { [key: string]: string } {
  if (!selectedAttributeOptions || !attributeDependencies)
    return selectedAttributeOptions || {};

  const validatedOptions: { [key: string]: string } = {};
  let resolvedInPass = true;

  while (resolvedInPass) {
    resolvedInPass = false;

    for (const [attributeId, value] of Object.entries(
      selectedAttributeOptions,
    )) {
      if (validatedOptions[attributeId] === value) {
        continue;
      }

      const rules = normalizeAttributeDependency(
        attributeDependencies[attributeId],
      );

      if (
        rules.length === 0 ||
        areAllDependencyRulesMet(rules, validatedOptions)
      ) {
        validatedOptions[attributeId] = value;
        resolvedInPass = true;
      }
    }
  }

  return validatedOptions;
}

export function validateConfiguration(
  prev: Configuration,
  next: Partial<Configuration>,
  product: Product,
  attributes: Attribute[],
  searchParams?: ReadonlyURLSearchParams | null,
  options?: { allowOutOfSpec?: boolean },
): Configuration {
  const newConfiguration = { ...prev, ...next };
  const allowOutOfSpec = options?.allowOutOfSpec ?? false;

  if (isMatrixLikePriceType(product.priceType)) {
    if (!allowOutOfSpec) {
      if (newConfiguration.quantity < 1) newConfiguration.quantity = 1;
      if (
        newConfiguration.volume &&
        newConfiguration.volume < product.spec.minimumOrder
      )
        newConfiguration.volume = product.spec.minimumOrder;
      if (
        newConfiguration.volume &&
        newConfiguration.volume > product.spec.maximumOrder
      )
        newConfiguration.volume = product.spec.maximumOrder;
    }
  } else {
    newConfiguration.volume = undefined;
    if (!allowOutOfSpec) {
      if (newConfiguration.quantity < 1) newConfiguration.quantity = 1;
      if (newConfiguration.quantity < product.spec.minimumOrder) {
        newConfiguration.quantity = product.spec.minimumOrder;
      }
      if (newConfiguration.quantity > product.spec.maximumOrder) {
        newConfiguration.quantity = product.spec.maximumOrder;
      }
    }
  }

  // Process attribute options merging
  if (next.selectedAttributeOptions) {
    newConfiguration.selectedAttributeOptions = {
      ...prev.selectedAttributeOptions,
      ...next.selectedAttributeOptions,
    };
  }
  if (next.advancedAttributeSelections) {
    newConfiguration.advancedAttributeSelections = {
      ...prev.advancedAttributeSelections,
      ...next.advancedAttributeSelections,
    };
  }

  // Always validate dependent attributes if any are selected
  if (newConfiguration.selectedAttributeOptions) {
    const stringifiedOptions: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(
      newConfiguration.selectedAttributeOptions,
    )) {
      stringifiedOptions[key] = String(value);
    }
    newConfiguration.selectedAttributeOptions = validateDependentAttributes(
      stringifiedOptions,
      product.attributeDependencies,
    );

    const nextAdvancedSelections = {
      ...(newConfiguration.advancedAttributeSelections ?? {}),
    };
    let hasAdvancedSelections = false;

    for (const attribute of attributes) {
      if (attribute.type !== AttributeInputTypeEnum.ADVANCED_FINISHING) {
        continue;
      }

      const selectedValue =
        newConfiguration.selectedAttributeOptions[attribute.id];
      if (typeof selectedValue !== "string" || selectedValue.length === 0) {
        delete nextAdvancedSelections[attribute.id];
        continue;
      }

      if (!nextAdvancedSelections[attribute.id]) {
        const preset = attribute.options.find(
          (option) => String(option.value) === selectedValue,
        )?.advancedPreset;

        nextAdvancedSelections[attribute.id] = createSelectionFromPreset(
          preset,
          selectedValue,
        );
      }

      hasAdvancedSelections = true;
    }

    newConfiguration.advancedAttributeSelections = hasAdvancedSelections
      ? nextAdvancedSelections
      : undefined;
  }

  if (!newConfiguration.selectedAttributeOptions) {
    newConfiguration.combination = null;
    newConfiguration.calculatedCombination = DEFAULT_COMBINATION;
    newConfiguration.descriptionCombination = null;
    newConfiguration.advancedAttributeSelections = undefined;
  } else {
    // Build splitCombination in the same order as attributes array
    const splitCombination = attributes
      .map((attr) => newConfiguration.selectedAttributeOptions?.[attr.id])
      .filter(
        (val): val is string => val !== undefined && val !== null,
      ) as string[];
    const [
      _combination,
      _calculatedCombination,
      _descriptionCombination,
      _attributeOptions,
    ] = getCombination(
      attributes,
      splitCombination,
      searchParams,
      product.attributeDependencies,
      true,
    );
    newConfiguration.combination = _combination || null;
    newConfiguration.calculatedCombination = resolveCalculatedCombination({
      combination: _combination,
      calculatedCombination: _calculatedCombination,
      priceType: product.priceType,
    });
    newConfiguration.descriptionCombination = _descriptionCombination || null;
  }

  newConfiguration.productId = product.id;
  const pageCountConfig = getEnabledPageCountConfig(product);

  if (pageCountConfig) {
    const activePageCountConfig =
      getEnabledPageCountConfig(
        product,
        newConfiguration.selectedAttributeOptions,
      ) ?? pageCountConfig;
    newConfiguration.pageCount =
      normalizePageCount(newConfiguration.pageCount, activePageCountConfig) ??
      activePageCountConfig.minimum;
  } else {
    delete newConfiguration.pageCount;
  }

  return newConfiguration;
}
