import {
  type CurrencyCode,
  CurrencyEnum,
  type ExternalAttribute,
  type Price,
  type Product,
} from "@konfi/types";
import { normalizeExternalDeliveryTime } from "@/lib/external-products/delivery-time";
import { DEFAULT_COMBINATION, calculateQuantity } from "@konfi/utils";

const WIDTH_ATTRIBUTE_PATTERN = /(width|szer(?:oko(?:sc|ść)|\.)|szerokosc)/i;
const HEIGHT_ATTRIBUTE_PATTERN = /(height|wys(?:oko(?:sc|ść)|\.)|wysokosc)/i;
const MAX_DIMENSION_SAMPLE_VALUE_COUNT = 3;

type DimensionAxis = "width" | "height";

type NumericRange = {
  maximum: number;
  minimum: number;
  step: number;
};

export type InferredExternalRangedDimension = {
  attribute: ExternalAttribute;
  axis: DimensionAxis;
} & NumericRange;

export type InferredExternalRangedDimensions = {
  height: InferredExternalRangedDimension;
  width: InferredExternalRangedDimension;
};

export type RangedDimensionPriceConfiguration = {
  configuration: Record<string, string>;
  priceRanges: Array<{
    deliveryTime?: number;
    price: number;
    quantity: number;
  }>;
};

function getAttributeTokens(
  attribute: Pick<ExternalAttribute, "category" | "id" | "name">,
): string[] {
  return [attribute.id, attribute.name, attribute.category]
    .filter(
      (token): token is string =>
        typeof token === "string" && token.trim().length > 0,
    )
    .map((token) => token.trim());
}

function getNumericRange(
  attribute: Pick<ExternalAttribute, "numberConfig">,
): NumericRange | null {
  const minimum = attribute.numberConfig?.minimum;
  const maximum = attribute.numberConfig?.maximum;
  const step = attribute.numberConfig?.step ?? 1;

  if (
    typeof minimum !== "number" ||
    !Number.isFinite(minimum) ||
    typeof maximum !== "number" ||
    !Number.isFinite(maximum) ||
    typeof step !== "number" ||
    !Number.isFinite(step) ||
    step <= 0 ||
    minimum <= 0 ||
    maximum <= 0 ||
    minimum > maximum
  ) {
    return null;
  }

  return {
    minimum,
    maximum,
    step,
  };
}

function scoreDimensionAttribute(
  attribute: Pick<ExternalAttribute, "category" | "id" | "name">,
  axis: DimensionAxis,
): number {
  const pattern =
    axis === "width" ? WIDTH_ATTRIBUTE_PATTERN : HEIGHT_ATTRIBUTE_PATTERN;
  const [id = "", name = "", category = ""] = getAttributeTokens(attribute);
  let score = 0;

  if (pattern.test(id)) score += 6;
  if (pattern.test(name)) score += 4;
  if (pattern.test(category)) score += 2;

  return score;
}

function snapToRangeStep(value: number, range: NumericRange): number {
  const stepsFromMinimum = Math.round((value - range.minimum) / range.step);
  const snapped = range.minimum + stepsFromMinimum * range.step;

  if (snapped < range.minimum) {
    return range.minimum;
  }

  if (snapped > range.maximum) {
    return range.maximum;
  }

  return Number(snapped.toFixed(4));
}

