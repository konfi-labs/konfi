"use client";

import {
  approveFakturowniaCostMappingAction,
  bulkApproveFakturowniaCostMappingsAction,
  createManualFakturowniaCostAction,
  getCostInvoiceSupplierDraftAction,
  linkCostMappingSupplierAction,
  rejectFakturowniaCostMappingAction,
  removeApprovedFakturowniaCostMappingAction,
  saveCostAsReferenceFromCostMappingAction,
  saveFakturowniaCostMappingPackagingAction,
  type CreateManualCostActionState,
  type SyncFakturowniaCostInvoicesActionState,
  syncFakturowniaCostInvoicesAction,
} from "@/actions/fakturownia-costs";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CostRecipesManager } from "@/components/fakturownia/CostRecipesManager";
import { MaterialGroupsManager } from "@/components/fakturownia/MaterialGroupsManager";
import SupplierForm from "@/components/suppliers/SupplierForm";
import type { Address, FakturowniaCostPackaging } from "@konfi/types";
import { useT } from "@/i18n/client";
import { describeCostPackaging } from "@/lib/fakturownia/describe-packaging";
import {
  Badge,
  Box,
  Button,
  Card,
  Combobox,
  createListCollection,
  Field,
  Flex,
  HStack,
  Input,
  Portal,
  Select,
  Separator,
  SimpleGrid,
  Spinner,
  Text,
  useFilter,
  useListCollection,
  VStack,
} from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  MaterialSymbol,
  toaster,
} from "@konfi/components";
import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

interface SelectorOption {
  description?: string;
  label: string;
  value: string;
}

export interface FakturowniaCostMappingSelectorOption {
  label: string;
  value: string;
}

export interface FakturowniaCostMappingSelectorAttribute {
  id: string;
  name: string;
  options: FakturowniaCostMappingSelectorOption[];
}

export interface FakturowniaCostMappingSelectorProduct {
  attributes: FakturowniaCostMappingSelectorAttribute[];
  categoryName?: string;
  channelId?: string;
  channelName?: string;
  id: string;
  name: string;
}

export interface FakturowniaCostReviewItem {
  evidence?: {
    conversion?: {
      baseCurrency: string;
      exchangeRate: number;
      rateDate?: string;
      source?: string;
      totalPriceGrossBase?: number;
      totalPriceNetBase?: number;
      unitCostGrossBase?: number;
      unitCostNetBase?: number;
    };
    currency: string;
    id: string;
    invoice: {
      id: string;
      issueDate?: string;
      number?: string;
      sellDate?: string;
    };
    invoiceKind?: "correction" | "regular";
    name: string;
    position: {
      code?: string;
      description?: string;
      fakturowniaProductId?: string;
      index: number;
      name?: string;
    };
    priceGross?: number;
    priceNet?: number;
    quantity: number;
    quantityUnit?: string;
    supplier: {
      clientId?: string;
      name?: string;
      nip?: string;
      supplierId?: string;
    };
    totalPriceGross?: number;
    totalPriceNet?: number;
    unitCostGross?: number;
    unitCostNet?: number;
  };
  mapping: {
    aliases: string[];
    attributeId?: string;
    attributeName?: string;
    combinationId?: string;
    confidence: number;
    id: string;
    name: string;
    optionLabel?: string;
    optionValue?: string;
    packaging?: FakturowniaCostPackaging;
    productIds?: string[];
    productId?: string;
    productLinks?: Array<{
      attributeId?: string;
      attributeName?: string;
      combinationId?: string;
      optionLabel?: string;
      optionValue?: string;
      productId: string;
      productName?: string;
    }>;
    productName?: string;
    reasoning?: string;
    reference?: boolean;
    sourceSignals: string[];
    supplierId?: string;
    supplierName?: string;
  };
}

const EMPTY_SELECTOR_OPTIONS: FakturowniaCostMappingSelectorOption[] = [];

function formatMoney(
  value: number | undefined,
  currency: string | undefined,
  lng: string,
): string {
  if (value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat(lng, {
    currency: currency ?? "PLN",
    style: "currency",
  }).format(value);
}

function costBasis(
  pair: FakturowniaCostReviewItem,
  lng: string,
  netLabel: string,
): string {
  const evidence = pair.evidence;
  if (!evidence) {
    return "-";
  }
  const quantity = evidence.quantity > 0 ? evidence.quantity : 1;
  const derivedUnitCostNet =
    evidence.totalPriceNet === undefined
      ? undefined
      : Math.round((evidence.totalPriceNet / quantity) * 100) / 100;
  // Prefer the NET unit cost so the basis is a single, consistent figure
  // rather than a net→gross fallback chain that mixes bases.
  const unitCostNet =
    evidence.unitCostNet ?? evidence.priceNet ?? derivedUnitCostNet;
  const unit = evidence.quantityUnit ?? "unit";
  const netUnit = `/ ${unit} (${netLabel})`;

  if (unitCostNet === undefined) {
    return "-";
  }

  const primary = formatMoney(unitCostNet, evidence.currency, lng);

  // When the invoice currency is not the base currency, also surface the
  // converted base-currency (PLN) figure so reviewers can compare costs
  // across currencies.
  const conversion = evidence.conversion;
  if (
    conversion &&
    evidence.currency !== conversion.baseCurrency &&
    conversion.unitCostNetBase !== undefined
  ) {
    const base = formatMoney(
      conversion.unitCostNetBase,
      conversion.baseCurrency,
      lng,
    );
    return `${primary} (≈ ${base}) ${netUnit}`;
  }

  return `${primary} ${netUnit}`;
}

function joinParts(parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" / ");
}

interface ProductLinkDraft {
  attributeId: string;
  key: string;
  optionValue: string;
  productId: string;
}

function initialProductLinkDrafts(
  mapping: FakturowniaCostReviewItem["mapping"],
): ProductLinkDraft[] {
  const links =
    mapping.productLinks && mapping.productLinks.length > 0
      ? mapping.productLinks
      : mapping.productId
        ? [
            {
              attributeId: mapping.attributeId,
              optionValue: mapping.optionValue,
              productId: mapping.productId,
            },
          ]
        : [];

  if (links.length > 0) {
    return links.map((link, index) => ({
      attributeId: link.attributeId ?? "",
      key: `${mapping.id}-${link.productId}-${index}`,
      optionValue: link.optionValue ?? "",
      productId: link.productId,
    }));
  }

  return [
    {
      attributeId: mapping.attributeId ?? "",
      key: `${mapping.id}-material`,
      optionValue: mapping.optionValue ?? "",
      productId: "",
    },
  ];
}

function productLinkPayload(input: {
  draft: ProductLinkDraft;
  products: readonly FakturowniaCostMappingSelectorProduct[];
  unionAttributes: readonly FakturowniaCostMappingSelectorAttribute[];
}) {
  if (!input.draft.productId) {
    return undefined;
  }

  const product = input.products.find(
    (candidate) => candidate.id === input.draft.productId,
  );
  const attributes = product?.attributes ?? input.unionAttributes;
  const attribute = attributes.find(
    (candidate) => candidate.id === input.draft.attributeId,
  );
  const option = attribute?.options.find(
    (candidate) => candidate.value === input.draft.optionValue,
  );

  return {
    productId: input.draft.productId,
    ...(product?.name ? { productName: product.name } : {}),
    ...(attribute
      ? { attributeId: attribute.id, attributeName: attribute.name }
      : {}),
    ...(option ? { optionLabel: option.label, optionValue: option.value } : {}),
  };
}

function productSelectorLabel(
  product: FakturowniaCostMappingSelectorProduct,
): string {
  const channelLabel = product.channelName ?? product.channelId;
  return channelLabel ? `${product.name} (${channelLabel})` : product.name;
}

function materialDraftPayload(input: {
  draft: ProductLinkDraft | undefined;
  unionAttributes: readonly FakturowniaCostMappingSelectorAttribute[];
}) {
  if (!input.draft || input.draft.productId) {
    return {};
  }
  const attribute = input.unionAttributes.find(
    (candidate) => candidate.id === input.draft?.attributeId,
  );
  const option = attribute?.options.find(
    (candidate) => candidate.value === input.draft?.optionValue,
  );

  return {
    attributeId: attribute?.id ?? "",
    attributeName: attribute?.name ?? "",
    optionLabel: option?.label ?? "",
    optionValue: option?.value ?? "",
  };
}

