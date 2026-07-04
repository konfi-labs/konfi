import {
  Attribute,
  Configuration,
  type CurrencyCode,
  CurrencyEnum,
  Price,
  PriceTypeEnum,
  Product,
} from "@konfi/types";
import {
  DEFAULT_COMBINATION,
  fixPriceCombinations,
  getCombination,
  resolveCalculatedCombination,
} from "@konfi/utils";
import {
  buildCombinationAttributes,
  parseCombinationValues,
} from "./combination-parsing";

export type CleanedAttributeData = {
  validAttributes: string[];
  validAttributeOptions: Product["attributeOptions"];
};

export type ProductPriceInitializationInput = Pick<
  Product,
  | "attributeDependencies"
  | "attributes"
  | "defaultPrice"
  | "priceType"
  | "prices"
>;

export type ProductPreviewInitializationInput = Pick<
  Product,
  | "attributeDependencies"
  | "pageCount"
  | "priceType"
  | "prices"
  | "spec"
  | "volumes"
>;

const FALLBACK_PRODUCT_FORM_PRICE: Price = {
  value: 0,
  threshold: 0,
  currency: CurrencyEnum.PLN,
};

const hasUsableExplicitMatrixPrice = (
  prices: Price[],
  combinationId: string,
  volumeValue: number,
) => {
  return prices.some(
    (price) =>
      price.combination?.id === combinationId &&
      price.volume?.value === volumeValue &&
      price.combination?.active !== false &&
      typeof price.value === "number" &&
      Number.isFinite(price.value) &&
      price.value >= 0,
  );
};

export const getFirstUsableMatrixVolume = ({
  calculatedCombination,
  fallbackVolume,
  prices,
  volumes,
}: {
  calculatedCombination: string;
  fallbackVolume: number;
  prices: Price[];
  volumes: ProductPreviewInitializationInput["volumes"];
}) => {
  if (
    hasUsableExplicitMatrixPrice(prices, calculatedCombination, fallbackVolume)
  ) {
    return fallbackVolume;
  }

  return (
    volumes.find((volume) =>
      hasUsableExplicitMatrixPrice(prices, calculatedCombination, volume.value),
    )?.value ?? fallbackVolume
  );
};

const getCalculatedAttributeIds = (
  attributeIds: string[],
  globalAttributes?: Attribute[] | null,
) => {
  return attributeIds.filter((attributeId) =>
    globalAttributes?.some(
      (globalAttribute) =>
        globalAttribute.id === attributeId && globalAttribute.calculated,
    ),
  );
};

const validateCombinationPrices = (
  combinationAttributes: ReturnType<typeof buildCombinationAttributes>,
  prices: Price[],
  attributeDependencies?: Product["attributeDependencies"],
) => {
  const invalidCombinationMessages: string[] = [];

  const validPrices = prices.filter((price) => {
    if (!price.combination || !price.combination.id) {
      return true;
    }

    if (price.combination.id === DEFAULT_COMBINATION) {
      return true;
    }

    const parsedCombination = parseCombinationValues({
      attributeDependencies,
      attributes: combinationAttributes,
      combinationId: price.combination.id,
    });

    if (!parsedCombination) {
      invalidCombinationMessages.push(
        `Price combination ${price.combination.id} does not match the configured attribute option values.`,
      );
      return false;
    }

    return true;
  });

  if (invalidCombinationMessages.length > 0) {
    console.warn(
      `Filtered ${invalidCombinationMessages.length} invalid MATRIX price row(s) while initializing the product form.`,
      invalidCombinationMessages.slice(0, 5),
    );
  }

  return validPrices;
};

export const createFallbackProductPrice = (
  currency: CurrencyCode = CurrencyEnum.PLN,
): Price => ({
  ...FALLBACK_PRODUCT_FORM_PRICE,
  currency,
});

export const getProductFormPreviewInitConfiguration = ({
  attributes,
  product,
  productId,
}: {
  attributes: Attribute[];
  product: ProductPreviewInitializationInput;
  productId: string;
}): Configuration | null => {
  if (
    product.priceType !== PriceTypeEnum.MATRIX &&
    product.priceType !== PriceTypeEnum.DYNAMIC
  ) {
    return null;
  }

  const fallbackVolume =
    product.spec.defaultOrder ??
    product.volumes[0]?.value ??
    product.spec.minimumOrder ??
    1;
  const baseConfiguration: Pick<
    Configuration,
    | "productId"
    | "quantity"
    | "customFormat"
    | "width"
    | "height"
    | "customSizes"
    | "pageCount"
  > = {
    productId,
    quantity: 1,
    customFormat: false,
    width: product.spec.minimumWidth ?? 0,
    height: product.spec.minimumHeight ?? 0,
    customSizes: [],
    pageCount: product.pageCount?.enabled
      ? product.pageCount.minimum
      : undefined,
  };
  const previewPrices = product.prices ?? [];
  const defaultCombinationVolume = getFirstUsableMatrixVolume({
    calculatedCombination: DEFAULT_COMBINATION,
    fallbackVolume,
    prices: previewPrices,
    volumes: product.volumes,
  });

  if (attributes.length === 0) {
    return {
      ...baseConfiguration,
      combination: null,
      calculatedCombination: DEFAULT_COMBINATION,
      descriptionCombination: null,
      selectedAttributeOptions: null,
      volume: defaultCombinationVolume,
    };
  }

  const [
    combination,
    calculatedCombination,
    descriptionCombination,
    selectedAttributeOptions,
  ] = getCombination(attributes, [], null, product.attributeDependencies, true);
  const resolvedCalculatedCombination = resolveCalculatedCombination({
    combination,
    calculatedCombination,
    priceType: product.priceType,
  });

  const volume = getFirstUsableMatrixVolume({
    calculatedCombination: resolvedCalculatedCombination,
    fallbackVolume,
    prices: previewPrices,
    volumes: product.volumes,
  });

  return {
    ...baseConfiguration,
    combination,
    calculatedCombination: resolvedCalculatedCombination,
    descriptionCombination,
    selectedAttributeOptions: {
      ...selectedAttributeOptions,
      volume,
    },
    volume,
  };
};

export const getInitialProductFormPrices = ({
  cleanedAttributeData,
  globalAttributes,
  product,
}: {
  cleanedAttributeData: CleanedAttributeData;
  globalAttributes?: Attribute[] | null;
  product: ProductPriceInitializationInput;
}): Price[] => {
  if (!product.prices || product.prices.length === 0) {
    return [createFallbackProductPrice(product.defaultPrice?.currency)];
  }

  if (product.priceType !== PriceTypeEnum.MATRIX) {
    return fixPriceCombinations(product.prices, product.priceType);
  }

  // When globalAttributes aren't loaded yet, skip validation to avoid
  // filtering out all MATRIX prices (getCalculatedAttributeIds returns []
  // when globalAttributes is null/empty, causing validateCombinationPrices to
  // reject every combination where combinationIndex !== parts.length).
  if (!globalAttributes || globalAttributes.length === 0) {
    return fixPriceCombinations(product.prices, product.priceType);
  }

  const calculatedAttributeIds = getCalculatedAttributeIds(
    product.attributes,
    globalAttributes,
  );
  const combinationAttributes = buildCombinationAttributes({
    attributeIds: calculatedAttributeIds,
    attributeOptions: cleanedAttributeData.validAttributeOptions,
    attributes: globalAttributes,
    missingOptionMode: "consume-single-token",
  });
  const validPrices = validateCombinationPrices(
    combinationAttributes,
    product.prices,
    product.attributeDependencies,
  );

  return fixPriceCombinations(validPrices, product.priceType);
};
