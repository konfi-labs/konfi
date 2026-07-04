"use client";

import { Badge, Box, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { Attribute } from "@konfi/types";
import type { CustomSizeWithQuantity } from "@konfi/types";
import type { FakturowniaCostUnit } from "@konfi/types";
import {
  getMaterialCostInsights,
  getProductCostInsights,
  type SerializedProductCostBucket,
} from "@/actions/fakturownia";
import { describeCostPackaging } from "@/lib/fakturownia/describe-packaging";
import { useT } from "@/i18n/client";
import {
  convertUnitCostToItemTotal,
  extractPaperAndFormat,
} from "@konfi/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

interface ConfigurationCostPanelProps {
  open: boolean;
  productId: string | undefined;
  selectedAttributeOptions: { [k: string]: string | number } | undefined | null;
  attributes: Attribute[];
  quantity: number;
  totalPrice: number | undefined;
  width?: number | null;
  height?: number | null;
  customSizes?: CustomSizeWithQuantity[] | null;
  bleed?: number | null;
}

/** Maps a FakturowniaCostUnit to a short i18n-able suffix key. */
const COST_UNIT_SUFFIX_KEY: Record<FakturowniaCostUnit, string> = {
  piece: "admin.configurationCost.unitSuffix.piece",
  area_m2: "admin.configurationCost.unitSuffix.area_m2",
  sheet: "admin.configurationCost.unitSuffix.sheet",
  metre: "admin.configurationCost.unitSuffix.metre",
};

const COST_UNIT_SUFFIX_DEFAULT: Record<FakturowniaCostUnit, string> = {
  piece: "/ szt",
  area_m2: "/ m²",
  sheet: "/ ark",
  metre: "/ mb",
};

const CONFIGURATION_COST_PANEL_COLLAPSED_STORAGE_KEY =
  "admin.configurationCostPanel.collapsed";

function readStoredConfigurationCostPanelCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.localStorage.getItem(
        CONFIGURATION_COST_PANEL_COLLAPSED_STORAGE_KEY,
      ) === "1"
    );
  } catch {
    return false;
  }
}

function persistConfigurationCostPanelCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      CONFIGURATION_COST_PANEL_COLLAPSED_STORAGE_KEY,
      collapsed ? "1" : "0",
    );
  } catch {
    /* ignore persistence errors */
  }
}

