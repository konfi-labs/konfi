import { Attribute, Product } from "@konfi/types";
import { orderAttributeOptions } from "@konfi/utils";

export interface AllegroCategoryParameter {
  dictionary?: Array<{
    id: string;
    value: string;
  }>;
  id: string;
  name: string;
  options?: {
    describesProduct?: boolean | null;
  };
  required?: boolean;
  restrictions?: Record<string, unknown>;
  type?: string;
}

export interface AllegroCategoryParametersResponse {
  parameters: AllegroCategoryParameter[];
}

export interface AllegroCategorySuggestion {
  id: string;
  name: string;
  path: string[];
}

export interface AllegroCategorySearchResponse {
  categories: AllegroCategorySuggestion[];
}

export interface AllegroExportConfigurationSelection {
  allegroOfferId?: string | null;
  allegroDescriptionEditedAt?: string;
  allegroDescriptionHtml?: string;
  allegroHandlingTime?: string;
  allegroHandlingTimeDays?: number | null;
  customFormat?: boolean;
  height?: number | null;
  gpsrSafetyInformationDescription?: string;
  gpsrSafetyInformationGeneratedAt?: string;
  gpsrSafetyInformationSourceSummary?: string;
  id: string;
  pageCount?: number | null;
  publicationStatus?: string | null;
  selectedAttributeOptions: Record<string, string>;
  volume: number;
  width?: number | null;
}

export type AllegroExportMappingStatus = "mapped" | "title_description_only";

export interface AllegroExportParameterMapping {
  attributeId: string;
  attributeName: string;
  describesProduct?: boolean;
  parameterId?: string;
  parameterName?: string;
  status: AllegroExportMappingStatus;
  valueId?: string;
  valueLabel: string;
}

export interface AllegroExportPreviewOffer {
  configurationId: string;
  fingerprint: string;
  mappings: AllegroExportParameterMapping[];
  title: string;
  warnings: string[];
}

const TITLE_LIMIT = 75;
const PAGE_COUNT_MAPPING_ATTRIBUTE_ID = "product-page-count";
const VOLUME_MAPPING_ATTRIBUTE_ID = "product-volume";
const PAGE_COUNT_PARAMETER_CANDIDATES = [
  "Page Count",
  "Number of Pages",
  "Pages",
  "Liczba stron",
  "Strony",
];
const VOLUME_PARAMETER_CANDIDATES = [
  "Liczba sztuk w ofercie",
  "Quantity",
  "Volume",
  "Naklad",
  "Nakład",
];

function normalizeMatchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMatchingParameter(
  attributeName: string,
  parameters: AllegroCategoryParameter[],
): AllegroCategoryParameter | undefined {
  const normalizedAttributeName = normalizeMatchValue(attributeName);
  if (!normalizedAttributeName) {
    return undefined;
  }

  return parameters.find((parameter) => {
    const normalizedParameterName = normalizeMatchValue(parameter.name);
    return (
      normalizedParameterName === normalizedAttributeName ||
      normalizedParameterName.includes(normalizedAttributeName) ||
      normalizedAttributeName.includes(normalizedParameterName)
    );
  });
}