function SingleCombobox({
  disabled,
  emptyText,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  emptyText: string;
  onChange: (value: string | undefined) => void;
  options: readonly SelectorOption[];
  placeholder: string;
  value?: string;
}) {
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const [inputValue, setInputValue] = useState(selectedOption?.label ?? "");
  const { contains } = useFilter({ sensitivity: "base" });
  const stableOptions = useMemo(() => options.slice(), [options]);
  const { collection, filter, set } = useListCollection<SelectorOption>({
    filter: contains,
    initialItems: stableOptions,
    itemToString: (item) => joinParts([item.label, item.description]),
    itemToValue: (item) => item.value,
  });

  useEffect(() => {
    set(stableOptions);
    filter("");
  }, [filter, set, stableOptions]);

  useEffect(() => {
    setInputValue(selectedOption?.label ?? "");
  }, [selectedOption?.label]);

  return (
    <Combobox.Root
      closeOnSelect
      collection={collection}
      colorPalette="primary"
      disabled={disabled}
      inputValue={inputValue}
      onInputValueChange={({ inputValue: nextInputValue }) => {
        setInputValue(nextInputValue);
        filter(nextInputValue);
      }}
      onValueChange={({ value: nextValue }) => {
        const next = nextValue[0];
        onChange(next || undefined);
        const nextOption = stableOptions.find(
          (option) => option.value === next,
        );
        setInputValue(nextOption?.label ?? "");
        filter("");
      }}
      openOnClick
      selectionBehavior="replace"
      size="sm"
      value={value ? [value] : []}
      width="100%"
    >
      <Combobox.Control>
        <Combobox.Input placeholder={placeholder} />
        <Combobox.IndicatorGroup>
          <Combobox.ClearTrigger />
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content maxH="64" overflowY="auto">
            <Combobox.Empty>{emptyText}</Combobox.Empty>
            {collection.items.map((item) => (
              <Combobox.Item key={item.value} item={item}>
                <Combobox.ItemText width="100%">
                  <VStack align="stretch" gap={0}>
                    <Text fontSize="sm" truncate>
                      {item.label}
                    </Text>
                    {item.description ? (
                      <Text color="fg.muted" fontSize="xs" truncate>
                        {item.description}
                      </Text>
                    ) : null}
                  </VStack>
                </Combobox.ItemText>
                <Combobox.ItemIndicator />
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}

function SingleSelect({
  disabled,
  formId,
  name,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  formId?: string;
  name: string;
  onChange: (value: string | undefined) => void;
  options: readonly SelectorOption[];
  placeholder: string;
  value?: string;
}) {
  const collection = useMemo(
    () => createListCollection({ items: options.slice() }),
    [options],
  );

  return (
    <Select.Root
      collection={collection}
      disabled={disabled}
      onValueChange={({ value: nextValue }) => onChange(nextValue[0])}
      size="sm"
      value={value ? [value] : []}
    >
      <Select.HiddenSelect name={name} form={formId} />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder={placeholder} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.ClearTrigger />
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content maxH="64" overflowY="auto">
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

function ProductLinksEditor({
  drafts,
  emptyText,
  onChange,
  productPlaceholder,
  products,
  t,
  unionAttributes,
}: {
  drafts: ProductLinkDraft[];
  emptyText: string;
  onChange: (drafts: ProductLinkDraft[]) => void;
  productPlaceholder: string;
  products: readonly FakturowniaCostMappingSelectorProduct[];
  t: ReturnType<typeof useT>["t"];
  unionAttributes: readonly FakturowniaCostMappingSelectorAttribute[];
}) {
  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        description: product.categoryName,
        label: productSelectorLabel(product),
        value: product.id,
      })),
    [products],
  );

  const updateDraft = (
    key: string,
    update: Partial<Omit<ProductLinkDraft, "key">>,
  ): void => {
    onChange(
      drafts.map((draft) =>
        draft.key === key ? { ...draft, ...update } : draft,
      ),
    );
  };

  return (
    <VStack align="stretch" gap={2}>
      {drafts.map((draft, index) => {
        const selectedProduct = products.find(
          (product) => product.id === draft.productId,
        );
        const attributeChoices = selectedProduct?.attributes ?? unionAttributes;
        const selectedAttribute = attributeChoices.find(
          (attribute) => attribute.id === draft.attributeId,
        );
        const optionChoices =
          selectedAttribute?.options ?? EMPTY_SELECTOR_OPTIONS;
        const attributeOptions = attributeChoices.map((attribute) => ({
          label: attribute.name,
          value: attribute.id,
        }));
        const selectOptionItems = optionChoices.map((option) => ({
          label: option.label,
          value: option.value,
        }));

        return (
          <SimpleGrid
            key={draft.key}
            alignItems="end"
            columns={{ base: 1, md: 4 }}
            gap={2}
          >
            <Field.Root>
              <Field.Label fontSize="xs">
                {t("fakturownia.costs.product", {
                  defaultValue: "Product",
                })}
              </Field.Label>
              <SingleCombobox
                disabled={productOptions.length === 0}
                emptyText={emptyText}
                onChange={(nextProductId) =>
                  updateDraft(draft.key, {
                    productId: nextProductId ?? "",
                    attributeId: "",
                    optionValue: "",
                  })
                }
                options={productOptions}
                placeholder={productPlaceholder}
                value={draft.productId}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">
                {t("fakturownia.costs.attribute", {
                  defaultValue: "Attribute",
                })}
              </Field.Label>
              <SingleSelect
                disabled={attributeOptions.length === 0}
                name={`attributeId-${draft.key}`}
                onChange={(nextAttributeId) =>
                  updateDraft(draft.key, {
                    attributeId: nextAttributeId ?? "",
                    optionValue: "",
                  })
                }
                options={attributeOptions}
                placeholder={t("fakturownia.costs.attributePlaceholder", {
                  defaultValue: "Any attribute",
                })}
                value={draft.attributeId}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">
                {t("fakturownia.costs.option", {
                  defaultValue: "Option",
                })}
              </Field.Label>
              <SingleSelect
                disabled={!selectedAttribute || selectOptionItems.length === 0}
                name={`optionValue-${draft.key}`}
                onChange={(nextOptionValue) =>
                  updateDraft(draft.key, {
                    optionValue: nextOptionValue ?? "",
                  })
                }
                options={selectOptionItems}
                placeholder={t("fakturownia.costs.optionPlaceholder", {
                  defaultValue: "Any option",
                })}
                value={draft.optionValue}
              />
            </Field.Root>
            <HStack justify="end">
              {drafts.length > 1 ? (
                <Button
                  aria-label={t("fakturownia.costs.removeProductLink", {
                    defaultValue: "Remove product link",
                  })}
                  colorPalette="red"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    onChange(drafts.filter((item) => item.key !== draft.key))
                  }
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                </Button>
              ) : null}
              {index === drafts.length - 1 ? (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onChange([
                      ...drafts,
                      {
                        attributeId: "",
                        key: `${Date.now()}-${drafts.length}`,
                        optionValue: "",
                        productId: "",
                      },
                    ])
                  }
                >
                  <MaterialSymbol>add</MaterialSymbol>
                  {t("fakturownia.costs.addProductLink", {
                    defaultValue: "Add product",
                  })}
                </Button>
              ) : null}
            </HStack>
          </SimpleGrid>
        );
      })}
    </VStack>
  );
}