export function ConfigurationCostPanel({
  open,
  productId,
  selectedAttributeOptions,
  attributes,
  quantity,
  totalPrice,
  width,
  height,
  customSizes,
  bleed,
}: ConfigurationCostPanelProps) {
  const { t, i18n } = useT(["order", "translation"]);
  const [collapsed, setCollapsed] = useState<boolean>(
    readStoredConfigurationCostPanelCollapsed,
  );

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== CONFIGURATION_COST_PANEL_COLLAPSED_STORAGE_KEY) {
        return;
      }

      setCollapsed(event.newValue === "1");
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    persistConfigurationCostPanelCollapsed(collapsed);
  }, [collapsed]);

  // ── Extract option pairs once (reused for both SWR keys) ──────────────────
  const pairs: Array<[string, string]> = useMemo(
    () =>
      selectedAttributeOptions != null
        ? Object.entries(selectedAttributeOptions).flatMap(([key, value]) =>
            key === "volume" || value == null
              ? []
              : [[key, String(value)] as [string, string]],
          )
        : [],
    [selectedAttributeOptions],
  );

  // Stable SWR key for material-cost lookup (sort so order doesn't matter)
  const materialPairsKey = useMemo(
    () =>
      pairs
        .map(([a, v]) => `${a}:${v}`)
        .sort()
        .join("|"),
    [pairs],
  );

  const { data: rollup, isLoading: isLoadingProduct } = useSWR(
    open && productId ? ["product-cost-insights", productId] : null,
    ([, pid]) => getProductCostInsights({ productId: pid }),
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const { data: materialInsights, isLoading: isLoadingMaterial } = useSWR(
    open && pairs.length > 0
      ? ["material-cost-insights", materialPairsKey]
      : null,
    () =>
      getMaterialCostInsights({
        options: pairs.map(([attributeId, optionValue]) => ({
          attributeId,
          optionValue,
        })),
      }),
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const isLoading = isLoadingProduct || isLoadingMaterial;

  const locale = i18n.resolvedLanguage ?? "pl";

  const formatCurrency = useCallback(
    (value: number | undefined): string => {
      if (value === undefined) {
        return "-";
      }
      return new Intl.NumberFormat(locale, {
        currency:
          rollup?.baseCurrency ?? materialInsights?.baseCurrency ?? "PLN",
        style: "currency",
      }).format(value);
    },
    [locale, rollup?.baseCurrency, materialInsights?.baseCurrency],
  );

  /** Derive the sheet geometry needed for "sheet" basis cost conversion. */
  const sheetGeometry = useMemo(() => {
    const { paperAttribute, formatOption } = extractPaperAndFormat(
      attributes,
      selectedAttributeOptions ?? null,
    );
    if (!paperAttribute?.calculateStockFromSheet?.enabled) return null;
    const sheet = paperAttribute.calculateStockFromSheet;
    return {
      sheetWidth: sheet.sheetWidth,
      sheetHeight: sheet.sheetHeight,
      margin: sheet.margin,
      bleed: sheet.bleed,
      // item dims: prefer formatOption dimensions, fall back to configured w/h
      itemWidth: formatOption?.formatWidth ?? width ?? 0,
      itemHeight: formatOption?.formatHeight ?? height ?? 0,
    };
  }, [attributes, selectedAttributeOptions, width, height]);

  // Item dimensions for "sheet" basis fitting, taken from the selected FORMAT
  // option (e.g. A5 → A6) independently of calculateStockFromSheet — so the cost
  // can be derived from how many items fit on the sheet whenever a sheet size is
  // known (from the material's packaging OR the paper attribute). Falls back to
  // the configured width/height.
  const formatDims = useMemo(() => {
    const { formatOption } = extractPaperAndFormat(
      attributes,
      selectedAttributeOptions ?? null,
    );
    return {
      itemWidth: formatOption?.formatWidth ?? width ?? 0,
      itemHeight: formatOption?.formatHeight ?? height ?? 0,
    };
  }, [attributes, selectedAttributeOptions, width, height]);

  const computed = useMemo(() => {
    // Render when at least one of the two sources has data
    if (!rollup && !materialInsights) return null;

    // ── Build geometry object shared by all conversions ──────────────────────
    const geo = {
      quantity,
      width: width ?? null,
      height: height ?? null,
      customSizes: customSizes ?? null,
      bleed: bleed ?? null,
      sheet: sheetGeometry
        ? {
            sheetWidth: sheetGeometry.sheetWidth,
            sheetHeight: sheetGeometry.sheetHeight,
            margin: sheetGeometry.margin,
            bleed: sheetGeometry.bleed,
          }
        : null,
    };

    function convertBucketToTotal(
      componentAttributeId: string,
      componentOptionValue: string,
      bucket: SerializedProductCostBucket,
      factor = 1,
    ) {
      const componentAttr = attributes.find(
        (a) => a.id === componentAttributeId,
      );
      const componentOpt = componentAttr?.options?.find(
        (o) => String(o.value) === String(componentOptionValue),
      );
      const effectiveBasis: FakturowniaCostUnit =
        componentAttr?.costUnit ?? bucket.costUnit ?? "piece";
      const unitsPerSheetOverride =
        effectiveBasis === "sheet"
          ? (componentOpt?.unitsPerSheet ?? null)
          : null;
      const sheetItemWidth =
        effectiveBasis === "sheet"
          ? (componentOpt?.formatWidth ?? formatDims.itemWidth)
          : (width ?? 0);
      const sheetItemHeight =
        effectiveBasis === "sheet"
          ? (componentOpt?.formatHeight ?? formatDims.itemHeight)
          : (height ?? 0);
      const rowSheetGeo =
        effectiveBasis === "sheet"
          ? bucket.sheetWidthMm && bucket.sheetHeightMm
            ? {
                sheetWidth: bucket.sheetWidthMm,
                sheetHeight: bucket.sheetHeightMm,
                margin: sheetGeometry?.margin,
                bleed: sheetGeometry?.bleed,
              }
            : geo.sheet
          : geo.sheet;
      const convertedTotal =
        bucket.latestUnitCostNetBase !== undefined
          ? (() => {
              const converted = convertUnitCostToItemTotal(
                effectiveBasis,
                bucket.latestUnitCostNetBase,
                {
                  ...geo,
                  sheet: rowSheetGeo,
                  width: sheetItemWidth,
                  height: sheetItemHeight,
                  unitsPerSheetOverride,
                },
              );
              return converted === undefined ? undefined : converted * factor;
            })()
          : undefined;
      const componentLabel =
        componentAttr && componentOpt
          ? `${componentAttr.name} / ${componentOpt.label}`
          : `${componentAttributeId}:${componentOptionValue}`;

      return {
        basis: effectiveBasis,
        convertedTotal,
        derivation: describeCostPackaging(bucket.packaging, effectiveBasis, t),
        label: componentLabel,
      };
    }

    // ── Build per-option rows — material bucket is primary, product bucket fallback ──
    const optionRows = pairs.map(([attributeId, optionValue]) => {
      const key = `${attributeId}:${optionValue}`;
      const materialBucket = materialInsights?.byOption?.[key];
      const productBucket = rollup?.byAttributeOption?.[key];
      const attr = attributes.find((a) => a.id === attributeId);
      const opt = attr?.options?.find(
        (o) => String(o.value) === String(optionValue),
      );
      const label =
        attr && opt
          ? `${attr.name} / ${opt.label}`
          : `${attributeId}:${optionValue}`;

      if (materialBucket?.source === "recipe") {
        const componentRows =
          materialBucket.components?.map((component) =>
            component.bucket
              ? {
                  ...convertBucketToTotal(
                    component.attributeId,
                    component.optionValue,
                    component.bucket,
                    component.factor,
                  ),
                  factor: component.factor,
                }
              : {
                  basis: undefined,
                  convertedTotal: undefined,
                  derivation: undefined,
                  factor: component.factor,
                  label: `${component.attributeId}:${component.optionValue}`,
                },
          ) ?? [];
        const incomplete =
          materialBucket.incomplete ||
          componentRows.some((row) => row.convertedTotal === undefined);
        const convertedTotal = incomplete
          ? undefined
          : componentRows.reduce(
              (sum, row) => sum + (row.convertedTotal ?? 0),
              0,
            );
        return {
          label,
          convertedTotal,
          basis: undefined,
          derivation: materialBucket.recipeName
            ? t("admin.configurationCost.recipe", {
                name: materialBucket.recipeName,
                defaultValue: "Recipe: {{name}}",
              })
            : undefined,
          componentRows,
          incomplete,
        };
      }

      // material-first: shared material cost spans all products using that option
      const bucket = materialBucket ?? productBucket;
      if (!bucket) {
        return { label, convertedTotal: undefined, basis: undefined };
      }

      // effectiveBasis: attribute override wins over bucket's detected basis
      const effectiveBasis: FakturowniaCostUnit =
        attr?.costUnit ?? bucket.costUnit ?? "piece";

      // For "sheet" basis we may need a per-option unitsPerSheet override
      const unitsPerSheetOverride =
        effectiveBasis === "sheet" ? (opt?.unitsPerSheet ?? null) : null;

      // Item dims for sheet basis: the selected format option (A5/A6 …) drives
      // how many items fit per sheet, regardless of calculateStockFromSheet.
      const sheetItemWidth =
        effectiveBasis === "sheet"
          ? (opt?.formatWidth ?? formatDims.itemWidth)
          : (width ?? 0);
      const sheetItemHeight =
        effectiveBasis === "sheet"
          ? (opt?.formatHeight ?? formatDims.itemHeight)
          : (height ?? 0);

      // For "sheet" basis, prefer bucket's purchase-sheet dims over the paper
      // attribute's calculateStockFromSheet dims (they reflect the actual sheet
      // size the supplier sells, e.g. 320×450 mm extracted from the invoice).
      const rowSheetGeo =
        effectiveBasis === "sheet"
          ? bucket.sheetWidthMm && bucket.sheetHeightMm
            ? {
                sheetWidth: bucket.sheetWidthMm,
                sheetHeight: bucket.sheetHeightMm,
                margin: sheetGeometry?.margin,
                bleed: sheetGeometry?.bleed,
              }
            : geo.sheet
          : geo.sheet;

      const convertedTotal =
        bucket.latestUnitCostNetBase !== undefined
          ? convertUnitCostToItemTotal(
              effectiveBasis,
              bucket.latestUnitCostNetBase,
              {
                ...geo,
                sheet: rowSheetGeo,
                width: sheetItemWidth,
                height: sheetItemHeight,
                unitsPerSheetOverride,
              },
            )
          : undefined;

      const derivation = describeCostPackaging(
        bucket.packaging,
        effectiveBasis,
        t,
      );

      return { label, convertedTotal, basis: effectiveBasis, derivation };
    });

    // ── Configuration cost total: sum of per-option buckets if any exist ─────
    const rowsWithData = optionRows.filter(
      (r) => r.convertedTotal !== undefined,
    );
    let configurationCostTotal: number | undefined;

    if (rowsWithData.length > 0) {
      configurationCostTotal = rowsWithData.reduce(
        (sum, r) => sum + (r.convertedTotal ?? 0),
        0,
      );
    } else if (rollup) {
      // Fall back to product overall cost bucket only when product rollup is present
      const overallBasis: FakturowniaCostUnit =
        rollup.overall.costUnit ?? "piece";
      const overallUnitCost = rollup.overall.latestUnitCostNetBase;
      if (overallUnitCost !== undefined) {
        configurationCostTotal = convertUnitCostToItemTotal(
          overallBasis,
          overallUnitCost,
          geo,
        );
      }
    }

    // ── Overall trend (from product overall bucket, when available) ───────────
    const baselineUnitCost = rollup?.overall.latestUnitCostNetBase;
    const overallDerivation = describeCostPackaging(
      rollup?.overall.packaging,
      rollup?.overall.costUnit ?? undefined,
      t,
    );
    const previous = rollup?.overall.previousUnitCostNetBase;
    const trend: "down" | "up" | null =
      baselineUnitCost !== undefined &&
      previous !== undefined &&
      baselineUnitCost !== previous
        ? baselineUnitCost < previous
          ? "down"
          : "up"
        : null;

    // ── Margin calculation (configuration-cost based) ─────────────────────────
    const salePLN = (totalPrice ?? 0) / 100;
    const unitSalePLN = quantity > 0 ? salePLN / quantity : salePLN;

    const marginValue =
      configurationCostTotal !== undefined && salePLN > 0
        ? salePLN - configurationCostTotal
        : undefined;
    const marginPct =
      marginValue !== undefined && salePLN > 0
        ? (marginValue / salePLN) * 100
        : undefined;

    const unitCostForDisplay =
      configurationCostTotal !== undefined && quantity > 0
        ? configurationCostTotal / quantity
        : undefined;
    const unitMarginValue =
      marginValue !== undefined && quantity > 0
        ? marginValue / quantity
        : marginValue;

    return {
      baselineUnitCost,
      overallDerivation,
      previous,
      trend,
      optionRows,
      salePLN,
      unitSalePLN,
      configurationCostTotal,
      unitCostForDisplay,
      marginValue,
      unitMarginValue,
      marginPct,
    };
  }, [
    rollup,
    materialInsights,
    pairs,
    attributes,
    totalPrice,
    quantity,
    width,
    height,
    customSizes,
    bleed,
    sheetGeometry,
    formatDims,
    t,
  ]);

  // Do not render when: dialog closed, or there is nothing to show at all
  if (!open || (!productId && pairs.length === 0)) return null;

  // Both responses settled and integration is off for both -> hide
  if (!isLoading && rollup === null && materialInsights === null) return null;

  if (!isLoading && (rollup !== undefined || materialInsights !== undefined)) {
    const hasProductData =
      rollup != null &&
      (rollup.overall.sampleCount > 0 ||
        Object.values(rollup.byAttributeOption ?? {}).some(
          (b) => b.sampleCount > 0,
        ));
    const hasMaterialData =
      materialInsights != null &&
      Object.keys(materialInsights.byOption).length > 0;
    if (!hasProductData && !hasMaterialData) return null;
  }

  // While both are still loading with open=true, render null to avoid flash
  if (isLoading && !rollup && !materialInsights) return null;

  const PANEL_POSITION = {
    top: { base: 3, md: 5 },
    right: { base: 3, md: 5 },
  } as const;

  if (collapsed) {
    return (
      <Box
        position="fixed"
        top={PANEL_POSITION.top}
        right={PANEL_POSITION.right}
        zIndex={2404}
      >
        <IconButton
          aria-label={t("admin.configurationCost.showCost", {
            defaultValue: "Show cost",
          })}
          borderRadius="full"
          size="sm"
          variant="surface"
          onClick={() => setCollapsed(false)}
        >
          <MaterialSymbol>payments</MaterialSymbol>
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      position="fixed"
      top={PANEL_POSITION.top}
      right={PANEL_POSITION.right}
      zIndex={2404}
      w={{ base: "calc(100vw - 24px)", md: "360px" }}
      maxH="80vh"
      display="flex"
      flexDirection="column"
      overflowY="auto"
      bg={{ base: "whiteAlpha.800", _dark: "blackAlpha.700" }}
      backdropFilter="saturate(150%) blur(24px)"
      css={{ WebkitBackdropFilter: "saturate(150%) blur(24px)" }}
      borderWidth="1px"
      borderColor={{ base: "whiteAlpha.700", _dark: "whiteAlpha.300" }}
      borderRadius="3xl"
      boxShadow="0 24px 70px rgba(15,23,42,0.28)"
      p={4}
    >
      {/* Header */}
      <HStack justifyContent="space-between" mb={3}>
        <HStack gap={2} minW={0} flex="1">
          <Text fontWeight="bold" fontSize="sm" truncate>
            {t("admin.configurationCost.title", {
              defaultValue: "Configuration cost (admin)",
            })}
          </Text>
          <Badge
            colorPalette="orange"
            flexShrink={0}
            size="sm"
            variant="subtle"
          >
            {t("admin.configurationCost.betaBadge", {
              defaultValue: "Beta",
            })}
          </Badge>
        </HStack>
        <IconButton
          aria-label={t("admin.configurationCost.hide", {
            defaultValue: "Hide cost panel",
          })}
          size="xs"
          flexShrink={0}
          variant="ghost"
          onClick={() => setCollapsed(true)}
        >
          <MaterialSymbol>visibility_off</MaterialSymbol>
        </IconButton>
      </HStack>

      {computed && (
        <VStack gap={3} alignItems="stretch">
          {/* Save-to-recalculate hint */}
          <HStack
            gap={1}
            alignItems="flex-start"
            color="fg.muted"
            fontSize="xs"
          >
            <MaterialSymbol>info</MaterialSymbol>
            <Text lineHeight="short">
              {t("admin.configurationCost.saveToRecalculate", {
                defaultValue:
                  "Costs reflect the saved configuration — save your changes to recalculate.",
              })}
            </Text>
          </HStack>
          {/* Overall unit cost + trend */}
          <Box>
            <Text fontSize="xs" color="fg.muted" mb={0.5}>
              {t("admin.costInsights.latestCost", {
                defaultValue: "Latest unit cost (net)",
              })}
            </Text>
            <HStack gap={1}>
              <Text fontSize="md" fontWeight="semibold">
                {formatCurrency(computed.baselineUnitCost)}
              </Text>
              {computed.trend && (
                <MaterialSymbol
                  color={computed.trend === "down" ? "green.500" : "red.500"}
                >
                  {computed.trend === "down" ? "trending_down" : "trending_up"}
                </MaterialSymbol>
              )}
            </HStack>
            {rollup && rollup.overall.averageUnitCostNetBase !== undefined && (
              <Text fontSize="xs" color="fg.muted">
                {t("admin.costInsights.averageCost", {
                  defaultValue: "Average unit cost (net)",
                })}
                {": "}
                {formatCurrency(rollup.overall.averageUnitCostNetBase)}
              </Text>
            )}
            {rollup?.overall.latestIssueDate && (
              <Text fontSize="xs" color="fg.muted">
                {t("admin.costInsights.latestIssueDate", {
                  defaultValue: "Latest invoice date",
                })}
                {": "}
                {rollup.overall.latestIssueDate}
              </Text>
            )}
            {computed.overallDerivation && (
              <Text fontSize="2xs" color="fg.muted" mt={0.5}>
                {computed.overallDerivation}
              </Text>
            )}
          </Box>

          {/* Material costs breakdown (per selected option) */}
          {computed.optionRows.length > 0 && (
            <Box>
              <Text fontSize="xs" color="fg.muted" mb={1}>
                {t("admin.configurationCost.materialCosts", {
                  defaultValue: "Material costs",
                })}
              </Text>
              <VStack gap={1} alignItems="stretch">
                {computed.optionRows.map((row) => (
                  <VStack key={row.label} gap={0} alignItems="stretch">
                    <HStack justifyContent="space-between">
                      <Text fontSize="xs" color="fg.muted" truncate>
                        {row.label}
                      </Text>
                      {row.convertedTotal !== undefined ? (
                        <HStack gap={1}>
                          <Text fontSize="xs" fontWeight="medium">
                            {formatCurrency(row.convertedTotal)}
                          </Text>
                          {row.basis && row.basis !== "piece" && (
                            <Text fontSize="xs" color="fg.subtle">
                              {t(COST_UNIT_SUFFIX_KEY[row.basis], {
                                defaultValue:
                                  COST_UNIT_SUFFIX_DEFAULT[row.basis],
                              })}
                            </Text>
                          )}
                        </HStack>
                      ) : (
                        <Text fontSize="xs" color="fg.muted">
                          {t("admin.configurationCost.noData", {
                            defaultValue: "no data",
                          })}
                        </Text>
                      )}
                    </HStack>
                    {row.derivation && (
                      <Text fontSize="2xs" color="fg.muted">
                        {row.derivation}
                      </Text>
                    )}
                    {"componentRows" in row &&
                    Array.isArray(row.componentRows) &&
                    row.componentRows.length > 0 ? (
                      <VStack align="stretch" gap={0} pl={2}>
                        {row.componentRows.map((componentRow) => (
                          <HStack
                            key={`${row.label}:${componentRow.label}`}
                            justifyContent="space-between"
                            gap={2}
                          >
                            <Text fontSize="2xs" color="fg.muted" truncate>
                              {componentRow.factor !== 1
                                ? `${componentRow.label} × ${componentRow.factor}`
                                : componentRow.label}
                            </Text>
                            <Text fontSize="2xs" color="fg.muted">
                              {componentRow.convertedTotal !== undefined
                                ? formatCurrency(componentRow.convertedTotal)
                                : t("admin.configurationCost.noData", {
                                    defaultValue: "no data",
                                  })}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    ) : null}
                  </VStack>
                ))}
              </VStack>
            </Box>
          )}

          {/* Configuration cost total */}
          {computed.configurationCostTotal !== undefined && (
            <Box>
              <Text fontSize="xs" color="fg.muted" mb={0.5}>
                {t("admin.configurationCost.configurationCostTotal", {
                  defaultValue: "Configuration cost (total)",
                })}
              </Text>
              <HStack gap={2} flexWrap="wrap">
                <Box>
                  <Text fontSize="xs" color="fg.muted">
                    {t("admin.configurationCost.totalCost", {
                      defaultValue: "Total net cost",
                    })}
                  </Text>
                  <Text fontSize="sm" fontWeight="semibold">
                    {formatCurrency(computed.configurationCostTotal)}
                  </Text>
                </Box>
                {computed.unitCostForDisplay !== undefined && (
                  <Box>
                    <Text fontSize="xs" color="fg.muted">
                      {t("admin.configurationCost.unitCost", {
                        defaultValue: "Unit cost",
                      })}
                    </Text>
                    <Text fontSize="sm" fontWeight="medium">
                      {formatCurrency(computed.unitCostForDisplay)}
                    </Text>
                  </Box>
                )}
              </HStack>
            </Box>
          )}

          {/* Margin block */}
          {computed.marginValue !== undefined && (
            <Box>
              <Text fontSize="xs" color="fg.muted" mb={0.5}>
                {t("admin.configurationCost.priceVsCost", {
                  defaultValue: "Configured price vs net purchase cost",
                })}
              </Text>
              <HStack gap={2} flexWrap="wrap">
                <Box>
                  <Text fontSize="xs" color="fg.muted">
                    {t("admin.configurationCost.configuredUnitPrice", {
                      defaultValue: "Unit price",
                    })}
                  </Text>
                  <Text fontSize="sm" fontWeight="medium">
                    {formatCurrency(computed.unitSalePLN)}
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color="fg.muted">
                    {t("admin.configurationCost.margin", {
                      defaultValue: "Unit margin",
                    })}
                  </Text>
                  <HStack gap={1}>
                    <Text
                      fontSize="sm"
                      fontWeight="semibold"
                      color={
                        computed.marginValue >= 0 ? "green.500" : "red.500"
                      }
                    >
                      {formatCurrency(computed.unitMarginValue)}
                    </Text>
                    {computed.marginPct !== undefined && (
                      <Text
                        fontSize="xs"
                        color={
                          computed.marginPct >= 0 ? "green.500" : "red.500"
                        }
                      >
                        ({computed.marginPct.toFixed(1)}%)
                      </Text>
                    )}
                  </HStack>
                </Box>
              </HStack>
            </Box>
          )}

          {/* Footer disclaimer */}
          <Text fontSize="xs" color="fg.muted" lineHeight="short">
            {t("admin.configurationCost.disclaimer", {
              defaultValue:
                "Net purchase cost from approved supplier invoices (PLN). Costs are converted to the configured size and quantity. Per-option figures are additive material costs; overall is a product-wide fallback.",
            })}
          </Text>
        </VStack>
      )}
    </Box>
  );
}
