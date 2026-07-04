"use client";

import {
  Badge,
  Box,
  Button,
  createListCollection,
  HStack,
  IconButton,
  Portal,
  Select,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  isAttributeMappingReady,
  isExternalAttributeSelectable,
  isProviderOnlyPricingMappingComplete,
} from "@/lib/external-products/provider-pricing";
import { MaterialSymbol, toaster } from "@konfi/components";
import type {
  AttributeMapping,
  ExternalProduct,
  ExternalProductPricingExclusionRule,
} from "@konfi/types";
import { useMemo, useState } from "react";
import type { TranslateFn } from "./types";
import {
  getExternalAttributeKey,
  getExternalAttributeLabel,
} from "./attributeMappingUtils";
import PricingExclusionAssistantDialog from "./PricingExclusionAssistantDialog";

type DraftCondition = {
  attributeName: string;
  values: string[];
};

type PricingExclusionSectionProps = {
  draftMappings: AttributeMapping[];
  draftPricingExclusionRules: ExternalProductPricingExclusionRule[];
  displayExternalAttributes: ExternalProduct["attributes"][number][];
  addPricingExclusionRule: (rule: ExternalProductPricingExclusionRule) => void;
  addPricingExclusionRules: (
    rules: ExternalProductPricingExclusionRule[],
  ) => void;
  removePricingExclusionRule: (ruleIndex: number) => void;
  productId: string;
  t: TranslateFn;
};

const EMPTY_CONDITION: DraftCondition = {
  attributeName: "",
  values: [],
};

function getExternalOptionLabel(
  attribute: ExternalProduct["attributes"][number] | undefined,
  value: string,
): string {
  return (
    attribute?.options?.find((option) => option.value === value)?.label ?? value
  );
}