function buildOfferTitle(options: {
  detailLabels?: string[];
  productName: string;
  volumeLabel: string;
}): string {
  const normalizedProductName = options.productName.trim().replace(/\s+/g, " ");
  const normalizedVolumeLabel = options.volumeLabel.trim().replace(/\s+/g, " ");
  const normalizedDetails = (options.detailLabels ?? [])
    .map((label) => label.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const suffixLabels = [...normalizedDetails, normalizedVolumeLabel].filter(
    Boolean,
  );
  const suffix = suffixLabels.join(" ");
  const separator = suffix ? " " : "";
  const title = `${normalizedProductName}${separator}${suffix}`;
  if (title.length <= TITLE_LIMIT) return title;

  const availableProductNameLength =
    TITLE_LIMIT - suffix.length - separator.length;
  if (availableProductNameLength <= 0) {
    return suffix.slice(0, TITLE_LIMIT);
  }

  return `${normalizedProductName.slice(0, availableProductNameLength).trimEnd()}${separator}${suffix}`;
}

function findMatchingParameterForNames(
  names: string[],
  parameters: AllegroCategoryParameter[],
): AllegroCategoryParameter | undefined {
  for (const name of names) {
    const parameter = findMatchingParameter(name, parameters);
    if (parameter) {
      return parameter;
    }
  }

  return undefined;
}

function findDictionaryValueId(
  parameter: AllegroCategoryParameter | undefined,
  value: string | undefined,
): string | undefined {
  if (!parameter?.dictionary?.length || !value) return undefined;
  const normalizedValue = normalizeMatchValue(value);
  if (!normalizedValue) return undefined;

  return parameter.dictionary.find(
    (item) => normalizeMatchValue(item.value) === normalizedValue,
  )?.id;
}

function buildVolumeParameterMapping(
  categoryParameters: AllegroCategoryParameter[],
  selection: AllegroExportConfigurationSelection,
): AllegroExportParameterMapping | null {
  const matchingParameter = findMatchingParameterForNames(
    VOLUME_PARAMETER_CANDIDATES,
    categoryParameters,
  );
  if (!matchingParameter) return null;

  const valueLabel = String(selection.volume);
  const valueId = findDictionaryValueId(matchingParameter, valueLabel);
  return {
    attributeId: VOLUME_MAPPING_ATTRIBUTE_ID,
    attributeName: matchingParameter.name,
    ...(matchingParameter.options?.describesProduct === true
      ? { describesProduct: true }
      : {}),
    parameterId: matchingParameter.id,
    parameterName: matchingParameter.name,
    status: "mapped",
    ...(valueId ? { valueId } : {}),
    valueLabel,
  };
}

export function getProductExportAttributes(
  product: Pick<Product, "attributes" | "attributeOptions">,
  attributes: Attribute[] | null | undefined,
): Attribute[] {
  if (!attributes?.length || !product.attributes?.length) {
    return [];
  }

  return product.attributes.flatMap((attributeId) => {
    const attribute = attributes.find((item) => item.id === attributeId);
    if (!attribute) {
      return [];
    }

    const allowedValues = product.attributeOptions?.[attributeId];
    const options =
      Array.isArray(allowedValues) && allowedValues.length > 0
        ? orderAttributeOptions(attribute.options, allowedValues)
        : attribute.options;

    if (options.length === 0) {
      return [];
    }

    return [{ ...attribute, options }];
  });
}

export function buildAllegroExportSelectionId(
  selection: Omit<AllegroExportConfigurationSelection, "id">,
): string {
  const attributeKey = Object.entries(selection.selectedAttributeOptions)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([attributeId, value]) => `${attributeId}:${value}`)
    .join("|");

  return [
    attributeKey,
    `volume:${selection.volume}`,
    `pages:${selection.pageCount ?? "none"}`,
    selection.customFormat
      ? `format:${selection.width ?? "none"}x${selection.height ?? "none"}`
      : "format:standard",
  ].join("|");
}

export function buildAllegroExportOfferFingerprint(options: {
  categoryId: string;
  productId: string;
  selection: AllegroExportConfigurationSelection;
}): string {
  return [
    "allegro-export",
    options.productId,
    options.categoryId,
    buildAllegroExportSelectionId(options.selection),
  ].join("|");
}

