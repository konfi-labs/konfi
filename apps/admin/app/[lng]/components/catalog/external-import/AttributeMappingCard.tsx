import {
  Badge,
  Box,
  Button,
  createListCollection,
  Field,
  HStack,
  Portal,
  Select,
  Text,
  VStack,
} from "@chakra-ui/react";
import type {
  AISuggestedAttributeMapping,
  AISuggestedOptionMapping,
} from "@/lib/external-products/ai-mapping-types";
import {
  isAttributeMappingReady,
  isExternalAttributeSelectable,
} from "@/lib/external-products/provider-pricing";
import { ButtonLink, MaterialSymbol, Tooltip } from "@konfi/components";
import type {
  Attribute,
  AttributeMapping,
  ExternalProduct,
} from "@konfi/types";
import AttributeOptionMappings from "./AttributeOptionMappings";
import {
  getConfidenceBadgeColor,
  getExternalAttributeKey,
  getExternalAttributeLabel,
} from "./attributeMappingUtils";
import type { AttributeCollection, TranslateFn } from "./types";

type AttributeMappingCardProps = {
  externalAttribute: ExternalProduct["attributes"][number];
  mapping?: AttributeMapping;
  internalAttributes: Attribute[];
  attributeCollection: AttributeCollection;
  reservedInternalAttributeIds: Set<string>;
  duplicateExternalAttributeNames: string[];
  isCustomAttribute: boolean;
  aiSuggestion?: AISuggestedAttributeMapping;
  creatingOptions: Record<string, boolean>;
  getAiOptionSuggestion: (
    externalAttributeName: string,
    externalValue: string,
  ) => AISuggestedOptionMapping | undefined;
  onApplyAiSuggestion: (suggestion: AISuggestedAttributeMapping) => void;
  onRemoveCustomAttribute: (externalAttributeName: string) => void;
  onUpdateMapping: (
    externalAttributeName: string,
    updates: Partial<AttributeMapping>,
  ) => void;
  onUpdateOptionMapping: (
    externalAttributeName: string,
    externalValue: string,
    internalValue?: string,
  ) => void;
  onAutoMatchOptions: (
    externalAttributeName: string,
    internalAttributeId?: string,
  ) => void;
  onCreateOption: (
    attributeId: string,
    externalAttributeName: string,
    externalValue: string,
    suggestedOption: { label: string; value: string },
  ) => void;
  t: TranslateFn;
};