export default function PricingExclusionSection({
  draftMappings,
  draftPricingExclusionRules,
  displayExternalAttributes,
  addPricingExclusionRule,
  addPricingExclusionRules,
  removePricingExclusionRule,
  productId,
  t,
}: PricingExclusionSectionProps) {
  const [draftConditions, setDraftConditions] = useState<DraftCondition[]>([
    EMPTY_CONDITION,
  ]);
  const [draftExcludedAttributes, setDraftExcludedAttributes] = useState<
    Record<string, string[]>
  >({});

  const mappingByExternalName = useMemo(
    () =>
      new Map(
        draftMappings.map((mapping) => [
          mapping.externalAttributeName,
          mapping,
        ]),
      ),
    [draftMappings],
  );

  const allAttributesByKey = useMemo(
    () =>
      new Map(
        displayExternalAttributes.map((attribute) => [
          getExternalAttributeKey(attribute),
          attribute,
        ]),
      ),
    [displayExternalAttributes],
  );

  const availableRuleAttributes = useMemo(() => {
    return displayExternalAttributes.flatMap((attribute) => {
      if (!isExternalAttributeSelectable(attribute)) {
        return [];
      }

      const mapping = mappingByExternalName.get(
        getExternalAttributeKey(attribute),
      );

      if (!mapping || !isAttributeMappingReady(mapping) || mapping.ignored) {
        return [];
      }

      const restrictedValues = isProviderOnlyPricingMappingComplete(mapping)
        ? [mapping.fixedExternalValue.trim()]
        : Object.keys(mapping.optionMappings ?? {});
      const restrictedValueSet =
        restrictedValues.length > 0 ? new Set(restrictedValues) : undefined;
      const values = restrictedValueSet
        ? attribute.values.filter((value) => restrictedValueSet.has(value))
        : attribute.values;
      const options = restrictedValueSet
        ? attribute.options?.filter((option) =>
            restrictedValueSet.has(option.value),
          )
        : attribute.options;

      if (values.length === 0) {
        return [];
      }

      return [
        {
          ...attribute,
          options,
          values,
        },
      ];
    });
  }, [displayExternalAttributes, mappingByExternalName]);

  const availableRuleAttributesByKey = useMemo(
    () =>
      new Map(
        availableRuleAttributes.map((attribute) => [
          getExternalAttributeKey(attribute),
          attribute,
        ]),
      ),
    [availableRuleAttributes],
  );

  const omittableAttributeKeys = useMemo(
    () =>
      availableRuleAttributes
        .filter((attribute) => {
          const mapping = mappingByExternalName.get(
            getExternalAttributeKey(attribute),
          );
          return !mapping || !isProviderOnlyPricingMappingComplete(mapping);
        })
        .map((attribute) => getExternalAttributeKey(attribute)),
    [availableRuleAttributes, mappingByExternalName],
  );

  const resetDraftRule = () => {
    setDraftConditions([EMPTY_CONDITION]);
    setDraftExcludedAttributes({});
  };

  const updateDraftCondition = (
    conditionIndex: number,
    updates: Partial<DraftCondition>,
  ) => {
    setDraftConditions((prev) =>
      prev.map((condition, index) => {
        if (index !== conditionIndex) {
          return condition;
        }

        const nextCondition = {
          ...condition,
          ...updates,
        };

        if (
          updates.attributeName !== undefined &&
          updates.attributeName !== condition.attributeName
        ) {
          return {
            attributeName: updates.attributeName,
            values: [],
          };
        }

        return nextCondition;
      }),
    );
  };

  const removeDraftCondition = (conditionIndex: number) => {
    setDraftConditions((prev) =>
      prev.filter((_, index) => index !== conditionIndex),
    );
  };

  const addDraftCondition = () => {
    setDraftConditions((prev) => [...prev, EMPTY_CONDITION]);
  };

  const toggleDraftConditionValue = (conditionIndex: number, value: string) => {
    setDraftConditions((prev) =>
      prev.map((condition, index) => {
        if (index !== conditionIndex) {
          return condition;
        }

        const nextValues = condition.values.includes(value)
          ? condition.values.filter((currentValue) => currentValue !== value)
          : [...condition.values, value];

        return {
          ...condition,
          values: nextValues,
        };
      }),
    );
  };

  const toggleDraftExcludedAttribute = (attributeName: string) => {
    setDraftExcludedAttributes((prev) => {
      if (attributeName in prev) {
        const next = { ...prev };
        delete next[attributeName];
        return next;
      }

      return {
        ...prev,
        [attributeName]: [],
      };
    });
  };

  const toggleDraftExcludedAttributeValue = (
    attributeName: string,
    value: string,
  ) => {
    setDraftExcludedAttributes((prev) => {
      const currentValues = prev[attributeName] ?? [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((currentValue) => currentValue !== value)
        : [...currentValues, value];

      return {
        ...prev,
        [attributeName]: nextValues,
      };
    });
  };

  const handleAddRule = () => {
    const completeConditions = draftConditions.filter(
      (condition) =>
        condition.attributeName.trim().length > 0 &&
        condition.values.length > 0,
    );
    const uniqueConditionAttributeNames = new Set(
      completeConditions.map((condition) => condition.attributeName),
    );

    if (
      completeConditions.length === 0 ||
      completeConditions.length !== draftConditions.length ||
      uniqueConditionAttributeNames.size !== completeConditions.length ||
      Object.keys(draftExcludedAttributes).length === 0
    ) {
      toaster.create({
        title: t("externalProducts.pricingExclusionsValidationError", {
          defaultValue:
            "Pick at least one complete trigger condition and one supplier attribute or value to exclude.",
        }),
        duration: 3000,
        type: "warning",
      });
      return;
    }

    const when = Object.fromEntries(
      completeConditions.map((condition) => [
        condition.attributeName,
        condition.values,
      ]),
    );
    const conditionAttributeNames = new Set(Object.keys(when));
    const omitAttributes: string[] = [];
    const excludeValues: Record<string, string[]> = {};

    for (const [attributeName, values] of Object.entries(
      draftExcludedAttributes,
    )) {
      if (conditionAttributeNames.has(attributeName)) {
        continue;
      }

      const sanitizedValues = [...new Set(values)];

      if (sanitizedValues.length === 0) {
        omitAttributes.push(attributeName);
        continue;
      }

      excludeValues[attributeName] = sanitizedValues;
    }

    if (
      omitAttributes.length === 0 &&
      Object.keys(excludeValues).length === 0
    ) {
      toaster.create({
        title: t("externalProducts.pricingExclusionsValidationError", {
          defaultValue:
            "Pick at least one complete trigger condition and one supplier attribute or value to exclude.",
        }),
        duration: 3000,
        type: "warning",
      });
      return;
    }

    addPricingExclusionRule({
      when,
      ...(omitAttributes.length > 0 ? { omitAttributes } : {}),
      ...(Object.keys(excludeValues).length > 0 ? { excludeValues } : {}),
    });
    resetDraftRule();

    toaster.create({
      title: t("externalProducts.pricingExclusionsRuleAdded", {
        defaultValue: "Pricing exclusion rule added",
      }),
      duration: 3000,
      type: "success",
    });
  };

  const resolveAttributeLabel = (key: string): string => {
    const attr = allAttributesByKey.get(key);
    return attr ? getExternalAttributeLabel(attr) : key;
  };

  if (availableRuleAttributes.length < 2) {
    return null;
  }

  return (
    <VStack alignItems="stretch" gap={3}>
      <Box>
        <Text fontWeight="semibold" mb={1}>
          {t("externalProducts.pricingExclusionsTitle", {
            defaultValue: "Manual pricing exclusions",
          })}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {t("externalProducts.pricingExclusionsDescription", {
            defaultValue:
              "Build supplier fetch rules manually. When the selected mapped supplier values match, the chosen supplier attributes will be omitted from generated price-fetch configurations.",
          })}
        </Text>
      </Box>

      <PricingExclusionAssistantDialog
        addPricingExclusionRules={addPricingExclusionRules}
        displayExternalAttributes={displayExternalAttributes}
        draftMappings={draftMappings}
        draftPricingExclusionRules={draftPricingExclusionRules}
        productId={productId}
        t={t}
      />

      {draftPricingExclusionRules.length > 0 ? (
        <Stack gap={3}>
          <Text fontSize="sm" fontWeight="medium">
            {t("externalProducts.pricingExclusionsCurrent", {
              defaultValue: "Current exclusion rules",
            })}
          </Text>
          {draftPricingExclusionRules.map((rule, ruleIndex) => (
            <Box
              key={`${ruleIndex}-${JSON.stringify(rule)}`}
              p={3}
              borderWidth="1px"
              borderRadius="xl"
            >
              <HStack
                justifyContent="space-between"
                alignItems="flex-start"
                mb={2}
              >
                <HStack gap={2} alignItems="center">
                  <Text fontSize="sm" fontWeight="medium">
                    {t("externalProducts.pricingExclusionsRuleLabel", {
                      defaultValue: "Rule {{number}}",
                      number: ruleIndex + 1,
                    })}
                  </Text>
                  <Badge
                    size="sm"
                    colorPalette={rule.source === "ai" ? "blue" : "green"}
                    variant="subtle"
                  >
                    {rule.source === "ai"
                      ? t("externalProducts.pricingExclusionsSourceAi", {
                          defaultValue: "AI",
                        })
                      : t("externalProducts.pricingExclusionsSourceManual", {
                          defaultValue: "Manual",
                        })}
                  </Badge>
                </HStack>
                <IconButton
                  aria-label={t(
                    "externalProducts.pricingExclusionsRemoveRule",
                    {
                      defaultValue: "Remove rule",
                    },
                  )}
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  onClick={() => removePricingExclusionRule(ruleIndex)}
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                </IconButton>
              </HStack>

              <Text fontSize="xs" color="fg.muted" mb={2}>
                {t("externalProducts.pricingExclusionsWhen", {
                  defaultValue: "When all of these supplier values match",
                })}
              </Text>
              <HStack gap={2} flexWrap="wrap" mb={3}>
                {Object.entries(rule.when).map(([attributeKey, values]) => (
                  <Button
                    key={`${attributeKey}-${values.join("|")}`}
                    size="xs"
                    variant="outline"
                  >
                    {resolveAttributeLabel(attributeKey)}:{" "}
                    {values
                      .map((value) =>
                        getExternalOptionLabel(
                          allAttributesByKey.get(attributeKey),
                          value,
                        ),
                      )
                      .join(", ")}
                  </Button>
                ))}
              </HStack>

              <Text fontSize="xs" color="fg.muted" mb={2}>
                {t("externalProducts.pricingExclusionsThenOmit", {
                  defaultValue: "Omit these supplier attributes",
                })}
              </Text>
              <VStack alignItems="stretch" gap={2}>
                {(rule.omitAttributes ?? []).map((attributeKey) => (
                  <Button
                    key={attributeKey}
                    size="xs"
                    colorPalette="orange"
                    variant="solid"
                    alignSelf="flex-start"
                  >
                    {resolveAttributeLabel(attributeKey)}
                  </Button>
                ))}
                {Object.entries(rule.excludeValues ?? {}).map(
                  ([attributeKey, values]) => (
                    <Box key={`${attributeKey}-${values.join("|")}`}>
                      <Text fontSize="xs" color="fg.muted" mb={1}>
                        {resolveAttributeLabel(attributeKey)}
                      </Text>
                      <HStack gap={2} flexWrap="wrap">
                        {values.map((value) => (
                          <Button
                            key={`${attributeKey}-${value}`}
                            size="xs"
                            colorPalette="orange"
                            variant="outline"
                          >
                            {getExternalOptionLabel(
                              allAttributesByKey.get(attributeKey),
                              value,
                            )}
                          </Button>
                        ))}
                      </HStack>
                    </Box>
                  ),
                )}
              </VStack>
            </Box>
          ))}
        </Stack>
      ) : null}

      <Box p={4} borderWidth="1px" borderRadius="xl">
        <VStack alignItems="stretch" gap={3}>
          <Text fontSize="sm" fontWeight="medium">
            {t("externalProducts.pricingExclusionsAdd", {
              defaultValue: "Add manual exclusion rule",
            })}
          </Text>

          <Stack gap={3}>
            {draftConditions.map((condition, conditionIndex) => {
              const selectedAttributeKeys = new Set(
                draftConditions
                  .filter((_, index) => index !== conditionIndex)
                  .map((currentCondition) => currentCondition.attributeName)
                  .filter(Boolean),
              );
              const availableAttributesForCondition =
                availableRuleAttributes.filter(
                  (attribute) =>
                    getExternalAttributeKey(attribute) ===
                      condition.attributeName ||
                    !selectedAttributeKeys.has(
                      getExternalAttributeKey(attribute),
                    ),
                );
              const attributeCollection = createListCollection({
                items: availableAttributesForCondition.map((attribute) => ({
                  label: getExternalAttributeLabel(attribute),
                  value: getExternalAttributeKey(attribute),
                })),
              });
              const selectedAttribute = availableRuleAttributesByKey.get(
                condition.attributeName,
              );
              const valueCollection = createListCollection({
                items:
                  (selectedAttribute?.options ?? []).length > 0
                    ? (selectedAttribute?.options ?? []).map((option) => ({
                        label: option.label ?? option.value,
                        value: option.value,
                      }))
                    : (selectedAttribute?.values ?? []).map((value) => ({
                        label: value,
                        value,
                      })),
              });

              return (
                <Box
                  key={`${conditionIndex}-${condition.attributeName}`}
                  p={3}
                  borderWidth="1px"
                  borderRadius="xl"
                >
                  <VStack alignItems="stretch" gap={3}>
                    <HStack alignItems="flex-start" gap={2}>
                      <Box flex={1}>
                        <Select.Root
                          collection={attributeCollection}
                          value={
                            condition.attributeName
                              ? [condition.attributeName]
                              : []
                          }
                          onValueChange={(event) => {
                            updateDraftCondition(conditionIndex, {
                              attributeName: event.value[0] ?? "",
                            });
                          }}
                          size="sm"
                        >
                          <Select.HiddenSelect />
                          <Select.Control>
                            <Select.Trigger>
                              <Select.ValueText
                                placeholder={t(
                                  "externalProducts.pricingExclusionsSelectAttribute",
                                  {
                                    defaultValue:
                                      "Select supplier attribute...",
                                  },
                                )}
                              />
                            </Select.Trigger>
                            <Select.IndicatorGroup>
                              <Select.Indicator />
                            </Select.IndicatorGroup>
                          </Select.Control>
                          <Portal>
                            <Select.Positioner>
                              <Select.Content>
                                {attributeCollection.items.map((item) => (
                                  <Select.Item key={item.value} item={item}>
                                    {item.label}
                                    <Select.ItemIndicator />
                                  </Select.Item>
                                ))}
                              </Select.Content>
                            </Select.Positioner>
                          </Portal>
                        </Select.Root>
                      </Box>

                      {draftConditions.length > 1 ? (
                        <IconButton
                          aria-label={t(
                            "externalProducts.pricingExclusionsRemoveCondition",
                            {
                              defaultValue: "Remove condition",
                            },
                          )}
                          size="sm"
                          variant="ghost"
                          colorPalette="red"
                          onClick={() => removeDraftCondition(conditionIndex)}
                        >
                          <MaterialSymbol>delete</MaterialSymbol>
                        </IconButton>
                      ) : null}
                    </HStack>

                    {selectedAttribute ? (
                      <Box>
                        <Text fontSize="xs" color="fg.muted" mb={2}>
                          {t("externalProducts.pricingExclusionsSelectValues", {
                            defaultValue: "Select one or more supplier values",
                          })}
                        </Text>
                        <HStack gap={2} flexWrap="wrap">
                          {valueCollection.items.map((item) => {
                            const isSelected = condition.values.includes(
                              item.value,
                            );

                            return (
                              <Button
                                key={item.value}
                                size="xs"
                                variant={isSelected ? "solid" : "outline"}
                                colorPalette={isSelected ? "primary" : "gray"}
                                onClick={() =>
                                  toggleDraftConditionValue(
                                    conditionIndex,
                                    item.value,
                                  )
                                }
                              >
                                {item.label}
                              </Button>
                            );
                          })}
                        </HStack>
                      </Box>
                    ) : null}
                  </VStack>
                </Box>
              );
            })}
          </Stack>

          <Button
            alignSelf="flex-start"
            size="xs"
            variant="outline"
            onClick={addDraftCondition}
            disabled={draftConditions.length >= availableRuleAttributes.length}
          >
            {t("externalProducts.pricingExclusionsAddCondition", {
              defaultValue: "Add trigger condition",
            })}
          </Button>

          <Box>
            <Text fontSize="sm" fontWeight="medium" mb={2}>
              {t("externalProducts.pricingExclusionsThenOmit", {
                defaultValue: "Omit these supplier attributes",
              })}
            </Text>
            <HStack gap={2} flexWrap="wrap">
              {omittableAttributeKeys
                .filter(
                  (attrKey) =>
                    !draftConditions.some(
                      (condition) => condition.attributeName === attrKey,
                    ),
                )
                .map((attrKey) => {
                  const isSelected = attrKey in draftExcludedAttributes;
                  const displayName = resolveAttributeLabel(attrKey);

                  return (
                    <Button
                      key={attrKey}
                      size="sm"
                      variant={isSelected ? "solid" : "outline"}
                      colorPalette={isSelected ? "orange" : "gray"}
                      onClick={() => toggleDraftExcludedAttribute(attrKey)}
                    >
                      {displayName}
                    </Button>
                  );
                })}
            </HStack>
          </Box>

          {Object.keys(draftExcludedAttributes).length > 0 ? (
            <VStack alignItems="stretch" gap={3}>
              {Object.entries(draftExcludedAttributes).map(
                ([attributeKey, selectedValues]) => {
                  const attribute =
                    availableRuleAttributesByKey.get(attributeKey);

                  if (!attribute) {
                    return null;
                  }

                  const displayName = getExternalAttributeLabel(attribute);
                  const optionItems =
                    (attribute.options ?? []).length > 0
                      ? (attribute.options ?? []).map((option) => ({
                          label: option.label ?? option.value,
                          value: option.value,
                        }))
                      : attribute.values.map((value) => ({
                          label: value,
                          value,
                        }));

                  return (
                    <Box
                      key={attributeKey}
                      p={3}
                      borderWidth="1px"
                      borderRadius="xl"
                    >
                      <Text fontSize="sm" fontWeight="medium" mb={2}>
                        {displayName}
                      </Text>
                      <Text fontSize="xs" color="fg.muted" mb={2}>
                        {t(
                          "externalProducts.pricingExclusionsExcludeValuesHelp",
                          {
                            defaultValue:
                              "Optionally pick exact supplier values to exclude. Leave all values unselected to exclude the whole attribute.",
                          },
                        )}
                      </Text>
                      <HStack gap={2} flexWrap="wrap">
                        {optionItems.map((item) => {
                          const isSelected = selectedValues.includes(
                            item.value,
                          );

                          return (
                            <Button
                              key={`${attributeKey}-${item.value}`}
                              size="xs"
                              variant={isSelected ? "solid" : "outline"}
                              colorPalette={isSelected ? "orange" : "gray"}
                              onClick={() =>
                                toggleDraftExcludedAttributeValue(
                                  attributeKey,
                                  item.value,
                                )
                              }
                            >
                              {item.label}
                            </Button>
                          );
                        })}
                      </HStack>
                    </Box>
                  );
                },
              )}
            </VStack>
          ) : null}

          <Button
            colorPalette="primary"
            size="sm"
            onClick={handleAddRule}
            alignSelf="flex-start"
          >
            {t("externalProducts.pricingExclusionsAddRule", {
              defaultValue: "Add exclusion rule",
            })}
          </Button>
        </VStack>
      </Box>
    </VStack>
  );
}
