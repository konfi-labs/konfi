"use client";

import { generateAllegroGpsrSafetyInformation } from "@/actions/allegro-gpsr";
import { useChannels } from "@/context/channels";
import { useConfiguration } from "@/context/configuration";
import { useT } from "@/i18n/client";
import { createAllegroDescriptionContent } from "@/lib/allegro-description";
import {
  parseAllegroHandlingTimeDays,
  toAllegroHandlingTimeDuration,
} from "@/lib/allegro-delivery-time";
import {
  buildAllegroExportPreviewOffer,
  buildAllegroExportSelectionId,
  getProductExportAttributes,
  isAllegroCategoryParametersResponse,
  isAllegroCategorySearchResponse,
  type AllegroCategoryParameter,
  type AllegroCategorySuggestion,
  type AllegroExportConfigurationSelection,
  type AllegroExportPreviewOffer,
} from "@/lib/allegro-export-preview";
import {
  buildAllegroExportStoredOfferId,
  deleteStoredAllegroExportOffer,
  loadStoredAllegroExportOffers,
  saveStoredAllegroExportOffer,
  type AllegroExportStoredOffer,
} from "@/lib/allegro-export-offers";
import {
  DEFAULT_ALLEGRO_PUBLICATION_SETTINGS,
  loadAllegroImportSettings,
  normalizeAllegroPublicationSettings,
  type AllegroPublicationSettings,
} from "@/lib/allegro-import-settings";
import {
  type AllegroManualParameterValue,
  type AllegroPublishOfferRequest,
} from "@/lib/allegro-product-offer-publication";
import { firestore } from "@/lib/firebase/clientApp";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Combobox,
  Container,
  Dialog,
  Field,
  HStack,
  Input,
  Portal,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import { Image, MaterialSymbol, toaster } from "@konfi/components";
import {
  getProductPageCountPriceByCalculatedCombination,
  getProductPageCountSegmentStepPriceByCalculatedCombination,
  getProductPageCountStepPriceByCalculatedCombination,
  getProductPriceByCalculatedCombination,
} from "@konfi/firebase";
import {
  Attribute,
  Discount,
  DiscountTypeEnum,
  FieldData,
  Locale,
  OrderItem,
  Price,
  PriceTypeEnum,
  Product,
  Unit,
} from "@konfi/types";
import {
  DEFAULT_COMBINATION,
  buildDynamicPricesForSelection,
  calculateConfiguredProductPrice,
  formatPrice,
  getCombination,
  getExactPageCountPriceSet,
  getPageCountPricingMode,
  getPageCountSegment,
  getSegmentedPageCountPriceSet,
  requiresRemoteDynamicPricingResolution,
} from "@konfi/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
  type FieldValues,
  type UseFieldArrayInsert,
} from "react-hook-form";
import {
  CombinationInput,
  type CombinationInputSaveOverridePayload,
} from "../../components/form/field-controllers/CombinationInput";
import { ProductGroupedIndexedSearch } from "../../components/form/field-controllers/ProductGroupedIndexedSearch";

interface ExportSelectionPreview extends AllegroExportConfigurationSelection {
  calculatedCombination: string;
  combination: string;
  combinationDescription: string;
  formattedPrice?: string;
  priceAmountMinor?: number;
  priceError?: string;
}

interface ProductPickerProps {
  lng?: Locale;
  selectedProduct: Product | null;
  setSelectedProduct: (product: Product | null) => void;
  t: ReturnType<typeof useT>["t"];
}

interface CategoryPanelProps {
  categoryId: string;
  categoryParameters: AllegroCategoryParameter[];
  categoryResults: AllegroCategorySuggestion[];
  categorySearchTerm: string;
  loadingCategorySearch: boolean;
  loadingParameters: boolean;
  manualParameterValues: Record<string, string>;
  offerCount: number;
  parameterCount: number;
  selectedCategory: AllegroCategorySuggestion | null;
  setCategoryId: (value: string) => void;
  setCategorySearchTerm: (value: string) => void;
  setManualParameterValue: (parameterId: string, value: string) => void;
  t: ReturnType<typeof useT>["t"];
  unresolvedCount: number;
  onLoadParameters: () => void;
  onSearchCategories: () => void;
  onSelectCategory: (category: AllegroCategorySuggestion) => void;
}

interface ConfigurationPanelProps {
  addingConfiguration: boolean;
  draftAttributes: Record<string, string>;
  draftPageCount: string;
  draftVolume: string;
  exportAttributes: Attribute[];
  loadingAttributes: boolean;
  selectedProduct: Product | null;
  setDraftAttributes: (
    value: (current: Record<string, string>) => Record<string, string>,
  ) => void;
  setDraftPageCount: (value: string) => void;
  setDraftVolume: (value: string) => void;
  t: ReturnType<typeof useT>["t"];
  volumeCollection: ReturnType<
    typeof createListCollection<{
      label: string;
      value: string;
    }>
  >;
  onAddConfiguration: () => void;
  onOpenConfigurator: () => void;
}

interface PreviewPanelProps {
  channelId?: string;
  defaultHandlingTime: string;
  loadingStoredOffers: boolean;
  onDeliveryTimeBlur: (configurationId: string) => void;
  onDeliveryTimeChange: (configurationId: string, value: string) => void;
  onPublishOffers: () => void;
  onRemoveConfiguration: (configurationId: string) => void;
  onGenerateSafetyInformation: (configurationId: string) => void;
  onOfferDescriptionBlur: (configurationId: string) => void;
  onOfferDescriptionChange: (configurationId: string, value: string) => void;
  onSafetyInformationBlur: (configurationId: string) => void;
  onSafetyInformationChange: (configurationId: string, value: string) => void;
  previewOffers: AllegroExportPreviewOffer[];
  publishingOffers: boolean;
  savingStoredOffers: boolean;
  generatingSafetyInformationIds: ReadonlySet<string>;
  selectedConfigurations: ExportSelectionPreview[];
  selectedProduct: Product | null;
  t: ReturnType<typeof useT>["t"];
}

interface AllegroListingPreviewProps {
  channelId?: string;
  defaultHandlingTime: string;
  onClose?: () => void;
  offer: AllegroExportPreviewOffer;
  previewOffers: AllegroExportPreviewOffer[];
  product: Product | null;
  selection?: ExportSelectionPreview;
  selectedConfigurations: ExportSelectionPreview[];
  t: ReturnType<typeof useT>["t"];
}

interface ProductSearchFormValues {
  billing?: {
    nip?: string;
  };
  items: Array<{
    customPrice?: number;
    id?: string;
    product?: Product;
    searchProvider?: string;
    unit?: string;
  }>;
}

interface AllegroOfferConfiguratorFormValues {
  items: OrderItem[];
}

function restoreStoredOfferSelection(
  offer: AllegroExportStoredOffer,
): ExportSelectionPreview {
  return {
    ...offer.selection,
    calculatedCombination: offer.calculatedCombination,
    combination: offer.combination,
    combinationDescription: offer.combinationDescription,
    formattedPrice: offer.formattedPrice,
    priceAmountMinor: offer.priceAmountMinor,
    priceError: offer.priceError,
    publicationStatus: offer.publicationStatus,
  };
}

async function loadBasePrices(options: {
  calculatedCombination: string;
  channelId: string;
  pageCount?: number | null;
  product: Product;
  selectedAttributeOptions: Record<string, string>;
  volume: number;
}): Promise<Price[] | undefined> {
  const resolvedCombination =
    options.calculatedCombination || DEFAULT_COMBINATION;
  const pageCountPricingMode = getPageCountPricingMode(
    options.product.pageCount?.pricing,
  );

  if (options.product.priceType === PriceTypeEnum.SINGLE) {
    return options.product.defaultPrice
      ? [options.product.defaultPrice]
      : undefined;
  }

  if (
    options.product.priceType === PriceTypeEnum.DYNAMIC &&
    options.product.dynamicPricing?.enabled &&
    !requiresRemoteDynamicPricingResolution(options.product.dynamicPricing)
  ) {
    return buildDynamicPricesForSelection({
      calculatedCombination: resolvedCombination,
      config: options.product.dynamicPricing,
      context: {
        pageCount: options.pageCount,
        quantity: options.volume,
        volume: options.volume,
      },
      currency: options.product.defaultPrice?.currency,
      product: options.product,
      selectedAttributeOptions: options.selectedAttributeOptions,
    });
  }

  if (options.product.pageCount?.enabled && pageCountPricingMode === "exact") {
    const inlinePriceSet = getExactPageCountPriceSet(
      options.pageCount,
      options.product.pageCount,
    );
    if (inlinePriceSet?.prices?.length) return inlinePriceSet.prices;

    if (typeof options.pageCount === "number") {
      const priceData = await getProductPageCountPriceByCalculatedCombination(
        firestore,
        options.channelId,
        options.product.id,
        options.pageCount,
        resolvedCombination,
      );
      return priceData?.prices;
    }
  }

  if (
    options.product.pageCount?.enabled &&
    pageCountPricingMode === "segmented"
  ) {
    const inlinePriceSet = getSegmentedPageCountPriceSet(
      options.pageCount,
      options.product.pageCount,
    );
    if (inlinePriceSet?.basePrices?.length) return inlinePriceSet.basePrices;
  }

  const priceData = await getProductPriceByCalculatedCombination(
    firestore,
    options.channelId,
    options.product.id,
    resolvedCombination,
  );

  return priceData?.prices?.length
    ? priceData.prices
    : options.product.prices?.length
      ? options.product.prices
      : undefined;
}

async function loadPageCountStepPrices(options: {
  calculatedCombination: string;
  channelId: string;
  pageCount?: number | null;
  product: Product;
}): Promise<Price[] | undefined> {
  if (
    !options.product.pageCount?.enabled ||
    options.product.priceType === PriceTypeEnum.DYNAMIC
  ) {
    return undefined;
  }

  const pricingMode = getPageCountPricingMode(
    options.product.pageCount.pricing,
  );
  if (pricingMode === "exact") return undefined;

  const resolvedCombination =
    options.calculatedCombination || DEFAULT_COMBINATION;

  if (pricingMode === "segmented") {
    const inlinePriceSet = getSegmentedPageCountPriceSet(
      options.pageCount,
      options.product.pageCount,
    );
    if (inlinePriceSet?.stepPrices?.length) return inlinePriceSet.stepPrices;

    const segment = getPageCountSegment(
      options.pageCount,
      options.product.pageCount,
    );
    if (segment) {
      const priceData =
        await getProductPageCountSegmentStepPriceByCalculatedCombination(
          firestore,
          options.channelId,
          options.product.id,
          segment.minimum,
          resolvedCombination,
        );
      return priceData?.prices;
    }
  }

  if (options.product.pageCount.pricing?.stepPrices?.length) {
    return options.product.pageCount.pricing.stepPrices;
  }

  const priceData = await getProductPageCountStepPriceByCalculatedCombination(
    firestore,
    options.channelId,
    options.product.id,
    resolvedCombination,
  );
  return priceData?.prices;
}

function buildInitialAttributeOptions(attributes: Attribute[]) {
  return Object.fromEntries(
    attributes.flatMap((attribute) => {
      const firstOption = attribute.options[0];
      return firstOption ? [[attribute.id, String(firstOption.value)]] : [];
    }),
  );
}

function buildProductImageUrl(options: {
  channelId?: string;
  image: string | undefined;
  product: Product;
}): string | undefined {
  if (!options.image) return undefined;
  if (
    options.image.startsWith("http://") ||
    options.image.startsWith("https://") ||
    options.image.startsWith("/")
  ) {
    return options.image;
  }

  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  const channelId = options.product.channelId || options.channelId;
  if (!cdnUrl || !channelId) return undefined;

  return `https://${cdnUrl}/channels/${channelId}/products/${options.product.id}/${options.image}?fit=crop&auto=format,compress`;
}

function getProductDescriptionPreview(product: Product): string {
  return (
    product.description?.trim() ||
    product.seo.description?.trim() ||
    product.specialNotes?.trim() ||
    product.name
  );
}

function buildManualParameterValues(options: {
  categoryParameters: AllegroCategoryParameter[];
  mappedParameterIds: Set<string>;
  values: Record<string, string>;
}): AllegroManualParameterValue[] {
  return options.categoryParameters.flatMap((parameter) => {
    if (options.mappedParameterIds.has(parameter.id)) return [];
    const rawValue = options.values[parameter.id]?.trim();
    if (!rawValue) return [];

    const dictionaryValue = parameter.dictionary?.find(
      (item) => item.id === rawValue,
    );

    return [
      {
        describesProduct: parameter.options?.describesProduct === true,
        parameterId: parameter.id,
        parameterName: parameter.name,
        valueId: dictionaryValue?.id,
        valueLabel: dictionaryValue?.value ?? rawValue,
      },
    ];
  });
}

