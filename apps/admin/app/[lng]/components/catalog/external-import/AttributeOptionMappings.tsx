import {
  Badge,
  Box,
  Button,
  createListCollection,
  HStack,
  Portal,
  Select,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { AISuggestedOptionMapping } from "@/lib/external-products/ai-mapping-types";
import {
  SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
  isSyntheticEmptyBranchExternalOptionValue,
  isSyntheticEmptyExternalOptionValue,
  isSyntheticExternalOptionValue,
  toOptionValue,
} from "@/lib/external-products/option-mapping-utils";
import { MaterialSymbol, Tooltip } from "@konfi/components";
import type { Attribute, ExternalProduct } from "@konfi/types";
import type { TranslateFn } from "./types";
import {
  getConfidenceBadgeColor,
  getExternalAttributeKey,
} from "./attributeMappingUtils";

type AttributeOptionMappingsProps = {
  externalAttribute: ExternalProduct["attributes"][number];
  internalAttributeId: string;
  internalOptions: NonNullable<Attribute["options"]>;
  optionMappings: Record<string, string>;
  creatingOptions: Record<string, boolean>;
  getAiOptionSuggestion: (
    externalAttributeName: string,
    externalValue: string,
  ) => AISuggestedOptionMapping | undefined;
  onAutoMatchOptions: (
    externalAttributeName: string,
    internalAttributeId?: string,
  ) => void;
  onUpdateOptionMapping: (
    externalAttributeName: string,
    externalValue: string,
    internalValue?: string,
  ) => void;
  onCreateOption: (
    attributeId: string,
    externalAttributeName: string,
    externalValue: string,
    suggestedOption: { label: string; value: string },
  ) => void;
  t: TranslateFn;
};

export default function AttributeOptionMappings({
  externalAttribute,
  internalAttributeId,
  internalOptions,
  optionMappings,
  creatingOptions,
  getAiOptionSuggestion,
  onAutoMatchOptions,
  onUpdateOptionMapping,
  onCreateOption,
  t,
}: AttributeOptionMappingsProps) {
  const externalValues = [
    SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
    ...new Set(
      [...externalAttribute.values, ...Object.keys(optionMappings)].filter(
        (value) => value !== SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
      ),
    ),
  ];
  const optionCollection = createListCollection({
    items: [
      {
        label: t("externalProducts.mappingNone", {
          defaultValue: "None",
        }),
        value: "__none__",
      },
      ...internalOptions.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    ],
  });

  return (
    <VStack alignItems="stretch" gap={2}>
      <HStack justifyContent="space-between">
        <Text fontSize="xs" fontWeight="medium" color="gray.600">
          {t("externalProducts.mappingOptions", {
            defaultValue: "Options",
          })}
        </Text>
        <Button
          size="2xs"
          variant="ghost"
          onClick={() =>
            onAutoMatchOptions(
              getExternalAttributeKey(externalAttribute),
              internalAttributeId,
            )
          }
        >
          {t("externalProducts.mappingAutoMatch", {
            defaultValue: "Auto-match",
          })}
        </Button>
      </HStack>

      <VStack alignItems="stretch" gap={1}>
        {externalValues.map((value) => {
          const isSyntheticEmptyValue =
            isSyntheticEmptyExternalOptionValue(value);
          const isSyntheticEmptyBranchValue =
            isSyntheticEmptyBranchExternalOptionValue(value);
          const selectedOption = optionMappings[value];
          const aiOptionSuggestion = getAiOptionSuggestion(
            getExternalAttributeKey(externalAttribute),
            value,
          );
          const createKey = `${internalAttributeId}-${value}`;
          const externalOption = externalAttribute.options?.find(
            (option) => option.value === value,
          );
          const displayLabel = isSyntheticEmptyValue
            ? t("externalProducts.mappingSyntheticEmptyExternalValue", {
                defaultValue: "Empty / omitted by provider",
              })
            : externalOption?.label || value;
          const syntheticSuggestedOption = {
            label: isSyntheticEmptyBranchValue
              ? displayLabel
              : t("externalProducts.mappingSyntheticEmptyInternalOptionLabel", {
                  defaultValue: "None",
                }),
            value: toOptionValue(
              isSyntheticEmptyBranchValue
                ? displayLabel
                : t(
                    "externalProducts.mappingSyntheticEmptyInternalOptionLabel",
                    {
                      defaultValue: "None",
                    },
                  ),
            ),
          };
          const createOptionLabel =
            displayLabel ||
            value ||
            t("externalProducts.mappingUnnamedOption", {
              defaultValue: "Option",
            });
          const createOptionSuggestion =
            aiOptionSuggestion?.suggestedNewOption ??
            (isSyntheticExternalOptionValue(value)
              ? syntheticSuggestedOption
              : {
                  label: createOptionLabel,
                  value: toOptionValue(createOptionLabel),
                });
          const createOptionAriaLabel = t("externalProducts.createOption", {
            defaultValue: 'Create "{{label}}"',
            label: createOptionSuggestion.label,
          });
          const tooltipContent = isSyntheticEmptyValue
            ? t("externalProducts.mappingSyntheticEmptyExternalValueHelp", {
                defaultValue:
                  "Use this when the provider does not expose a real option and omits the attribute instead.",
              })
            : isSyntheticEmptyBranchValue
              ? t("externalProducts.mappingSyntheticDerivedExternalValueHelp", {
                  defaultValue:
                    "Detected from the provider response as a selectable empty branch. Create or map the matching internal option manually if needed.",
                })
              : value !== displayLabel
                ? `API: ${value}`
                : undefined;

          return (
            <HStack key={value} gap={2} alignItems="center">
              <Tooltip content={tooltipContent}>
                <Text fontSize="xs" minW="80px" color="gray.600" truncate>
                  {displayLabel}
                  {aiOptionSuggestion && (
                    <Badge
                      size="sm"
                      ml={1}
                      colorPalette={getConfidenceBadgeColor(
                        aiOptionSuggestion.confidence,
                      )}
                    >
                      {Math.round(aiOptionSuggestion.confidence * 100)}%
                    </Badge>
                  )}
                </Text>
              </Tooltip>
              <MaterialSymbol color="gray.400">arrow_forward</MaterialSymbol>
              <Box flex={1}>
                <Select.Root
                  collection={optionCollection}
                  value={selectedOption ? [selectedOption] : []}
                  onValueChange={(event) => {
                    const nextValue = event.value[0];
                    onUpdateOptionMapping(
                      getExternalAttributeKey(externalAttribute),
                      value,
                      nextValue === "__none__" ? undefined : nextValue,
                    );
                  }}
                  size="sm"
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t(
                          "externalProducts.mappingInternalOptionPlaceholder",
                          {
                            defaultValue: "Select option...",
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
                        {optionCollection.items.map((item) => (
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
              {!selectedOption && (
                <Tooltip content={createOptionAriaLabel}>
                  <Button
                    size="xs"
                    colorPalette="success"
                    variant="ghost"
                    aria-label={createOptionAriaLabel}
                    loading={creatingOptions[createKey]}
                    onClick={() =>
                      onCreateOption(
                        internalAttributeId,
                        getExternalAttributeKey(externalAttribute),
                        value,
                        createOptionSuggestion,
                      )
                    }
                  >
                    <MaterialSymbol>add</MaterialSymbol>
                  </Button>
                </Tooltip>
              )}
            </HStack>
          );
        })}
      </VStack>
    </VStack>
  );
}