export function buildAllegroExportParameterMappings(options: {
  attributes: Attribute[];
  categoryParameters: AllegroCategoryParameter[];
  pageCountAttributeName?: string;
  pageCountValueLabel?: string;
  selection: AllegroExportConfigurationSelection;
}): AllegroExportParameterMapping[] {
  const attributeMappings = options.attributes.flatMap((attribute) => {
    const selectedValue =
      options.selection.selectedAttributeOptions[attribute.id];
    if (!selectedValue) {
      return [];
    }

    const option = attribute.options.find(
      (item) => String(item.value) === String(selectedValue),
    );
    const matchingParameter = findMatchingParameter(
      attribute.name,
      options.categoryParameters,
    );
    const valueLabel = option?.label ?? selectedValue;
    const valueId = findDictionaryValueId(matchingParameter, valueLabel);

    const mapping: AllegroExportParameterMapping = {
      attributeId: attribute.id,
      attributeName: attribute.name,
      ...(matchingParameter?.options?.describesProduct === true
        ? { describesProduct: true }
        : {}),
      parameterId: matchingParameter?.id,
      parameterName: matchingParameter?.name,
      status: matchingParameter ? "mapped" : "title_description_only",
      ...(valueId ? { valueId } : {}),
      valueLabel,
    };

    return [mapping];
  });
  const volumeMapping = buildVolumeParameterMapping(
    options.categoryParameters,
    options.selection,
  );
  if (typeof options.selection.pageCount !== "number") {
    return volumeMapping
      ? [...attributeMappings, volumeMapping]
      : attributeMappings;
  }

  const pageCountAttributeName = options.pageCountAttributeName ?? "Page Count";
  const matchingParameter = findMatchingParameterForNames(
    [pageCountAttributeName, ...PAGE_COUNT_PARAMETER_CANDIDATES],
    options.categoryParameters,
  );
  const pageCountValueLabel =
    options.pageCountValueLabel ?? String(options.selection.pageCount);
  const pageCountValueId = findDictionaryValueId(
    matchingParameter,
    pageCountValueLabel,
  );

  const pageCountMapping: AllegroExportParameterMapping = {
    attributeId: PAGE_COUNT_MAPPING_ATTRIBUTE_ID,
    attributeName: pageCountAttributeName,
    ...(matchingParameter?.options?.describesProduct === true
      ? { describesProduct: true }
      : {}),
    parameterId: matchingParameter?.id,
    parameterName: matchingParameter?.name,
    status: matchingParameter ? "mapped" : "title_description_only",
    ...(pageCountValueId ? { valueId: pageCountValueId } : {}),
    valueLabel: pageCountValueLabel,
  };

  return volumeMapping
    ? [...attributeMappings, pageCountMapping, volumeMapping]
    : [...attributeMappings, pageCountMapping];
}

export function buildAllegroExportPreviewOffer(options: {
  attributes: Attribute[];
  categoryId: string;
  categoryParameters: AllegroCategoryParameter[];
  formatCustomFormatLabel?: (width: number, height: number) => string;
  formatPageCountLabel?: (pageCount: number) => string;
  formatVolumeLabel?: (volume: number) => string;
  pageCountAttributeName?: string;
  product: Pick<Product, "id" | "name" | "pageCount">;
  selection: AllegroExportConfigurationSelection;
}): AllegroExportPreviewOffer {
  const pageCountLabel =
    options.product.pageCount?.enabled &&
    typeof options.selection.pageCount === "number"
      ? (options.formatPageCountLabel?.(options.selection.pageCount) ??
        `${options.selection.pageCount} pages`)
      : undefined;
  const mappings = buildAllegroExportParameterMappings({
    attributes: options.attributes,
    categoryParameters: options.categoryParameters,
    pageCountAttributeName: options.pageCountAttributeName,
    pageCountValueLabel: pageCountLabel,
    selection: options.selection,
  });
  const volumeLabel =
    options.formatVolumeLabel?.(options.selection.volume) ??
    `${options.selection.volume} pcs`;
  const customFormatLabel =
    options.selection.customFormat &&
    typeof options.selection.width === "number" &&
    typeof options.selection.height === "number"
      ? (options.formatCustomFormatLabel?.(
          options.selection.width,
          options.selection.height,
        ) ?? `${options.selection.width} x ${options.selection.height} mm`)
      : undefined;
  const title = buildOfferTitle({
    detailLabels: customFormatLabel ? [customFormatLabel] : [],
    productName: options.product.name,
    volumeLabel,
  });
  const unmappedMappings = mappings.filter(
    (mapping) => mapping.status === "title_description_only",
  );
  const warnings = [
    ...unmappedMappings.map(
      (mapping) =>
        `${mapping.attributeName}: ${mapping.valueLabel} has no matching Allegro parameter.`,
    ),
    ...(title.length > TITLE_LIMIT
      ? [`Generated title is ${title.length} characters.`]
      : []),
  ];

  return {
    configurationId: options.selection.id,
    fingerprint: buildAllegroExportOfferFingerprint({
      categoryId: options.categoryId,
      productId: options.product.id,
      selection: options.selection,
    }),
    mappings,
    title,
    warnings,
  };
}

export function isAllegroCategoryParametersResponse(
  value: unknown,
): value is AllegroCategoryParametersResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const parameters = (value as { parameters?: unknown }).parameters;
  return Array.isArray(parameters);
}

export function isAllegroCategorySearchResponse(
  value: unknown,
): value is AllegroCategorySearchResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const categories = (value as { categories?: unknown }).categories;
  return Array.isArray(categories);
}