function CompactFact({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  return (
    <Box minW="0">
      <Text color="fg.muted" fontSize="xs">
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="medium" truncate>
        {value || "-"}
      </Text>
    </Box>
  );
}

function PackagingEditor({
  pair,
  lng,
  t,
  onSave,
}: {
  pair: FakturowniaCostReviewItem;
  lng: string;
  t: ReturnType<typeof useT>["t"];
  onSave?: (formData: FormData) => void;
}) {
  const { evidence, mapping } = pair;
  const pkg = mapping.packaging;

  const deriveCostBasis = (): string => {
    if (pkg?.rollWidthMm && pkg?.rollLengthM) return "roll";
    if (pkg?.sheetsPerPack || (pkg?.sheetWidthMm && pkg?.sheetHeightMm))
      return "sheet";
    if (pkg?.purchaseUnit === "m2") return "area_m2";
    if (pkg?.purchaseUnit === "mb") return "metre";
    if (pkg?.purchaseUnit === "szt") return "piece";
    return "";
  };

  const [open, setOpen] = useState(false);
  const [costBasisState, setCostBasisState] = useState(deriveCostBasis);
  const [rollWidthMm, setRollWidthMm] = useState(
    pkg?.rollWidthMm?.toString() ?? "",
  );
  const [rollLengthMm, setRollLengthMm] = useState(
    pkg?.rollLengthM != null ? (pkg.rollLengthM * 1000).toString() : "",
  );
  const [sheetWidthMm, setSheetWidthMm] = useState(
    pkg?.sheetWidthMm?.toString() ?? "",
  );
  const [sheetHeightMm, setSheetHeightMm] = useState(
    pkg?.sheetHeightMm?.toString() ?? "",
  );
  const [sheetsPerPack, setSheetsPerPack] = useState(
    pkg?.sheetsPerPack?.toString() ?? "",
  );
  const [thicknessMicron, setThicknessMicron] = useState(
    pkg?.thicknessMicron?.toString() ?? "",
  );

  const preview = useMemo(() => {
    const unitNet =
      evidence?.unitCostNet ??
      evidence?.priceNet ??
      (evidence?.totalPriceNet != null && evidence?.quantity
        ? evidence.totalPriceNet / evidence.quantity
        : undefined);

    if (costBasisState === "roll") {
      const w = parseFloat(rollWidthMm);
      const l = parseFloat(rollLengthMm);
      if (w > 0 && l > 0) {
        const areaM2 = (w / 1000) * (l / 1000);
        const areaText = t("fakturownia.costs.packagingPreviewArea", {
          defaultValue: "Area: {{area}} m²",
          area: areaM2.toFixed(2),
        });
        if (unitNet !== undefined) {
          const perM2 = unitNet / areaM2;
          return `${areaText} → ${formatMoney(perM2, evidence?.currency, lng)} ${t("fakturownia.costs.packagingPerM2Suffix", { defaultValue: "/ m²" })}`;
        }
        return areaText;
      }
    }

    if (costBasisState === "sheet") {
      const sheets = parseFloat(sheetsPerPack);
      const sw = parseFloat(sheetWidthMm);
      const sh = parseFloat(sheetHeightMm);
      const sizePart = sw > 0 && sh > 0 ? ` (${sw}×${sh} mm)` : "";
      if (sheets > 0 && unitNet !== undefined) {
        const perSheet = unitNet / sheets;
        return `${formatMoney(perSheet, evidence?.currency, lng)} ${t("fakturownia.costs.packagingPerSheetSuffix", { defaultValue: "/ sheet" })}${sizePart}`;
      }
      if (sw > 0 && sh > 0) {
        return sizePart.trim();
      }
    }

    return null;
  }, [
    costBasisState,
    rollWidthMm,
    rollLengthMm,
    sheetWidthMm,
    sheetHeightMm,
    sheetsPerPack,
    evidence,
    lng,
    t,
  ]);

  const basisOptions = useMemo<SelectorOption[]>(
    () => [
      {
        label: t("fakturownia.costs.packagingBasisRoll", {
          defaultValue: "Roll (width × length)",
        }),
        value: "roll",
      },
      {
        label: t("fakturownia.costs.packagingBasisSheet", {
          defaultValue: "Sheet / ream",
        }),
        value: "sheet",
      },
      {
        label: t("fakturownia.costs.packagingBasisArea", {
          defaultValue: "Per m²",
        }),
        value: "area_m2",
      },
      {
        label: t("fakturownia.costs.packagingBasisMetre", {
          defaultValue: "Per running metre",
        }),
        value: "metre",
      },
      {
        label: t("fakturownia.costs.packagingBasisPiece", {
          defaultValue: "Per piece",
        }),
        value: "piece",
      },
      {
        label: t("fakturownia.costs.packagingBasisClear", {
          defaultValue: "Clear cost basis",
        }),
        value: "clear",
      },
    ],
    [t],
  );

  function handleSubmit(event: { preventDefault(): void }): void {
    event.preventDefault();
    const fd = new FormData();
    fd.append("mappingId", mapping.id);
    fd.append("lng", lng);
    fd.append("costBasis", costBasisState);
    if (costBasisState === "roll") {
      if (rollWidthMm) fd.append("rollWidthMm", rollWidthMm);
      if (rollLengthMm) fd.append("rollLengthMm", rollLengthMm);
      if (thicknessMicron) fd.append("thicknessMicron", thicknessMicron);
    } else if (costBasisState === "sheet") {
      if (sheetWidthMm) fd.append("sheetWidthMm", sheetWidthMm);
      if (sheetHeightMm) fd.append("sheetHeightMm", sheetHeightMm);
      if (sheetsPerPack) fd.append("sheetsPerPack", sheetsPerPack);
      if (thicknessMicron) fd.append("thicknessMicron", thicknessMicron);
    }
    onSave?.(fd);
    setOpen(false);
  }

  if (!onSave) return null;

  return (
    <Box mt={2}>
      <Button
        size="xs"
        variant="ghost"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
      >
        <MaterialSymbol>tune</MaterialSymbol>
        {t("fakturownia.costs.packagingEditToggle", {
          defaultValue: "Set cost basis",
        })}
      </Button>
      {open ? (
        <Box
          border="1px solid"
          borderColor="border.muted"
          borderRadius="2xl"
          mt={1}
          p={3}
        >
          <Text color="fg.muted" fontSize="xs" mb={2}>
            {t("fakturownia.costs.packagingHelp", {
              defaultValue:
                "Set how this material is priced so configurator margins are based on the product size, not the whole roll/ream.",
            })}
          </Text>
          <VStack align="stretch" gap={2}>
            <Box>
              <Text color="fg.muted" fontSize="xs" mb={1}>
                {t("fakturownia.costs.packagingBasisLabel", {
                  defaultValue: "Cost basis",
                })}
              </Text>
              <SingleSelect
                name="costBasis"
                onChange={(value) => setCostBasisState(value ?? "")}
                options={basisOptions}
                placeholder={t("fakturownia.costs.packagingBasisNone", {
                  defaultValue: "Not set",
                })}
                value={costBasisState || undefined}
              />
            </Box>
            {costBasisState === "roll" ? (
              <SimpleGrid columns={{ base: 2, md: 3 }} gap={2}>
                <Box>
                  <Text color="fg.muted" fontSize="xs" mb={1}>
                    {t("fakturownia.costs.packagingRollWidth", {
                      defaultValue: "Roll width (mm)",
                    })}
                  </Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    value={rollWidthMm}
                    onChange={(e) => setRollWidthMm(e.target.value)}
                  />
                </Box>
                <Box>
                  <Text color="fg.muted" fontSize="xs" mb={1}>
                    {t("fakturownia.costs.packagingRollLength", {
                      defaultValue: "Roll length (mm)",
                    })}
                  </Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    value={rollLengthMm}
                    onChange={(e) => setRollLengthMm(e.target.value)}
                  />
                </Box>
                <Box>
                  <Text color="fg.muted" fontSize="xs" mb={1}>
                    {t("fakturownia.costs.packagingThickness", {
                      defaultValue: "Thickness (µm, optional)",
                    })}
                  </Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    value={thicknessMicron}
                    onChange={(e) => setThicknessMicron(e.target.value)}
                  />
                </Box>
              </SimpleGrid>
            ) : null}
            {costBasisState === "sheet" ? (
              <SimpleGrid columns={{ base: 2, md: 3 }} gap={2}>
                <Box>
                  <Text color="fg.muted" fontSize="xs" mb={1}>
                    {t("fakturownia.costs.packagingSheetWidth", {
                      defaultValue: "Sheet width (mm)",
                    })}
                  </Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    value={sheetWidthMm}
                    onChange={(e) => setSheetWidthMm(e.target.value)}
                  />
                </Box>
                <Box>
                  <Text color="fg.muted" fontSize="xs" mb={1}>
                    {t("fakturownia.costs.packagingSheetHeight", {
                      defaultValue: "Sheet height (mm)",
                    })}
                  </Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    value={sheetHeightMm}
                    onChange={(e) => setSheetHeightMm(e.target.value)}
                  />
                </Box>
                <Box>
                  <Text color="fg.muted" fontSize="xs" mb={1}>
                    {t("fakturownia.costs.packagingSheetsPerPack", {
                      defaultValue: "Sheets per pack",
                    })}
                  </Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    value={sheetsPerPack}
                    onChange={(e) => setSheetsPerPack(e.target.value)}
                  />
                </Box>
                <Box>
                  <Text color="fg.muted" fontSize="xs" mb={1}>
                    {t("fakturownia.costs.packagingThickness", {
                      defaultValue: "Thickness (µm, optional)",
                    })}
                  </Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    value={thicknessMicron}
                    onChange={(e) => setThicknessMicron(e.target.value)}
                  />
                </Box>
              </SimpleGrid>
            ) : null}
            {preview ? (
              <Text color="fg.muted" fontSize="xs">
                {preview}
              </Text>
            ) : null}
            <form onSubmit={handleSubmit}>
              <Button size="xs" colorPalette="primary" type="submit">
                {t("fakturownia.costs.packagingSave", {
                  defaultValue: "Save cost basis",
                })}
              </Button>
            </form>
          </VStack>
        </Box>
      ) : null}
    </Box>
  );
}

function MappingCard({
  lng,
  onImportSupplier,
  onRejectAction,
  onReferenceAction,
  onRemoveAction,
  onSavePackagingAction,
  pair,
  selectorProducts,
  showActions,
  supplierLinked,
}: {
  lng: string;
  onImportSupplier?: (input: { evidenceId: string; mappingId: string }) => void;
  onRejectAction: (formData: FormData) => void;
  onReferenceAction?: (formData: FormData) => void;
  onRemoveAction?: (formData: FormData) => void;
  onSavePackagingAction?: (formData: FormData) => void;
  pair: FakturowniaCostReviewItem;
  selectorProducts: FakturowniaCostMappingSelectorProduct[];
  showActions: boolean;
  supplierLinked?: boolean;
}) {
  const { t } = useT(["fakturownia", "translation"]);
  const { evidence, mapping } = pair;
  const approveFormId = useId();
  const [editingApprovedLinks, setEditingApprovedLinks] = useState(false);
  const [productLinkDrafts, setProductLinkDrafts] = useState(() =>
    initialProductLinkDrafts(mapping),
  );

  const fallbackProduct = useMemo<
    FakturowniaCostMappingSelectorProduct | undefined
  >(() => {
    if (!mapping.productId) {
      return undefined;
    }
    const knownProductIds = new Set(
      selectorProducts.map((product) => product.id),
    );
    if (knownProductIds.has(mapping.productId)) {
      return undefined;
    }

    return {
      attributes: mapping.attributeId
        ? [
            {
              id: mapping.attributeId,
              name: mapping.attributeName ?? mapping.attributeId,
              options: mapping.optionValue
                ? [
                    {
                      label: mapping.optionLabel ?? mapping.optionValue,
                      value: mapping.optionValue,
                    },
                  ]
                : [],
            },
          ]
        : [],
      id: mapping.productId,
      name: mapping.productName ?? mapping.productId,
    } satisfies FakturowniaCostMappingSelectorProduct;
  }, [
    mapping.attributeId,
    mapping.attributeName,
    mapping.optionLabel,
    mapping.optionValue,
    mapping.productId,
    mapping.productName,
    selectorProducts,
  ]);
  const products = useMemo(
    () =>
      fallbackProduct
        ? [fallbackProduct, ...selectorProducts]
        : selectorProducts,
    [fallbackProduct, selectorProducts],
  );
  // Deduped union of attributes (+options) across all selectorProducts — used
  // as fallback choices when no product is selected so an admin can still pick
  // attribute+option to create a shared material-level cost mapping.
  const unionAttributes = useMemo<
    FakturowniaCostMappingSelectorAttribute[]
  >(() => {
    const attrMap = new Map<
      string,
      {
        id: string;
        name: string;
        optionMap: Map<string, FakturowniaCostMappingSelectorOption>;
      }
    >();
    for (const product of selectorProducts) {
      for (const attr of product.attributes) {
        let entry = attrMap.get(attr.id);
        if (!entry) {
          entry = { id: attr.id, name: attr.name, optionMap: new Map() };
          attrMap.set(attr.id, entry);
        }
        for (const opt of attr.options) {
          if (!entry.optionMap.has(opt.value)) {
            entry.optionMap.set(opt.value, opt);
          }
        }
      }
    }
    return Array.from(attrMap.values()).map((entry) => ({
      id: entry.id,
      name: entry.name,
      options: Array.from(entry.optionMap.values()),
    }));
  }, [selectorProducts]);

  const selectedProduct = products.find(
    (product) => product.id === productLinkDrafts[0]?.productId,
  );
  const productLinkPayloads = useMemo(
    () =>
      productLinkDrafts.flatMap((draft) => {
        const payload = productLinkPayload({
          draft,
          products,
          unionAttributes,
        });
        return payload ? [payload] : [];
      }),
    [productLinkDrafts, products, unionAttributes],
  );
  const productLinksJson = useMemo(
    () => JSON.stringify(productLinkPayloads),
    [productLinkPayloads],
  );
  const materialPayload = materialDraftPayload({
    draft: productLinkDrafts.find((draft) => !draft.productId),
    unionAttributes,
  });
  const primaryProductLink = productLinkPayloads[0];
  const linkedProductNames =
    productLinkPayloads.length > 0
      ? productLinkPayloads
          .map((link) => link.productName ?? link.productId)
          .join(", ")
      : undefined;
  const aiMatched = mapping.sourceSignals.includes("ai_high_confidence_match");
  const title = evidence?.position.name ?? evidence?.name ?? mapping.name;
  const supplier = mapping.supplierName ?? evidence?.supplier.name;
  const invoice = evidence
    ? joinParts([
        evidence.invoice.number ?? evidence.invoice.id,
        evidence.invoice.issueDate,
      ])
    : undefined;
  const itemMeta = joinParts([supplier, invoice, evidence?.position.code]);
  const supplierAlreadyLinked =
    Boolean(mapping.supplierId) || Boolean(supplierLinked);
  const canImportSupplier = Boolean(
    onImportSupplier && evidence?.id && supplier,
  );

  useEffect(() => {
    setProductLinkDrafts(initialProductLinkDrafts(mapping));
    setEditingApprovedLinks(false);
  }, [mapping]);

  return (
    <Card.Root variant="outline">
      <Card.Body p={3}>
        <VStack align="stretch" gap={3}>
          <Flex gap={3} justify="space-between" wrap="wrap">
            <Box flex="1" minW="0">
              <HStack gap={2} wrap="wrap">
                <Text fontSize="sm" fontWeight="semibold" minW="0" truncate>
                  {title}
                </Text>
                <Badge
                  colorPalette={
                    productLinkPayloads.length > 0 ? "success" : "orange"
                  }
                  size="sm"
                  variant="surface"
                >
                  {productLinkPayloads.length > 1
                    ? t("fakturownia.costs.productLinkCount", {
                        count: productLinkPayloads.length,
                        defaultValue: "{{count}} products",
                      })
                    : (linkedProductNames ??
                      selectedProduct?.name ??
                      mapping.productName ??
                      t("fakturownia.costs.noProductCandidate", {
                        defaultValue: "No product candidate",
                      }))}
                </Badge>
                {aiMatched ? (
                  <Badge colorPalette="blue" size="sm" variant="surface">
                    {t("fakturownia.costs.aiMatched", {
                      defaultValue: "AI matched",
                    })}
                  </Badge>
                ) : null}
                {evidence?.invoiceKind === "correction" ? (
                  <Badge colorPalette="orange" size="sm" variant="surface">
                    {t("fakturownia.costs.correction", {
                      defaultValue: "Correction",
                    })}
                  </Badge>
                ) : null}
                {mapping.reference ? (
                  <Badge colorPalette="gray" size="sm" variant="surface">
                    <MaterialSymbol>bookmark</MaterialSymbol>
                    {t("fakturownia.costs.referenceBadge", {
                      defaultValue: "Reference",
                    })}
                  </Badge>
                ) : null}
                <Badge size="sm" variant="surface">
                  {Math.round(mapping.confidence * 100)}%
                </Badge>
              </HStack>
              <Text color="fg.muted" fontSize="xs" mt={1} truncate>
                {itemMeta || "-"}
              </Text>
              {supplier && (supplierAlreadyLinked || canImportSupplier) ? (
                <HStack gap={2} mt={1}>
                  {supplierAlreadyLinked ? (
                    <Badge colorPalette="green" size="sm" variant="subtle">
                      <MaterialSymbol>storefront</MaterialSymbol>
                      {t("fakturownia.costs.supplierLinked", {
                        defaultValue: "Supplier in system",
                      })}
                    </Badge>
                  ) : onImportSupplier && evidence?.id ? (
                    <Button
                      colorPalette="primary"
                      size="xs"
                      type="button"
                      variant="outline"
                      onClick={() =>
                        onImportSupplier({
                          evidenceId: evidence.id,
                          mappingId: mapping.id,
                        })
                      }
                    >
                      <MaterialSymbol>add_business</MaterialSymbol>
                      {t("fakturownia.costs.importSupplier", {
                        defaultValue: "Import supplier",
                      })}
                    </Button>
                  ) : null}
                </HStack>
              ) : null}
              {mapping.reasoning ? (
                <Text color="fg.muted" fontSize="xs" fontStyle="italic" mt={1}>
                  {t("fakturownia.costs.aiReasoning", {
                    defaultValue: "AI reasoning",
                  })}
                  : {mapping.reasoning}
                </Text>
              ) : null}
              {(() => {
                const packagingDesc = describeCostPackaging(
                  mapping.packaging,
                  undefined,
                  t,
                );
                return packagingDesc ? (
                  <Text color="fg.muted" fontSize="xs" mt={1}>
                    {t("fakturownia.costs.packagingLabel", {
                      defaultValue: "Packaging",
                    })}
                    {": "}
                    {packagingDesc}
                  </Text>
                ) : null;
              })()}
            </Box>
            <Box flexShrink={0} textAlign="right">
              <Text fontSize="sm" fontWeight="semibold" whiteSpace="nowrap">
                {costBasis(
                  pair,
                  lng,
                  t("fakturownia.costs.net", { defaultValue: "net" }),
                )}
              </Text>
              {evidence?.totalPriceNet !== undefined ? (
                <Text color="fg.muted" fontSize="xs" whiteSpace="nowrap">
                  {formatMoney(evidence.totalPriceNet, evidence.currency, lng)}{" "}
                  {t("fakturownia.costs.total", { defaultValue: "total" })}
                </Text>
              ) : null}
            </Box>
          </Flex>

          <PackagingEditor
            pair={pair}
            lng={lng}
            t={t}
            onSave={onSavePackagingAction}
          />

          {showActions ? (
            <>
              <form
                id={approveFormId}
                action={approveFakturowniaCostMappingAction}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="mappingId"
                value={mapping.id}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="lng"
                value={lng}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="productId"
                value={primaryProductLink?.productId ?? ""}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="productName"
                value={primaryProductLink?.productName ?? ""}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="productLinks"
                value={productLinksJson}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="attributeName"
                value={materialPayload.attributeName ?? ""}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="optionLabel"
                value={materialPayload.optionLabel ?? ""}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="attributeId"
                value={materialPayload.attributeId ?? ""}
              />
              <input
                form={approveFormId}
                type="hidden"
                name="optionValue"
                value={materialPayload.optionValue ?? ""}
              />
              <VStack align="stretch" gap={2}>
                <ProductLinksEditor
                  drafts={productLinkDrafts}
                  emptyText={t("fakturownia.costs.noProducts", {
                    defaultValue: "No products found",
                  })}
                  onChange={setProductLinkDrafts}
                  productPlaceholder={t(
                    "fakturownia.costs.productPlaceholder",
                    {
                      defaultValue: "Select product",
                    },
                  )}
                  products={products}
                  t={t}
                  unionAttributes={unionAttributes}
                />
                <HStack justify="end" gap={1} wrap="wrap">
                  {productLinkPayloads.length === 0 &&
                  materialPayload.attributeId &&
                  materialPayload.optionValue ? (
                    <Text color="fg.muted" fontSize="xs" textAlign="right">
                      {t("fakturownia.costs.materialApproveHint", {
                        defaultValue:
                          "Approving without a product creates a shared material cost.",
                      })}
                    </Text>
                  ) : null}
                  <Button
                    colorPalette="success"
                    disabled={
                      productLinkPayloads.length === 0 &&
                      !(
                        materialPayload.attributeId &&
                        materialPayload.optionValue
                      )
                    }
                    form={approveFormId}
                    size="sm"
                    type="submit"
                  >
                    <MaterialSymbol>check</MaterialSymbol>
                    {t("fakturownia.costs.approve", {
                      defaultValue: "Approve",
                    })}
                  </Button>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      onRejectAction(new FormData(event.currentTarget));
                    }}
                  >
                    <input type="hidden" name="mappingId" value={mapping.id} />
                    <input type="hidden" name="lng" value={lng} />
                    <Button
                      colorPalette="red"
                      size="sm"
                      type="submit"
                      variant="ghost"
                    >
                      <MaterialSymbol>block</MaterialSymbol>
                      {t("fakturownia.costs.reject", {
                        defaultValue: "Reject",
                      })}
                    </Button>
                  </form>
                  {onReferenceAction ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        onReferenceAction(new FormData(event.currentTarget));
                      }}
                    >
                      <input
                        type="hidden"
                        name="mappingId"
                        value={mapping.id}
                      />
                      <input type="hidden" name="lng" value={lng} />
                      <Button
                        colorPalette="gray"
                        size="sm"
                        type="submit"
                        variant="outline"
                      >
                        <MaterialSymbol>bookmark_add</MaterialSymbol>
                        {t("fakturownia.costs.saveAsReference", {
                          defaultValue: "Save as reference",
                        })}
                      </Button>
                    </form>
                  ) : null}
                </HStack>
              </VStack>
            </>
          ) : (
            <VStack align="stretch" gap={2}>
              {editingApprovedLinks ? (
                <>
                  <form
                    id={approveFormId}
                    action={approveFakturowniaCostMappingAction}
                    onSubmit={() => setEditingApprovedLinks(false)}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="mappingId"
                    value={mapping.id}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="lng"
                    value={lng}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="productId"
                    value={primaryProductLink?.productId ?? ""}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="productName"
                    value={primaryProductLink?.productName ?? ""}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="productLinks"
                    value={productLinksJson}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="attributeId"
                    value={materialPayload.attributeId ?? ""}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="attributeName"
                    value={materialPayload.attributeName ?? ""}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="optionValue"
                    value={materialPayload.optionValue ?? ""}
                  />
                  <input
                    form={approveFormId}
                    type="hidden"
                    name="optionLabel"
                    value={materialPayload.optionLabel ?? ""}
                  />
                  <ProductLinksEditor
                    drafts={productLinkDrafts}
                    emptyText={t("fakturownia.costs.noProducts", {
                      defaultValue: "No products found",
                    })}
                    onChange={setProductLinkDrafts}
                    productPlaceholder={t(
                      "fakturownia.costs.productPlaceholder",
                      {
                        defaultValue: "Select product",
                      },
                    )}
                    products={products}
                    t={t}
                    unionAttributes={unionAttributes}
                  />
                  <HStack justify="end">
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setProductLinkDrafts(initialProductLinkDrafts(mapping));
                        setEditingApprovedLinks(false);
                      }}
                    >
                      {t("fakturownia.costs.cancelEdit", {
                        defaultValue: "Cancel",
                      })}
                    </Button>
                    <Button
                      colorPalette="success"
                      disabled={
                        productLinkPayloads.length === 0 &&
                        !(
                          materialPayload.attributeId &&
                          materialPayload.optionValue
                        )
                      }
                      form={approveFormId}
                      size="sm"
                      type="submit"
                    >
                      <MaterialSymbol>save</MaterialSymbol>
                      {t("fakturownia.costs.saveChanges", {
                        defaultValue: "Save changes",
                      })}
                    </Button>
                  </HStack>
                </>
              ) : (
                <>
                  <SimpleGrid columns={{ base: 1, md: 4 }} gap={2}>
                    <CompactFact
                      label={t("fakturownia.costs.product", {
                        defaultValue: "Product",
                      })}
                      value={linkedProductNames ?? mapping.productName}
                    />
                    <CompactFact
                      label={t("fakturownia.costs.attribute", {
                        defaultValue: "Attribute",
                      })}
                      value={
                        primaryProductLink?.attributeName ??
                        mapping.attributeName
                      }
                    />
                    <CompactFact
                      label={t("fakturownia.costs.option", {
                        defaultValue: "Option",
                      })}
                      value={
                        primaryProductLink?.optionLabel ?? mapping.optionValue
                      }
                    />
                    <CompactFact
                      label={t("fakturownia.costs.sourceSignals", {
                        defaultValue: "Source signals",
                      })}
                      value={mapping.sourceSignals.join(", ")}
                    />
                  </SimpleGrid>
                  {!mapping.reference ? (
                    <HStack justify="end">
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => setEditingApprovedLinks(true)}
                      >
                        <MaterialSymbol>edit</MaterialSymbol>
                        {t("fakturownia.costs.editMapping", {
                          defaultValue: "Edit",
                        })}
                      </Button>
                    </HStack>
                  ) : null}
                </>
              )}
              {onRemoveAction ? (
                <HStack justify="end">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      if (
                        !window.confirm(
                          mapping.reference
                            ? t("fakturownia.costs.referenceRemoveConfirm", {
                                defaultValue:
                                  "Remove this reference cost? It will return to Pending review.",
                              })
                            : t("fakturownia.costs.removeConfirm", {
                                defaultValue:
                                  "Remove this confirmed cost? It will leave the product cost rollup and return to Pending review for re-approval.",
                              }),
                        )
                      ) {
                        return;
                      }
                      onRemoveAction(new FormData(form));
                    }}
                  >
                    <input type="hidden" name="mappingId" value={mapping.id} />
                    <input type="hidden" name="lng" value={lng} />
                    <Button
                      colorPalette="red"
                      size="sm"
                      type="submit"
                      variant="ghost"
                    >
                      <MaterialSymbol>delete</MaterialSymbol>
                      {t("fakturownia.costs.remove", {
                        defaultValue: "Remove",
                      })}
                    </Button>
                  </form>
                </HStack>
              ) : null}
            </VStack>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

