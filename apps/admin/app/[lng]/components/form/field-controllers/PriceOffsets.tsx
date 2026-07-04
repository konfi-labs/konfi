"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  createListCollection,
  Field,
  HStack,
  IconButton,
  Input,
  Portal,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import {
  CurrencyEnum,
  Product,
  ProductPriceOffsetRule,
  ProductPriceOffsetRuleScope,
} from "@konfi/types";
import {
  applyProductPriceOffsets,
  DEFAULT_COMBINATION,
  formatPrice,
} from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { useMemo } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

type PriceOffsetsProps = {
  isProductForm?: boolean;
};

type SelectItem = {
  label: string;
  value: string;
};

const SCOPE_VALUES: ProductPriceOffsetRuleScope[] = [
  "product",
  "attributeOption",
  "configuration",
];

function createRule(): ProductPriceOffsetRule {
  return {
    enabled: true,
    fixedValue: 0,
    id: crypto.randomUUID(),
    percent: 0,
    scope: "product",
  };
}

function normalizeNumberInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const numeric = Number(trimmed.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function ControlledSelect({
  disabled,
  items,
  onValueChange,
  placeholder,
  value,
}: {
  disabled?: boolean;
  items: SelectItem[];
  onValueChange: (value: string) => void;
  placeholder: string;
  value?: string;
}) {
  const collection = useMemo(
    () =>
      createListCollection({
        items,
      }),
    [items],
  );

  return (
    <Select.Root
      collection={collection}
      disabled={disabled}
      value={value ? [value] : []}
      onValueChange={({ value: nextValue }) => {
        if (nextValue[0]) {
          onValueChange(nextValue[0]);
        }
      }}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder={placeholder} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content>
            {collection.items.map((item) => (
              <Select.Item key={item.value} item={item}>
                {item.label}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}

export function PriceOffsets({ isProductForm = false }: PriceOffsetsProps) {
  const { t, i18n } = useT();
  const { attributes: attributeDefinitions } = useConfiguration();
  const { control, setValue } = useFormContext();
  const { append, fields, move, remove } = useFieldArray({
    control,
    keyName: "__fieldArrayId",
    name: "priceOffsets.rules",
  });
  const priceOffsets = useWatch({
    control,
    name: "priceOffsets",
  }) as Product["priceOffsets"] | undefined;
  const configuredAttributeIds = (useWatch({
    control,
    name: "attributes",
  }) ?? []) as Product["attributes"];
  const configuredAttributeOptions = (useWatch({
    control,
    name: "attributeOptions",
  }) ?? {}) as Product["attributeOptions"];
  const sourcePrices = (useWatch({
    control,
    name: "prices",
  }) ?? []) as Product["prices"];
  const defaultPrice = useWatch({
    control,
    name: "defaultPrice",
  }) as Product["defaultPrice"] | undefined;

  const enabled = priceOffsets?.enabled ?? false;
  const rules = priceOffsets?.rules ?? [];
  const previewPrice = sourcePrices[0] ?? defaultPrice;
  const effectivePreviewPrice = useMemo(() => {
    if (!previewPrice) {
      return undefined;
    }

    return applyProductPriceOffsets({
      calculatedCombination:
        previewPrice.combination?.id ?? DEFAULT_COMBINATION,
      prices: [previewPrice],
      product: {
        attributeOptions: configuredAttributeOptions,
        attributes: configuredAttributeIds,
        priceOffsets,
      },
    })[0];
  }, [
    configuredAttributeIds,
    configuredAttributeOptions,
    previewPrice,
    priceOffsets,
  ]);
  const previewCurrency =
    previewPrice?.currency ??
    effectivePreviewPrice?.currency ??
    CurrencyEnum.PLN;
  const basePreview = previewPrice?.value
    ? formatPrice(
        previewPrice.value,
        previewCurrency,
        previewPrice.volume?.value,
        undefined,
        i18n.resolvedLanguage,
      )
    : undefined;
  const effectivePreview = effectivePreviewPrice?.value
    ? formatPrice(
        effectivePreviewPrice.value,
        effectivePreviewPrice.currency ?? previewCurrency,
        effectivePreviewPrice.volume?.value,
        undefined,
        i18n.resolvedLanguage,
      )
    : undefined;

  const scopeItems = useMemo(
    () =>
      SCOPE_VALUES.map((scope) => ({
        label: t(`admin.priceOffsets.scope.${scope}`, {
          defaultValue:
            scope === "product"
              ? "Whole product"
              : scope === "attributeOption"
                ? "Attribute option"
                : "Exact configuration",
        }),
        value: scope,
      })),
    [t],
  );

  const attributeItems = useMemo(
    () =>
      configuredAttributeIds.map((attributeId) => {
        const attribute = attributeDefinitions?.find(
          (candidate) => candidate.id === attributeId,
        );

        return {
          label: attribute?.name ?? attributeId,
          value: attributeId,
        };
      }),
    [attributeDefinitions, configuredAttributeIds],
  );

  const getOptionItems = (attributeId?: string): SelectItem[] => {
    if (!attributeId) {
      return [];
    }

    const attribute = attributeDefinitions?.find(
      (candidate) => candidate.id === attributeId,
    );
    const allowedValues = configuredAttributeOptions[attributeId] ?? [];

    return allowedValues.map((optionValue) => {
      const option = attribute?.options.find(
        (candidate) => candidate.value === optionValue,
      );

      return {
        label: option?.label ?? optionValue,
        value: optionValue,
      };
    });
  };

  const setFieldValue = (name: string, value: unknown) => {
    setValue(name, value, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  if (!isProductForm) {
    return null;
  }

  return (
    <Box p="4" borderWidth="1px" borderColor="border" borderRadius="2xl">
      <Stack
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        gap="4"
      >
        <Box>
          <HStack gap="2" mb="1">
            <MaterialSymbol>price_change</MaterialSymbol>
            <Text fontWeight="semibold">
              {t("admin.priceOffsets.title", {
                defaultValue: "Price offsets",
              })}
            </Text>
            <Badge colorPalette={enabled ? "success" : "gray"}>
              {enabled
                ? t("admin.priceOffsets.enabledBadge", {
                    defaultValue: "Enabled",
                  })
                : t("admin.priceOffsets.disabledBadge", {
                    defaultValue: "Disabled",
                  })}
            </Badge>
          </HStack>
          <Text color="fg.muted" fontSize="sm">
            {t("admin.priceOffsets.description", {
              defaultValue:
                "Non-destructive product price overlay applied after source prices are resolved.",
            })}
          </Text>
          {basePreview && effectivePreview ? (
            <Text color="fg.muted" fontSize="sm" mt="2">
              {t("admin.priceOffsets.preview", {
                base: basePreview,
                defaultValue: "Preview: {{base}} -> {{effective}}",
                effective: effectivePreview,
              })}
            </Text>
          ) : null}
        </Box>
        <Switch.Root
          alignSelf={{ base: "flex-start", md: "center" }}
          checked={enabled}
          onCheckedChange={(details) =>
            setFieldValue("priceOffsets.enabled", details.checked)
          }
        >
          <Switch.HiddenInput />
          <Switch.Control />
          <Switch.Label>
            {t("admin.priceOffsets.enable", {
              defaultValue: "Enable offsets",
            })}
          </Switch.Label>
        </Switch.Root>
      </Stack>

      <VStack align="stretch" gap="3" mt="4">
        {rules.length === 0 ? (
          <Text color="fg.muted" fontSize="sm">
            {t("admin.priceOffsets.empty", {
              defaultValue: "No offset rules have been added.",
            })}
          </Text>
        ) : null}
        {rules.map((rule, index) => {
          const optionItems = getOptionItems(rule.attributeId);

          return (
            <Box
              key={fields[index]?.__fieldArrayId ?? rule.id}
              p="3"
              borderWidth="1px"
              borderColor="border"
              borderRadius="md"
            >
              <Stack gap="3">
                <HStack justify="space-between" align="center">
                  <Switch.Root
                    checked={rule.enabled !== false}
                    onCheckedChange={(details) =>
                      setFieldValue(
                        `priceOffsets.rules.${index}.enabled`,
                        details.checked,
                      )
                    }
                  >
                    <Switch.HiddenInput />
                    <Switch.Control />
                    <Switch.Label>
                      {t("admin.priceOffsets.ruleEnabled", {
                        count: index + 1,
                        defaultValue: "Rule {{count}}",
                      })}
                    </Switch.Label>
                  </Switch.Root>
                  <HStack gap="1">
                    <IconButton
                      aria-label={t("admin.priceOffsets.moveUp", {
                        defaultValue: "Move rule up",
                      })}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      size="xs"
                      variant="ghost"
                    >
                      <MaterialSymbol>arrow_upward</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      aria-label={t("admin.priceOffsets.moveDown", {
                        defaultValue: "Move rule down",
                      })}
                      disabled={index === rules.length - 1}
                      onClick={() => move(index, index + 1)}
                      size="xs"
                      variant="ghost"
                    >
                      <MaterialSymbol>arrow_downward</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      aria-label={t("admin.priceOffsets.removeRule", {
                        defaultValue: "Remove rule",
                      })}
                      colorPalette="red"
                      onClick={() => remove(index)}
                      size="xs"
                      variant="ghost"
                    >
                      <MaterialSymbol>delete</MaterialSymbol>
                    </IconButton>
                  </HStack>
                </HStack>

                <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
                  <Field.Root>
                    <Field.Label>
                      {t("admin.priceOffsets.label", {
                        defaultValue: "Label",
                      })}
                    </Field.Label>
                    <Input
                      value={rule.label ?? ""}
                      onChange={(event) =>
                        setFieldValue(
                          `priceOffsets.rules.${index}.label`,
                          event.currentTarget.value || undefined,
                        )
                      }
                    />
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label>
                      {t("admin.priceOffsets.scopeLabel", {
                        defaultValue: "Scope",
                      })}
                    </Field.Label>
                    <ControlledSelect
                      items={scopeItems}
                      placeholder={t("admin.priceOffsets.scopePlaceholder", {
                        defaultValue: "Select scope",
                      })}
                      value={rule.scope}
                      onValueChange={(nextScope) => {
                        setFieldValue(
                          `priceOffsets.rules.${index}.scope`,
                          nextScope,
                        );
                        setFieldValue(
                          `priceOffsets.rules.${index}.attributeId`,
                          undefined,
                        );
                        setFieldValue(
                          `priceOffsets.rules.${index}.optionValue`,
                          undefined,
                        );
                        setFieldValue(
                          `priceOffsets.rules.${index}.calculatedCombination`,
                          undefined,
                        );
                      }}
                    />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>
                      {t("admin.priceOffsets.percent", {
                        defaultValue: "Percent",
                      })}
                    </Field.Label>
                    <Input
                      inputMode="decimal"
                      value={rule.percent ?? ""}
                      onChange={(event) =>
                        setFieldValue(
                          `priceOffsets.rules.${index}.percent`,
                          normalizeNumberInput(event.currentTarget.value),
                        )
                      }
                    />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>
                      {t("admin.priceOffsets.fixedValue", {
                        defaultValue: "Fixed minor units",
                      })}
                    </Field.Label>
                    <Input
                      inputMode="numeric"
                      value={rule.fixedValue ?? ""}
                      onChange={(event) => {
                        const value = normalizeNumberInput(
                          event.currentTarget.value,
                        );
                        setFieldValue(
                          `priceOffsets.rules.${index}.fixedValue`,
                          value === undefined ? undefined : Math.trunc(value),
                        );
                      }}
                    />
                  </Field.Root>
                  {rule.scope === "attributeOption" ? (
                    <>
                      <Field.Root required>
                        <Field.Label>
                          {t("admin.priceOffsets.attribute", {
                            defaultValue: "Attribute",
                          })}
                        </Field.Label>
                        <ControlledSelect
                          disabled={attributeItems.length === 0}
                          items={attributeItems}
                          placeholder={t(
                            "admin.priceOffsets.attributePlaceholder",
                            {
                              defaultValue: "Select attribute",
                            },
                          )}
                          value={rule.attributeId}
                          onValueChange={(attributeId) => {
                            setFieldValue(
                              `priceOffsets.rules.${index}.attributeId`,
                              attributeId,
                            );
                            setFieldValue(
                              `priceOffsets.rules.${index}.optionValue`,
                              undefined,
                            );
                          }}
                        />
                      </Field.Root>
                      <Field.Root required>
                        <Field.Label>
                          {t("admin.priceOffsets.option", {
                            defaultValue: "Option",
                          })}
                        </Field.Label>
                        <ControlledSelect
                          disabled={optionItems.length === 0}
                          items={optionItems}
                          placeholder={t(
                            "admin.priceOffsets.optionPlaceholder",
                            {
                              defaultValue: "Select option",
                            },
                          )}
                          value={rule.optionValue}
                          onValueChange={(optionValue) =>
                            setFieldValue(
                              `priceOffsets.rules.${index}.optionValue`,
                              optionValue,
                            )
                          }
                        />
                      </Field.Root>
                    </>
                  ) : null}
                  {rule.scope === "configuration" ? (
                    <>
                      <Field.Root required>
                        <Field.Label>
                          {t("admin.priceOffsets.configuration", {
                            defaultValue: "Calculated combination",
                          })}
                        </Field.Label>
                        <Input
                          value={rule.calculatedCombination ?? ""}
                          onChange={(event) =>
                            setFieldValue(
                              `priceOffsets.rules.${index}.calculatedCombination`,
                              event.currentTarget.value || undefined,
                            )
                          }
                        />
                      </Field.Root>
                      <Field.Root>
                        <Field.Label>
                          {t("admin.priceOffsets.volume", {
                            defaultValue: "Volume",
                          })}
                        </Field.Label>
                        <Input
                          inputMode="numeric"
                          value={rule.volumeValue ?? ""}
                          onChange={(event) =>
                            setFieldValue(
                              `priceOffsets.rules.${index}.volumeValue`,
                              normalizeNumberInput(event.currentTarget.value),
                            )
                          }
                        />
                      </Field.Root>
                      <Field.Root>
                        <Field.Label>
                          {t("admin.priceOffsets.pageCount", {
                            defaultValue: "Page count",
                          })}
                        </Field.Label>
                        <Input
                          inputMode="numeric"
                          value={rule.pageCount ?? ""}
                          onChange={(event) => {
                            const value = normalizeNumberInput(
                              event.currentTarget.value,
                            );
                            setFieldValue(
                              `priceOffsets.rules.${index}.pageCount`,
                              value === undefined
                                ? undefined
                                : Math.trunc(value),
                            );
                          }}
                        />
                      </Field.Root>
                    </>
                  ) : null}
                </SimpleGrid>
              </Stack>
            </Box>
          );
        })}
      </VStack>

      <Button
        mt="4"
        size="sm"
        colorPalette="primary"
        variant="subtle"
        onClick={() => {
          if (!priceOffsets) {
            setFieldValue("priceOffsets", {
              enabled: true,
              rules: [],
            });
          }
          append(createRule());
          setFieldValue("priceOffsets.enabled", true);
        }}
      >
        <MaterialSymbol>add</MaterialSymbol>
        {t("admin.priceOffsets.addRule", {
          defaultValue: "Add offset rule",
        })}
      </Button>
    </Box>
  );
}
