"use client";

import { Box, Text } from "@chakra-ui/react";
import { Attribute, Configuration, Product } from "@konfi/types";
import {
  areAllDependencyRulesMet,
  getEnabledPageCountConfig,
  getDisabledOptionsFromRules,
  normalizeAttributeDependency,
} from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import { ReadonlyURLSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo } from "react";
import { PageCountInput } from "./PageCountInput";
import { ProductOptionSelect } from "./OptionSelect";

type Props = {
  attributes: Attribute[];
  configuration: Configuration;
  updateConfiguration: React.Dispatch<Partial<Configuration>>;
  searchParams?: ReadonlyURLSearchParams;
  attributeDependencies?: Product["attributeDependencies"];
  product: Product;
  t: TFunction;
  i18n: i18n;
};

export function Options({
  attributes,
  configuration,
  updateConfiguration,
  searchParams,
  attributeDependencies,
  product,
  t,
  i18n,
}: Props) {
  const normalizedSelectedOptions = useMemo(() => {
    const selected = configuration.selectedAttributeOptions ?? {};
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(selected)) {
      normalized[key] = String(value);
    }

    return normalized;
  }, [configuration.selectedAttributeOptions]);

  const attributeDisabledOptions = useMemo(() => {
    const deps = attributeDependencies;
    const selected = normalizedSelectedOptions;
    const disabledMap: { [attributeId: string]: string[]; } = {};

    attributes.forEach((attr) => {
      const rules = normalizeAttributeDependency(deps?.[attr.id]);

      if (rules.length === 0) {
        disabledMap[attr.id] = [];
        return;
      }

      disabledMap[attr.id] = getDisabledOptionsFromRules(
        rules,
        attr.options.map((opt) => opt.value),
        selected,
      );
    });

    return disabledMap;
  }, [
    attributes,
    attributeDependencies,
    normalizedSelectedOptions,
  ]);

  // Determine which attributes should be shown based on dependency rules
  const activeAttributes = useMemo(() => {
    const deps = attributeDependencies;
    const selected = normalizedSelectedOptions;
    return attributes.filter((attr) => {
      const rules = normalizeAttributeDependency(deps?.[attr.id]);

      if (rules.length === 0) {
        return true;
      }

      return areAllDependencyRulesMet(rules, selected);
    });
  }, [
    attributes,
    attributeDependencies,
    normalizedSelectedOptions,
  ]);
  const pageCountConfig = useMemo(
    () => getEnabledPageCountConfig(product),
    [product],
  );
  const pageCountPlacementAttributeId = pageCountConfig?.placement?.afterAttributeId;
  const renderPageCountBeforeFirstAttribute =
    Boolean(pageCountConfig) &&
    (!pageCountPlacementAttributeId ||
      !activeAttributes.some(
        (attribute) => attribute.id === pageCountPlacementAttributeId,
      ));

  useEffect(() => {
    const selected = configuration.selectedAttributeOptions;
    if (!selected) return;

    const updates: { [key: string]: string; } = {};

    const missing = activeAttributes.filter((attr) => !(attr.id in selected));
    missing.forEach((attr) => {
      const disabledOptions = attributeDisabledOptions[attr.id] || [];
      const availableOptions = attr.options.filter(
        (opt) => !disabledOptions.includes(opt.value),
      );
      if (availableOptions.length > 0) {
        updates[attr.id] = availableOptions[0].value;
      }
    });

    activeAttributes.forEach((attr) => {
      const currentSelection = selected[attr.id];
      if (currentSelection !== undefined) {
        const disabledOptions = attributeDisabledOptions[attr.id] || [];
        const isDisabled = disabledOptions.includes(String(currentSelection));

        if (isDisabled) {
          const availableOptions = attr.options.filter(
            (opt) => !disabledOptions.includes(opt.value),
          );
          if (availableOptions.length > 0) {
            updates[attr.id] = availableOptions[0].value;
          }
        }
      }
    });

    if (Object.keys(updates).length === 0) return;

    // merge updates into existing selections
    updateConfiguration({
      selectedAttributeOptions: { ...selected, ...updates },
    });
  }, [
    activeAttributes,
    attributeDisabledOptions,
    configuration.selectedAttributeOptions,
    updateConfiguration,
  ]);

  return (
    <>
      {renderPageCountBeforeFirstAttribute && (
        <PageCountInput
          configuration={configuration}
          product={product}
          updateConfiguration={updateConfiguration}
          t={t}
          i18n={i18n}
        />
      )}
      {activeAttributes.map((attribute) => (
        <Fragment key={attribute.id}>
          <Box py={"2"} w={"100%"}>
            <Text mb={"2"} fontSize={"xl"} fontWeight={"600"}>
              {attribute.name}
            </Text>
            <ProductOptionSelect
              attribute={attribute}
              configuration={configuration}
              updateConfiguration={updateConfiguration}
              searchParams={searchParams}
              disabledOptions={attributeDisabledOptions[attribute.id] || []}
              t={t}
              i18n={i18n}
            />
          </Box>
          {pageCountConfig &&
            pageCountPlacementAttributeId === attribute.id && (
              <PageCountInput
                configuration={configuration}
                product={product}
                updateConfiguration={updateConfiguration}
                t={t}
                i18n={i18n}
              />
            )}
        </Fragment>
      ))}
    </>
  );
}
