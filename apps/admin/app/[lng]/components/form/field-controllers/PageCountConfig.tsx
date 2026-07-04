"use client";

import { useT } from "@/i18n/client";
import {
  Box,
  Button,
  Collapsible,
  createListCollection,
  Field,
  Heading,
  Input,
  Portal,
  Select,
  SimpleGrid,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { Attribute, PriceTypeEnum, Product } from "@konfi/types";
import {
  DEFAULT_PAGE_COUNT_COVER_PAGES,
  formatPageCountBreakdown,
  getPageCountPricingMode,
  getPageCountValues,
  PAGE_COUNT_DIVISOR,
} from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import PricesMatrix from "./PricesMatrix";

type PageCountConfigProps = {
  isProductForm?: boolean;
};

function getDefaultPageCountValue(): NonNullable<Product["pageCount"]> {
  return {
    enabled: false,
    minimum: PAGE_COUNT_DIVISOR,
    maximum: PAGE_COUNT_DIVISOR,
    step: PAGE_COUNT_DIVISOR,
    coverPages: DEFAULT_PAGE_COUNT_COVER_PAGES,
    placement: {
      afterAttributeId: null,
    },
    pricing: {
      mode: "step",
      stepPrices: [],
      exactPrices: [],
    },
  };
}

export const PageCountConfig = ({
  isProductForm = false,
}: PageCountConfigProps) => {
  const { t: baseT } = useT();
  type TranslateOptions = Exclude<Parameters<typeof baseT>[1], string>;
  const t = useCallback(
    (key: string, options?: TranslateOptions) =>
      baseT(key.startsWith("pageCountConfig.") ? `admin.${key}` : key, options),
    [baseT],
  );
  const { attributes } = useConfiguration();
  const { control, getValues, setValue } = useFormContext();

  const activeAttributes: Product["attributes"] =
    useWatch({
      control,
      name: "attributes",
    }) ?? [];
  const priceType: Product["priceType"] = useWatch({
    control,
    name: "priceType",
  });
  const pageCount: Product["pageCount"] = useWatch({
    control,
    name: "pageCount",
  });

  const enabled = pageCount?.enabled ?? false;
  const pricingMode = getPageCountPricingMode(pageCount?.pricing);
  const pageCountValues = useMemo(
    () => getPageCountValues(pageCount),
    [
      pageCount?.enabled,
      pageCount?.maximum,
      pageCount?.minimum,
      pageCount?.step,
    ],
  );
  const [activeExactPageCount, setActiveExactPageCount] = useState<string>(
    String(pageCountValues[0] ?? PAGE_COUNT_DIVISOR),
  );

  const activeAttributeOptions = useMemo(() => {
    if (!attributes) {
      return [];
    }

    return activeAttributes
      .map((attributeId) =>
        attributes.find((attribute) => attribute.id === attributeId),
      )
      .filter((attribute): attribute is Attribute => Boolean(attribute));
  }, [activeAttributes, attributes]);

  const placementCollection = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: t("pageCountConfig.position.beforeFirst", {
              defaultValue: "Before the first attribute",
            }),
            value: "__before__",
          },
          ...activeAttributeOptions.map((attribute) => ({
            label: t("pageCountConfig.position.afterAttribute", {
              defaultValue: `After ${attribute.name}`,
              attribute: attribute.name,
            }),
            value: attribute.id,
          })),
        ],
      }),
    [activeAttributeOptions, t],
  );
  const pricingModeCollection = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: t("pageCountConfig.pricingMode.step", {
              defaultValue: "Per-step surcharge",
            }),
            value: "step",
          },
          {
            label: t("pageCountConfig.pricingMode.exact", {
              defaultValue: "Exact prices per page count",
            }),
            value: "exact",
          },
        ],
      }),
    [t],
  );
  const exactPageCountCollection = useMemo(
    () =>
      createListCollection({
        items: pageCountValues.map((value) => ({
          label: formatPageCountBreakdown(value, pageCount) ?? String(value),
          value: String(value),
        })),
      }),
    [pageCount, pageCountValues],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const selectedAnchor = pageCount?.placement?.afterAttributeId;
    if (!selectedAnchor) {
      return;
    }

    if (
      activeAttributeOptions.some(
        (attribute) => attribute.id === selectedAnchor,
      )
    ) {
      return;
    }

    setValue("pageCount.placement.afterAttributeId", null, {
      shouldDirty: true,
      shouldTouch: true,
    });
  }, [
    activeAttributeOptions,
    enabled,
    pageCount?.placement?.afterAttributeId,
    setValue,
  ]);

  useEffect(() => {
    if (!enabled || pricingMode !== "exact") {
      return;
    }

    const currentExactPrices = pageCount?.pricing?.exactPrices ?? [];
    const nextExactPrices = pageCountValues.map((value) => {
      const existingEntry = currentExactPrices.find(
        (entry) => entry.pageCount === value,
      );

      return existingEntry ?? { pageCount: value, prices: [] };
    });
    const needsSync =
      currentExactPrices.length !== nextExactPrices.length ||
      currentExactPrices.some(
        (entry, index) => entry.pageCount !== nextExactPrices[index]?.pageCount,
      );

    if (needsSync) {
      setValue("pageCount.pricing.exactPrices", nextExactPrices, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }

    const firstValue = nextExactPrices[0]?.pageCount ?? pageCountValues[0];

    if (
      firstValue &&
      !pageCountValues.some((value) => String(value) === activeExactPageCount)
    ) {
      setActiveExactPageCount(String(firstValue));
    }
  }, [
    activeExactPageCount,
    enabled,
    pageCount?.pricing?.exactPrices,
    pageCountValues,
    pricingMode,
    setValue,
  ]);

  if (!isProductForm) {
    return null;
  }

  const ensurePageCountDefaults = () => {
    const currentValue = getValues("pageCount") as
      | Product["pageCount"]
      | undefined;
    const fallback = getDefaultPageCountValue();

    setValue(
      "pageCount",
      {
        ...fallback,
        ...currentValue,
        placement: {
          ...fallback.placement,
          ...(currentValue?.placement ?? {}),
        },
        pricing: {
          ...fallback.pricing,
          ...(currentValue?.pricing ?? {}),
        },
      },
      {
        shouldDirty: true,
        shouldTouch: true,
      },
    );
  };

  const handleNumericFieldChange =
    (fieldName: "minimum" | "maximum" | "step" | "coverPages") =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.currentTarget.value);

      setValue(
        `pageCount.${fieldName}`,
        Number.isFinite(nextValue) ? nextValue : undefined,
        {
          shouldDirty: true,
          shouldTouch: true,
        },
      );
    };

  const previewBreakdown = enabled
    ? formatPageCountBreakdown(pageCount?.minimum, pageCount)
    : undefined;
  const selectedExactPageCount = Number(activeExactPageCount);
  const selectedExactPageCountIndex = (
    pageCount?.pricing?.exactPrices ?? []
  ).findIndex((entry) => entry.pageCount === selectedExactPageCount);
  const segmentedRanges =
    pageCount?.pricing?.segments ??
    pageCount?.pricing?.segmentPrices?.map(({ maximum, minimum }) => ({
      maximum,
      minimum,
    })) ??
    [];

  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>
        <Button size="md" colorPalette="primary" pl={6} variant="outline">
          {t("pageCountConfig.configure", {
            defaultValue: "Configure page count",
          })}
          <MaterialSymbol style={{ paddingTop: "3px" }}>
            expand_more
          </MaterialSymbol>
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <VStack align="stretch" gap="4" mt={4}>
          <Controller
            control={control}
            name="pageCount.enabled"
            render={({ field }) => (
              <Field.Root>
                <Switch.Root
                  name={field.name}
                  checked={field.value ?? false}
                  onCheckedChange={({ checked }) => {
                    if (checked) {
                      ensurePageCountDefaults();
                    }

                    field.onChange(checked);
                  }}
                >
                  <Switch.HiddenInput ref={field.ref} onBlur={field.onBlur} />
                  <Switch.Control />
                  <Switch.Label>
                    {t("pageCountConfig.enabledLabel", {
                      defaultValue:
                        "Enable page-count input for brochure, catalog, and book products",
                    })}
                  </Switch.Label>
                </Switch.Root>
              </Field.Root>
            )}
          />

          <Text fontSize="sm" color={{ base: "gray.600", _dark: "gray.400" }}>
            {t("pageCountConfig.helper", {
              defaultValue:
                "The entered page count is treated as the inner pages. The static cover is added separately, for example 124 + 4.",
            })}
          </Text>

          {enabled && (
            <>
              <SimpleGrid minChildWidth="240px" gap="4">
                <Field.Root required>
                  <Field.Label>
                    {t("pageCountConfig.minimum", {
                      defaultValue: "Minimum inner pages",
                    })}
                  </Field.Label>
                  <Input
                    type="number"
                    min={PAGE_COUNT_DIVISOR}
                    step={PAGE_COUNT_DIVISOR}
                    value={pageCount?.minimum ?? PAGE_COUNT_DIVISOR}
                    onChange={handleNumericFieldChange("minimum")}
                  />
                </Field.Root>

                <Field.Root required>
                  <Field.Label>
                    {t("pageCountConfig.maximum", {
                      defaultValue: "Maximum inner pages",
                    })}
                  </Field.Label>
                  <Input
                    type="number"
                    min={PAGE_COUNT_DIVISOR}
                    step={PAGE_COUNT_DIVISOR}
                    value={pageCount?.maximum ?? PAGE_COUNT_DIVISOR}
                    onChange={handleNumericFieldChange("maximum")}
                  />
                </Field.Root>

                <Field.Root required>
                  <Field.Label>
                    {t("pageCountConfig.step", {
                      defaultValue: "Page step",
                    })}
                  </Field.Label>
                  <Input
                    type="number"
                    min={PAGE_COUNT_DIVISOR}
                    step={PAGE_COUNT_DIVISOR}
                    value={pageCount?.step ?? PAGE_COUNT_DIVISOR}
                    onChange={handleNumericFieldChange("step")}
                  />
                </Field.Root>

                <Field.Root required>
                  <Field.Label>
                    {t("pageCountConfig.coverPages", {
                      defaultValue: "Cover pages",
                    })}
                  </Field.Label>
                  <Input
                    type="number"
                    min={PAGE_COUNT_DIVISOR}
                    step={PAGE_COUNT_DIVISOR}
                    value={
                      pageCount?.coverPages ?? DEFAULT_PAGE_COUNT_COVER_PAGES
                    }
                    onChange={handleNumericFieldChange("coverPages")}
                  />
                </Field.Root>
              </SimpleGrid>

              <SimpleGrid minChildWidth="320px" gap="4">
                <Field.Root>
                  <Field.Label>
                    {t("pageCountConfig.positionLabel", {
                      defaultValue: "Input placement",
                    })}
                  </Field.Label>
                  <Select.Root
                    collection={placementCollection}
                    value={[
                      pageCount?.placement?.afterAttributeId ?? "__before__",
                    ]}
                    onValueChange={({ value }) =>
                      setValue(
                        "pageCount.placement.afterAttributeId",
                        value[0] === "__before__" ? null : value[0],
                        {
                          shouldDirty: true,
                          shouldTouch: true,
                        },
                      )
                    }
                  >
                    <Select.HiddenSelect name="pageCount.placement.afterAttributeId" />
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText
                          placeholder={t(
                            "pageCountConfig.positionPlaceholder",
                            {
                              defaultValue: "Select where to place the input",
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
                          {placementCollection.items.map((item) => (
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

                <Field.Root>
                  <Field.Label>
                    {t("pageCountConfig.externalAttributeName", {
                      defaultValue: "External attribute name",
                    })}
                  </Field.Label>
                  <Input
                    value={pageCount?.externalAttributeName ?? ""}
                    onChange={(event) =>
                      setValue(
                        "pageCount.externalAttributeName",
                        event.currentTarget.value,
                        {
                          shouldDirty: true,
                          shouldTouch: true,
                        },
                      )
                    }
                    placeholder={t(
                      "pageCountConfig.externalAttributePlaceholder",
                      {
                        defaultValue: "e.g. pageNumber",
                      },
                    )}
                  />
                  <Field.HelperText>
                    {t("pageCountConfig.externalAttributeHelper", {
                      defaultValue:
                        "Used when importing or syncing external provider products.",
                    })}
                  </Field.HelperText>
                </Field.Root>

                {priceType === PriceTypeEnum.MATRIX ? (
                  <Field.Root>
                    <Field.Label>
                      {t("pageCountConfig.pricingMode.label", {
                        defaultValue: "Page-count pricing mode",
                      })}
                    </Field.Label>
                    {pricingMode === "segmented" ? (
                      <Box
                        px="3"
                        py="2"
                        borderWidth="1px"
                        borderRadius="md"
                        bg={{ base: "gray.50", _dark: "gray.900" }}
                      >
                        <Text fontWeight="medium">
                          {t("pageCountConfig.pricingMode.segmented", {
                            defaultValue: "Segmented provider pricing",
                          })}
                        </Text>
                      </Box>
                    ) : (
                      <Select.Root
                        collection={pricingModeCollection}
                        value={[pricingMode]}
                        onValueChange={({ value }) =>
                          setValue(
                            "pageCount.pricing.mode",
                            value[0] === "exact" ? "exact" : "step",
                            {
                              shouldDirty: true,
                              shouldTouch: true,
                            },
                          )
                        }
                      >
                        <Select.HiddenSelect name="pageCount.pricing.mode" />
                        <Select.Control>
                          <Select.Trigger>
                            <Select.ValueText
                              placeholder={t(
                                "pageCountConfig.pricingMode.placeholder",
                                {
                                  defaultValue: "Select a pricing mode",
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
                              {pricingModeCollection.items.map((item) => (
                                <Select.Item key={item.value} item={item}>
                                  {item.label}
                                  <Select.ItemIndicator />
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select.Positioner>
                        </Portal>
                      </Select.Root>
                    )}
                    <Field.HelperText>
                      {pricingMode === "segmented"
                        ? t("pageCountConfig.pricingMode.segmentedHelper", {
                            defaultValue:
                              "Imported nonlinear pricing is preserved as compact page-count ranges with their own base and step tables.",
                          })
                        : pricingMode === "exact"
                          ? t("pageCountConfig.pricingMode.exactHelper", {
                              defaultValue:
                                "Use a dedicated price matrix for each allowed page-count value.",
                            })
                          : t("pageCountConfig.pricingMode.stepHelper", {
                              defaultValue:
                                "Use one compact surcharge matrix that is added for every page-count step above the minimum.",
                            })}
                    </Field.HelperText>
                  </Field.Root>
                ) : null}
              </SimpleGrid>

              <Box
                p="4"
                borderRadius="2xl"
                bg={{ base: "gray.50", _dark: "gray.900" }}
              >
                <Heading size="sm" mb="2">
                  {t("pageCountConfig.previewHeading", {
                    defaultValue: "Display preview",
                  })}
                </Heading>
                <Text fontSize="sm">
                  {previewBreakdown ??
                    t("pageCountConfig.previewFallback", {
                      defaultValue: "Enter valid values to see the breakdown.",
                    })}
                </Text>
                <Text
                  mt="2"
                  fontSize="xs"
                  color={{ base: "gray.600", _dark: "gray.400" }}
                >
                  {t("pageCountConfig.divisibleByFour", {
                    defaultValue:
                      "All values should stay divisible by 4 so the product follows the standard cover + inner-page rule.",
                  })}
                </Text>
              </Box>

              {priceType === PriceTypeEnum.MATRIX ? (
                <Box>
                  <Heading size="md" mb="2">
                    {pricingMode === "segmented"
                      ? t("pageCountConfig.segmentedPricesHeading", {
                          defaultValue: "Segmented page-count pricing",
                        })
                      : pricingMode === "exact"
                        ? t("pageCountConfig.exactPricesHeading", {
                            defaultValue: "Exact page-count price tables",
                          })
                        : t("pageCountConfig.stepPricesHeading", {
                            defaultValue: "Per-step surcharge prices",
                          })}
                  </Heading>
                  <Text
                    fontSize="sm"
                    color={{ base: "gray.600", _dark: "gray.400" }}
                    mb="4"
                  >
                    {pricingMode === "segmented"
                      ? t("pageCountConfig.segmentedPricesHelper", {
                          defaultValue:
                            "This imported product uses compact pricing ranges. The first range reuses the main base matrix, and later ranges keep their own imported base and per-step matrices.",
                        })
                      : pricingMode === "exact"
                        ? t("pageCountConfig.exactPricesHelper", {
                            defaultValue:
                              "Edit one full price matrix per allowed page-count value. The selected page-count slice will be used during pricing.",
                          })
                        : t("pageCountConfig.stepPricesHelper", {
                            defaultValue:
                              "Keep the main price matrix as the minimum-page base price. This table defines the extra charge that should be added for each step above the minimum.",
                          })}
                  </Text>
                  {pricingMode === "segmented" ? (
                    <VStack align="stretch" gap="3">
                      {segmentedRanges.length > 0 ? (
                        segmentedRanges.map((segment, index) => (
                          <Box
                            key={`${segment.minimum}-${segment.maximum}`}
                            p="3"
                            borderWidth="1px"
                            borderRadius="md"
                          >
                            <Text fontWeight="medium">
                              {t("pageCountConfig.segmentedRangeLabel", {
                                defaultValue:
                                  "Range {{minimum}} to {{maximum}}",
                                maximum:
                                  formatPageCountBreakdown(
                                    segment.maximum,
                                    pageCount,
                                  ) ?? segment.maximum,
                                minimum:
                                  formatPageCountBreakdown(
                                    segment.minimum,
                                    pageCount,
                                  ) ?? segment.minimum,
                              })}
                            </Text>
                            <Text
                              mt="1"
                              fontSize="sm"
                              color={{ base: "gray.600", _dark: "gray.400" }}
                            >
                              {index === 0
                                ? t(
                                    "pageCountConfig.segmentedRangeBaseHelper",
                                    {
                                      defaultValue:
                                        "Uses the main product price matrix as the base and the shared first-range step surcharge table.",
                                    },
                                  )
                                : t(
                                    "pageCountConfig.segmentedRangeImportedHelper",
                                    {
                                      defaultValue:
                                        "Uses imported segment-specific base and per-step matrices preserved from provider pricing.",
                                    },
                                  )}
                            </Text>
                          </Box>
                        ))
                      ) : (
                        <Text
                          fontSize="sm"
                          color={{ base: "gray.600", _dark: "gray.400" }}
                        >
                          {t("pageCountConfig.segmentedPricesEmpty", {
                            defaultValue:
                              "No segmented ranges are available for this product yet.",
                          })}
                        </Text>
                      )}
                    </VStack>
                  ) : pricingMode === "exact" ? (
                    <VStack align="stretch" gap="4">
                      <Field.Root>
                        <Field.Label>
                          {t("pageCountConfig.exactPricesPageCountLabel", {
                            defaultValue: "Page count to edit",
                          })}
                        </Field.Label>
                        <Select.Root
                          collection={exactPageCountCollection}
                          value={
                            exactPageCountCollection.items.length > 0
                              ? [activeExactPageCount]
                              : []
                          }
                          onValueChange={({ value }) => {
                            if (value[0]) {
                              setActiveExactPageCount(value[0]);
                            }
                          }}
                        >
                          <Select.HiddenSelect />
                          <Select.Control>
                            <Select.Trigger>
                              <Select.ValueText
                                placeholder={t(
                                  "pageCountConfig.exactPricesPageCountPlaceholder",
                                  {
                                    defaultValue: "Select a page count",
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
                                {exactPageCountCollection.items.map((item) => (
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

                      {selectedExactPageCountIndex >= 0 ? (
                        <PricesMatrix
                          fieldName={`pageCount.pricing.exactPrices.${selectedExactPageCountIndex}.prices`}
                          drawerTitle={t("pageCountConfig.editExactPrices", {
                            defaultValue:
                              "Edit exact price table for {{pageCount}} pages",
                            pageCount:
                              formatPageCountBreakdown(
                                selectedExactPageCount,
                                pageCount,
                              ) ?? selectedExactPageCount,
                          })}
                          editButtonLabel={t(
                            "pageCountConfig.editExactPrices",
                            {
                              defaultValue:
                                "Edit exact price table for {{pageCount}} pages",
                              pageCount:
                                formatPageCountBreakdown(
                                  selectedExactPageCount,
                                  pageCount,
                                ) ?? selectedExactPageCount,
                            },
                          )}
                          exportButtonLabel={t(
                            "pageCountConfig.exportExactPrices",
                            {
                              defaultValue:
                                "Export exact price table for {{pageCount}} pages",
                              pageCount:
                                formatPageCountBreakdown(
                                  selectedExactPageCount,
                                  pageCount,
                                ) ?? selectedExactPageCount,
                            },
                          )}
                        />
                      ) : (
                        <Text
                          fontSize="sm"
                          color={{ base: "gray.600", _dark: "gray.400" }}
                        >
                          {t("pageCountConfig.exactPricesEmpty", {
                            defaultValue:
                              "Adjust the page-count range to generate exact price-table slots.",
                          })}
                        </Text>
                      )}
                    </VStack>
                  ) : (
                    <PricesMatrix
                      fieldName="pageCount.pricing.stepPrices"
                      drawerTitle={t("pageCountConfig.editStepPrices", {
                        defaultValue: "Edit page-step surcharge table",
                      })}
                      editButtonLabel={t("pageCountConfig.editStepPrices", {
                        defaultValue: "Edit page-step surcharge table",
                      })}
                      exportButtonLabel={t("pageCountConfig.exportStepPrices", {
                        defaultValue: "Export page-step surcharge table",
                      })}
                    />
                  )}
                </Box>
              ) : (
                <Text
                  fontSize="sm"
                  color={{ base: "gray.600", _dark: "gray.400" }}
                >
                  {t("pageCountConfig.nonMatrixPricingInfo", {
                    defaultValue:
                      "Per-step surcharge editing is currently available for matrix-priced products.",
                  })}
                </Text>
              )}
            </>
          )}
        </VStack>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