function buildPublishOfferRequest(options: {
  categoryId: string;
  channelId?: string;
  descriptionHtml: string;
  manualParameters: AllegroManualParameterValue[];
  offer: AllegroExportPreviewOffer;
  product: Product;
  publicationSettings: AllegroPublicationSettings;
  selection: ExportSelectionPreview;
}): AllegroPublishOfferRequest {
  const imageUrls = options.product.spec.images.flatMap((image) => {
    const imageUrl = buildProductImageUrl({
      channelId: options.channelId,
      image,
      product: options.product,
    });
    return imageUrl ? [imageUrl] : [];
  });

  return {
    allegroOfferId: options.selection.allegroOfferId,
    categoryId: options.categoryId,
    configurationDescription: options.selection.combinationDescription,
    currency: String(options.product.defaultPrice?.currency ?? "PLN"),
    descriptionHtml: options.descriptionHtml,
    externalId: options.offer.fingerprint,
    handlingTime: options.selection.allegroHandlingTime,
    imageUrls,
    manualParameters: options.manualParameters,
    parameters: options.offer.mappings,
    publicationSettings: options.publicationSettings,
    priceAmountMinor: options.selection.priceAmountMinor ?? Number.NaN,
    productName: options.product.name,
    quantity: options.selection.volume,
    safetyInformationDescription:
      options.selection.gpsrSafetyInformationDescription ?? "",
    title: options.offer.title,
  };
}

function getCustomFormatLabel(
  selection: Pick<
    AllegroExportConfigurationSelection,
    "customFormat" | "height" | "width"
  >,
  t: ReturnType<typeof useT>["t"],
): string | undefined {
  if (
    selection.customFormat !== true ||
    typeof selection.width !== "number" ||
    typeof selection.height !== "number" ||
    !Number.isFinite(selection.width) ||
    !Number.isFinite(selection.height) ||
    selection.width <= 0 ||
    selection.height <= 0
  ) {
    return undefined;
  }

  return t("allegro.export.customFormatLabel", {
    defaultValue: "{{width}} x {{height}} mm",
    height: selection.height,
    width: selection.width,
  });
}

function buildSelectionDescriptionHtml(options: {
  manualParameters?: AllegroManualParameterValue[];
  offer: AllegroExportPreviewOffer;
  product: Product;
  selection: ExportSelectionPreview;
  t: ReturnType<typeof useT>["t"];
}): string {
  return createAllegroDescriptionContent({
    configurationDescription: options.selection.combinationDescription,
    customFormatLabel: getCustomFormatLabel(options.selection, options.t),
    description: getProductDescriptionPreview(options.product),
    manualParameters: options.manualParameters,
    parameters: options.offer.mappings,
    productName: options.product.name,
    quantity: options.selection.volume,
  });
}

function getCurrentDescriptionHtml(options: {
  defaultDescriptionHtml: string;
  selection?: ExportSelectionPreview;
}): string {
  if (!options.selection?.allegroDescriptionEditedAt) {
    return options.defaultDescriptionHtml;
  }

  return (
    options.selection.allegroDescriptionHtml ?? options.defaultDescriptionHtml
  );
}

function isPublishOfferResponse(
  value: unknown,
): value is { offerId: string | null; publicationStatus: string | null } {
  return (
    typeof value === "object" &&
    value !== null &&
    ("offerId" in value
      ? value.offerId === null || typeof value.offerId === "string"
      : true) &&
    ("publicationStatus" in value
      ? value.publicationStatus === null ||
        typeof value.publicationStatus === "string"
      : true)
  );
}

const PRODUCT_SEARCH_FIELD_DATA = {
  name: "product",
  searchFor: "products",
  searchResult: "object",
  type: "groupedIndexedSearch",
} satisfies FieldData;
const MAX_VISIBLE_PARAMETER_DICTIONARY_OPTIONS = 50;