function formatNumericExternalValue(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function parseConfiguredDimensionValue(value?: string): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeThresholdCurve(prices: Price[]): Price[] {
  const sortedPrices = [...prices].toSorted(
    (left, right) => (left.threshold ?? 0) - (right.threshold ?? 0),
  );
  let minimumAllowedPriceAtLowerThreshold = 0;

  for (let index = sortedPrices.length - 1; index >= 0; index -= 1) {
    const current = sortedPrices[index];

    if (
      !current ||
      typeof current.value !== "number" ||
      !Number.isFinite(current.value)
    ) {
      continue;
    }

    if (current.value < minimumAllowedPriceAtLowerThreshold) {
      sortedPrices[index] = {
        ...current,
        value: minimumAllowedPriceAtLowerThreshold,
      };
      continue;
    }

    minimumAllowedPriceAtLowerThreshold = current.value;
  }

  return sortedPrices;
}

export function inferExternalRangedDimensions(
  attributes?: ExternalAttribute[],
): InferredExternalRangedDimensions | null {
  const numericAttributes = (attributes ?? [])
    .map((attribute) => {
      const range = getNumericRange(attribute);

      if (!range) {
        return null;
      }

      return {
        attribute,
        range,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        attribute: ExternalAttribute;
        range: NumericRange;
      } => Boolean(entry),
    );

  if (numericAttributes.length < 2) {
    return null;
  }

  const widthCandidate = [...numericAttributes]
    .toSorted(
      (left, right) =>
        scoreDimensionAttribute(right.attribute, "width") -
        scoreDimensionAttribute(left.attribute, "width"),
    )
    .find(
      (candidate) => scoreDimensionAttribute(candidate.attribute, "width") > 0,
    );
  const heightCandidate = [...numericAttributes]
    .toSorted(
      (left, right) =>
        scoreDimensionAttribute(right.attribute, "height") -
        scoreDimensionAttribute(left.attribute, "height"),
    )
    .find(
      (candidate) =>
        candidate.attribute.name !== widthCandidate?.attribute.name &&
        scoreDimensionAttribute(candidate.attribute, "height") > 0,
    );

  if (!widthCandidate || !heightCandidate) {
    return null;
  }

  return {
    width: {
      ...widthCandidate.range,
      attribute: widthCandidate.attribute,
      axis: "width",
    },
    height: {
      ...heightCandidate.range,
      attribute: heightCandidate.attribute,
      axis: "height",
    },
  };
}

export function getRangedDimensionAttributeNames(
  dimensions: InferredExternalRangedDimensions | null | undefined,
): Set<string> {
  if (!dimensions) {
    return new Set<string>();
  }

  return new Set([
    dimensions.width.attribute.name,
    dimensions.height.attribute.name,
  ]);
}

export function buildSampledRangedDimensionValues(
  dimension: InferredExternalRangedDimension,
): string[] {
  const fractions = [0, 0.5, 1, 0.25, 0.75];
  const sampledValues: number[] = [];

  for (const fraction of fractions) {
    const candidate =
      dimension.minimum + (dimension.maximum - dimension.minimum) * fraction;
    const snapped = snapToRangeStep(candidate, dimension);

    if (!sampledValues.includes(snapped)) {
      sampledValues.push(snapped);
    }

    if (sampledValues.length >= MAX_DIMENSION_SAMPLE_VALUE_COUNT) {
      break;
    }
  }

  if (!sampledValues.includes(dimension.maximum)) {
    sampledValues.push(dimension.maximum);
  }

  return sampledValues
    .toSorted((left, right) => left - right)
    .slice(0, MAX_DIMENSION_SAMPLE_VALUE_COUNT)
    .map(formatNumericExternalValue);
}

export function buildRangedDimensionSpec(
  dimensions: InferredExternalRangedDimensions,
): Pick<
  NonNullable<Product["spec"]>,
  | "heightStep"
  | "maximumHeight"
  | "maximumWidth"
  | "minimumHeight"
  | "minimumWidth"
  | "widthStep"
> {
  return {
    minimumWidth: dimensions.width.minimum,
    maximumWidth: dimensions.width.maximum,
    widthStep: dimensions.width.step,
    minimumHeight: dimensions.height.minimum,
    maximumHeight: dimensions.height.maximum,
    heightStep: dimensions.height.step,
  };
}

export function buildRangedDimensionMatrixPrices(options: {
  configurations: RangedDimensionPriceConfiguration[];
  currency?: CurrencyCode;
  dimensions: InferredExternalRangedDimensions;
  resolveCombinationId?: (
    configuration: Record<string, string>,
  ) => string | null | undefined;
}): Price[] {
  const {
    configurations,
    currency = CurrencyEnum.PLN,
    dimensions,
    resolveCombinationId,
  } = options;
  const pricesByCombinationAndThreshold = new Map<string, Price>();

  for (const configuration of configurations) {
    const width = parseConfiguredDimensionValue(
      configuration.configuration[dimensions.width.attribute.name],
    );
    const height = parseConfiguredDimensionValue(
      configuration.configuration[dimensions.height.attribute.name],
    );

    if (!width || !height) {
      continue;
    }

    const combinationId =
      resolveCombinationId?.(configuration.configuration) ??
      DEFAULT_COMBINATION;

    if (!combinationId) {
      continue;
    }

    for (const range of configuration.priceRanges) {
      if (
        typeof range.quantity !== "number" ||
        !Number.isFinite(range.quantity) ||
        range.quantity <= 0 ||
        typeof range.price !== "number" ||
        !Number.isFinite(range.price) ||
        range.price <= 0
      ) {
        continue;
      }

      const threshold = calculateQuantity(true, range.quantity, width, height);

      if (!Number.isFinite(threshold) || threshold <= 0) {
        continue;
      }

      const totalPrice = range.price * range.quantity;
      const normalizedUnitPrice = Math.round(totalPrice / threshold);

      if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice <= 0) {
        continue;
      }

      const priceKey = `${combinationId}:${threshold}`;
      const existingPrice = pricesByCombinationAndThreshold.get(priceKey);

      if (
        existingPrice &&
        typeof existingPrice.value === "number" &&
        existingPrice.value >= normalizedUnitPrice
      ) {
        continue;
      }

      pricesByCombinationAndThreshold.set(priceKey, {
        combination: {
          id: combinationId,
          active: true,
          customFormat: false,
        },
        currency,
        threshold,
        value: normalizedUnitPrice,
        volume: {
          deliveryTime: normalizeExternalDeliveryTime(range.deliveryTime) ?? 2,
          value: range.quantity,
        },
      });
    }
  }

  const groupedPrices = new Map<string, Price[]>();

  for (const price of pricesByCombinationAndThreshold.values()) {
    const combinationId = price.combination?.id ?? DEFAULT_COMBINATION;
    const existing = groupedPrices.get(combinationId) ?? [];
    existing.push(price);
    groupedPrices.set(combinationId, existing);
  }

  return Array.from(groupedPrices.entries())
    .flatMap(([, prices]) => normalizeThresholdCurve(prices))
    .toSorted((left, right) => {
      const combinationDiff = (
        left.combination?.id ?? DEFAULT_COMBINATION
      ).localeCompare(right.combination?.id ?? DEFAULT_COMBINATION);

      if (combinationDiff !== 0) {
        return combinationDiff;
      }

      return (left.threshold ?? 0) - (right.threshold ?? 0);
    });
}