interface SyncResultSummary {
  effectiveDateFrom?: string;
  evidenceCreatedOrUpdated: number;
  incremental: boolean;
  invoicesScanned: number;
  pendingMappingsCreated: number;
  positionsScanned: number;
  truncated: boolean;
}

const BULK_APPROVE_SIGNALS = new Set([
  "ai_high_confidence_match",
  "learned_from_approval",
]);

function isBulkApproveEligible(pair: FakturowniaCostReviewItem): boolean {
  const hasSignal = pair.mapping.sourceSignals.some((signal) =>
    BULK_APPROVE_SIGNALS.has(signal),
  );
  if (!hasSignal) {
    return false;
  }
  // Product-level mapping: must have a productId.
  if (pair.mapping.productId) {
    return true;
  }
  // Material-level mapping: no productId, but attribute+option present.
  return Boolean(pair.mapping.attributeId) && Boolean(pair.mapping.optionValue);
}

function formatSyncTimestamp(iso: string, lng: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(lng, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function SyncSubmitButton({ label }: { label: string }) {
  const { pending: submitting } = useFormStatus();
  return (
    <Button
      colorPalette="primary"
      disabled={submitting}
      loading={submitting}
      size="sm"
      type="submit"
    >
      <MaterialSymbol>sync</MaterialSymbol>
      {label}
    </Button>
  );
}

function ManualCostSubmitButton({ label }: { label: string }) {
  const { pending: submitting } = useFormStatus();
  return (
    <Button
      colorPalette="primary"
      disabled={submitting}
      loading={submitting}
      size="sm"
      type="submit"
    >
      <MaterialSymbol>add</MaterialSymbol>
      {label}
    </Button>
  );
}

function ManualCostForm({
  lng,
  selectorProducts,
  t,
}: {
  lng: string;
  selectorProducts: FakturowniaCostMappingSelectorProduct[];
  t: ReturnType<typeof useT>["t"];
}) {
  const formId = useId();
  const [state, action] = useActionState<CreateManualCostActionState, FormData>(
    createManualFakturowniaCostAction,
    { ok: true },
  );
  const [productLinkDrafts, setProductLinkDrafts] = useState<
    ProductLinkDraft[]
  >([
    {
      attributeId: "",
      key: "manual-product-0",
      optionValue: "",
      productId: "",
    },
  ]);
  const [unit, setUnit] = useState("sheet");

  const unionAttributes = useMemo<
    FakturowniaCostMappingSelectorAttribute[]
  >(() => {
    const attrMap = new Map<
      string,
      {
        id: string;
        name: string;
        optionMap: Map<string, FakturowniaCostMappingSelectorOption>;
      }
    >();
    for (const product of selectorProducts) {
      for (const attr of product.attributes) {
        let entry = attrMap.get(attr.id);
        if (!entry) {
          entry = { id: attr.id, name: attr.name, optionMap: new Map() };
          attrMap.set(attr.id, entry);
        }
        for (const opt of attr.options) {
          if (!entry.optionMap.has(opt.value)) {
            entry.optionMap.set(opt.value, opt);
          }
        }
      }
    }
    return Array.from(attrMap.values()).map((entry) => ({
      id: entry.id,
      name: entry.name,
      options: Array.from(entry.optionMap.values()),
    }));
  }, [selectorProducts]);

  const productLinkPayloads = useMemo(
    () =>
      productLinkDrafts.flatMap((draft) => {
        const payload = productLinkPayload({
          draft,
          products: selectorProducts,
          unionAttributes,
        });
        return payload ? [payload] : [];
      }),
    [productLinkDrafts, selectorProducts, unionAttributes],
  );
  const productLinksJson = useMemo(
    () => JSON.stringify(productLinkPayloads),
    [productLinkPayloads],
  );
  const materialPayload = materialDraftPayload({
    draft: productLinkDrafts.find((draft) => !draft.productId),
    unionAttributes,
  });
  const primaryProductLink = productLinkPayloads[0];
  const unitOptions = useMemo<SelectorOption[]>(
    () => [
      {
        label: t("fakturownia.costs.manualUnitSheet", {
          defaultValue: "Per sheet",
        }),
        value: "sheet",
      },
      {
        label: t("fakturownia.costs.manualUnitPiece", {
          defaultValue: "Per piece",
        }),
        value: "piece",
      },
      {
        label: t("fakturownia.costs.manualUnitArea", {
          defaultValue: "Per m²",
        }),
        value: "area_m2",
      },
      {
        label: t("fakturownia.costs.manualUnitMetre", {
          defaultValue: "Per running metre",
        }),
        value: "metre",
      },
    ],
    [t],
  );

  return (
    <Card.Root variant="outline">
      <Card.Body p={3}>
        <form id={formId} action={action}>
          <input type="hidden" name="lng" value={lng} />
          <input
            type="hidden"
            name="productId"
            value={primaryProductLink?.productId ?? ""}
          />
          <input
            type="hidden"
            name="productName"
            value={primaryProductLink?.productName ?? ""}
          />
          <input type="hidden" name="productLinks" value={productLinksJson} />
          <input
            type="hidden"
            name="attributeName"
            value={materialPayload.attributeName ?? ""}
          />
          <input
            type="hidden"
            name="optionLabel"
            value={materialPayload.optionLabel ?? ""}
          />
          <input
            type="hidden"
            name="attributeId"
            value={materialPayload.attributeId ?? ""}
          />
          <input
            type="hidden"
            name="optionValue"
            value={materialPayload.optionValue ?? ""}
          />
          <VStack align="stretch" gap={3}>
            <SimpleGrid columns={{ base: 1, md: 4 }} gap={2}>
              <Field.Root required>
                <Field.Label fontSize="xs">
                  {t("fakturownia.costs.manualName", {
                    defaultValue: "Cost name",
                  })}
                </Field.Label>
                <Input
                  name="name"
                  placeholder={t("fakturownia.costs.manualNamePlaceholder", {
                    defaultValue: "Paper 320×450",
                  })}
                  size="sm"
                />
              </Field.Root>
              <Field.Root>
                <Field.Label fontSize="xs">
                  {t("fakturownia.costs.manualSupplier", {
                    defaultValue: "Supplier",
                  })}
                </Field.Label>
                <Input name="supplierName" size="sm" />
              </Field.Root>
              <Field.Root required>
                <Field.Label fontSize="xs">
                  {t("fakturownia.costs.manualUnitCostNet", {
                    defaultValue: "Net unit cost",
                  })}
                </Field.Label>
                <Input
                  min={0}
                  name="unitCostNet"
                  size="sm"
                  step="0.01"
                  type="number"
                />
              </Field.Root>
              <Field.Root required>
                <Field.Label fontSize="xs">
                  {t("fakturownia.costs.manualUnit", {
                    defaultValue: "Cost unit",
                  })}
                </Field.Label>
                <SingleSelect
                  formId={formId}
                  name="unit"
                  onChange={(nextUnit) => setUnit(nextUnit ?? "sheet")}
                  options={unitOptions}
                  placeholder={t("fakturownia.costs.manualUnitPlaceholder", {
                    defaultValue: "Choose unit",
                  })}
                  value={unit}
                />
              </Field.Root>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 4 }} gap={2}>
              <Field.Root>
                <Field.Label fontSize="xs">
                  {t("fakturownia.costs.manualIssueDate", {
                    defaultValue: "Cost date",
                  })}
                </Field.Label>
                <Input name="issueDate" size="sm" type="date" />
              </Field.Root>
            </SimpleGrid>

            <ProductLinksEditor
              drafts={productLinkDrafts}
              emptyText={t("fakturownia.costs.noProducts", {
                defaultValue: "No products found",
              })}
              onChange={setProductLinkDrafts}
              productPlaceholder={t("fakturownia.costs.productPlaceholder", {
                defaultValue: "Select product",
              })}
              products={selectorProducts}
              t={t}
              unionAttributes={unionAttributes}
            />

            {unit === "sheet" ? (
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={2}>
                <Field.Root>
                  <Field.Label fontSize="xs">
                    {t("fakturownia.costs.packagingSheetWidth", {
                      defaultValue: "Sheet width (mm)",
                    })}
                  </Field.Label>
                  <Input min={0} name="sheetWidthMm" size="sm" type="number" />
                </Field.Root>
                <Field.Root>
                  <Field.Label fontSize="xs">
                    {t("fakturownia.costs.packagingSheetHeight", {
                      defaultValue: "Sheet height (mm)",
                    })}
                  </Field.Label>
                  <Input min={0} name="sheetHeightMm" size="sm" type="number" />
                </Field.Root>
                <Field.Root>
                  <Field.Label fontSize="xs">
                    {t("fakturownia.costs.packagingThickness", {
                      defaultValue: "Thickness (µm, optional)",
                    })}
                  </Field.Label>
                  <Input
                    min={0}
                    name="thicknessMicron"
                    size="sm"
                    type="number"
                  />
                </Field.Root>
              </SimpleGrid>
            ) : null}

            {productLinkPayloads.length === 0 &&
            materialPayload.attributeId &&
            materialPayload.optionValue ? (
              <Text color="fg.muted" fontSize="xs">
                {t("fakturownia.costs.materialApproveHint", {
                  defaultValue:
                    "Approving without a product creates a shared material cost.",
                })}
              </Text>
            ) : null}

            {state.ok && state.mappingId ? (
              <Text color="green.fg" fontSize="sm">
                {t("fakturownia.costs.manualCreated", {
                  defaultValue: "Manual cost was added.",
                })}
              </Text>
            ) : null}
            {!state.ok && state.error ? (
              <Text color="red.fg" fontSize="sm">
                {state.error}
              </Text>
            ) : null}

            <HStack justify="end">
              <ManualCostSubmitButton
                label={t("fakturownia.costs.manualCreate", {
                  defaultValue: "Add manual cost",
                })}
              />
            </HStack>
          </VStack>
        </form>
      </Card.Body>
    </Card.Root>
  );
}