export default function AttributeMappingCard({
  externalAttribute,
  mapping,
  internalAttributes,
  attributeCollection,
  reservedInternalAttributeIds,
  duplicateExternalAttributeNames,
  isCustomAttribute,
  aiSuggestion,
  creatingOptions,
  getAiOptionSuggestion,
  onApplyAiSuggestion,
  onRemoveCustomAttribute,
  onUpdateMapping,
  onUpdateOptionMapping,
  onAutoMatchOptions,
  onCreateOption,
  t,
}: AttributeMappingCardProps) {
  const internalAttribute = internalAttributes.find(
    (attribute) => attribute.id === mapping?.internalAttributeId,
  );
  const externalValueCollection = createListCollection({
    items:
      (externalAttribute.options ?? []).length > 0
        ? externalAttribute.options!.map((option) => ({
            label: option.label ?? option.value,
            value: option.value,
          }))
        : externalAttribute.values.map((value) => ({ label: value, value })),
  });
  const internalOptions = internalAttribute?.options ?? [];
  const optionMappings = mapping?.optionMappings ?? {};
  const isIgnoredAttribute = mapping?.ignored === true;
  const isProviderOnlyPricing = mapping?.providerOnlyPricing === true;
  const isPageCountAttribute = mapping?.specialRole === "pageCount";
  const isReadyMapping = mapping ? isAttributeMappingReady(mapping) : false;
  const isInternalMode =
    !isIgnoredAttribute && !isProviderOnlyPricing && !isPageCountAttribute;
  const hasSelectableValues = isExternalAttributeSelectable(externalAttribute);
  const canUseAsPageCount =
    hasSelectableValues || Boolean(externalAttribute.numberConfig);
  const hasDuplicateInternalAttribute =
    duplicateExternalAttributeNames.length > 0;
  const hasMissingAttribute =
    aiSuggestion &&
    !aiSuggestion.internalAttributeId &&
    aiSuggestion.suggestedNewAttribute;
  const shouldHighlight = aiSuggestion && !isReadyMapping;
  const internalAttributeCollection = createListCollection({
    items: attributeCollection.items.map((item) => {
      const itemValue = String(item.value);

      return {
        ...item,
        disabled:
          itemValue !== "__none__" &&
          itemValue !== mapping?.internalAttributeId &&
          reservedInternalAttributeIds.has(itemValue),
      };
    }),
  });

  return (
    <Box
      borderWidth="1px"
      borderRadius="xl"
      p={3}
      borderColor={
        hasDuplicateInternalAttribute
          ? "red.200"
          : shouldHighlight
            ? "purple.200"
            : undefined
      }
      bg={
        hasDuplicateInternalAttribute
          ? "red.50"
          : shouldHighlight
            ? "purple.50"
            : undefined
      }
      _dark={{
        borderColor: hasDuplicateInternalAttribute
          ? "red.700"
          : shouldHighlight
            ? "purple.700"
            : undefined,
        bg: hasDuplicateInternalAttribute
          ? "red.900/20"
          : shouldHighlight
            ? "purple.900/20"
            : undefined,
      }}
    >
      <VStack alignItems="stretch" gap={2}>
        <HStack justifyContent="space-between" alignItems="center">
          <HStack gap={2}>
            <Text fontWeight="semibold" fontSize="sm">
              {getExternalAttributeLabel(externalAttribute)}
            </Text>
            {aiSuggestion && (
              <Badge
                size="sm"
                colorPalette={getConfidenceBadgeColor(aiSuggestion.confidence)}
              >
                {Math.round(aiSuggestion.confidence * 100)}%
              </Badge>
            )}
          </HStack>
          <HStack gap={1}>
            {aiSuggestion &&
              aiSuggestion.internalAttributeId &&
              !isReadyMapping && (
                <Tooltip
                  content={t("externalProducts.applySuggestion", {
                    defaultValue: "Apply AI suggestion",
                  })}
                >
                  <Button
                    size="xs"
                    colorPalette="purple"
                    variant="ghost"
                    onClick={() => onApplyAiSuggestion(aiSuggestion)}
                  >
                    <MaterialSymbol>check</MaterialSymbol>
                  </Button>
                </Tooltip>
              )}
            {isCustomAttribute && (
              <Tooltip
                content={t("externalProducts.mappingRemoveAttribute", {
                  defaultValue: "Remove",
                })}
              >
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  onClick={() =>
                    onRemoveCustomAttribute(
                      getExternalAttributeKey(externalAttribute),
                    )
                  }
                >
                  <MaterialSymbol>close</MaterialSymbol>
                </Button>
              </Tooltip>
            )}
          </HStack>
        </HStack>

        {hasMissingAttribute && (
          <HStack
            bg="yellow.50"
            _dark={{ bg: "yellow.900/20" }}
            p={2}
            borderRadius="lg"
            fontSize="xs"
          >
            <MaterialSymbol color="yellow.600">warning</MaterialSymbol>
            <Text flex={1}>
              {t("externalProducts.missingAttributeShort", {
                defaultValue: 'Create: "{{name}}"',
                name: aiSuggestion.suggestedNewAttribute?.name,
              })}
            </Text>
            <ButtonLink
              size="xs"
              colorPalette="yellow"
              variant="ghost"
              isExternal
              href={`/configuration/attributes?prefill=${encodeURIComponent(
                JSON.stringify({
                  name: aiSuggestion.suggestedNewAttribute?.name,
                  type: aiSuggestion.suggestedNewAttribute?.type,
                  options: aiSuggestion.suggestedNewAttribute?.options,
                }),
              )}`}
              ariaLabel={t("externalProducts.createAttribute", {
                defaultValue: "Create",
              })}
            >
              <MaterialSymbol>add</MaterialSymbol>
            </ButtonLink>
          </HStack>
        )}

        {!hasSelectableValues && (
          <Box
            bg="primaryAccent.50"
            _dark={{ bg: "primaryAccent.900/20" }}
            p={2}
            borderRadius="lg"
            fontSize="xs"
          >
            <HStack alignItems="flex-start">
              <MaterialSymbol color="primaryAccent.500">info</MaterialSymbol>
              <Text>
                {t("externalProducts.mappingCustomInputDescription", {
                  defaultValue:
                    "This is a provider custom input without predefined values. It won't block product creation and is skipped in customer-facing attribute mapping.",
                })}
              </Text>
            </HStack>
          </Box>
        )}

        {hasSelectableValues && (
          <HStack gap={2} flexWrap="wrap">
            <Button
              size="xs"
              variant={isInternalMode ? "solid" : "outline"}
              colorPalette={isInternalMode ? "primary" : "gray"}
              onClick={() =>
                onUpdateMapping(getExternalAttributeKey(externalAttribute), {
                  ignored: false,
                  providerOnlyPricing: false,
                  specialRole: undefined,
                  fixedExternalValue: undefined,
                })
              }
            >
              {t("externalProducts.mappingModeInternal", {
                defaultValue: "Internal attribute",
              })}
            </Button>
            {externalAttribute.affectsPricing ? (
              <Button
                size="xs"
                variant={isProviderOnlyPricing ? "solid" : "outline"}
                colorPalette="purple"
                onClick={() =>
                  onUpdateMapping(getExternalAttributeKey(externalAttribute), {
                    ignored: false,
                    providerOnlyPricing: true,
                    specialRole: undefined,
                    fixedExternalValue:
                      mapping?.fixedExternalValue ??
                      externalAttribute.values[0],
                    internalAttributeId: undefined,
                    optionMappings: {},
                  })
                }
              >
                {t("externalProducts.mappingModeProviderOnly", {
                  defaultValue: "Provider pricing only",
                })}
              </Button>
            ) : null}
            <Button
              size="xs"
              variant={isIgnoredAttribute ? "solid" : "outline"}
              colorPalette="orange"
              onClick={() =>
                onUpdateMapping(getExternalAttributeKey(externalAttribute), {
                  ignored: true,
                  providerOnlyPricing: false,
                  specialRole: undefined,
                  fixedExternalValue: undefined,
                  internalAttributeId: undefined,
                  optionMappings: {},
                })
              }
            >
              {t("externalProducts.mappingModeIgnored", {
                defaultValue: "Ignore attribute",
              })}
            </Button>
          </HStack>
        )}
        {canUseAsPageCount ? (
          <Button
            alignSelf="flex-start"
            size="xs"
            variant={isPageCountAttribute ? "solid" : "outline"}
            colorPalette="teal"
            onClick={() =>
              onUpdateMapping(getExternalAttributeKey(externalAttribute), {
                ignored: false,
                providerOnlyPricing: false,
                specialRole: "pageCount",
                fixedExternalValue: undefined,
                internalAttributeId: undefined,
                optionMappings: {},
              })
            }
          >
            {t("externalProducts.mappingModePageCount", {
              defaultValue: "Page count",
            })}
          </Button>
        ) : null}

        {isIgnoredAttribute && hasSelectableValues ? (
          <VStack alignItems="stretch" gap={2}>
            <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.300" }}>
              {t("externalProducts.ignoredAttributeDescription", {
                defaultValue:
                  "Ignore this supplier attribute. It will not add customer-facing options, sizes, or pricing values.",
              })}
            </Text>
          </VStack>
        ) : isProviderOnlyPricing && hasSelectableValues ? (
          <VStack alignItems="stretch" gap={2}>
            <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.300" }}>
              {t("externalProducts.providerOnlyPricingDescription", {
                defaultValue:
                  "Use this supplier attribute only when fetching supplier prices. It will not become a customer-facing product option.",
              })}
            </Text>
            <Field.Root>
              <Select.Root
                collection={externalValueCollection}
                value={
                  mapping?.fixedExternalValue
                    ? [mapping.fixedExternalValue]
                    : []
                }
                onValueChange={(event) => {
                  const nextValue = event.value[0];
                  onUpdateMapping(getExternalAttributeKey(externalAttribute), {
                    ignored: false,
                    providerOnlyPricing: true,
                    specialRole: undefined,
                    fixedExternalValue: nextValue,
                    internalAttributeId: undefined,
                    optionMappings: {},
                  });
                }}
                size="sm"
              >
                <Select.HiddenSelect />
                <Select.Control>
                  <Select.Trigger>
                    <Select.ValueText
                      placeholder={t(
                        "externalProducts.providerOnlyPricingValuePlaceholder",
                        {
                          defaultValue: "Select default provider value...",
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
                      {externalValueCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item}>
                          {item.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </Field.Root>
          </VStack>
        ) : isPageCountAttribute ? (
          <VStack alignItems="stretch" gap={2}>
            <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.300" }}>
              {t("externalProducts.pageCountAttributeDescription", {
                defaultValue:
                  "Use this supplier attribute as product page count. It will not become a customer-facing product option.",
              })}
            </Text>
          </VStack>
        ) : hasSelectableValues ? (
          <>
            <Field.Root>
              <Select.Root
                collection={internalAttributeCollection}
                value={
                  mapping?.internalAttributeId
                    ? [mapping.internalAttributeId]
                    : []
                }
                onValueChange={(event) => {
                  const nextValue = event.value[0];
                  onUpdateMapping(getExternalAttributeKey(externalAttribute), {
                    ignored: false,
                    internalAttributeId:
                      nextValue === "__none__" ? undefined : nextValue,
                    providerOnlyPricing: false,
                    specialRole: undefined,
                    fixedExternalValue: undefined,
                    optionMappings: {},
                  });
                }}
                size="sm"
              >
                <Select.HiddenSelect />
                <Select.Control>
                  <Select.Trigger>
                    <Select.ValueText
                      placeholder={t(
                        "externalProducts.mappingInternalAttributePlaceholder",
                        {
                          defaultValue: "Select attribute...",
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
                      {internalAttributeCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item}>
                          <HStack gap={2}>
                            <span>{item.label}</span>
                            {item.calculated && (
                              <Badge
                                size="xs"
                                colorPalette="green"
                                variant="subtle"
                              >
                                {t("externalProducts.mappingCalculated", {
                                  defaultValue: "Calc",
                                })}
                              </Badge>
                            )}
                          </HStack>
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </Field.Root>
            {hasDuplicateInternalAttribute && mapping?.internalAttributeId && (
              <Box
                bg="red.50"
                _dark={{ bg: "red.900/20" }}
                p={2}
                borderRadius="lg"
                fontSize="xs"
              >
                <HStack alignItems="flex-start">
                  <MaterialSymbol color="var(--chakra-colors-red-500)">
                    warning
                  </MaterialSymbol>
                  <Text>
                    {t("externalProducts.mappingDuplicateCardDescription", {
                      defaultValue:
                        "{{attribute}} is also mapped from {{externalAttributes}}. Each internal attribute can only be used once.",
                      attribute:
                        internalAttribute?.name ?? mapping.internalAttributeId,
                      externalAttributes:
                        duplicateExternalAttributeNames.join(", "),
                    })}
                  </Text>
                </HStack>
              </Box>
            )}
          </>
        ) : null}

        {!isProviderOnlyPricing &&
          !isIgnoredAttribute &&
          hasSelectableValues &&
          mapping?.internalAttributeId &&
          internalOptions.length > 0 && (
            <AttributeOptionMappings
              externalAttribute={externalAttribute}
              internalAttributeId={mapping.internalAttributeId}
              internalOptions={internalOptions}
              optionMappings={optionMappings}
              creatingOptions={creatingOptions}
              getAiOptionSuggestion={getAiOptionSuggestion}
              onAutoMatchOptions={onAutoMatchOptions}
              onUpdateOptionMapping={onUpdateOptionMapping}
              onCreateOption={onCreateOption}
              t={t}
            />
          )}
      </VStack>
    </Box>
  );
}
