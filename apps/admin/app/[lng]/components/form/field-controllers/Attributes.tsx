import { useT } from "@/i18n/client";
import {
  Box,
  Button,
  Collapsible,
  Heading,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { Attribute, Product } from "@konfi/types";
import {
  isMatrixLikePriceType,
  normalizeAttributeDependency,
} from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import { startTransition, useCallback, useMemo, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import AttributeInfo from "../../configuration/AttributeInfo";
type AttributesFieldControllerProps = {
  isProductForm?: boolean;
};

const ALL_ATTRIBUTES_PREVIEW_LIMIT = 12;

export const Attributes = ({
  isProductForm = false,
}: AttributesFieldControllerProps) => {
  const { t } = useT();
  const { attributes } = useConfiguration();
  const { control } = useFormContext();
  const { swap, remove, append } = useFieldArray({
    control,
    name: "attributes",
  });
  const activeAttributes: Product["attributes"] | null = useWatch({
    name: "attributes",
  });
  const activeAttributeOptions: Product["attributeOptions"] | null = useWatch({
    name: "attributeOptions",
  });
  const attributeDependencies: Product["attributeDependencies"] = useWatch({
    name: "attributeDependencies",
  });
  const watchProductType: Product["productType"] = useWatch({
    name: "productType",
  });
  const watchPriceType: Product["priceType"] = useWatch({ name: "priceType" });
  const [attributeSearch, setAttributeSearch] = useState("");
  const hasProductTypeSelection = Boolean(watchProductType?.id);

  const isMissingAttributes = useMemo(() => {
    if (!attributes || !activeAttributes) return;
    for (let i = 0; i < activeAttributes?.length; i++) {
      if (
        isUndefined(attributes?.find((obj) => obj.id === activeAttributes[i]))
      ) {
        console.error(`Nie znaleziono atrybutu ${activeAttributes[i]}`);
        return true;
      }
    }
  }, [activeAttributes, attributes]);

  const availableAttributes = useMemo(() => {
    if (isNull(attributes)) return [];

    let filteredAttributes: Attribute[] = [];

    if (isProductForm) {
      const allowedAttributeIds = hasProductTypeSelection
        ? new Set(watchProductType?.attributes ?? [])
        : null;

      filteredAttributes = attributes.filter(
        (obj) =>
          !activeAttributes?.includes(obj.id) &&
          (!allowedAttributeIds || allowedAttributeIds.has(obj.id)),
      );
    } else {
      filteredAttributes = attributes.filter(
        (obj) => !activeAttributes?.includes(obj.id),
      );
    }

    // For product form, filter dependent attributes - only show them if their dependency is satisfied
    if (isProductForm && attributeDependencies) {
      return filteredAttributes.filter((attribute) => {
        const rules = normalizeAttributeDependency(
          attributeDependencies[attribute.id],
        );

        // If attribute doesn't depend on anything, always show it
        if (rules.length === 0) return true;

        return rules.every((rule) => {
          const dependentAttributeValues =
            activeAttributeOptions?.[rule.dependsOn];

          // Only show if parent attribute is selected and has a valid value
          if (
            !dependentAttributeValues ||
            dependentAttributeValues.length === 0
          ) {
            return false;
          }

          // If no specific dependency values are defined, show when parent has any value
          if (!rule.dependencyValues || rule.dependencyValues.length === 0) {
            return true;
          }

          // Show only if parent value matches one of the dependency values
          return dependentAttributeValues.some((value) =>
            rule.dependencyValues?.includes(value),
          );
        });
      });
    }

    return filteredAttributes;
  }, [
    attributes,
    watchProductType,
    hasProductTypeSelection,
    isProductForm,
    activeAttributes,
    activeAttributeOptions,
    attributeDependencies,
  ]);

  const allAttributesFallback = isProductForm && !hasProductTypeSelection;
  const normalizedAttributeSearch = attributeSearch.trim().toLocaleLowerCase();
  const filteredAvailableAttributes = useMemo(() => {
    if (!normalizedAttributeSearch) {
      return availableAttributes;
    }

    return availableAttributes.filter((attribute) => {
      const searchableText = [
        attribute.name,
        attribute.id,
        ...attribute.options.map((option) => option.label),
        ...attribute.options.map((option) => option.value),
      ]
        .join(" ")
        .toLocaleLowerCase();

      return searchableText.includes(normalizedAttributeSearch);
    });
  }, [availableAttributes, normalizedAttributeSearch]);
  const visibleAvailableAttributes =
    allAttributesFallback && !normalizedAttributeSearch
      ? filteredAvailableAttributes.slice(0, ALL_ATTRIBUTES_PREVIEW_LIMIT)
      : filteredAvailableAttributes;
  const hiddenAvailableAttributesCount =
    filteredAvailableAttributes.length - visibleAvailableAttributes.length;

  function handleAppend(
    attributeId: Attribute["id"],
    attributeFormat: Attribute["format"],
    attributePages: Attribute["pages"],
  ) {
    if (!isNull(activeAttributes)) {
      // Check if attribute with format is already added
      if (attributeFormat) {
        for (let i = 0; i < activeAttributes.length; i++) {
          const attribute = attributes?.find(
            (obj) => obj.id === activeAttributes[i],
          );
          if (isUndefined(attribute))
            throw `Attribute with ID ${activeAttributes[i]} is undefined`;
          if (attribute.format) {
            toaster.create({
              title: t("attributes.formatTagAlreadyAdded"),
              type: "warning",
              duration: 3000,
            });
            return;
          }
        }
      }
      // Check if attribute with pages is already added
      if (attributePages) {
        for (let i = 0; i < activeAttributes.length; i++) {
          const attribute = attributes?.find(
            (obj) => obj.id === activeAttributes[i],
          );
          if (isUndefined(attribute)) throw "Attribute is undefined";
          if (attribute.pages) {
            toaster.create({
              title: t("attributes.pagesTagAlreadyAdded"),
              type: "warning",
              duration: 3000,
            });
            return;
          }
        }
      }
    }
    append(attributeId);
  }

  if (isMissingAttributes) return null;

  if (isNull(attributes) || isNull(activeAttributes)) return null;

  if (isProductForm && !isMatrixLikePriceType(watchPriceType)) return null;

  return (
    <>
      <Collapsible.Root>
        <Collapsible.Trigger asChild>
          <Button size="md" colorPalette={"primary"} pl={6}>
            {t("attributes.selectAttributes")}
            <MaterialSymbol style={{ paddingTop: "3px" }}>
              expand_more
            </MaterialSymbol>
          </Button>
        </Collapsible.Trigger>
        <Collapsible.Content mt={"4"}>
          <Box>
            {allAttributesFallback && (
              <Stack mb={"4"} gap={"2"}>
                <Text fontSize={"sm"} color={"fg.muted"}>
                  {t("attributes.allAttributesWithoutProductType", {
                    defaultValue:
                      "No product type selected. Search or choose from all available attributes.",
                  })}
                </Text>
                <Input
                  size={"sm"}
                  value={attributeSearch}
                  onChange={(event) => setAttributeSearch(event.target.value)}
                  placeholder={t("attributes.searchAvailableAttributes", {
                    defaultValue: "Search available attributes...",
                  })}
                />
              </Stack>
            )}
            <SimpleGrid mb="8" minChildWidth="250px" gap={"4"}>
              <>
                {activeAttributes?.map((activeAttribute, index) => {
                  const attribute = attributes?.find(
                    (attribute) => attribute.id === activeAttribute,
                  );
                  if (isUndefined(attribute)) throw "Attribute is undefined";
                  return (
                    <Box
                      key={index}
                      p={"6"}
                      shadow={"inset"}
                      borderRadius={"3xl"}
                    >
                      <Stack mb={"4"} direction={"row"} gap={"2"}>
                        <Heading
                          size={"md"}
                          mr={"auto"}
                          color={"primary.solid"}
                        >
                          {attribute.name}
                        </Heading>
                        {activeAttributes.find(
                          (activeAttribute) => activeAttribute === attribute.id,
                        ) && (
                          <IconButton
                            size={"xs"}
                            variant={"ghost"}
                            colorPalette={"primary"}
                            onClick={() =>
                              remove(
                                activeAttributes.findIndex(
                                  (activeAttribute) =>
                                    activeAttribute === attribute.id,
                                ),
                              )
                            }
                            aria-label={t("attributes.delete")}
                          >
                            <MaterialSymbol>delete</MaterialSymbol>
                          </IconButton>
                        )}
                        <IconButton
                          size={"xs"}
                          variant={"ghost"}
                          colorPalette="primary"
                          onClick={() => index !== 0 && swap(index, index - 1)}
                          aria-label={t("attributes.moveUp")}
                        >
                          <MaterialSymbol>chevron_left</MaterialSymbol>
                        </IconButton>
                        <IconButton
                          size={"xs"}
                          variant={"ghost"}
                          colorPalette="primary"
                          onClick={() =>
                            index !== attributes.length - 1 &&
                            swap(index, index + 1)
                          }
                          aria-label={t("attributes.moveDown")}
                        >
                          <MaterialSymbol>chevron_right</MaterialSymbol>
                        </IconButton>
                      </Stack>
                      <AttributeInfo attribute={attribute} />
                    </Box>
                  );
                })}
                {visibleAvailableAttributes.map((attribute, index) => (
                  <Box
                    key={index}
                    p={"6"}
                    shadow={"inset"}
                    borderRadius={"3xl"}
                  >
                    <Stack mb={"4"} direction={"row"} gap={"2"}>
                      <Heading size={"md"} mr={"auto"}>
                        {attribute.name}
                      </Heading>
                      <IconButton
                        size={"xs"}
                        variant={"ghost"}
                        onClick={() =>
                          handleAppend(
                            attribute.id,
                            attribute.format,
                            attribute.pages,
                          )
                        }
                        aria-label={t("attributes.add")}
                      >
                        <MaterialSymbol>add</MaterialSymbol>
                      </IconButton>
                    </Stack>
                    <AttributeInfo attribute={attribute} />
                  </Box>
                ))}
              </>
            </SimpleGrid>
            {hiddenAvailableAttributesCount > 0 && (
              <Text mt={"-4"} mb={"8"} fontSize={"sm"} color={"fg.muted"}>
                {t("attributes.moreAttributesAvailable", {
                  count: hiddenAvailableAttributesCount,
                  defaultValue:
                    "{{count}} more attributes available. Use search to narrow the list.",
                })}
              </Text>
            )}
            {isProductForm && (
              <>
                <Heading mt="8" mb="4" size="md">
                  {t("attributes.attributeOptions")}
                </Heading>
                <SimpleGrid minChildWidth={"300px"} gap={"4"}>
                  {activeAttributes.map((activeAttribute) => (
                    <AttributeOptionsFieldArray
                      key={activeAttribute}
                      attributes={attributes}
                      activeAttribute={activeAttribute}
                      activeAttributeOptions={activeAttributeOptions}
                    />
                  ))}
                </SimpleGrid>
              </>
            )}
          </Box>
        </Collapsible.Content>
      </Collapsible.Root>
    </>
  );
};

const AttributeOptionsFieldArray = ({
  attributes,
  activeAttribute,
  activeAttributeOptions,
}: {
  attributes: Attribute[];
  activeAttribute: string;
  activeAttributeOptions: Product["attributeOptions"] | null;
}) => {
  const { t } = useT();
  const attribute = attributes.find((obj) => obj.id === activeAttribute);
  const { append, remove, move } = useFieldArray({
    name: `attributeOptions.${activeAttribute}`,
  });

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    } catch {
      // ignore DataTransfer errors in some browsers
    }
    setDraggingIndex(index);
  }, []);

  const handleDragEnter = useCallback(
    (_e: React.DragEvent, index: number) => {
      if (draggingIndex !== null && draggingIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [draggingIndex],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggingIndex !== null && draggingIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [draggingIndex],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      let fromIndex = draggingIndex;
      if (fromIndex === null) {
        const data = e.dataTransfer.getData("text/plain");
        const parsed = Number.isNaN(Number(data)) ? null : Number(data);
        fromIndex = parsed;
      }
      if (fromIndex === null) return handleDragEnd();
      if (fromIndex !== toIndex) {
        move(fromIndex, toIndex);
      }
      handleDragEnd();
    },
    [draggingIndex, move, handleDragEnd],
  );

  return (
    <Box p={"6"} shadow={"inset"} borderRadius={"3xl"}>
      <Heading size={"md"} mb={"4"}>
        {attribute?.name}
      </Heading>
      <HStack wrap={"wrap"} gap={"2"}>
        {activeAttributeOptions &&
          activeAttributeOptions[activeAttribute] &&
          activeAttributeOptions[activeAttribute].map((key, index) => {
            const isOver = dragOverIndex === index && draggingIndex !== null;
            const optionLabel =
              attribute?.options.find(
                (option) =>
                  option.value ===
                  activeAttributeOptions[activeAttribute][index],
              )?.label ?? key;
            return (
              <Box
                key={key}
                onDragEnter={(e) => handleDragEnter(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                display={"inline-flex"}
                alignItems={"center"}
                gap={"1"}
                px={"1"}
                py={"1"}
                borderRadius={"full"}
                opacity={draggingIndex === index ? 0.6 : 1}
                transform={draggingIndex === index ? "scale(1.05)" : undefined}
                boxShadow={isOver ? "md" : undefined}
                borderWidth={"1px"}
                borderColor={isOver ? "primary.solid" : "primary.muted"}
                transition={"all 150ms ease"}
                bg={isOver ? "primary.muted" : "primary.subtle"}
              >
                <IconButton
                  size={"2xs"}
                  variant={"ghost"}
                  colorPalette={"primary"}
                  aria-label={t("fieldArray.dragHandle", {
                    defaultValue: "Drag to reorder",
                  })}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  cursor={draggingIndex === index ? "grabbing" : "grab"}
                >
                  <MaterialSymbol>drag_indicator</MaterialSymbol>
                </IconButton>
                <Box px={"1"} fontSize={"xs"} fontWeight={"medium"}>
                  {optionLabel}
                </Box>
                <IconButton
                  size={"2xs"}
                  variant={"ghost"}
                  colorPalette={"primary"}
                  onClick={() => startTransition(() => remove(index))}
                  aria-label={t("attributes.delete")}
                >
                  <MaterialSymbol>close</MaterialSymbol>
                </IconButton>
              </Box>
            );
          })}
        {attribute?.options
          .filter(
            (option) =>
              activeAttributeOptions &&
              !activeAttributeOptions[activeAttribute]?.includes(option.value),
          )
          .map((option, index) => (
            <Button
              key={index}
              variant={"subtle"}
              onClick={() => startTransition(() => append(option.value))}
              size={"2xs"}
            >
              {option.label}
            </Button>
          ))}
      </HStack>
    </Box>
  );
};