const ProductPicker = (props: ProductPickerProps) => {
  const { lng, selectedProduct, setSelectedProduct, t } = props;
  const methods = useForm<ProductSearchFormValues>({
    defaultValues: {
      items: [
        {
          product: selectedProduct ?? undefined,
          searchProvider: "konfi",
        },
      ],
    },
  });
  const watchedItems = useWatch({
    control: methods.control,
    name: "items",
  });
  const watchedProduct = watchedItems?.[0]?.product ?? null;
  const fieldData = useMemo(
    () =>
      ({
        ...PRODUCT_SEARCH_FIELD_DATA,
        label: t("allegro.settings.searchLabel", {
          defaultValue: "Search Products",
        }),
        placeholder: t("allegro.settings.searchPlaceholder", {
          defaultValue: "Type product name…",
        }),
      }) satisfies FieldData,
    [t],
  );

  useEffect(() => {
    if (watchedProduct?.id !== selectedProduct?.id) {
      setSelectedProduct(watchedProduct);
    }
  }, [selectedProduct?.id, setSelectedProduct, watchedProduct]);

  useEffect(() => {
    const currentProduct = methods.getValues("items")?.[0]?.product ?? null;
    if (selectedProduct?.id !== currentProduct?.id) {
      methods.setValue("items.0.product", selectedProduct ?? undefined, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
  }, [methods, selectedProduct]);

  return (
    <Card.Root>
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <Text fontWeight="semibold">
            {t("allegro.export.sourceProduct", {
              defaultValue: "Source Product",
            })}
          </Text>
          <FormProvider {...methods}>
            <ProductGroupedIndexedSearch
              fieldArrayIndex={0}
              fieldData={fieldData}
              lng={lng}
            />
          </FormProvider>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};

function getDefaultConfiguratorQuantity(product: Product) {
  return (
    [
      product.spec.defaultOrder,
      product.volumes[0]?.value,
      product.spec.minimumOrder,
      1,
    ].find(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    ) ?? 1
  );
}

function buildConfiguratorOrderItem(product: Product): OrderItem {
  const quantity = getDefaultConfiguratorQuantity(product);

  return {
    id: `allegro-offer-${product.id}`,
    name: product.name,
    product,
    description: "",
    combination: null,
    calculatedCombination: null,
    volume: quantity,
    pageCount: product.pageCount?.enabled ? product.pageCount.minimum : null,
    customFormat: false,
    totalPrice: 0,
    customPrice: 0,
    width: 0,
    height: 0,
    quantity,
    customSizes: [],
    discount: new Discount(undefined, DiscountTypeEnum.PERCENTAGE, 0, 0, null)
      .object,
    unit: product.prefferedUnit ?? Unit.PCS,
    advancedAttributeSelections: undefined,
  };
}

const AllegroOfferConfigurator = (props: {
  onSaveConfiguration: (payload: CombinationInputSaveOverridePayload) => void;
  product: Product;
  t: ReturnType<typeof useT>["t"];
}) => {
  const methods = useForm<AllegroOfferConfiguratorFormValues>({
    defaultValues: {
      items: [buildConfiguratorOrderItem(props.product)],
    },
  });
  const { control, reset } = methods;
  const { insert } = useFieldArray({
    control,
    keyName: "__fieldArrayId",
    name: "items",
  });

  useEffect(() => {
    reset({
      items: [buildConfiguratorOrderItem(props.product)],
    });
  }, [props.product, reset]);

  return (
    <FormProvider {...methods}>
      <Box maxW="100%" minW={0} overflowX="hidden">
        <CombinationInput
          allowSaveAsNew={false}
          index={0}
          insertAction={
            insert as unknown as UseFieldArrayInsert<FieldValues, string>
          }
          itemId={`allegro-offer-${props.product.id}`}
          onSaveConfiguration={props.onSaveConfiguration}
          saveConfigurationIcon="sell"
          saveConfigurationLabel={props.t("allegro.export.addToOffer", {
            defaultValue: "Add to Offer",
          })}
          showConfigurationSaveToast={false}
        />
      </Box>
    </FormProvider>
  );
};

const ManualCategoryParameterField = (props: {
  parameter: AllegroCategoryParameter;
  setValue: (parameterId: string, value: string) => void;
  t: ReturnType<typeof useT>["t"];
  value: string;
}) => {
  const [searchValue, setSearchValue] = useState("");
  const selectedDictionaryOption = useMemo(
    () =>
      (props.parameter.dictionary ?? []).find(
        (option) => option.id === props.value,
      ),
    [props.parameter.dictionary, props.value],
  );
  const visibleDictionaryOptions = useMemo(() => {
    const dictionaryOptions = props.parameter.dictionary ?? [];
    const visibleOptions = filterLocalFuseItems(
      dictionaryOptions,
      searchValue,
      {
        keys: ["value"],
        limit: MAX_VISIBLE_PARAMETER_DICTIONARY_OPTIONS,
        threshold: 0.34,
      },
    );

    if (
      selectedDictionaryOption &&
      !visibleOptions.some(
        (option) => option.id === selectedDictionaryOption.id,
      )
    ) {
      return [selectedDictionaryOption, ...visibleOptions].slice(
        0,
        MAX_VISIBLE_PARAMETER_DICTIONARY_OPTIONS,
      );
    }

    return visibleOptions;
  }, [props.parameter.dictionary, searchValue, selectedDictionaryOption]);
  const collection = useMemo(
    () =>
      createListCollection({
        items: visibleDictionaryOptions.map((option) => ({
          label: option.value,
          value: option.id,
        })),
      }),
    [visibleDictionaryOptions],
  );

  if ((props.parameter.dictionary ?? []).length > 0) {
    return (
      <Combobox.Root
        collection={collection}
        inputBehavior="autohighlight"
        selectionBehavior="replace"
        value={props.value ? [props.value] : []}
        onInputValueChange={(details) => setSearchValue(details.inputValue)}
        onValueChange={(details) =>
          props.setValue(props.parameter.id, details.value[0] ?? "")
        }
      >
        <Combobox.Label>{props.parameter.name}</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input
            autoComplete="off"
            placeholder={
              selectedDictionaryOption?.value ??
              props.t("allegro.export.searchParameterValue", {
                defaultValue: "Search value",
              })
            }
          />
          <Combobox.IndicatorGroup>
            <Combobox.ClearTrigger />
            <Combobox.Trigger />
          </Combobox.IndicatorGroup>
        </Combobox.Control>
        <Portal>
          <Combobox.Positioner>
            <Combobox.Content maxH="72" overflowY="auto">
              <Combobox.Empty>
                {props.t("allegro.export.parameterSearchHint", {
                  defaultValue: "Type to search available values.",
                })}
              </Combobox.Empty>
              {collection.items.map((item) => (
                <Combobox.Item item={item} key={item.value}>
                  <Combobox.ItemText>{item.label}</Combobox.ItemText>
                  <Combobox.ItemIndicator />
                </Combobox.Item>
              ))}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Root>
    );
  }

  return (
    <Field.Root>
      <Field.Label>{props.parameter.name}</Field.Label>
      <Input
        value={props.value}
        onChange={(event) =>
          props.setValue(props.parameter.id, event.target.value)
        }
        placeholder={props.t("allegro.export.parameterValuePlaceholder", {
          defaultValue: "Parameter value",
        })}
      />
    </Field.Root>
  );
};

const CategoryPanel = (props: CategoryPanelProps) => {
  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: props.categoryResults.map((category) => ({
          category,
          label: category.name,
          value: category.id,
        })),
      }),
    [props.categoryResults],
  );
  const selectedCategoryPath = props.selectedCategory?.path.join(" / ");
  const requiredParameters = props.categoryParameters.filter(
    (parameter) => parameter.required,
  );

  return (
    <Card.Root>
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <Text fontWeight="semibold">
            {props.t("allegro.export.category", {
              defaultValue: "Allegro Category",
            })}
          </Text>
          <HStack align="end">
            <Field.Root>
              <Field.Label>
                {props.t("allegro.export.categorySearch", {
                  defaultValue: "Search Categories",
                })}
              </Field.Label>
              <Input
                autoComplete="off"
                name="allegro-export-category-search"
                onChange={(event) =>
                  props.setCategorySearchTerm(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    props.onSearchCategories();
                  }
                }}
                placeholder={props.t(
                  "allegro.export.categorySearchPlaceholder",
                  {
                    defaultValue: "Type a product or category phrase…",
                  },
                )}
                value={props.categorySearchTerm}
              />
            </Field.Root>
            <Button
              colorPalette="primary"
              loading={props.loadingCategorySearch}
              onClick={() => props.onSearchCategories()}
            >
              <MaterialSymbol>search</MaterialSymbol>
              {props.t("actions.search", { defaultValue: "Search" })}
            </Button>
          </HStack>

          <Combobox.Root
            collection={categoryCollection}
            disabled={props.categoryResults.length === 0}
            openOnClick
            selectionBehavior="replace"
            value={props.selectedCategory ? [props.selectedCategory.id] : []}
            onValueChange={(details) => {
              const selectedItem = details.items[0] as
                | {
                    category: AllegroCategorySuggestion;
                  }
                | undefined;
              if (selectedItem) props.onSelectCategory(selectedItem.category);
            }}
          >
            <Combobox.Label>
              {props.t("allegro.export.categoryResults", {
                defaultValue: "Category Results",
              })}
            </Combobox.Label>
            <Combobox.Control>
              <Combobox.Input
                placeholder={props.t(
                  "allegro.export.categorySelectPlaceholder",
                  {
                    defaultValue: "Select Allegro category",
                  },
                )}
              />
              <Combobox.IndicatorGroup>
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            <Portal>
              <Combobox.Positioner>
                <Combobox.Content>
                  <Combobox.Empty>
                    {props.t("allegro.export.noCategoryResults", {
                      defaultValue: "No category suggestions found.",
                    })}
                  </Combobox.Empty>
                  {categoryCollection.items.map((item) => (
                    <Combobox.Item item={item} key={item.value}>
                      <Combobox.ItemText width="100%">
                        <VStack align="stretch" gap={0}>
                          <Text fontWeight="medium">{item.label}</Text>
                          <Text color="fg.muted" fontSize="xs">
                            {item.category.path.join(" / ")}
                          </Text>
                        </VStack>
                      </Combobox.ItemText>
                      <Combobox.ItemIndicator />
                    </Combobox.Item>
                  ))}
                </Combobox.Content>
              </Combobox.Positioner>
            </Portal>
          </Combobox.Root>

          {props.selectedCategory && (
            <HStack wrap="wrap">
              <Badge colorPalette="primary">
                {props.t("allegro.export.productId", {
                  defaultValue: "ID: {{id}}",
                  id: props.selectedCategory.id,
                })}
              </Badge>
              {selectedCategoryPath && (
                <Text color="fg.muted" fontSize="sm">
                  {selectedCategoryPath}
                </Text>
              )}
            </HStack>
          )}

          <HStack align="end">
            <Field.Root>
              <Field.Label>
                {props.t("allegro.export.manualCategoryId", {
                  defaultValue: "Manual Category ID",
                })}
              </Field.Label>
              <Input
                autoComplete="off"
                name="allegro-export-category-id"
                onChange={(event) => props.setCategoryId(event.target.value)}
                placeholder={props.t("allegro.export.categoryPlaceholder", {
                  defaultValue: "Enter category ID…",
                })}
                value={props.categoryId}
              />
            </Field.Root>
            <Button
              loading={props.loadingParameters}
              variant="outline"
              onClick={() => props.onLoadParameters()}
            >
              <MaterialSymbol>sync</MaterialSymbol>
              {props.t("allegro.export.loadParameters", {
                defaultValue: "Load Parameters",
              })}
            </Button>
          </HStack>

          <HStack wrap="wrap">
            <Badge colorPalette={props.parameterCount ? "success" : "gray"}>
              {props.t("allegro.export.parameterCount", {
                defaultValue: "{{count}} Parameters",
                count: props.parameterCount,
              })}
            </Badge>
            <Badge colorPalette={props.offerCount > 0 ? "blue" : "gray"}>
              {props.t("allegro.export.offerCount", {
                defaultValue: "{{count}} Offers",
                count: props.offerCount,
              })}
            </Badge>
            <Badge
              colorPalette={props.unresolvedCount > 0 ? "orange" : "success"}
            >
              {props.t("allegro.export.unresolvedCount", {
                defaultValue: "{{count}} Unresolved",
                count: props.unresolvedCount,
              })}
            </Badge>
          </HStack>

          {requiredParameters.length > 0 && (
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={3}>
                {props.t("allegro.export.requiredCategoryParameters", {
                  defaultValue: "Required Allegro parameters",
                })}
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                {requiredParameters.map((parameter) => (
                  <ManualCategoryParameterField
                    key={parameter.id}
                    parameter={parameter}
                    setValue={props.setManualParameterValue}
                    t={props.t}
                    value={props.manualParameterValues[parameter.id] ?? ""}
                  />
                ))}
              </SimpleGrid>
            </Box>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};

const OptionSelect = (props: {
  collection: ReturnType<
    typeof createListCollection<{ label: string; value: string }>
  >;
  label: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}) => (
  <Select.Root
    collection={props.collection}
    value={props.value ? [props.value] : []}
    onValueChange={(event) => props.onValueChange(event.value[0] ?? "")}
  >
    <Select.HiddenSelect />
    <Select.Label>{props.label}</Select.Label>
    <Select.Control>
      <Select.Trigger>
        <Select.ValueText placeholder={props.placeholder} />
      </Select.Trigger>
      <Select.IndicatorGroup>
        <Select.Indicator />
      </Select.IndicatorGroup>
    </Select.Control>
    <Portal>
      <Select.Positioner>
        <Select.Content>
          {props.collection.items.map((option) => (
            <Select.Item item={option} key={option.value}>
              {option.label}
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Positioner>
    </Portal>
  </Select.Root>
);

const ConfigurationPanel = (props: ConfigurationPanelProps) => (
  <Skeleton loading={props.loadingAttributes}>
    <Card.Root>
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <HStack justify="space-between" align="center" wrap="wrap">
            <Box>
              <Text fontWeight="semibold">
                {props.t("allegro.export.configuration", {
                  defaultValue: "Exact Configuration",
                })}
              </Text>
              <Text color="fg.muted" fontSize="sm">
                {props.t("allegro.export.configurationDescription", {
                  defaultValue:
                    "Add one concrete configuration at a time. The wizard never expands every product permutation automatically.",
                })}
              </Text>
            </Box>
            <HStack wrap="wrap">
              <Button
                colorPalette="primary"
                disabled={!props.selectedProduct}
                onClick={() => props.onOpenConfigurator()}
              >
                <MaterialSymbol>tune</MaterialSymbol>
                {props.t("allegro.export.openConfigurator", {
                  defaultValue: "Open Configurator",
                })}
              </Button>
              <Button
                colorPalette="primary"
                disabled={!props.selectedProduct}
                loading={props.addingConfiguration}
                variant="outline"
                onClick={() => props.onAddConfiguration()}
              >
                <MaterialSymbol>playlist_add</MaterialSymbol>
                {props.t("allegro.export.addConfiguration", {
                  defaultValue: "Add Configuration",
                })}
              </Button>
            </HStack>
          </HStack>

          {!props.selectedProduct ? (
            <Text color="fg.muted">
              {props.t("allegro.export.selectProductPrompt", {
                defaultValue: "Select a product to configure export offers.",
              })}
            </Text>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap={4}>
              {props.exportAttributes.map((attribute) => (
                <OptionSelect
                  key={attribute.id}
                  collection={createListCollection({
                    items: attribute.options.map((option) => ({
                      label: option.label,
                      value: String(option.value),
                    })),
                  })}
                  label={attribute.name}
                  placeholder={props.t("allegro.export.selectValue", {
                    defaultValue: "Select Value",
                  })}
                  value={props.draftAttributes[attribute.id] ?? ""}
                  onValueChange={(value) =>
                    props.setDraftAttributes((current) => ({
                      ...current,
                      [attribute.id]: value,
                    }))
                  }
                />
              ))}

              <OptionSelect
                collection={props.volumeCollection}
                label={props.t("allegro.export.quantity", {
                  defaultValue: "Quantity",
                })}
                placeholder={props.t("allegro.export.selectQuantity", {
                  defaultValue: "Select Quantity",
                })}
                value={props.draftVolume}
                onValueChange={props.setDraftVolume}
              />

              {props.selectedProduct.pageCount?.enabled && (
                <Field.Root>
                  <Field.Label>
                    {props.t("allegro.export.pageCount", {
                      defaultValue: "Page Count",
                    })}
                  </Field.Label>
                  <Input
                    inputMode="numeric"
                    min={props.selectedProduct.pageCount.minimum}
                    max={props.selectedProduct.pageCount.maximum}
                    name="allegro-export-page-count"
                    onChange={(event) =>
                      props.setDraftPageCount(event.target.value)
                    }
                    type="number"
                    value={props.draftPageCount}
                  />
                </Field.Root>
              )}
            </SimpleGrid>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  </Skeleton>
);

const PreviewPanel = (props: PreviewPanelProps) => {
  const [previewOfferId, setPreviewOfferId] = useState<string | null>(null);
  const activeOffer =
    props.previewOffers.find(
      (offer) => offer.configurationId === previewOfferId,
    ) ?? null;
  const activeSelection = activeOffer
    ? props.selectedConfigurations.find(
        (configuration) => configuration.id === activeOffer.configurationId,
      )
    : undefined;

  return (
    <Card.Root>
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <HStack justify="space-between" align="center" wrap="wrap">
            <Box>
              <Text fontWeight="semibold">
                {props.t("allegro.export.preview", {
                  defaultValue: "Offer Preview",
                })}
              </Text>
              <Text color="fg.muted" fontSize="sm">
                {props.t("allegro.export.previewDescription", {
                  defaultValue:
                    "Review generated titles, parameters, prices, and unresolved values before publishing to Allegro.",
                })}
              </Text>
            </Box>
            <Button
              colorPalette="primary"
              disabled={
                props.previewOffers.length === 0 ||
                props.loadingStoredOffers ||
                props.savingStoredOffers ||
                props.publishingOffers
              }
              loading={props.publishingOffers}
              onClick={() => props.onPublishOffers()}
            >
              <MaterialSymbol>publish</MaterialSymbol>
              {props.t("allegro.export.publishOffers", {
                defaultValue: "Publish Offers",
              })}
            </Button>
            <Badge
              colorPalette={
                props.loadingStoredOffers || props.savingStoredOffers
                  ? "blue"
                  : "success"
              }
              variant="subtle"
            >
              {props.loadingStoredOffers
                ? props.t("allegro.export.storedOffersLoading", {
                    defaultValue: "Loading Saved Offers",
                  })
                : props.savingStoredOffers
                  ? props.t("allegro.export.storedOffersSaving", {
                      defaultValue: "Saving Offers",
                    })
                  : props.t("allegro.export.storedOffersReady", {
                      count: props.selectedConfigurations.length,
                      defaultValue: "{{count}} Saved",
                    })}
            </Badge>
          </HStack>

          {props.previewOffers.length > 10 && (
            <Alert.Root status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {props.t("allegro.export.massExportGuardTitle", {
                    defaultValue: "Large Export Preview",
                  })}
                </Alert.Title>
                <Alert.Description>
                  {props.t("allegro.export.massExportGuardDescription", {
                    defaultValue:
                      "This preview has more than 10 offers. Reduce the curated list before enabling publish.",
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}

          {props.previewOffers.length === 0 ? (
            <Text color="fg.muted">
              {props.t("allegro.export.emptyPreview", {
                defaultValue:
                  "No configurations added yet. The generated offer count is 0.",
              })}
            </Text>
          ) : (
            <Stack gap={4}>
              {props.previewOffers.map((offer) => {
                const selection = props.selectedConfigurations.find(
                  (configuration) => configuration.id === offer.configurationId,
                );
                const defaultDescriptionHtml =
                  props.selectedProduct && selection
                    ? buildSelectionDescriptionHtml({
                        offer,
                        product: props.selectedProduct,
                        selection,
                        t: props.t,
                      })
                    : "";

                return (
                  <OfferPreview
                    key={offer.configurationId}
                    defaultDescriptionHtml={defaultDescriptionHtml}
                    defaultHandlingTime={props.defaultHandlingTime}
                    generatingSafetyInformation={props.generatingSafetyInformationIds.has(
                      offer.configurationId,
                    )}
                    offer={offer}
                    selectedConfigurations={props.selectedConfigurations}
                    t={props.t}
                    onGenerateSafetyInformation={
                      props.onGenerateSafetyInformation
                    }
                    onDeliveryTimeBlur={props.onDeliveryTimeBlur}
                    onDeliveryTimeChange={props.onDeliveryTimeChange}
                    onOpenPreview={() =>
                      setPreviewOfferId(offer.configurationId)
                    }
                    onOfferDescriptionBlur={props.onOfferDescriptionBlur}
                    onOfferDescriptionChange={props.onOfferDescriptionChange}
                    onRemoveConfiguration={props.onRemoveConfiguration}
                    onSafetyInformationBlur={props.onSafetyInformationBlur}
                    onSafetyInformationChange={props.onSafetyInformationChange}
                  />
                );
              })}
            </Stack>
          )}

          <Dialog.Root
            open={Boolean(activeOffer)}
            size="full"
            onOpenChange={(details) => {
              if (!details.open) setPreviewOfferId(null);
            }}
          >
            <Portal>
              <Dialog.Backdrop />
              <Dialog.Positioner maxW="100vw" overflowX="hidden">
                <Dialog.Content maxW="100vw" overflowX="hidden">
                  <Dialog.Body
                    bgColor={{ base: "white", _dark: "black" }}
                    overflowX="hidden"
                    p={0}
                  >
                    {activeOffer ? (
                      <AllegroListingPreview
                        channelId={props.channelId}
                        defaultHandlingTime={props.defaultHandlingTime}
                        offer={activeOffer}
                        previewOffers={props.previewOffers}
                        product={props.selectedProduct}
                        selection={activeSelection}
                        selectedConfigurations={props.selectedConfigurations}
                        t={props.t}
                        onClose={() => setPreviewOfferId(null)}
                      />
                    ) : null}
                  </Dialog.Body>
                </Dialog.Content>
              </Dialog.Positioner>
            </Portal>
          </Dialog.Root>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};

const OfferPreview = (props: {
  defaultDescriptionHtml: string;
  defaultHandlingTime: string;
  onDeliveryTimeBlur: (configurationId: string) => void;
  onDeliveryTimeChange: (configurationId: string, value: string) => void;
  generatingSafetyInformation: boolean;
  offer: AllegroExportPreviewOffer;
  onGenerateSafetyInformation: (configurationId: string) => void;
  onOpenPreview: () => void;
  onOfferDescriptionBlur: (configurationId: string) => void;
  onOfferDescriptionChange: (configurationId: string, value: string) => void;
  onRemoveConfiguration: (configurationId: string) => void;
  onSafetyInformationBlur: (configurationId: string) => void;
  onSafetyInformationChange: (configurationId: string, value: string) => void;
  selectedConfigurations: ExportSelectionPreview[];
  t: ReturnType<typeof useT>["t"];
}) => {
  const selection = props.selectedConfigurations.find(
    (configuration) => configuration.id === props.offer.configurationId,
  );
  const hasUnmapped = props.offer.mappings.some(
    (mapping) => mapping.status === "title_description_only",
  );
  const fallbackHandlingTimeDays =
    parseAllegroHandlingTimeDays(props.defaultHandlingTime) ?? 3;
  const handlingTimeInput =
    selection?.allegroHandlingTimeDays === null
      ? ""
      : String(selection?.allegroHandlingTimeDays ?? fallbackHandlingTimeDays);
  const handlingTimeDuration =
    selection?.allegroHandlingTime ??
    toAllegroHandlingTimeDuration(fallbackHandlingTimeDays) ??
    "P3D";
  const descriptionHtml = getCurrentDescriptionHtml({
    defaultDescriptionHtml: props.defaultDescriptionHtml,
    selection,
  });

  return (
    <Card.Root variant="outline">
      <Card.Body>
        <VStack align="stretch" gap={3}>
          <HStack justify="space-between" align="start" gap={3}>
            <Box minW={0}>
              <Text fontWeight="medium" overflowWrap="anywhere">
                {props.offer.title}
              </Text>
              <Text fontSize="xs" color="fg.muted" overflowWrap="anywhere">
                {props.offer.fingerprint}
              </Text>
            </Box>
            <HStack>
              <Badge
                colorPalette={selection?.priceError ? "orange" : "primary"}
              >
                {selection?.formattedPrice ??
                  selection?.priceError ??
                  props.t("allegro.export.noPrice", {
                    defaultValue: "No Price",
                  })}
              </Badge>
              {selection?.allegroOfferId ? (
                <Badge colorPalette="success" variant="subtle">
                  {props.t("allegro.export.publishedOfferBadge", {
                    defaultValue: "Published {{offerId}}",
                    offerId: selection.allegroOfferId,
                  })}
                </Badge>
              ) : null}
              <Button
                size="xs"
                variant="outline"
                onClick={() => props.onOpenPreview()}
              >
                <MaterialSymbol>visibility</MaterialSymbol>
                {props.t("allegro.export.openOfferPreview", {
                  defaultValue: "Open Preview",
                })}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  props.onRemoveConfiguration(props.offer.configurationId)
                }
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {props.t("actions.remove", { defaultValue: "Remove" })}
              </Button>
            </HStack>
          </HStack>

          <Table.Root size="sm" variant="outline">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>
                  {props.t("allegro.export.attribute", {
                    defaultValue: "Attribute",
                  })}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {props.t("allegro.export.value", { defaultValue: "Value" })}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {props.t("allegro.export.mapping", {
                    defaultValue: "Mapping",
                  })}
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {props.offer.mappings.map((mapping) => (
                <Table.Row key={mapping.attributeId}>
                  <Table.Cell>{mapping.attributeName}</Table.Cell>
                  <Table.Cell>{mapping.valueLabel}</Table.Cell>
                  <Table.Cell>
                    {mapping.status === "mapped" ? (
                      <Badge colorPalette="success">
                        {mapping.parameterName}
                      </Badge>
                    ) : (
                      <Badge colorPalette="orange">
                        {props.t("allegro.export.titleOnly", {
                          defaultValue: "Title/Description",
                        })}
                      </Badge>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>

          {hasUnmapped && (
            <Alert.Root status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  {props.t("allegro.export.unmappedWarning", {
                    defaultValue:
                      "Some values have no matching Allegro parameter and will only be represented in title or description.",
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}

          <Field.Root>
            <Field.Label>
              {props.t("allegro.export.deliveryTimeDays", {
                defaultValue: "Delivery time",
              })}
            </Field.Label>
            <HStack gap={3} align="center">
              <Input
                inputMode="numeric"
                max={365}
                min={1}
                type="number"
                value={handlingTimeInput}
                onBlur={() =>
                  props.onDeliveryTimeBlur(props.offer.configurationId)
                }
                onChange={(event) =>
                  props.onDeliveryTimeChange(
                    props.offer.configurationId,
                    event.currentTarget.value,
                  )
                }
              />
              <Badge colorPalette="blue" variant="subtle">
                {handlingTimeDuration}
              </Badge>
            </HStack>
            <Field.HelperText>
              {props.t("allegro.export.deliveryTimeDaysHelp", {
                defaultValue:
                  "Enter days. The offer is sent to Allegro as {{duration}}.",
                duration: handlingTimeDuration,
              })}
            </Field.HelperText>
          </Field.Root>

          <Field.Root>
            <Field.Label>
              {props.t("allegro.export.allegroDescriptionHtml", {
                defaultValue: "Allegro description HTML",
              })}
            </Field.Label>
            <Textarea
              fontFamily="mono"
              minH="180px"
              resize="vertical"
              value={descriptionHtml}
              placeholder={props.t(
                "allegro.export.allegroDescriptionHtmlPlaceholder",
                {
                  defaultValue:
                    "Converted Allegro description will appear here and can be edited before publication.",
                },
              )}
              onBlur={() =>
                props.onOfferDescriptionBlur(props.offer.configurationId)
              }
              onChange={(event) =>
                props.onOfferDescriptionChange(
                  props.offer.configurationId,
                  event.currentTarget.value,
                )
              }
            />
            <Field.HelperText>
              {props.t("allegro.export.allegroDescriptionHtmlHelp", {
                defaultValue:
                  "Allowed Allegro tags: h1, h2, p, ul, ol, li, b. Images are still added from product files.",
              })}
            </Field.HelperText>
          </Field.Root>

          <AllegroDescriptionHtmlPreview html={descriptionHtml} t={props.t} />

          <Field.Root required>
            <HStack justify="space-between" align="center" gap={3}>
              <Field.Label mb={0}>
                {props.t("allegro.export.gpsrSafetyInformation", {
                  defaultValue: "GPSR safety information",
                })}
              </Field.Label>
              <Button
                size="xs"
                variant="ai"
                loading={props.generatingSafetyInformation}
                disabled={!selection}
                onClick={() =>
                  props.onGenerateSafetyInformation(props.offer.configurationId)
                }
              >
                <MaterialSymbol>auto_awesome</MaterialSymbol>
                {props.t("allegro.export.generateGpsrSafetyInformation", {
                  defaultValue: "Generate with AI",
                })}
              </Button>
            </HStack>
            <Textarea
              minH="120px"
              resize="vertical"
              value={selection?.gpsrSafetyInformationDescription ?? ""}
              placeholder={props.t(
                "allegro.export.gpsrSafetyInformationPlaceholder",
                {
                  defaultValue:
                    "Add safety information for this exact Allegro offer before publishing.",
                },
              )}
              onBlur={() =>
                props.onSafetyInformationBlur(props.offer.configurationId)
              }
              onChange={(event) =>
                props.onSafetyInformationChange(
                  props.offer.configurationId,
                  event.currentTarget.value,
                )
              }
            />
            {selection?.gpsrSafetyInformationSourceSummary ? (
              <Field.HelperText overflowWrap="anywhere">
                {props.t("allegro.export.gpsrGeneratedSourceSummary", {
                  defaultValue: "AI research: {{summary}}",
                  summary: selection.gpsrSafetyInformationSourceSummary,
                })}
              </Field.HelperText>
            ) : null}
          </Field.Root>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};

const AllegroDescriptionHtmlPreview = (props: {
  html: string;
  t: ReturnType<typeof useT>["t"];
}) => (
  <Box>
    <Text fontSize="sm" fontWeight="semibold" mb={2}>
      {props.t("allegro.export.allegroDescriptionPreview", {
        defaultValue: "Rendered Allegro description",
      })}
    </Text>
    {props.html.trim() ? (
      <Box
        bg="white"
        borderColor="border"
        borderWidth="1px"
        color="gray.900"
        fontSize="15px"
        lineHeight="1.6"
        maxW="850px"
        overflowWrap="anywhere"
        p={{ base: 4, md: 6 }}
        css={{
          "& h1": {
            fontSize: "24px",
            fontWeight: 700,
            lineHeight: 1.25,
            marginBottom: "16px",
          },
          "& h2": {
            fontSize: "20px",
            fontWeight: 700,
            lineHeight: 1.3,
            marginBottom: "12px",
            marginTop: "24px",
          },
          "& li": {
            marginBottom: "6px",
          },
          "& ol, & ul": {
            marginBottom: "16px",
            paddingLeft: "24px",
          },
          "& p": {
            marginBottom: "16px",
          },
        }}
        dangerouslySetInnerHTML={{ __html: props.html }}
      />
    ) : (
      <Text color="fg.muted" fontSize="sm">
        {props.t("allegro.export.allegroDescriptionPreviewEmpty", {
          defaultValue: "No description content to preview.",
        })}
      </Text>
    )}
  </Box>
);

const AllegroListingPreview = (props: AllegroListingPreviewProps) => {
  const product = props.product;
  if (!product) return null;

  const configurationById = new Map(
    props.selectedConfigurations.map((configuration) => [
      configuration.id,
      configuration,
    ]),
  );
  const imageUrls = product.spec.images.slice(0, 5).flatMap((image) => {
    const imageUrl = buildProductImageUrl({
      channelId: props.channelId,
      image,
      product,
    });
    return imageUrl ? [imageUrl] : [];
  });
  const mainImageUrl = imageUrls[0];
  const priceLabel =
    props.selection?.formattedPrice ??
    props.selection?.priceError ??
    props.t("allegro.export.noPrice", { defaultValue: "No Price" });
  const fallbackHandlingTimeDays =
    parseAllegroHandlingTimeDays(props.defaultHandlingTime) ?? 3;
  const previewHandlingTimeDuration =
    props.selection?.allegroHandlingTime ??
    toAllegroHandlingTimeDuration(fallbackHandlingTimeDays) ??
    "P3D";
  const previewHandlingTimeDays =
    props.selection?.allegroHandlingTimeDays ?? fallbackHandlingTimeDays;
  const defaultDescriptionHtml = props.selection
    ? buildSelectionDescriptionHtml({
        offer: props.offer,
        product,
        selection: props.selection,
        t: props.t,
      })
    : "";
  const descriptionHtml = getCurrentDescriptionHtml({
    defaultDescriptionHtml,
    selection: props.selection,
  });
  const variantItems = props.previewOffers
    .flatMap((offer) => {
      const configuration = configurationById.get(offer.configurationId);
      if (!configuration) return [];

      const labelParts = [
        props.t("allegro.export.volumeOption", {
          defaultValue: "{{count}} pcs",
          count: configuration.volume,
        }),
        typeof configuration.pageCount === "number"
          ? props.t("allegro.export.pageCountTitleLabel", {
              defaultValue: "{{count}} pages",
              count: configuration.pageCount,
            })
          : undefined,
      ].filter((part): part is string => Boolean(part));

      return [
        {
          active: offer.configurationId === props.offer.configurationId,
          id: offer.configurationId,
          label: labelParts.join(" · "),
          price:
            configuration.formattedPrice ??
            configuration.priceError ??
            props.t("allegro.export.noPrice", { defaultValue: "No Price" }),
          title: offer.mappings
            .slice(0, 2)
            .map((mapping) => mapping.valueLabel)
            .join(" · "),
        },
      ];
    })
    .toSorted((left, right) => left.label.localeCompare(right.label));
  const parameterRows = [
    {
      name: props.t("allegro.export.previewCondition", {
        defaultValue: "Condition",
      }),
      value: props.t("allegro.export.previewConditionNew", {
        defaultValue: "New",
      }),
    },
    {
      name: props.t("allegro.export.quantity", {
        defaultValue: "Quantity",
      }),
      value: props.selection
        ? props.t("allegro.export.volumeOption", {
            defaultValue: "{{count}} pcs",
            count: props.selection.volume,
          })
        : "-",
    },
    {
      name: props.t("allegro.export.previewCategory", {
        defaultValue: "Category",
      }),
      value: product.category.name,
    },
    ...props.offer.mappings.slice(0, 6).map((mapping) => ({
      name: mapping.attributeName,
      value: mapping.valueLabel,
    })),
  ];

  const brandName = "shotPRINT";
  const sellerName = "KONFI";
  const cardBg = "white";
  const cardRadius = "xl";
  const cardShadow = "xs";

  return (
    <Box
      bg="gray.200"
      borderRadius="lg"
      maxW="100%"
      overflowX="hidden"
      overflowY="auto"
      w="full"
    >
      {props.onClose ? (
        <HStack justify="flex-end" px={4} py={2}>
          <Button size="sm" variant="ghost" onClick={() => props.onClose?.()}>
            <MaterialSymbol>close</MaterialSymbol>
            {props.t("common.close", { defaultValue: "Close" })}
          </Button>
        </HStack>
      ) : null}

      <Box maxW="1240px" minW={0} mx="auto" p={{ base: 3, md: 5 }} w="full">
        <Box
          display="grid"
          gap={4}
          gridTemplateColumns={{ base: "1fr", lg: "minmax(0, 1fr) 360px" }}
        >
          <VStack
            align="stretch"
            bg={cardBg}
            borderRadius={cardRadius}
            boxShadow={cardShadow}
            gap={4}
            minW={0}
            p={{ base: 4, md: 6 }}
          >
            <HStack gap={3} justify="space-between" wrap="wrap">
              <HStack color="fg.muted" fontSize="xs" gap={2}>
                <Text>
                  {props.t("allegro.export.previewBrandLabel", {
                    brand: brandName,
                    defaultValue: "Brand: {{brand}}",
                  })}
                </Text>
                <Text color="border">|</Text>
                <Text>
                  {props.t("allegro.export.previewConditionLabel", {
                    defaultValue: "Condition: New",
                  })}
                </Text>
              </HStack>
              <HStack color="#00a499" gap={3}>
                <MaterialSymbol>balance</MaterialSymbol>
                <MaterialSymbol>share</MaterialSymbol>
                <MaterialSymbol>favorite</MaterialSymbol>
              </HStack>
            </HStack>

            <Text
              fontSize={{ base: "xl", md: "2xl" }}
              fontWeight="bold"
              lineHeight="1.2"
              overflowWrap="anywhere"
            >
              {props.offer.title}
            </Text>

            <HStack color="fg.muted" fontSize="sm" gap={2} wrap="wrap">
              <Text color="fg" fontWeight="bold">
                {props.t("allegro.export.previewRating", {
                  defaultValue: "4.9",
                })}
              </Text>
              <HStack color="#ff9000" gap={0}>
                <MaterialSymbol>star</MaterialSymbol>
                <MaterialSymbol>star</MaterialSymbol>
                <MaterialSymbol>star</MaterialSymbol>
                <MaterialSymbol>star</MaterialSymbol>
                <MaterialSymbol>star</MaterialSymbol>
              </HStack>
              <Text color="#00a499" fontWeight="medium">
                {props.t("allegro.export.previewRatingCount", {
                  defaultValue: "123 ratings",
                })}
              </Text>
              <Box bg="border" h="12px" w="1px" />
              <Text>
                {props.t("allegro.export.previewBoughtRecently", {
                  defaultValue: "693 people bought recently",
                })}
              </Text>
            </HStack>

            <Text color="#00a499" fontSize="sm" fontWeight="medium">
              {props.t("allegro.export.previewProductCard", {
                defaultValue: "Product information card",
              })}
            </Text>

            <Box bg="white" borderRadius="md" minW={0} overflow="hidden">
              {mainImageUrl ? (
                <Image
                  alt={props.t("allegro.export.previewMainImageAlt", {
                    defaultValue: "{{title}} main image",
                    title: props.offer.title,
                  })}
                  height={640}
                  loading="lazy"
                  objectFit="contain"
                  ratio={1}
                  src={mainImageUrl}
                  transparentBackground
                  width={640}
                />
              ) : (
                <VStack
                  align="center"
                  aspectRatio={1}
                  bg="bg.subtle"
                  justify="center"
                  p={6}
                >
                  <MaterialSymbol>image</MaterialSymbol>
                  <Text color="fg.muted" fontSize="sm">
                    {props.t("allegro.export.previewNoImage", {
                      defaultValue: "No product image",
                    })}
                  </Text>
                </VStack>
              )}
            </Box>

            {imageUrls.length > 1 && (
              <HStack gap={2} overflowX="auto" pb={1}>
                {imageUrls.map((imageUrl, index) => (
                  <Box
                    borderWidth="2px"
                    borderColor={index === 0 ? "#ff5a00" : "#e0e0e0"}
                    borderRadius="md"
                    flexShrink={0}
                    key={imageUrl}
                    overflow="hidden"
                    w="68px"
                  >
                    <Image
                      alt={props.t("allegro.export.previewImageAlt", {
                        defaultValue: "{{title}} image {{number}}",
                        number: index + 1,
                        title: props.offer.title,
                      })}
                      height={64}
                      loading="lazy"
                      ratio={1}
                      src={imageUrl}
                      width={64}
                    />
                  </Box>
                ))}
              </HStack>
            )}
          </VStack>

          <VStack align="stretch" gap={4} minW={0}>
            <VStack
              align="stretch"
              alignSelf="start"
              bg={cardBg}
              borderRadius={cardRadius}
              boxShadow={cardShadow}
              gap={3}
              p={4}
              position={{ base: "static", lg: "sticky" }}
              top={4}
              w="full"
            >
              <HStack gap={2} justify="space-between">
                <VStack align="start" gap={0}>
                  <Text fontSize="sm" fontWeight="semibold">
                    {props.t("allegro.export.previewSellerFrom", {
                      defaultValue: "from {{seller}}",
                      seller: sellerName,
                    })}
                  </Text>
                  <HStack color="fg.muted" fontSize="xs" gap={2}>
                    <Badge colorPalette="gray" size="xs" variant="subtle">
                      {props.t("allegro.export.previewCompanyBadge", {
                        defaultValue: "Company",
                      })}
                    </Badge>
                    <Text color="#00a499" fontWeight="medium">
                      {props.t("allegro.export.previewRecommends", {
                        defaultValue: "recommends 98.9%",
                      })}
                    </Text>
                  </HStack>
                </VStack>
              </HStack>

              <HStack gap={2}>
                <Badge bg="#00a82d" color="white" px={2} py={1}>
                  {props.t("allegro.export.previewSuperPrice", {
                    defaultValue: "SUPER PRICE",
                  })}
                </Badge>
                <Badge bg="#00a82d" color="white" px={2} py={0.5}>
                  -50%
                </Badge>
                <Text color="fg.muted" fontSize="xs">
                  {props.t("allegro.export.previewDiscountInfo", {
                    defaultValue: "on the fifth item",
                  })}
                </Text>
              </HStack>

              <HStack align="baseline" gap={2}>
                <Text
                  color={props.selection?.priceError ? "orange.fg" : "fg"}
                  fontSize="3xl"
                  fontWeight="bold"
                  fontVariantNumeric="tabular-nums"
                  overflowWrap="anywhere"
                >
                  {priceLabel}
                </Text>
                <Badge bg="#1f2c5c" color="white" px={2} py={1}>
                  SMART!
                </Badge>
              </HStack>

              <Text color="fg.muted" fontSize="xs">
                {props.t("allegro.export.previewPayLater", {
                  defaultValue: "pay later — check options",
                })}
              </Text>

              <Text color="fg.muted" fontSize="xs">
                {props.t("allegro.export.previewBoughtThisOffer", {
                  defaultValue: "693 people bought this offer",
                })}
              </Text>

              {variantItems.length > 0 && (
                <Box borderTopWidth="1px" pt={3}>
                  <Text fontSize="sm" fontWeight="medium" mb={2}>
                    {props.t("allegro.export.previewVariants", {
                      defaultValue: "Product Variants",
                    })}
                  </Text>
                  <SimpleGrid columns={{ base: 4, md: 5 }} gap={2} minW={0}>
                    {variantItems.slice(0, 10).map((variant) => (
                      <Box
                        aspectRatio={1}
                        bg="bg.subtle"
                        borderWidth="2px"
                        borderColor={variant.active ? "#ff5a00" : "#e0e0e0"}
                        borderRadius="md"
                        key={variant.id}
                        overflow="hidden"
                        position="relative"
                        title={`${variant.label} · ${variant.price}`}
                      >
                        {mainImageUrl ? (
                          <Image
                            alt={variant.label}
                            height={64}
                            loading="lazy"
                            ratio={1}
                            src={mainImageUrl}
                            width={64}
                          />
                        ) : (
                          <VStack align="center" h="full" justify="center">
                            <MaterialSymbol>image</MaterialSymbol>
                          </VStack>
                        )}
                      </Box>
                    ))}
                  </SimpleGrid>
                </Box>
              )}

              {props.selection ? (
                <Box>
                  <Text fontSize="sm" mb={1}>
                    {props.t("allegro.export.quantity", {
                      defaultValue: "Quantity",
                    })}
                  </Text>
                  <Box
                    borderWidth="2px"
                    borderColor="#ff5a00"
                    borderRadius="md"
                    display="inline-block"
                    px={3}
                    py={1}
                  >
                    <Text fontSize="sm" fontWeight="medium">
                      {props.t("allegro.export.volumeOption", {
                        count: props.selection.volume,
                        defaultValue: "{{count}} pcs",
                      })}
                    </Text>
                  </Box>
                </Box>
              ) : null}

              <Box>
                <Text fontSize="sm" mb={1}>
                  {props.t("allegro.export.previewQuantityLabel", {
                    defaultValue: "Quantity",
                  })}
                </Text>
                <HStack gap={2}>
                  <Button size="sm" variant="outline">
                    -
                  </Button>
                  <Box
                    borderWidth="1px"
                    borderRadius="md"
                    minW="56px"
                    px={3}
                    py={1}
                    textAlign="center"
                  >
                    <Text fontWeight="semibold">1</Text>
                  </Box>
                  <Button size="sm" variant="outline">
                    +
                  </Button>
                  <Text color="fg.muted" fontSize="xs">
                    {props.t("allegro.export.previewStockHint", {
                      defaultValue: "of many in stock",
                    })}
                  </Text>
                </HStack>
              </Box>

              <VStack align="stretch" gap={2}>
                <Button bg="#ff5a00" color="white" size="lg" _hover={{}}>
                  {props.t("allegro.export.previewAddToCart", {
                    defaultValue: "Add To Cart",
                  })}
                </Button>
                <Button
                  borderColor="#ff5a00"
                  color="#ff5a00"
                  size="lg"
                  variant="outline"
                  _hover={{}}
                >
                  {props.t("allegro.export.previewBuyNow", {
                    defaultValue: "Buy Now",
                  })}
                </Button>
              </VStack>
            </VStack>

            <Box
              bg={cardBg}
              borderRadius={cardRadius}
              boxShadow={cardShadow}
              p={4}
            >
              <VStack align="stretch" gap={3}>
                <HStack align="start" gap={2}>
                  <MaterialSymbol color="gray.500">
                    local_shipping
                  </MaterialSymbol>
                  <VStack align="start" gap={0} minW={0}>
                    <Text fontSize="sm" fontWeight="medium">
                      {props.t("allegro.export.previewDeliveryTitle", {
                        defaultValue: "Delivery",
                      })}
                    </Text>
                    <Text color="fg.muted" fontSize="xs">
                      {props.t("allegro.export.previewDeliveryValue", {
                        count: previewHandlingTimeDays,
                        defaultValue:
                          "Courier delivery in {{count}} days ({{duration}})",
                        duration: previewHandlingTimeDuration,
                      })}
                    </Text>
                  </VStack>
                </HStack>
                <HStack align="start" gap={2}>
                  <MaterialSymbol color="gray.500">payments</MaterialSymbol>
                  <VStack align="start" gap={0} minW={0}>
                    <Text fontSize="sm" fontWeight="medium">
                      {props.t("allegro.export.previewPaymentTitle", {
                        defaultValue: "Payment",
                      })}
                    </Text>
                    <Text color="fg.muted" fontSize="xs">
                      {props.t("allegro.export.previewPaymentValue", {
                        defaultValue: "Online payment, invoice available",
                      })}
                    </Text>
                  </VStack>
                </HStack>
                <HStack align="start" gap={2}>
                  <MaterialSymbol color="gray.500">
                    verified_user
                  </MaterialSymbol>
                  <VStack align="start" gap={0} minW={0}>
                    <Text fontSize="sm" fontWeight="medium">
                      {props.t("allegro.export.previewGuaranteeTitle", {
                        defaultValue: "Purchase protection",
                      })}
                    </Text>
                    <Text color="fg.muted" fontSize="xs">
                      {props.t("allegro.export.previewGuaranteeValue", {
                        defaultValue:
                          "Preview only. Publishing is disabled until export is implemented.",
                      })}
                    </Text>
                  </VStack>
                </HStack>
              </VStack>
            </Box>
          </VStack>
        </Box>

        <Box
          bg={cardBg}
          borderRadius={cardRadius}
          boxShadow={cardShadow}
          mt={4}
          p={{ base: 4, md: 6 }}
        >
          <Text fontSize="lg" fontWeight="bold" mb={4}>
            {props.t("allegro.export.previewDescriptionHeading", {
              defaultValue: "Description",
            })}
          </Text>
          <VStack align="stretch" gap={3}>
            <AllegroDescriptionHtmlPreview html={descriptionHtml} t={props.t} />
            <Box bg="bg.subtle" borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                {props.t("allegro.export.previewConfigurationInfo", {
                  defaultValue: "Configuration Details",
                })}
              </Text>
              <VStack align="stretch" gap={2}>
                {props.offer.mappings.slice(0, 8).map((mapping) => (
                  <HStack align="start" gap={2} key={mapping.attributeId}>
                    <Badge
                      colorPalette={
                        mapping.parameterName ? "success" : "orange"
                      }
                      mt={0.5}
                    >
                      {mapping.parameterName
                        ? props.t("allegro.export.previewMapped", {
                            defaultValue: "Mapped",
                          })
                        : props.t("allegro.export.titleOnly", {
                            defaultValue: "Title/Description",
                          })}
                    </Badge>
                    <Text fontSize="sm" minW={0} overflowWrap="anywhere">
                      {mapping.attributeName}: {mapping.valueLabel}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </Box>
          </VStack>
        </Box>

        <Box
          bg={cardBg}
          borderRadius={cardRadius}
          boxShadow={cardShadow}
          mt={4}
          p={{ base: 4, md: 6 }}
        >
          <Text fontSize="lg" fontWeight="bold" mb={4}>
            {props.t("allegro.export.previewParameters", {
              defaultValue: "Parameters",
            })}
          </Text>
          <Table.Root size="md" variant="outline">
            <Table.Body>
              {parameterRows.map((row, index) => (
                <Table.Row
                  bg={index % 2 === 0 ? "bg.subtle" : "bg"}
                  key={row.name}
                >
                  <Table.Cell color="fg.muted" w="40%">
                    {row.name}
                  </Table.Cell>
                  <Table.Cell>{row.value}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </Box>
  );
};

const AllegroExportWizard = () => {
  const { t, i18n } = useT(["allegro", "translation"]);
  const { channel } = useChannels();
  const { attributes, loadingAttributes } = useConfiguration();
  const [categoryId, setCategoryId] = useState("");
  const [categoryParameters, setCategoryParameters] = useState<
    AllegroCategoryParameter[]
  >([]);
  const [manualParameterValues, setManualParameterValues] = useState<
    Record<string, string>
  >({});
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  const [categoryResults, setCategoryResults] = useState<
    AllegroCategorySuggestion[]
  >([]);
  const [loadingCategorySearch, setLoadingCategorySearch] = useState(false);
  const [loadingParameters, setLoadingParameters] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<AllegroCategorySuggestion | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [draftAttributes, setDraftAttributes] = useState<
    Record<string, string>
  >({});
  const [draftVolume, setDraftVolume] = useState("");
  const [draftPageCount, setDraftPageCount] = useState("");
  const [addingConfiguration, setAddingConfiguration] = useState(false);
  const [configuratorOpen, setConfiguratorOpen] = useState(false);
  const [loadingStoredOffers, setLoadingStoredOffers] = useState(false);
  const [savingStoredOffers, setSavingStoredOffers] = useState(false);
  const [publishingOffers, setPublishingOffers] = useState(false);
  const [publicationSettings, setPublicationSettings] =
    useState<AllegroPublicationSettings>(DEFAULT_ALLEGRO_PUBLICATION_SETTINGS);
  const [storedOffersLoadVersion, setStoredOffersLoadVersion] = useState(0);
  const refreshedStoredOffersVersionRef = useRef(0);
  const [selectedConfigurations, setSelectedConfigurations] = useState<
    ExportSelectionPreview[]
  >([]);
  const [generatingSafetyInformationIds, setGeneratingSafetyInformationIds] =
    useState<Set<string>>(() => new Set());

  const exportAttributes = useMemo(
    () =>
      selectedProduct
        ? getProductExportAttributes(selectedProduct, attributes)
        : [],
    [attributes, selectedProduct],
  );

  const volumeCollection = useMemo(
    () =>
      createListCollection({
        items: (selectedProduct?.volumes ?? []).map((volume) => ({
          label: t("allegro.export.volumeOption", {
            defaultValue: "{{count}} pcs",
            count: volume.value,
          }),
          value: String(volume.value),
        })),
      }),
    [selectedProduct?.volumes, t],
  );

  const buildPreviewOfferForSelection = useCallback(
    (selection: AllegroExportConfigurationSelection) => {
      if (!selectedProduct || !categoryId.trim()) return null;

      return buildAllegroExportPreviewOffer({
        attributes: exportAttributes,
        categoryId: categoryId.trim(),
        categoryParameters,
        formatPageCountLabel: (pageCount) =>
          t("allegro.export.pageCountTitleLabel", {
            defaultValue: "{{count}} pages",
            count: pageCount,
          }),
        formatCustomFormatLabel: (width, height) =>
          t("allegro.export.customFormatLabel", {
            defaultValue: "{{width}} x {{height}} mm",
            height,
            width,
          }),
        formatVolumeLabel: (volume) =>
          t("allegro.export.volumeOption", {
            defaultValue: "{{count}} pcs",
            count: volume,
          }),
        pageCountAttributeName: t("allegro.export.pageCount", {
          defaultValue: "Page Count",
        }),
        product: selectedProduct,
        selection,
      });
    },
    [categoryId, categoryParameters, exportAttributes, selectedProduct, t],
  );

  const previewOffers = useMemo<AllegroExportPreviewOffer[]>(() => {
    return selectedConfigurations.flatMap((selection) => {
      const offer = buildPreviewOfferForSelection(selection);
      return offer ? [offer] : [];
    });
  }, [buildPreviewOfferForSelection, selectedConfigurations]);

  useEffect(() => {
    setSelectedConfigurations([]);
  }, [selectedProduct?.id]);

  useEffect(() => {
    setSelectedConfigurations([]);
  }, [categoryId]);

  useEffect(() => {
    setManualParameterValues({});
  }, [categoryId]);

  useEffect(() => {
    if (!channel?.id) {
      setPublicationSettings(DEFAULT_ALLEGRO_PUBLICATION_SETTINGS);
      return;
    }

    let cancelled = false;
    void loadAllegroImportSettings(channel.id)
      .then((settings) => {
        if (cancelled) return;
        setPublicationSettings(
          normalizeAllegroPublicationSettings(settings?.publication),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load Allegro publication settings:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [channel?.id]);

  useEffect(() => {
    if (!selectedProduct) {
      setLoadingStoredOffers(false);
      return;
    }

    const trimmedCategoryId = categoryId.trim();
    if (!channel?.id || !trimmedCategoryId) {
      setLoadingStoredOffers(false);
      return;
    }

    let cancelled = false;
    setLoadingStoredOffers(true);
    void loadStoredAllegroExportOffers({
      categoryId: trimmedCategoryId,
      channelId: channel.id,
      productId: selectedProduct.id,
    })
      .then((offers) => {
        if (cancelled) return;
        setSelectedConfigurations(offers.map(restoreStoredOfferSelection));
        setStoredOffersLoadVersion((version) => version + 1);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load stored Allegro export offers:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("allegro.export.storedOffersLoadError", {
            defaultValue: "Failed to load saved Allegro offers.",
          }),
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingStoredOffers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, channel?.id, selectedProduct, t]);

  const persistOfferSelection = useCallback(
    async (selection: ExportSelectionPreview) => {
      const trimmedCategoryId = categoryId.trim();
      if (!channel?.id || !selectedProduct || !trimmedCategoryId) return;

      const previewOffer = buildPreviewOfferForSelection(selection);
      if (!previewOffer) return;

      setSavingStoredOffers(true);
      try {
        await saveStoredAllegroExportOffer({
          channelId: channel.id,
          input: {
            calculatedCombination: selection.calculatedCombination,
            categoryId: trimmedCategoryId,
            categoryParametersLoaded: categoryParameters.length > 0,
            combination: selection.combination,
            combinationDescription: selection.combinationDescription,
            formattedPrice: selection.formattedPrice,
            priceAmountMinor: selection.priceAmountMinor,
            priceError: selection.priceError,
            product: selectedProduct,
            publicationStatus: selection.publicationStatus,
            previewOffer,
            selectedCategory,
            selection,
            status: selection.allegroOfferId ? "published" : "draft",
          },
        });
      } catch (error) {
        console.error("Failed to save stored Allegro export offer:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("allegro.export.storedOffersSaveError", {
            defaultValue: "Failed to save Allegro offer.",
          }),
        });
      } finally {
        setSavingStoredOffers(false);
      }
    },
    [
      buildPreviewOfferForSelection,
      categoryId,
      categoryParameters,
      channel?.id,
      selectedCategory,
      selectedProduct,
      t,
    ],
  );

  const handleSafetyInformationChange = useCallback(
    (configurationId: string, value: string) => {
      setSelectedConfigurations((current) =>
        current.map((configuration) =>
          configuration.id === configurationId
            ? {
                ...configuration,
                gpsrSafetyInformationDescription: value,
              }
            : configuration,
        ),
      );
    },
    [],
  );

  const handleOfferDescriptionChange = useCallback(
    (configurationId: string, value: string) => {
      setSelectedConfigurations((current) =>
        current.map((configuration) =>
          configuration.id === configurationId
            ? {
                ...configuration,
                allegroDescriptionEditedAt: new Date().toISOString(),
                allegroDescriptionHtml: value,
              }
            : configuration,
        ),
      );
    },
    [],
  );

  const handleDeliveryTimeChange = useCallback(
    (configurationId: string, value: string) => {
      const days = Number(value);
      const duration = toAllegroHandlingTimeDuration(days);

      setSelectedConfigurations((current) =>
        current.map((configuration) =>
          configuration.id === configurationId
            ? {
                ...configuration,
                allegroHandlingTime: duration,
                allegroHandlingTimeDays: duration ? days : null,
              }
            : configuration,
        ),
      );
    },
    [],
  );

  const handleOfferDescriptionBlur = useCallback(
    (configurationId: string) => {
      const selection = selectedConfigurations.find(
        (configuration) => configuration.id === configurationId,
      );
      if (selection) void persistOfferSelection(selection);
    },
    [persistOfferSelection, selectedConfigurations],
  );

  const handleDeliveryTimeBlur = useCallback(
    (configurationId: string) => {
      const selection = selectedConfigurations.find(
        (configuration) => configuration.id === configurationId,
      );
      if (selection) void persistOfferSelection(selection);
    },
    [persistOfferSelection, selectedConfigurations],
  );

  const handleSafetyInformationBlur = useCallback(
    (configurationId: string) => {
      const selection = selectedConfigurations.find(
        (configuration) => configuration.id === configurationId,
      );
      if (selection) void persistOfferSelection(selection);
    },
    [persistOfferSelection, selectedConfigurations],
  );

  const handleGenerateSafetyInformation = useCallback(
    async (configurationId: string) => {
      const selection = selectedConfigurations.find(
        (configuration) => configuration.id === configurationId,
      );
      const offer = previewOffers.find(
        (previewOffer) => previewOffer.configurationId === configurationId,
      );
      if (!selectedProduct || !selection || !offer) return;

      const mappedParameterIds = new Set(
        offer.mappings.flatMap((mapping) =>
          mapping.status === "mapped" && mapping.parameterId
            ? [mapping.parameterId]
            : [],
        ),
      );
      const manualParameters = buildManualParameterValues({
        categoryParameters,
        mappedParameterIds,
        values: manualParameterValues,
      });

      setGeneratingSafetyInformationIds((current) => {
        const next = new Set(current);
        next.add(configurationId);
        return next;
      });
      try {
        const result = await generateAllegroGpsrSafetyInformation({
          category: {
            id: categoryId.trim(),
            name: selectedCategory?.name,
            path: selectedCategory?.path,
          },
          configurationDescription: selection.combinationDescription,
          locale: i18n.resolvedLanguage ?? "pl",
          manualParameters: manualParameters.map((parameter) => ({
            name: parameter.parameterName,
            value: parameter.valueLabel,
          })),
          offerTitle: offer.title,
          parameters: offer.mappings.map((mapping) => ({
            name: mapping.parameterName ?? mapping.attributeName,
            value: mapping.valueLabel,
          })),
          product: {
            categoryName: selectedProduct.category?.name,
            description: getProductDescriptionPreview(selectedProduct),
            keywords: selectedProduct.keywords ?? [],
            name: selectedProduct.name,
            productTypeName: selectedProduct.productType?.name,
          },
          quantity: selection.volume,
        });
        const updatedSelection: ExportSelectionPreview = {
          ...selection,
          gpsrSafetyInformationDescription: result.safetyInformationDescription,
          gpsrSafetyInformationGeneratedAt: new Date().toISOString(),
          gpsrSafetyInformationSourceSummary: result.sourceSummary,
        };
        setSelectedConfigurations((current) =>
          current.map((configuration) =>
            configuration.id === configurationId
              ? updatedSelection
              : configuration,
          ),
        );
        void persistOfferSelection(updatedSelection);
        toaster.success({
          title: t("allegro.export.gpsrGenerateSuccessTitle", {
            defaultValue: "GPSR draft generated",
          }),
          description: t("allegro.export.gpsrGenerateSuccessDescription", {
            defaultValue:
              "Review the generated safety information before publishing.",
          }),
        });
      } catch (error) {
        console.error("Failed to generate Allegro GPSR information:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("allegro.export.gpsrGenerateErrorDescription", {
            defaultValue: "Failed to generate GPSR safety information.",
          }),
        });
      } finally {
        setGeneratingSafetyInformationIds((current) => {
          const next = new Set(current);
          next.delete(configurationId);
          return next;
        });
      }
    },
    [
      categoryId,
      categoryParameters,
      i18n.resolvedLanguage,
      manualParameterValues,
      persistOfferSelection,
      previewOffers,
      selectedCategory,
      selectedConfigurations,
      selectedProduct,
      t,
    ],
  );

  useEffect(() => {
    if (!selectedProduct) {
      setDraftAttributes({});
      setDraftVolume("");
      setDraftPageCount("");
      return;
    }

    setDraftAttributes(buildInitialAttributeOptions(exportAttributes));
    setDraftVolume(String(selectedProduct.volumes[0]?.value ?? ""));
    setDraftPageCount(
      selectedProduct.pageCount?.enabled
        ? String(selectedProduct.pageCount.minimum)
        : "",
    );
  }, [exportAttributes, selectedProduct]);

  const loadParametersForCategory = useCallback(
    async (value: string) => {
      const trimmedCategoryId = value.trim();
      if (!trimmedCategoryId) {
        toaster.warning({
          title: t("allegro.export.categoryRequiredTitle", {
            defaultValue: "Category Required",
          }),
          description: t("allegro.export.categoryRequiredDescription", {
            defaultValue:
              "Enter an Allegro category ID before loading parameters.",
          }),
        });
        return;
      }

      setLoadingParameters(true);
      try {
        const response = await fetch(
          `/api/allegro/category-parameters?categoryId=${encodeURIComponent(trimmedCategoryId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Failed to load category parameters");

        const payload: unknown = await response.json();
        if (!isAllegroCategoryParametersResponse(payload)) {
          throw new Error("Invalid category parameters response");
        }

        setCategoryParameters(payload.parameters);
        setManualParameterValues({});
      } catch (error) {
        console.error("Failed to load Allegro category parameters:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("allegro.export.categoryLoadError", {
            defaultValue: "Failed to load Allegro category parameters.",
          }),
        });
      } finally {
        setLoadingParameters(false);
      }
    },
    [t],
  );

  const handleCategoryIdChange = useCallback((value: string) => {
    setCategoryId(value);
    setSelectedCategory(null);
    setCategoryParameters([]);
    setManualParameterValues({});
    setSelectedConfigurations([]);
  }, []);

  const handleManualParameterValueChange = useCallback(
    (parameterId: string, value: string) => {
      setManualParameterValues((current) => ({
        ...current,
        [parameterId]: value,
      }));
    },
    [],
  );

  const handleLoadParameters = useCallback(async () => {
    await loadParametersForCategory(categoryId);
  }, [categoryId, loadParametersForCategory]);

  const handleSearchCategories = useCallback(async () => {
    const trimmedTerm = categorySearchTerm.trim();
    if (trimmedTerm.length < 2) {
      toaster.warning({
        title: t("allegro.export.categorySearchTooShortTitle", {
          defaultValue: "Search Term Too Short",
        }),
        description: t("allegro.export.categorySearchTooShortDescription", {
          defaultValue:
            "Type at least 2 characters to search Allegro categories.",
        }),
      });
      return;
    }

    setLoadingCategorySearch(true);
    try {
      const response = await fetch(
        `/api/allegro/categories?query=${encodeURIComponent(trimmedTerm)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Failed to search Allegro categories");

      const payload: unknown = await response.json();
      if (!isAllegroCategorySearchResponse(payload)) {
        throw new Error("Invalid category search response");
      }

      setCategoryResults(payload.categories);
    } catch (error) {
      console.error("Failed to search Allegro categories:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.export.categorySearchError", {
          defaultValue: "Failed to search Allegro categories.",
        }),
      });
    } finally {
      setLoadingCategorySearch(false);
    }
  }, [categorySearchTerm, t]);

  const handleSelectCategory = useCallback(
    (category: AllegroCategorySuggestion) => {
      setSelectedCategory(category);
      setCategoryId(category.id);
      setCategoryParameters([]);
      setSelectedConfigurations([]);
      void loadParametersForCategory(category.id);
    },
    [loadParametersForCategory],
  );

  const calculatePricePreview = useCallback(
    async (
      product: Product,
      selection: AllegroExportConfigurationSelection,
      calculatedCombination: string,
    ): Promise<{
      formattedPrice?: string;
      priceAmountMinor?: number;
      priceError?: string;
    }> => {
      if (!channel) {
        return {
          priceError: t("allegro.export.noChannelPriceError", {
            defaultValue: "No channel selected.",
          }),
        };
      }

      try {
        const [prices, pageCountStepPrices] = await Promise.all([
          loadBasePrices({
            calculatedCombination,
            channelId: channel.id,
            pageCount: selection.pageCount,
            product,
            selectedAttributeOptions: selection.selectedAttributeOptions,
            volume: selection.volume,
          }),
          loadPageCountStepPrices({
            calculatedCombination,
            channelId: channel.id,
            pageCount: selection.pageCount,
            product,
          }),
        ]);

        if (!prices?.length) {
          return {
            priceError: t("allegro.export.priceUnavailable", {
              defaultValue: "Price unavailable for this configuration.",
            }),
          };
        }

        const pageCountConfig = product.pageCount?.enabled
          ? {
              ...product.pageCount,
              pricing: {
                ...product.pageCount.pricing,
                stepPrices:
                  pageCountStepPrices ?? product.pageCount.pricing?.stepPrices,
              },
            }
          : null;
        const result = calculateConfiguredProductPrice({
          calculatedCombination,
          customFormat: false,
          lng: i18n.resolvedLanguage,
          minimumOrder: product.spec.minimumOrder,
          pageCount: selection.pageCount,
          pageCountConfig,
          priceType: product.priceType,
          prices,
          quantity: selection.volume,
          volume: selection.volume,
        });

        if ("error" in result || typeof result.result !== "number") {
          return {
            priceError: t("allegro.export.priceUnavailable", {
              defaultValue: "Price unavailable for this configuration.",
            }),
          };
        }

        return {
          formattedPrice: formatPrice(
            result.result,
            product.defaultPrice?.currency,
            undefined,
            undefined,
            i18n.resolvedLanguage,
          ),
          priceAmountMinor: result.result,
        };
      } catch (error) {
        console.error(
          "Failed to calculate Allegro export price preview:",
          error,
        );
        return {
          priceError: t("allegro.export.priceCalculationError", {
            defaultValue: "Failed to calculate price.",
          }),
        };
      }
    },
    [channel, i18n.resolvedLanguage, t],
  );

  useEffect(() => {
    if (
      storedOffersLoadVersion === 0 ||
      refreshedStoredOffersVersionRef.current === storedOffersLoadVersion ||
      !selectedProduct ||
      selectedConfigurations.length === 0
    ) {
      return;
    }

    let cancelled = false;
    refreshedStoredOffersVersionRef.current = storedOffersLoadVersion;

    void Promise.all(
      selectedConfigurations.map(async (configuration) => {
        const pricePreview = await calculatePricePreview(
          selectedProduct,
          configuration,
          configuration.calculatedCombination,
        );

        return { ...configuration, ...pricePreview };
      }),
    ).then((refreshedConfigurations) => {
      if (cancelled) return;
      setSelectedConfigurations(refreshedConfigurations);
      for (const configuration of refreshedConfigurations) {
        void persistOfferSelection(configuration);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    calculatePricePreview,
    persistOfferSelection,
    selectedConfigurations,
    selectedProduct,
    storedOffersLoadVersion,
  ]);

  const addOfferSelection = useCallback(
    async (options: {
      calculatedCombination: string;
      combination: string;
      combinationDescription: string;
      pricePreview?: {
        formattedPrice?: string;
        priceAmountMinor?: number;
        priceError?: string;
      };
      selection: Omit<AllegroExportConfigurationSelection, "id">;
    }) => {
      if (!selectedProduct) return;

      const selectionId = buildAllegroExportSelectionId(options.selection);
      if (
        selectedConfigurations.some(
          (configuration) => configuration.id === selectionId,
        )
      ) {
        toaster.info({
          title: t("allegro.export.duplicateConfigurationTitle", {
            defaultValue: "Configuration Already Added",
          }),
          description: t("allegro.export.duplicateConfigurationDescription", {
            defaultValue: "This exact configuration is already in the preview.",
          }),
        });
        return;
      }

      const basePendingConfiguration: ExportSelectionPreview = {
        ...options.selection,
        ...options.pricePreview,
        calculatedCombination: options.calculatedCombination,
        combination: options.combination,
        combinationDescription: options.combinationDescription,
        id: selectionId,
      };
      const pendingPreviewOffer = buildPreviewOfferForSelection(
        basePendingConfiguration,
      );
      const pendingConfiguration: ExportSelectionPreview = {
        ...basePendingConfiguration,
        ...(pendingPreviewOffer
          ? {
              allegroDescriptionHtml: buildSelectionDescriptionHtml({
                offer: pendingPreviewOffer,
                product: selectedProduct,
                selection: basePendingConfiguration,
                t,
              }),
            }
          : {}),
      };

      setSelectedConfigurations((current) => [
        ...current,
        pendingConfiguration,
      ]);

      if (options.pricePreview) {
        void persistOfferSelection(pendingConfiguration);
        return;
      }

      setAddingConfiguration(true);
      try {
        const pricePreview = await calculatePricePreview(
          selectedProduct,
          pendingConfiguration,
          options.calculatedCombination,
        );
        const refreshedConfiguration = {
          ...pendingConfiguration,
          ...pricePreview,
        };
        setSelectedConfigurations((current) =>
          current.map((configuration) =>
            configuration.id === selectionId
              ? refreshedConfiguration
              : configuration,
          ),
        );
        void persistOfferSelection(refreshedConfiguration);
      } finally {
        setAddingConfiguration(false);
      }
    },
    [
      buildPreviewOfferForSelection,
      calculatePricePreview,
      persistOfferSelection,
      selectedConfigurations,
      selectedProduct,
      t,
    ],
  );

  const handleOpenConfigurator = useCallback(() => {
    if (!selectedProduct) return;

    if (!categoryId.trim()) {
      toaster.warning({
        title: t("allegro.export.categoryRequiredTitle", {
          defaultValue: "Category Required",
        }),
        description: t("allegro.export.categoryRequiredDescription", {
          defaultValue:
            "Choose an Allegro category before adding a configuration.",
        }),
      });
      return;
    }

    setConfiguratorOpen(true);
  }, [categoryId, selectedProduct, t]);

  const handleAddConfiguratorConfiguration = useCallback(
    (payload: CombinationInputSaveOverridePayload) => {
      const { configuration, product, totalPrice } = payload;

      const selectedAttributeOptions = Object.fromEntries(
        Object.entries(configuration.selectedAttributeOptions ?? {}).flatMap(
          ([key, value]) =>
            key === "volume" || value === undefined || value === null
              ? []
              : [[key, String(value)]],
        ),
      );
      const volume =
        typeof configuration.volume === "number" &&
        Number.isFinite(configuration.volume)
          ? configuration.volume
          : configuration.quantity;
      const selection = {
        customFormat: configuration.customFormat,
        height: configuration.height,
        pageCount:
          typeof configuration.pageCount === "number"
            ? configuration.pageCount
            : null,
        selectedAttributeOptions,
        volume,
        width: configuration.width,
      };

      setDraftAttributes(selectedAttributeOptions);
      setDraftVolume(String(volume));
      setDraftPageCount(
        typeof selection.pageCount === "number"
          ? String(selection.pageCount)
          : "",
      );
      void addOfferSelection({
        calculatedCombination:
          configuration.calculatedCombination ?? DEFAULT_COMBINATION,
        combination: configuration.combination ?? "",
        combinationDescription: configuration.descriptionCombination ?? "",
        pricePreview:
          typeof totalPrice === "number"
            ? {
                formattedPrice: formatPrice(
                  totalPrice,
                  product.defaultPrice?.currency,
                  undefined,
                  undefined,
                  i18n.resolvedLanguage,
                ),
                priceAmountMinor: totalPrice,
              }
            : undefined,
        selection,
      });
      setConfiguratorOpen(false);
    },
    [addOfferSelection, i18n.resolvedLanguage],
  );

  const handleAddConfiguration = useCallback(async () => {
    if (!selectedProduct) return;

    if (!categoryId.trim()) {
      toaster.warning({
        title: t("allegro.export.categoryRequiredTitle", {
          defaultValue: "Category Required",
        }),
        description: t("allegro.export.categoryRequiredDescription", {
          defaultValue:
            "Choose an Allegro category before adding a configuration.",
        }),
      });
      return;
    }

    const volume = Number(draftVolume);
    if (!Number.isFinite(volume) || volume <= 0) {
      toaster.warning({
        title: t("allegro.export.volumeRequiredTitle", {
          defaultValue: "Quantity Required",
        }),
        description: t("allegro.export.volumeRequiredDescription", {
          defaultValue: "Choose a quantity before adding the configuration.",
        }),
      });
      return;
    }

    const pageCount = (() => {
      if (!selectedProduct.pageCount?.enabled) return null;

      const parsedPageCount = Number(draftPageCount);
      if (!Number.isFinite(parsedPageCount) || parsedPageCount <= 0) {
        toaster.warning({
          title: t("allegro.export.pageCountRequiredTitle", {
            defaultValue: "Page Count Required",
          }),
          description: t("allegro.export.pageCountRequiredDescription", {
            defaultValue: "Enter a page count for this export configuration.",
          }),
        });
        return undefined;
      }

      return parsedPageCount;
    })();
    if (typeof pageCount === "undefined") return;
    if (typeof pageCount === "number" && selectedProduct.pageCount?.enabled) {
      const pageCountConfig = selectedProduct.pageCount;
      const isValidStep =
        pageCountConfig.step <= 0 ||
        (pageCount - pageCountConfig.minimum) % pageCountConfig.step === 0;
      if (
        !Number.isInteger(pageCount) ||
        pageCount < pageCountConfig.minimum ||
        pageCount > pageCountConfig.maximum ||
        !isValidStep
      ) {
        toaster.warning({
          title: t("allegro.export.pageCountInvalidTitle", {
            defaultValue: "Invalid Page Count",
          }),
          description: t("allegro.export.pageCountInvalidDescription", {
            defaultValue:
              "Enter a page count between {{minimum}} and {{maximum}} using step {{step}}.",
            maximum: pageCountConfig.maximum,
            minimum: pageCountConfig.minimum,
            step: pageCountConfig.step,
          }),
        });
        return;
      }
    }

    const [
      combination,
      calculatedCombination,
      combinationDescription,
      selectedAttributeOptions,
    ] = getCombination(
      exportAttributes,
      exportAttributes.map((attribute) => draftAttributes[attribute.id] ?? ""),
      null,
      selectedProduct.attributeDependencies,
      true,
    );
    const selection = {
      pageCount,
      selectedAttributeOptions: Object.fromEntries(
        Object.entries(selectedAttributeOptions).flatMap(([key, value]) =>
          typeof value === "string" ? [[key, value]] : [],
        ),
      ),
      volume,
    };
    await addOfferSelection({
      calculatedCombination,
      combination,
      combinationDescription,
      selection,
    });
  }, [
    addOfferSelection,
    categoryId,
    draftAttributes,
    draftPageCount,
    draftVolume,
    exportAttributes,
    selectedProduct,
    t,
  ]);

  const handlePublishOffers = useCallback(async () => {
    const trimmedCategoryId = categoryId.trim();
    if (!selectedProduct || !trimmedCategoryId) return;

    const offersToPublish = previewOffers.flatMap((offer) => {
      const selection = selectedConfigurations.find(
        (configuration) => configuration.id === offer.configurationId,
      );
      return selection ? [{ offer, selection }] : [];
    });

    if (!publicationSettings.enabled) {
      toaster.warning({
        title: t("allegro.export.publishDisabledTitle", {
          defaultValue: "Publication Disabled",
        }),
        description: t("allegro.export.publishDisabledDescription", {
          defaultValue:
            "Enable Allegro offer publication in Allegro settings before publishing.",
        }),
      });
      return;
    }

    if (!publicationSettings.responsibleProducerId.trim()) {
      toaster.warning({
        title: t("allegro.export.publishMissingGpsrTitle", {
          defaultValue: "GPSR Settings Required",
        }),
        description: t("allegro.export.publishMissingProducerDescription", {
          defaultValue:
            "Select a responsible producer in Allegro settings before publishing.",
        }),
      });
      return;
    }

    const missingSafetyInformationOffer = offersToPublish.find(
      ({ selection }) => !selection.gpsrSafetyInformationDescription?.trim(),
    );
    if (missingSafetyInformationOffer) {
      toaster.warning({
        title: t("allegro.export.publishMissingGpsrTitle", {
          defaultValue: "GPSR Settings Required",
        }),
        description: t("allegro.export.publishMissingSafetyDescription", {
          defaultValue:
            "Fill or generate GPSR safety information for every offer before publishing.",
        }),
      });
      return;
    }

    const missingPriceOffer = offersToPublish.find(
      ({ selection }) => typeof selection.priceAmountMinor !== "number",
    );
    if (missingPriceOffer) {
      toaster.warning({
        title: t("allegro.export.publishMissingPriceTitle", {
          defaultValue: "Price Required",
        }),
        description: t("allegro.export.publishMissingPriceDescription", {
          defaultValue:
            "Resolve the price preview before publishing this offer.",
        }),
      });
      return;
    }

    const missingRequiredParameter = categoryParameters.find((parameter) => {
      if (!parameter.required) return false;
      const isMappedForEveryOffer =
        offersToPublish.length > 0 &&
        offersToPublish.every(({ offer }) =>
          offer.mappings.some(
            (mapping) =>
              mapping.status === "mapped" &&
              mapping.parameterId === parameter.id,
          ),
        );
      if (isMappedForEveryOffer) return false;

      return !manualParameterValues[parameter.id]?.trim();
    });
    if (missingRequiredParameter) {
      toaster.warning({
        title: t("allegro.export.publishMissingParameterTitle", {
          defaultValue: "Required Parameter Missing",
        }),
        description: t("allegro.export.publishMissingParameterDescription", {
          defaultValue:
            "Fill in required Allegro parameter: {{parameterName}}.",
          parameterName: missingRequiredParameter.name,
        }),
      });
      return;
    }

    setPublishingOffers(true);
    try {
      const publishedConfigurations: ExportSelectionPreview[] = [];

      for (const { offer, selection } of offersToPublish) {
        const mappedParameterIds = new Set(
          offer.mappings.flatMap((mapping) =>
            mapping.status === "mapped" && mapping.parameterId
              ? [mapping.parameterId]
              : [],
          ),
        );
        const manualParameters = buildManualParameterValues({
          categoryParameters,
          mappedParameterIds,
          values: manualParameterValues,
        });
        const defaultDescriptionHtml = buildSelectionDescriptionHtml({
          manualParameters,
          offer,
          product: selectedProduct,
          selection,
          t,
        });
        const currentDescriptionHtml = getCurrentDescriptionHtml({
          defaultDescriptionHtml,
          selection,
        });
        const descriptionHtml = currentDescriptionHtml.trim()
          ? currentDescriptionHtml
          : defaultDescriptionHtml;
        const response = await fetch("/api/allegro/product-offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPublishOfferRequest({
              categoryId: trimmedCategoryId,
              channelId: channel?.id,
              descriptionHtml,
              manualParameters,
              offer,
              product: selectedProduct,
              publicationSettings,
              selection,
            }),
          ),
        });
        const payload: unknown = await response.json();

        if (!response.ok || !isPublishOfferResponse(payload)) {
          throw new Error(
            isPublishOfferResponse(payload) && payload.offerId
              ? payload.offerId
              : "Failed to publish Allegro offer",
          );
        }

        const updatedSelection: ExportSelectionPreview = {
          ...selection,
          allegroOfferId: payload.offerId ?? selection.allegroOfferId,
          publicationStatus:
            payload.publicationStatus ??
            selection.publicationStatus ??
            "ACTIVE",
        };
        publishedConfigurations.push(updatedSelection);
      }

      setSelectedConfigurations((current) =>
        current.map(
          (configuration) =>
            publishedConfigurations.find(
              (published) => published.id === configuration.id,
            ) ?? configuration,
        ),
      );
      for (const configuration of publishedConfigurations) {
        void persistOfferSelection(configuration);
      }

      toaster.success({
        title: t("allegro.export.publishSuccessTitle", {
          defaultValue: "Offers Published",
        }),
        description: t("allegro.export.publishSuccessDescription", {
          count: publishedConfigurations.length,
          defaultValue:
            "{{count}} Allegro offer was published or updated successfully.",
        }),
      });
    } catch (error) {
      console.error("Failed to publish Allegro offers:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.export.publishErrorDescription", {
          defaultValue:
            "Allegro rejected the publication request. Check seller settings and required category parameters.",
        }),
      });
    } finally {
      setPublishingOffers(false);
    }
  }, [
    categoryId,
    categoryParameters,
    channel?.id,
    manualParameterValues,
    persistOfferSelection,
    publicationSettings,
    previewOffers,
    selectedConfigurations,
    selectedProduct,
    t,
  ]);

  const handleRemoveConfiguration = useCallback(
    (configurationId: string) => {
      setSelectedConfigurations((current) =>
        current.filter((configuration) => configuration.id !== configurationId),
      );

      const trimmedCategoryId = categoryId.trim();
      if (!channel?.id || !selectedProduct || !trimmedCategoryId) return;

      const offerId = buildAllegroExportStoredOfferId({
        categoryId: trimmedCategoryId,
        productId: selectedProduct.id,
        selectionId: configurationId,
      });

      setSavingStoredOffers(true);
      void deleteStoredAllegroExportOffer({
        channelId: channel.id,
        offerId,
      })
        .catch((error) => {
          console.error("Failed to delete stored Allegro export offer:", error);
          toaster.error({
            title: t("common.error", { defaultValue: "Error" }),
            description: t("allegro.export.storedOffersDeleteError", {
              defaultValue: "Failed to remove saved Allegro offer.",
            }),
          });
        })
        .finally(() => setSavingStoredOffers(false));
    },
    [categoryId, channel?.id, selectedProduct, t],
  );

  const unresolvedCount = previewOffers.reduce(
    (count, offer) =>
      count +
      offer.mappings.filter(
        (mapping) => mapping.status === "title_description_only",
      ).length,
    0,
  );

  return (
    <VStack align="stretch" gap={6}>
      <Alert.Root status="info">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t("allegro.export.title", {
              defaultValue: "Product Export",
            })}
          </Alert.Title>
          <Alert.Description>
            {t("allegro.export.description", {
              defaultValue:
                "Build curated Allegro offers from exact Konfi configurations, then publish them to the connected Allegro account.",
            })}
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={6}>
        <ProductPicker
          lng={i18n.resolvedLanguage as Locale}
          selectedProduct={selectedProduct}
          setSelectedProduct={setSelectedProduct}
          t={t}
        />
        <CategoryPanel
          categoryId={categoryId}
          categoryParameters={categoryParameters}
          categoryResults={categoryResults}
          categorySearchTerm={categorySearchTerm}
          loadingCategorySearch={loadingCategorySearch}
          loadingParameters={loadingParameters}
          manualParameterValues={manualParameterValues}
          offerCount={previewOffers.length}
          parameterCount={categoryParameters.length}
          selectedCategory={selectedCategory}
          setCategoryId={handleCategoryIdChange}
          setCategorySearchTerm={setCategorySearchTerm}
          setManualParameterValue={handleManualParameterValueChange}
          t={t}
          unresolvedCount={unresolvedCount}
          onLoadParameters={handleLoadParameters}
          onSearchCategories={handleSearchCategories}
          onSelectCategory={handleSelectCategory}
        />
      </SimpleGrid>

      <ConfigurationPanel
        addingConfiguration={addingConfiguration}
        draftAttributes={draftAttributes}
        draftPageCount={draftPageCount}
        draftVolume={draftVolume}
        exportAttributes={exportAttributes}
        loadingAttributes={loadingAttributes}
        selectedProduct={selectedProduct}
        setDraftAttributes={setDraftAttributes}
        setDraftPageCount={setDraftPageCount}
        setDraftVolume={setDraftVolume}
        t={t}
        volumeCollection={volumeCollection}
        onAddConfiguration={handleAddConfiguration}
        onOpenConfigurator={handleOpenConfigurator}
      />

      <Dialog.Root
        open={configuratorOpen}
        size="full"
        lazyMount
        unmountOnExit
        onOpenChange={(details) => setConfiguratorOpen(details.open)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner maxW="100vw" overflowX="hidden">
            <Dialog.Content maxW="100vw" overflowX="hidden">
              <Dialog.Body
                bgColor={{ base: "white", _dark: "black" }}
                overflowX="hidden"
              >
                <Container maxW="7xl" minW={0} py={8} w="full">
                  <Dialog.CloseTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <MaterialSymbol>close</MaterialSymbol>
                      {t("common.close", { defaultValue: "Close" })}
                    </Button>
                  </Dialog.CloseTrigger>
                  {selectedProduct ? (
                    <AllegroOfferConfigurator
                      product={selectedProduct}
                      t={t}
                      onSaveConfiguration={handleAddConfiguratorConfiguration}
                    />
                  ) : (
                    <Skeleton borderRadius="3xl" height="60vh" />
                  )}
                </Container>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <PreviewPanel
        channelId={channel?.id}
        defaultHandlingTime={publicationSettings.handlingTime}
        generatingSafetyInformationIds={generatingSafetyInformationIds}
        loadingStoredOffers={loadingStoredOffers}
        savingStoredOffers={savingStoredOffers}
        publishingOffers={publishingOffers}
        previewOffers={previewOffers}
        selectedConfigurations={selectedConfigurations}
        selectedProduct={selectedProduct}
        t={t}
        onDeliveryTimeBlur={handleDeliveryTimeBlur}
        onDeliveryTimeChange={handleDeliveryTimeChange}
        onGenerateSafetyInformation={handleGenerateSafetyInformation}
        onOfferDescriptionBlur={handleOfferDescriptionBlur}
        onOfferDescriptionChange={handleOfferDescriptionChange}
        onPublishOffers={handlePublishOffers}
        onRemoveConfiguration={handleRemoveConfiguration}
        onSafetyInformationBlur={handleSafetyInformationBlur}
        onSafetyInformationChange={handleSafetyInformationChange}
      />
    </VStack>
  );
};

export default AllegroExportWizard;