interface SyncProgress {
  currentInvoiceNumber?: string;
  effectiveDateFrom?: string;
  elapsedMs?: number;
  error?: string;
  evidenceCreatedOrUpdated: number;
  incremental: boolean;
  invoicesScanned: number;
  page: number;
  pendingMappingsCreated: number;
  phase: string;
  positionsScanned: number;
  startedAt?: string;
  status: "running" | "completed" | "failed";
  truncated?: boolean;
  updatedAt?: string;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// Polls the server-side progress doc while a sync is running. A blocking server
// action can't stream, so the page reflects live progress out-of-band here.
function SyncProgressPanel({
  active,
  t,
}: {
  active: boolean;
  t: ReturnType<typeof useT>["t"];
}) {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    setProgress(null);
    setElapsedMs(0);
    const startedAt = Date.now();
    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const response = await fetch("/api/fakturownia/cost-sync/progress", {
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as {
          progress?: SyncProgress | null;
        };
        // Ignore a stale completed/failed doc from a prior run; only surface
        // progress once the current run has started writing "running".
        if (!cancelled && data.progress?.status === "running") {
          setProgress(data.progress);
        }
      } catch {
        // Transient network errors are fine — the next tick retries.
      }
    };

    void poll();
    const pollId = setInterval(poll, 1200);
    const tickId = setInterval(() => {
      if (!cancelled) {
        setElapsedMs(Date.now() - startedAt);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [active]);

  if (!active) {
    return null;
  }

  const counters = [
    {
      label: t("fakturownia.costs.progressInvoices", {
        defaultValue: "Invoices",
      }),
      value: progress?.invoicesScanned ?? 0,
    },
    {
      label: t("fakturownia.costs.progressPositions", {
        defaultValue: "Positions",
      }),
      value: progress?.positionsScanned ?? 0,
    },
    {
      label: t("fakturownia.costs.progressEvidence", {
        defaultValue: "Evidence",
      }),
      value: progress?.evidenceCreatedOrUpdated ?? 0,
    },
    {
      label: t("fakturownia.costs.progressPending", {
        defaultValue: "Pending",
      }),
      value: progress?.pendingMappingsCreated ?? 0,
    },
  ];

  return (
    <Card.Root colorPalette="primary" variant="subtle">
      <Card.Body p={3}>
        <VStack align="stretch" gap={2}>
          <HStack gap={2}>
            <Spinner colorPalette="primary" size="sm" />
            <Text fontSize="sm" fontWeight="medium">
              {progress && progress.page > 0
                ? t("fakturownia.costs.progressScanning", {
                    defaultValue: "Scanning page {{page}}…",
                    page: progress.page,
                  })
                : t("fakturownia.costs.progressStarting", {
                    defaultValue: "Starting sync…",
                  })}
            </Text>
            <Text color="fg.muted" fontSize="xs" ml="auto">
              {formatElapsed(elapsedMs)}
            </Text>
          </HStack>
          {progress?.currentInvoiceNumber ? (
            <Text color="fg.muted" fontSize="xs" truncate>
              {t("fakturownia.costs.progressCurrentInvoice", {
                defaultValue: "Current invoice: {{number}}",
                number: progress.currentInvoiceNumber,
              })}
            </Text>
          ) : null}
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={2}>
            {counters.map((counter) => (
              <Box key={counter.label}>
                <Text color="fg.muted" fontSize="xs">
                  {counter.label}
                </Text>
                <Text fontSize="sm" fontWeight="semibold">
                  {counter.value}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export default function FakturowniaCostsPage({
  approved,
  hasFakturowniaIntegration,
  lastSyncResult,
  lastSyncedAt,
  pending,
  selectorProducts,
}: {
  approved: FakturowniaCostReviewItem[];
  hasFakturowniaIntegration: boolean;
  lastSyncResult?: SyncResultSummary;
  lastSyncedAt?: string;
  pending: FakturowniaCostReviewItem[];
  selectorProducts: FakturowniaCostMappingSelectorProduct[];
}) {
  // Deduped union of attributes across all selectorProducts — passed to the
  // MaterialGroupsManager so attribute names are displayed without a product
  // context.
  const allAttributes = useMemo<{ id: string; name: string }[]>(() => {
    const seen = new Map<string, string>();
    for (const product of selectorProducts) {
      for (const attr of product.attributes) {
        if (!seen.has(attr.id)) {
          seen.set(attr.id, attr.name);
        }
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [selectorProducts]);
  const { t, i18n } = useT(["fakturownia", "translation"]);
  const lng = i18n.resolvedLanguage ?? "pl";
  const [syncState, syncAction, syncing] = useActionState<
    SyncFakturowniaCostInvoicesActionState,
    FormData
  >(syncFakturowniaCostInvoicesAction, { ok: true });
  const [optimisticRejectedIds, setOptimisticRejectedIds] = useState<string[]>(
    [],
  );
  const [optimisticReferencedIds, setOptimisticReferencedIds] = useState<
    string[]
  >([]);
  const [optimisticRemovedApprovedIds, setOptimisticRemovedApprovedIds] =
    useState<string[]>([]);
  const [optimisticLinkedSupplierIds, setOptimisticLinkedSupplierIds] =
    useState<string[]>([]);
  const [supplierDrawer, setSupplierDrawer] = useState<{
    open: boolean;
    prefill?: {
      name?: string;
      companyName?: string;
      nip?: string;
      email?: string;
      phone?: string;
      currency?: string;
      addresses?: Address[];
    };
    mappingId?: string;
    draftNip?: string;
    draftName?: string;
  }>({ open: false });
  const optimisticPending = useMemo(
    () =>
      pending
        .filter(
          (pair) =>
            !optimisticRejectedIds.includes(pair.mapping.id) &&
            !optimisticReferencedIds.includes(pair.mapping.id),
        )
        // Highest-confidence suggestions first so the easiest approvals are
        // surfaced at the top; the stable sort preserves the server ordering
        // for ties.
        .slice()
        .sort((a, b) => b.mapping.confidence - a.mapping.confidence),
    [optimisticRejectedIds, optimisticReferencedIds, pending],
  );
  const optimisticApproved = useMemo(
    () =>
      approved.filter(
        (pair) => !optimisticRemovedApprovedIds.includes(pair.mapping.id),
      ),
    [approved, optimisticRemovedApprovedIds],
  );
  const connectedApproved = useMemo(
    () => optimisticApproved.filter((pair) => !pair.mapping.reference),
    [optimisticApproved],
  );
  const referenceApproved = useMemo(
    () => optimisticApproved.filter((pair) => pair.mapping.reference === true),
    [optimisticApproved],
  );
  const eligibleMappingIds = useMemo(
    () =>
      optimisticPending
        .filter(isBulkApproveEligible)
        .map((pair) => pair.mapping.id),
    [optimisticPending],
  );
  const syncResult = syncState.result ?? lastSyncResult;

  useEffect(() => {
    setOptimisticRejectedIds((currentIds) => {
      const nextIds = currentIds.filter((mappingId) =>
        pending.some((pair) => pair.mapping.id === mappingId),
      );

      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [pending]);

  // Drop optimistic reference ids once the server revalidation reflects them —
  // the mapping leaves the pending list (it appears in approved with reference:true).
  useEffect(() => {
    setOptimisticReferencedIds((currentIds) => {
      const nextIds = currentIds.filter((mappingId) =>
        pending.some((pair) => pair.mapping.id === mappingId),
      );

      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [pending]);

  // Drop optimistic removals once the server revalidation reflects them — i.e.
  // the mapping has left the approved list (it reappears under pending).
  useEffect(() => {
    setOptimisticRemovedApprovedIds((currentIds) => {
      const nextIds = currentIds.filter((mappingId) =>
        approved.some((pair) => pair.mapping.id === mappingId),
      );

      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [approved]);

  // Drop optimistic supplier links once the server has stamped supplierId on
  // the mapping (or the mapping is gone).
  useEffect(() => {
    setOptimisticLinkedSupplierIds((currentIds) => {
      if (currentIds.length === 0) {
        return currentIds;
      }
      const unlinkedIds = new Set<string>();
      for (const pair of [...pending, ...approved]) {
        if (!pair.mapping.supplierId) {
          unlinkedIds.add(pair.mapping.id);
        }
      }
      const nextIds = currentIds.filter((mappingId) =>
        unlinkedIds.has(mappingId),
      );
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [approved, pending]);

  function rejectMappingAction(formData: FormData): void {
    const mappingId = formData.get("mappingId");
    if (typeof mappingId !== "string" || !mappingId.trim()) {
      return;
    }

    setOptimisticRejectedIds((currentIds) =>
      currentIds.includes(mappingId) ? currentIds : [...currentIds, mappingId],
    );

    void rejectFakturowniaCostMappingAction(formData).catch(
      (error: unknown) => {
        console.error(
          "[FakturowniaCostsPage] Failed to reject cost mapping:",
          error,
        );
        setOptimisticRejectedIds((currentIds) =>
          currentIds.filter((currentId) => currentId !== mappingId),
        );
      },
    );
  }

  function saveAsReferenceMappingAction(formData: FormData): void {
    const mappingId = formData.get("mappingId");
    if (typeof mappingId !== "string" || !mappingId.trim()) {
      return;
    }

    setOptimisticReferencedIds((currentIds) =>
      currentIds.includes(mappingId) ? currentIds : [...currentIds, mappingId],
    );

    void saveCostAsReferenceFromCostMappingAction(formData).catch(
      (error: unknown) => {
        console.error(
          "[FakturowniaCostsPage] Failed to save cost as reference:",
          error,
        );
        setOptimisticReferencedIds((currentIds) =>
          currentIds.filter((currentId) => currentId !== mappingId),
        );
      },
    );
  }

  function removeApprovedMappingAction(formData: FormData): void {
    const mappingId = formData.get("mappingId");
    if (typeof mappingId !== "string" || !mappingId.trim()) {
      return;
    }

    setOptimisticRemovedApprovedIds((currentIds) =>
      currentIds.includes(mappingId) ? currentIds : [...currentIds, mappingId],
    );

    void removeApprovedFakturowniaCostMappingAction(formData).catch(
      (error: unknown) => {
        console.error(
          "[FakturowniaCostsPage] Failed to remove approved cost mapping:",
          error,
        );
        setOptimisticRemovedApprovedIds((currentIds) =>
          currentIds.filter((currentId) => currentId !== mappingId),
        );
      },
    );
  }

  function savePackagingAction(formData: FormData): void {
    void saveFakturowniaCostMappingPackagingAction(formData).catch(
      (error: unknown) => {
        console.error(
          "[FakturowniaCostsPage] Failed to save cost mapping packaging:",
          error,
        );
        toaster.error({
          title: t("errors.somethingWentWrong"),
          duration: 4000,
        });
      },
    );
  }

  function handleImportSupplier(input: {
    evidenceId: string;
    mappingId: string;
  }): void {
    void getCostInvoiceSupplierDraftAction({ evidenceId: input.evidenceId })
      .then((state) => {
        if (!state.ok) {
          toaster.error({
            title: t("errors.somethingWentWrong"),
            description: state.error,
            duration: 4000,
          });
          return;
        }
        if (state.alreadyExists) {
          // Supplier already in the system — link directly without opening the form.
          setOptimisticLinkedSupplierIds((currentIds) =>
            currentIds.includes(input.mappingId)
              ? currentIds
              : [...currentIds, input.mappingId],
          );
          void linkCostMappingSupplierAction({
            mappingId: input.mappingId,
            name: state.alreadyExists!.name,
            lng,
          })
            .then((linkState) => {
              if (!linkState.ok) {
                console.error(
                  "[FakturowniaCostsPage] Failed to link existing supplier:",
                  linkState.error,
                );
                setOptimisticLinkedSupplierIds((currentIds) =>
                  currentIds.filter((id) => id !== input.mappingId),
                );
              } else {
                toaster.success({
                  title: t("fakturownia.costs.supplierLinkedExisting", {
                    defaultValue: "Linked existing supplier {{name}}",
                    name: linkState.supplierName ?? state.alreadyExists!.name,
                  }),
                  duration: 3000,
                });
              }
            })
            .catch((error: unknown) => {
              console.error(
                "[FakturowniaCostsPage] Failed to link existing supplier:",
                error,
              );
              setOptimisticLinkedSupplierIds((currentIds) =>
                currentIds.filter((id) => id !== input.mappingId),
              );
            });
          return;
        }
        // No existing supplier — open the drawer prefilled with invoice data.
        setSupplierDrawer({
          open: true,
          prefill: state.draft
            ? {
                ...(state.draft.name ? { name: state.draft.name } : {}),
                ...(state.draft.companyName
                  ? { companyName: state.draft.companyName }
                  : {}),
                ...(state.draft.nip ? { nip: state.draft.nip } : {}),
                ...(state.draft.email ? { email: state.draft.email } : {}),
                ...(state.draft.phone ? { phone: state.draft.phone } : {}),
                ...(state.draft.currency
                  ? { currency: state.draft.currency }
                  : {}),
                ...(state.draft.addresses?.length
                  ? { addresses: state.draft.addresses }
                  : {}),
              }
            : undefined,
          mappingId: input.mappingId,
          draftName: state.draft?.name,
          draftNip: state.draft?.nip,
        });
      })
      .catch((error: unknown) => {
        console.error(
          "[FakturowniaCostsPage] Failed to fetch supplier draft:",
          error,
        );
        toaster.error({
          title: t("errors.somethingWentWrong"),
          description:
            error instanceof Error ? error.message : "Failed to load supplier.",
          duration: 4000,
        });
      });
  }

  return (
    <Box>
      <CustomHeading
        heading={t("fakturownia.costs.title", {
          defaultValue: "Cost intelligence",
        })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />

      <VStack align="stretch" gap={2}>
        <Flex flexDir={["column", "row"]} gap={2}>
          {hasFakturowniaIntegration ? (
            <form action={syncAction}>
              <input type="hidden" name="lng" value={lng} />
              <HStack gap={2} align="end" wrap="wrap">
                <Field.Root maxW="44">
                  <Field.Label fontSize="xs">
                    {t("fakturownia.costs.dateFrom", {
                      defaultValue: "Date from",
                    })}
                  </Field.Label>
                  <Input size="sm" type="date" name="dateFrom" />
                </Field.Root>
                <Field.Root maxW="44">
                  <Field.Label fontSize="xs">
                    {t("fakturownia.costs.dateTo", {
                      defaultValue: "Date to",
                    })}
                  </Field.Label>
                  <Input size="sm" type="date" name="dateTo" />
                </Field.Root>
                <SyncSubmitButton
                  label={t("fakturownia.costs.sync", { defaultValue: "Sync" })}
                />
                <ButtonLink
                  lng={lng}
                  href="/fakturownia"
                  ariaLabel={t("fakturownia.costs.backToFakturownia", {
                    defaultValue: "Back to Fakturownia",
                  })}
                  variant="outline"
                  justifySelf="end"
                  size="sm"
                >
                  <MaterialSymbol>receipt_long</MaterialSymbol>
                  {t("fakturownia.costs.backToFakturownia", {
                    defaultValue: "Back to Fakturownia",
                  })}
                </ButtonLink>
              </HStack>
            </form>
          ) : (
            <Text color="fg.muted" fontSize="sm">
              {t("fakturownia.costs.manualOnlyNoIntegration", {
                defaultValue:
                  "Fakturownia is not connected. You can still add manual costs; invoice sync is unavailable.",
              })}
            </Text>
          )}
        </Flex>

        <SyncProgressPanel active={syncing} t={t} />

        {lastSyncedAt ? (
          <Text color="fg.muted" fontSize="xs">
            {t("fakturownia.costs.lastSynced", {
              date: formatSyncTimestamp(lastSyncedAt, lng),
              defaultValue: "Last synced: {{date}}",
            })}
          </Text>
        ) : null}

        {syncState.error ? (
          <Text color="red.fg" fontSize="sm">
            {t("fakturownia.costs.syncError", {
              defaultValue: "Sync failed: {{error}}",
              error: syncState.error,
            })}
          </Text>
        ) : null}

        {syncResult ? (
          <VStack align="stretch" gap={1}>
            <Text color="fg.muted" fontSize="xs">
              {t("fakturownia.costs.syncSummary", {
                defaultValue:
                  "Invoices scanned: {{invoices}} • Evidence upserted: {{evidence}} • Pending created: {{pending}}",
                evidence: syncResult.evidenceCreatedOrUpdated,
                invoices: syncResult.invoicesScanned,
                pending: syncResult.pendingMappingsCreated,
              })}
            </Text>
            {syncResult.truncated ? (
              <Text color="orange.fg" fontSize="xs">
                {t("fakturownia.costs.syncTruncated", {
                  defaultValue: "Truncated — more data remains. Sync again.",
                })}
              </Text>
            ) : null}
          </VStack>
        ) : null}
      </VStack>
      <Separator mt="5" mb="5" />

      <CollapsibleSection
        title={t("fakturownia.costs.manualTitle", {
          defaultValue: "Manual costs",
        })}
        defaultOpen
      >
        <ManualCostForm lng={lng} selectorProducts={selectorProducts} t={t} />
      </CollapsibleSection>

      <Separator mt="5" mb="5" />

      <CollapsibleSection
        title={t("fakturownia.costs.materialGroups.title", {
          defaultValue: "Material cost groups",
        })}
        defaultOpen={false}
      >
        <MaterialGroupsManager attributes={allAttributes} hideHeading />
      </CollapsibleSection>

      <Separator mt="5" mb="5" />

      <CollapsibleSection
        title={t("fakturownia.costs.costRecipes.title", {
          defaultValue: "Cost recipes",
        })}
        defaultOpen={false}
      >
        <CostRecipesManager hideHeading />
      </CollapsibleSection>

      <Separator mt="5" mb="5" />

      <VStack align="stretch" gap={5}>
        <CollapsibleSection
          title={t("fakturownia.costs.pendingTitle", {
            defaultValue: "Pending review",
          })}
          badge={<Badge>{optimisticPending.length}</Badge>}
          headerRight={
            eligibleMappingIds.length > 0 ? (
              <form action={bulkApproveFakturowniaCostMappingsAction}>
                <input type="hidden" name="lng" value={lng} />
                {eligibleMappingIds.map((mappingId) => (
                  <input
                    key={mappingId}
                    name="mappingId"
                    type="hidden"
                    value={mappingId}
                  />
                ))}
                <Button
                  colorPalette="success"
                  size="sm"
                  type="submit"
                  variant="surface"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MaterialSymbol>done_all</MaterialSymbol>
                  {t("fakturownia.costs.approveAllSuggested", {
                    count: eligibleMappingIds.length,
                    defaultValue: "Approve all suggested ({{count}})",
                  })}
                </Button>
              </form>
            ) : null
          }
          defaultOpen
        >
          <VStack align="stretch" gap={2}>
            {optimisticPending.length > 0 ? (
              optimisticPending.map((pair) => (
                <MappingCard
                  key={pair.mapping.id}
                  pair={pair}
                  lng={lng}
                  onImportSupplier={handleImportSupplier}
                  onRejectAction={rejectMappingAction}
                  onReferenceAction={saveAsReferenceMappingAction}
                  onSavePackagingAction={savePackagingAction}
                  selectorProducts={selectorProducts}
                  showActions
                  supplierLinked={optimisticLinkedSupplierIds.includes(
                    pair.mapping.id,
                  )}
                />
              ))
            ) : (
              <Card.Root variant="outline">
                <Card.Body p={3}>
                  <Text color="fg.muted" fontSize="sm">
                    {t("fakturownia.costs.noPending", {
                      defaultValue: "No cost mappings are waiting for review.",
                    })}
                  </Text>
                </Card.Body>
              </Card.Root>
            )}
          </VStack>
        </CollapsibleSection>

        <CollapsibleSection
          title={t("fakturownia.costs.approvedTitle", {
            defaultValue: "Approved cost data",
          })}
          badge={
            <Badge colorPalette="success">{connectedApproved.length}</Badge>
          }
          defaultOpen
        >
          <VStack align="stretch" gap={2}>
            {connectedApproved.map((pair) => (
              <MappingCard
                key={pair.mapping.id}
                pair={pair}
                lng={lng}
                onImportSupplier={handleImportSupplier}
                onRejectAction={rejectMappingAction}
                onRemoveAction={removeApprovedMappingAction}
                onSavePackagingAction={savePackagingAction}
                selectorProducts={selectorProducts}
                showActions={false}
                supplierLinked={optimisticLinkedSupplierIds.includes(
                  pair.mapping.id,
                )}
              />
            ))}
          </VStack>
        </CollapsibleSection>

        <CollapsibleSection
          title={t("fakturownia.costs.referenceCostsTitle", {
            defaultValue: "Reference costs",
          })}
          badge={<Badge colorPalette="gray">{referenceApproved.length}</Badge>}
          defaultOpen
        >
          <VStack align="stretch" gap={2}>
            {referenceApproved.length > 0 ? (
              referenceApproved.map((pair) => (
                <MappingCard
                  key={pair.mapping.id}
                  pair={pair}
                  lng={lng}
                  onRejectAction={rejectMappingAction}
                  onRemoveAction={removeApprovedMappingAction}
                  onSavePackagingAction={savePackagingAction}
                  selectorProducts={selectorProducts}
                  showActions={false}
                />
              ))
            ) : (
              <Card.Root variant="outline">
                <Card.Body p={3}>
                  <Text color="fg.muted" fontSize="sm">
                    {t("fakturownia.costs.noReference", {
                      defaultValue: "No reference costs saved yet.",
                    })}
                  </Text>
                </Card.Body>
              </Card.Root>
            )}
          </VStack>
        </CollapsibleSection>
      </VStack>
      <SupplierForm
        type="CREATE"
        open={supplierDrawer.open}
        setOpen={(value) =>
          setSupplierDrawer((prev) => ({
            ...prev,
            open: typeof value === "function" ? value(prev.open) : value,
          }))
        }
        prefill={supplierDrawer.prefill}
        onSuccess={(created) => {
          if (supplierDrawer.mappingId) {
            const mappingId = supplierDrawer.mappingId;
            setOptimisticLinkedSupplierIds((currentIds) =>
              currentIds.includes(mappingId)
                ? currentIds
                : [...currentIds, mappingId],
            );
            void linkCostMappingSupplierAction({
              mappingId,
              name: created?.name ?? supplierDrawer.draftName,
              nip: created?.nip ?? supplierDrawer.draftNip,
              lng,
            }).catch((error: unknown) => {
              console.error(
                "[FakturowniaCostsPage] Failed to link supplier after create:",
                error,
              );
            });
          }
          setSupplierDrawer({ open: false });
        }}
      />
    </Box>
  );
}
