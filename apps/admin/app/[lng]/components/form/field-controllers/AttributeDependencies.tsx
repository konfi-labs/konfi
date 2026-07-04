import { useT } from "@/i18n/client";
import {
  appendAttributeDependencyRule,
  filterConditionalOptionsByDependencyValues,
  getAvailableDependencyParentIds,
  removeAttributeDependencyRule,
  sortAttributeIdsWithDependencies,
  wouldCreateAttributeDependencyCycle,
} from "@/lib/attribute-dependency-editor";
import {
  Box,
  Button,
  Collapsible,
  createListCollection,
  Heading,
  HStack,
  IconButton,
  Portal,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import type { AttributeDependencyRule, Product } from "@konfi/types";
import { normalizeAttributeDependency } from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { isNull } from "es-toolkit";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

type AttributeDependenciesProps = {
  isProductForm?: boolean;
};

export const AttributeDependencies = ({
  isProductForm = false,
}: AttributeDependenciesProps) => {
  const { t } = useT();
  const { attributes } = useConfiguration();
  const { setValue, getValues } = useFormContext();
  const [newDependency, setNewDependency] = useState({
    attributeId: "",
    dependsOn: "",
    dependencyValues: [] as string[],
    conditionalOptions: {} as { [parentOptionValue: string]: string[] },
  });

  const activeAttributes: Product["attributes"] | undefined = useWatch({
    name: "attributes",
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const attributeDependencies: Product["attributeDependencies"] =
    useWatch({
      name: "attributeDependencies",
    }) || {};

  const availableAttributes = useMemo(() => {
    if (isNull(attributes) || !activeAttributes) return [];
    return attributes.filter((attr) => activeAttributes.includes(attr.id));
  }, [attributes, activeAttributes]);

  const availableDependentAttributes = useMemo(() => {
    const availableAttributeIds = availableAttributes.map((attr) => attr.id);

    return availableAttributes.filter(
      (attribute) =>
        getAvailableDependencyParentIds({
          attributeDependencies,
          attributeId: attribute.id,
          availableAttributeIds,
        }).length > 0,
    );
  }, [availableAttributes, attributeDependencies]);

  const availableParentAttributes = useMemo(() => {
    const availableParentIds = new Set(
      getAvailableDependencyParentIds({
        attributeDependencies,
        attributeId: newDependency.attributeId,
        availableAttributeIds: availableAttributes.map((attr) => attr.id),
      }),
    );

    return availableAttributes.filter((attr) =>
      availableParentIds.has(attr.id),
    );
  }, [availableAttributes, newDependency.attributeId, attributeDependencies]);

  const selectedParentAttribute = useMemo(() => {
    if (!newDependency.dependsOn || !attributes) return null;
    return (
      attributes.find((attr) => attr.id === newDependency.dependsOn) || null
    );
  }, [newDependency.dependsOn, attributes]);

  const selectedAttribute = useMemo(() => {
    if (!newDependency.attributeId || !attributes) return null;
    return (
      attributes.find((attr) => attr.id === newDependency.attributeId) || null
    );
  }, [newDependency.attributeId, attributes]);

  const visibleParentOptions = useMemo(() => {
    if (!selectedParentAttribute) {
      return [];
    }

    if (newDependency.dependencyValues.length === 0) {
      return selectedParentAttribute.options;
    }

    const selectedDependencyValues = new Set(newDependency.dependencyValues);

    return selectedParentAttribute.options.filter((option) =>
      selectedDependencyValues.has(option.value),
    );
  }, [newDependency.dependencyValues, selectedParentAttribute]);

  const buildDependencyRule = (): AttributeDependencyRule => {
    const filteredConditionalOptions =
      filterConditionalOptionsByDependencyValues(
        newDependency.dependencyValues,
        newDependency.conditionalOptions,
      );

    return {
      dependsOn: newDependency.dependsOn,
      ...(newDependency.dependencyValues.length > 0
        ? {
            dependencyValues: newDependency.dependencyValues,
          }
        : {}),
      ...(Object.keys(filteredConditionalOptions).length > 0
        ? {
            conditionalOptions: filteredConditionalOptions,
          }
        : {}),
    };
  };

  const handleAddDependency = () => {
    if (!newDependency.attributeId || !newDependency.dependsOn) {
      toaster.create({
        title: "Wybierz atrybut i jego zależność",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    const currentDependencies = getValues("attributeDependencies") || {};
    const currentRules = normalizeAttributeDependency(
      currentDependencies[newDependency.attributeId],
    );

    if (
      currentRules.some((rule) => rule.dependsOn === newDependency.dependsOn)
    ) {
      toaster.create({
        title: "Ta zależność już istnieje dla tego atrybutu",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    if (
      wouldCreateAttributeDependencyCycle(
        currentDependencies,
        newDependency.attributeId,
        newDependency.dependsOn,
      )
    ) {
      toaster.create({
        title: "Ta zależność utworzyłaby cykl atrybutów",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    const updatedDependencies = appendAttributeDependencyRule(
      currentDependencies,
      newDependency.attributeId,
      buildDependencyRule(),
    );
    const sortedAttributes = sortAttributeIdsWithDependencies(
      getValues("attributes") || [],
      updatedDependencies,
    );

    setValue("attributeDependencies", updatedDependencies);
    setValue("attributes", sortedAttributes);
    setNewDependency({
      attributeId: "",
      dependsOn: "",
      dependencyValues: [],
      conditionalOptions: {},
    });

    toaster.create({
      title: "Dodano zależność atrybutu",
      type: "success",
      duration: 3000,
    });
  };

  const handleRemoveDependency = (attributeId: string, ruleIndex: number) => {
    const currentDependencies = getValues("attributeDependencies") || {};
    const updatedDependencies = removeAttributeDependencyRule(
      currentDependencies,
      attributeId,
      ruleIndex,
    );
    const sortedAttributes = sortAttributeIdsWithDependencies(
      getValues("attributes") || [],
      updatedDependencies,
    );

    setValue("attributeDependencies", updatedDependencies);
    setValue("attributes", sortedAttributes);

    toaster.create({
      title: "Usunięto zależność atrybutu",
      type: "success",
      duration: 3000,
    });
  };

  const handleDependencyValueChange = (
    optionValue: string,
    checked: boolean,
  ) => {
    setNewDependency((prev) => {
      const newValues = checked
        ? [...prev.dependencyValues, optionValue]
        : prev.dependencyValues.filter((value) => value !== optionValue);

      return {
        ...prev,
        dependencyValues: newValues,
        conditionalOptions:
          newValues.length > 0
            ? filterConditionalOptionsByDependencyValues(
                newValues,
                prev.conditionalOptions,
              )
            : prev.conditionalOptions,
      };
    });
  };

  if (!isProductForm || !attributeDependencies || !availableAttributes.length)
    return null;

  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>
        <Button size="md" colorPalette="primary" pl={6} variant="outline">
          {t("attributeDependencies.configure", {
            defaultValue: "Configure attribute dependencies",
          })}
          <MaterialSymbol style={{ paddingTop: "3px" }}>
            expand_more
          </MaterialSymbol>
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content mt="4">
        <Box>
          <Text
            fontSize="sm"
            color={{ base: "gray.600", _dark: "gray.400" }}
            mb="4"
          >
            {t("attributeDependencies.description", {
              defaultValue:
                "Configure which attributes should be displayed only when other attributes have specific values.",
            })}
          </Text>

          {Object.keys(attributeDependencies).length > 0 && (
            <>
              <Heading size="sm" mb="3">
                {t("attributeDependencies.current", {
                  defaultValue: "Current dependencies",
                })}
              </Heading>
              <SimpleGrid minChildWidth="300px" gap="3" mb="6">
                {Object.entries(attributeDependencies).map(
                  ([attributeId, dependency]) => {
                    const dependencyRules =
                      normalizeAttributeDependency(dependency);

                    if (dependencyRules.length === 0) {
                      return null;
                    }

                    const attribute = attributes?.find(
                      (a) => a.id === attributeId,
                    );

                    return (
                      <Box
                        key={attributeId}
                        p="4"
                        border="1px solid"
                        borderColor={{ base: "gray.200", _dark: "gray.600" }}
                        borderRadius="3xl"
                      >
                        <Text fontWeight="medium" mb="2">
                          {attribute?.name}
                        </Text>
                        <Stack gap="3">
                          {dependencyRules.map((rule, ruleIndex) => {
                            const parentAttribute = attributes?.find(
                              (a) => a.id === rule.dependsOn,
                            );

                            return (
                              <Box
                                key={`${attributeId}-${rule.dependsOn}-${ruleIndex}`}
                                pt={ruleIndex === 0 ? "0" : "3"}
                                borderTopWidth={
                                  ruleIndex === 0 ? undefined : "1px"
                                }
                                borderColor={{
                                  base: "gray.100",
                                  _dark: "gray.700",
                                }}
                              >
                                <HStack
                                  justify="space-between"
                                  align="start"
                                  gap="3"
                                  mb="2"
                                >
                                  <Text
                                    fontSize="sm"
                                    color={{
                                      base: "gray.600",
                                      _dark: "gray.400",
                                    }}
                                  >
                                    {t("attributeDependencies.dependsOn", {
                                      defaultValue: "Depends on:",
                                    })}{" "}
                                    <strong>{parentAttribute?.name}</strong>
                                  </Text>
                                  <IconButton
                                    size="xs"
                                    variant="ghost"
                                    colorPalette="red"
                                    onClick={() =>
                                      handleRemoveDependency(
                                        attributeId,
                                        ruleIndex,
                                      )
                                    }
                                    aria-label={t(
                                      "attributeDependencies.removeRule",
                                      {
                                        defaultValue: "Remove rule",
                                      },
                                    )}
                                  >
                                    <MaterialSymbol>delete</MaterialSymbol>
                                  </IconButton>
                                </HStack>
                                {rule.dependencyValues &&
                                  rule.dependencyValues.length > 0 && (
                                    <Text
                                      fontSize="sm"
                                      color={{
                                        base: "gray.600",
                                        _dark: "gray.400",
                                      }}
                                    >
                                      {t("attributeDependencies.values", {
                                        defaultValue: "Values:",
                                      })}{" "}
                                      {rule.dependencyValues
                                        .map((val) => {
                                          const option =
                                            parentAttribute?.options.find(
                                              (opt) => opt.value === val,
                                            );
                                          return option?.label || val;
                                        })
                                        .join(", ")}
                                    </Text>
                                  )}
                                {(!rule.dependencyValues ||
                                  rule.dependencyValues.length === 0) && (
                                  <Text
                                    fontSize="sm"
                                    color={{
                                      base: "gray.600",
                                      _dark: "gray.400",
                                    }}
                                  >
                                    {t("attributeDependencies.values", {
                                      defaultValue: "Values:",
                                    })}{" "}
                                    <em>
                                      {t("attributeDependencies.anyValue", {
                                        defaultValue: "any value",
                                      })}
                                    </em>
                                  </Text>
                                )}
                                {rule.conditionalOptions &&
                                  Object.keys(rule.conditionalOptions).length >
                                    0 && (
                                    <Box
                                      mt="2"
                                      p="2"
                                      bg={{
                                        base: "gray.50",
                                        _dark: "gray.800",
                                      }}
                                      borderRadius="lg"
                                    >
                                      <Text
                                        fontSize="xs"
                                        fontWeight="medium"
                                        mb="1"
                                      >
                                        {t(
                                          "attributeDependencies.optionRestrictions",
                                          {
                                            defaultValue:
                                              "Option restrictions:",
                                          },
                                        )}
                                      </Text>
                                      {Object.entries(
                                        rule.conditionalOptions,
                                      ).map(([parentVal, allowedOptions]) => {
                                        const parentOpt =
                                          parentAttribute?.options.find(
                                            (opt) => opt.value === parentVal,
                                          );
                                        return (
                                          <Text
                                            key={parentVal}
                                            fontSize="xs"
                                            color={{
                                              base: "gray.600",
                                              _dark: "gray.400",
                                            }}
                                          >
                                            •{" "}
                                            <strong>
                                              {parentOpt?.label || parentVal}:
                                            </strong>{" "}
                                            {allowedOptions
                                              .map((val) => {
                                                const opt =
                                                  attribute?.options.find(
                                                    (o) => o.value === val,
                                                  );
                                                return opt?.label || val;
                                              })
                                              .join(", ")}
                                          </Text>
                                        );
                                      })}
                                    </Box>
                                  )}
                              </Box>
                            );
                          })}
                        </Stack>
                      </Box>
                    );
                  },
                )}
              </SimpleGrid>
            </>
          )}

          <Heading size="sm" mb="3">
            {t("attributeDependencies.addNew", {
              defaultValue: "Add new dependency",
            })}
          </Heading>
          <Box
            p="4"
            border="1px solid"
            borderColor={{ base: "gray.200", _dark: "gray.600" }}
            borderRadius="3xl"
          >
            <Stack gap="4">
              <Box>
                <Select.Root
                  value={
                    newDependency.attributeId ? [newDependency.attributeId] : []
                  }
                  onValueChange={(e) =>
                    setNewDependency(() => ({
                      attributeId: e.value[0],
                      dependsOn: "",
                      dependencyValues: [],
                      conditionalOptions: {},
                    }))
                  }
                  collection={createListCollection({
                    items: availableDependentAttributes.map((attr) => ({
                      label: attr.name,
                      value: attr.id,
                    })),
                  })}
                >
                  <Select.HiddenSelect />
                  <Select.Label>
                    {t("attributeDependencies.dependentAttribute", {
                      defaultValue: "Dependent attribute",
                    })}
                  </Select.Label>
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t(
                          "attributeDependencies.selectAttribute",
                          { defaultValue: "Select attribute..." },
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
                        {availableDependentAttributes.map((attribute) => (
                          <Select.Item key={attribute.id} item={attribute.id}>
                            {attribute.name}
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
                {newDependency.attributeId && (
                  <Text
                    mt={2}
                    fontSize={"xs"}
                    color={{ base: "gray.400", _dark: "gray.600" }}
                  >
                    [
                    {availableAttributes
                      .find((attr) => attr.id === newDependency.attributeId)
                      ?.options.map((option) => option.label)
                      .join(", ")}
                    ]
                  </Text>
                )}
              </Box>

              <Box>
                <Select.Root
                  value={
                    newDependency.dependsOn ? [newDependency.dependsOn] : []
                  }
                  onValueChange={(e) =>
                    setNewDependency((prev) => ({
                      ...prev,
                      dependsOn: e.value[0],
                      dependencyValues: [],
                      conditionalOptions: {},
                    }))
                  }
                  collection={createListCollection({
                    items: availableParentAttributes.map((attr) => ({
                      label: attr.name,
                      value: attr.id,
                    })),
                  })}
                >
                  <Select.HiddenSelect />
                  <Select.Label>
                    {t("attributeDependencies.parentAttribute", {
                      defaultValue: "Parent attribute",
                    })}
                  </Select.Label>
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t(
                          "attributeDependencies.selectParentAttribute",
                          { defaultValue: "Select parent attribute..." },
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
                        {availableParentAttributes.map((attribute) => (
                          <Select.Item key={attribute.id} item={attribute.id}>
                            {attribute.name}
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
              </Box>

              {selectedParentAttribute && (
                <Box>
                  <Text fontSize="sm" mb="2">
                    {t("attributeDependencies.triggerValues", {
                      defaultValue: "Show this attribute only for these values",
                    })}
                    <Text
                      as="span"
                      fontSize="xs"
                      color={{ base: "gray.500", _dark: "gray.400" }}
                    >
                      {" "}
                      (
                      {t("attributeDependencies.leaveEmpty", {
                        defaultValue:
                          "leave empty to show it for every parent value",
                      })}
                      )
                    </Text>
                  </Text>
                  <HStack wrap="wrap" gap="2">
                    {selectedParentAttribute.options.map((option) => {
                      const isSelected =
                        newDependency.dependencyValues.includes(option.value);
                      return (
                        <Button
                          key={option.value}
                          size="sm"
                          variant={isSelected ? "solid" : "outline"}
                          colorPalette={isSelected ? "primary" : "gray"}
                          onClick={() =>
                            handleDependencyValueChange(
                              option.value,
                              !isSelected,
                            )
                          }
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </HStack>
                </Box>
              )}

              {selectedParentAttribute && selectedAttribute && (
                <Box>
                  <Text fontSize="sm" fontWeight="medium" mb="3">
                    {t("attributeDependencies.conditionalOptions", {
                      defaultValue:
                        "Visible options for the dependent attribute",
                    })}
                    <Text
                      as="span"
                      fontSize="xs"
                      color={{ base: "gray.500", _dark: "gray.400" }}
                    >
                      {" "}
                      (
                      {t("attributeDependencies.conditionalOptionsHelp", {
                        attribute: selectedAttribute.name,
                        parentAttribute: selectedParentAttribute.name,
                        defaultValue:
                          "Choose which options of {{attribute}} stay visible for the selected values of {{parentAttribute}}.",
                      })}
                      )
                    </Text>
                  </Text>
                  <Stack gap="3">
                    {visibleParentOptions.map((parentOption) => {
                      const selectedOptions =
                        newDependency.conditionalOptions[parentOption.value] ||
                        [];
                      const hasSelection = selectedOptions.length > 0;

                      return (
                        <Box
                          key={parentOption.value}
                          p="3"
                          border="1px solid"
                          borderColor={{ base: "gray.100", _dark: "gray.700" }}
                          borderRadius="xl"
                        >
                          <Text fontSize="sm" fontWeight="medium" mb="2">
                            {t("attributeDependencies.whenParentIs", {
                              defaultValue: "When {{parentAttr}} = {{value}}:",
                              parentAttr: selectedParentAttribute.name,
                              value: parentOption.label,
                            })}
                          </Text>
                          <HStack wrap="wrap" gap="2">
                            {selectedAttribute.options.map((option) => {
                              const isSelected = selectedOptions.includes(
                                option.value,
                              );
                              return (
                                <Button
                                  key={option.value}
                                  size="xs"
                                  variant={isSelected ? "solid" : "outline"}
                                  colorPalette={isSelected ? "green" : "gray"}
                                  onClick={() => {
                                    setNewDependency((prev) => {
                                      const current =
                                        prev.conditionalOptions[
                                          parentOption.value
                                        ] || [];
                                      const updated = isSelected
                                        ? current.filter(
                                            (v) => v !== option.value,
                                          )
                                        : [...current, option.value];
                                      const conditionalOptions = {
                                        ...prev.conditionalOptions,
                                      };

                                      if (updated.length > 0) {
                                        conditionalOptions[parentOption.value] =
                                          updated;
                                      } else {
                                        delete conditionalOptions[
                                          parentOption.value
                                        ];
                                      }

                                      return {
                                        ...prev,
                                        conditionalOptions,
                                      };
                                    });
                                  }}
                                >
                                  {option.label}
                                </Button>
                              );
                            })}
                          </HStack>
                          {!hasSelection && (
                            <Text
                              fontSize="xs"
                              color={{ base: "gray.500", _dark: "gray.400" }}
                              mt="2"
                            >
                              {t("attributeDependencies.allOptionsAvailable", {
                                defaultValue:
                                  "All options stay visible for this value",
                              })}
                            </Text>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              <Button
                colorPalette="primary"
                onClick={handleAddDependency}
                disabled={
                  !newDependency.attributeId || !newDependency.dependsOn
                }
              >
                {t("attributeDependencies.add", {
                  defaultValue: "Add dependency",
                })}
              </Button>
            </Stack>
          </Box>
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
