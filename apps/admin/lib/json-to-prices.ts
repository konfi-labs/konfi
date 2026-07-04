import { Attribute, CurrencyEnum, Price, Product, Volume } from "@konfi/types";
import {
  parseCombinationValues,
  type CombinationAttribute,
} from "./combination-parsing";

export type JsonWorksheetCellValue = string | number | boolean | undefined;

export interface JsonWorksheetRow {
  combination: string;
  [volume: string]: JsonWorksheetCellValue;
}

export interface JsonWorksheetParseResult {
  prices: JsonWorksheetRow[];
  thresholds: JsonWorksheetRow[];
  deliveryTimes: JsonWorksheetRow[];
  active: JsonWorksheetRow[];
}

export interface JsonToPricesInput {
  attributeDependencies?: Product["attributeDependencies"];
  combinationAttributes?: CombinationAttribute[];
  optionsLabelValuePairs: { [x: string]: string };
  watchAttributes: Attribute["id"][] | undefined;
  attributes: Attribute[] | null;
  memoizedCombinations: string[];
  xlsxParseResult: JsonWorksheetParseResult;
  volumes: Omit<Volume, "deliveryTime">[];
}

export type JsonToPricesResult = {
  data: Price[];
  error: string | null;
};

type WorksheetCellValue = JsonWorksheetCellValue | null;
type WorksheetRow = JsonWorksheetRow;

function parseBoolean(value: WorksheetCellValue): boolean {
  if (typeof value === "boolean") return value;
  if (value == null) return false;

  // Allow comma separated sequences like "true,true,true" or "false,false".
  // Ignore empty tokens (from trailing commas or ",,,"). Treat any mix of
  // truthy and falsey (after ignoring empties) as an error to surface data issues.
  const validTruthy = ["true", "1", "yes", "on"];
  const validFalsey = ["false", "0", "no", "off", ""];

  const rawTokens = String(value)
    .toLowerCase()
    .split(",")
    .map((t) => t.trim());

  // Filter out tokens that are purely empty to allow patterns like "true,true,"
  // Treat explicit string tokens 'undefined' and 'null' as empty / ignorable.
  // They can appear if upstream serialization inserted placeholders.
  const tokens = rawTokens.filter(
    (t) => t !== "" && t !== "undefined" && t !== "null",
  );

  let hasTruthy = false;
  let hasFalsey = false; // retained for possible future analytics; no longer triggers error

  for (const token of tokens) {
    if (validTruthy.includes(token)) {
      hasTruthy = true;
      continue;
    }
    if (validFalsey.includes(token)) {
      hasFalsey = true;
      continue;
    }
    // Ignore silently if token somehow became an ignorable placeholder after filters (defensive)
    if (token === "undefined" || token === "null") continue;
    throw new Error(
      `Invalid boolean value: "${token}". Expected one of: ${[
        ...validTruthy.filter((v) => v !== ""),
        ...validFalsey.filter((v) => v !== ""),
      ].join(", ")}`,
    );
  }

  // Mixed truthy/falsey now allowed. We apply OR semantics: any truthy => true.
  // If no truthy tokens (including case where all tokens ignored) => false.
  return hasTruthy;
}

function isNullishWorksheetValue(value: WorksheetCellValue): boolean {
  if (value == null) return true;
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    return normalizedValue === "" || normalizedValue === "null";
  }
  return false;
}

function parseNullableNumber(value: WorksheetCellValue): number | null {
  if (isNullishWorksheetValue(value)) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseNumberOrFallback(
  value: WorksheetCellValue,
  fallbackValue: number,
): number {
  const parsedValue = parseNullableNumber(value);
  return parsedValue ?? fallbackValue;
}

function parseOptionalNumber(value: WorksheetCellValue): number | undefined {
  const parsedValue = parseNullableNumber(value);
  return parsedValue ?? undefined;
}

export function jsonToPrices({
  attributeDependencies,
  combinationAttributes,
  optionsLabelValuePairs,
  watchAttributes,
  attributes,
  memoizedCombinations,
  xlsxParseResult,
  volumes,
}: JsonToPricesInput): JsonToPricesResult {
  try {
    const watchAttributeIds = watchAttributes ?? [];
    const attributeById = new Map(
      (attributes ?? []).map((attribute) => [attribute.id, attribute]),
    );

    function isCustomFormat(combination: string): boolean {
      const parsedCombination =
        combinationAttributes && combinationAttributes.length > 0
          ? parseCombinationValues({
              attributeDependencies,
              attributes: combinationAttributes,
              combinationId: combination,
            })
          : null;

      if (parsedCombination) {
        return parsedCombination.values.some((value) => value.customFormat);
      }

      const combinationAttributeOptions = combination.split("-");
      const customFormatResults: boolean[] = [];
      for (let i = 0; i < watchAttributeIds.length; i++) {
        const attributeId = watchAttributeIds[i];
        const attribute = attributeById.get(attributeId);
        if (!attribute?.format) continue;
        for (let j = 0; j < combinationAttributeOptions.length; j++) {
          const combinationAttributeOption = combinationAttributeOptions[j];
          const option = attribute.options.find(
            (obj) => obj.value === combinationAttributeOption,
          );
          if (!option) continue;
          customFormatResults.push(option.customFormat);
        }
      }
      if (customFormatResults.includes(true)) return true;
      else return false;
    }

    function hasThresholds(unformattedThreshold: WorksheetCellValue): boolean {
      return !isNullishWorksheetValue(unformattedThreshold);
    }

    function replaceLabelsWithValues(combination: string): string {
      return combination
        .split(", ")
        .map((label) => optionsLabelValuePairs[label])
        .filter((value): value is string => Boolean(value))
        .join("-");
    }

    function buildRowLookup(rows: WorksheetRow[]): Map<string, WorksheetRow> {
      const lookup = new Map<string, WorksheetRow>();
      const canUseRowOrder = rows.length === memoizedCombinations.length;

      rows.forEach((row, index) => {
        const indexedCombination = canUseRowOrder
          ? memoizedCombinations[index]
          : undefined;

        if (indexedCombination && !lookup.has(indexedCombination)) {
          lookup.set(indexedCombination, row);
          return;
        }

        const resolvedCombination = replaceLabelsWithValues(row.combination);

        if (resolvedCombination && !lookup.has(resolvedCombination)) {
          lookup.set(resolvedCombination, row);
        }
      });

      return lookup;
    }

    const priceRowsByCombination = buildRowLookup(
      xlsxParseResult.prices as WorksheetRow[],
    );
    const thresholdRowsByCombination = buildRowLookup(
      xlsxParseResult.thresholds as WorksheetRow[],
    );
    const deliveryTimeRowsByCombination = buildRowLookup(
      xlsxParseResult.deliveryTimes as WorksheetRow[],
    );
    const activeRowsByCombination = buildRowLookup(
      xlsxParseResult.active as WorksheetRow[],
    );
    const formattedPrices: Price[] = [];
    for (let i = 0; i < memoizedCombinations.length; i++) {
      const combination = memoizedCombinations[i];
      const unformattedPrice = priceRowsByCombination.get(combination);
      const unformattedThreshold = thresholdRowsByCombination.get(combination);
      const unformattedDeliveryTime =
        deliveryTimeRowsByCombination.get(combination);
      const unformattedActive = activeRowsByCombination.get(combination);
      for (let j = 0; j < volumes.length; j++) {
        const volume = volumes[j];

        if (
          unformattedPrice?.[volume.value] === undefined ||
          unformattedThreshold?.[volume.value] === undefined ||
          unformattedDeliveryTime?.[volume.value] === undefined ||
          unformattedActive?.[volume.value] === undefined
        ) {
          unformattedPrice?.[volume.value] === undefined &&
            console.error(
              "Export again and fill the table (Prices are not filled)",
            );
          unformattedThreshold?.[volume.value] === undefined &&
            console.error(
              "Export again and fill the table (Thresholds are not filled)",
            );
          unformattedDeliveryTime?.[volume.value] === undefined &&
            console.error(
              "Export again and fill the table (Delivery times are not filled)",
            );
          unformattedActive?.[volume.value] === undefined &&
            console.error(
              "Export again and fill the table (Activity is not filled)",
            );
          return { data: [], error: "No data" };
        }

        const customFormat = isCustomFormat(combination);
        const currentPriceValue = parseNullableNumber(
          unformattedPrice[volume.value],
        );
        const _hasThresholds = hasThresholds(
          unformattedThreshold[volume.value],
        );
        const price: Price = {
          value: currentPriceValue,
          combination: {
            id: combination,
            active:
              (parseBoolean(unformattedActive[volume.value]) ||
                Boolean(customFormat)) &&
              currentPriceValue !== null,
            customFormat: customFormat,
          },
          threshold: _hasThresholds
            ? parseOptionalNumber(unformattedThreshold[volume.value])
            : undefined,
          volume: {
            value: volume.value,
            deliveryTime: parseNumberOrFallback(
              unformattedDeliveryTime[volume.value],
              2,
            ),
          },
          currency: CurrencyEnum.PLN,
        };

        if (customFormat || _hasThresholds) {
          const prices: string[] = String(unformattedPrice[volume.value]).split(
            ",",
          );
          const thresholds: string[] = String(
            unformattedThreshold[volume.value],
          ).split(",");
          const deliveryTimes: string[] =
            `${unformattedDeliveryTime[volume.value]}`.split(",");
          const actives: string[] = `${unformattedActive[volume.value]}`.split(
            ",",
          );

          const lengthArray: number[] = [
            prices.length,
            thresholds.length,
            deliveryTimes.length,
            actives.length,
          ];
          const length = Math.max(...lengthArray);
          for (let k = 0; k < length; k++) {
            const priceValue = prices[k];
            const threshold = thresholds[k];
            const volumeDeliveryTime = deliveryTimes[k];
            const combinationPriceActive = actives[k];
            const parsedPriceValue = parseNullableNumber(priceValue);
            const _price: Price = {
              value: parsedPriceValue,
              combination: {
                id: combination,
                active:
                  (parseBoolean(combinationPriceActive) ||
                    Boolean(customFormat)) &&
                  parsedPriceValue !== null,
                customFormat: customFormat,
              },
              threshold: _hasThresholds
                ? parseOptionalNumber(threshold)
                : undefined,
              volume: {
                value: volume.value,
                deliveryTime: parseNumberOrFallback(volumeDeliveryTime, 2),
              },
              currency: CurrencyEnum.PLN,
            };
            formattedPrices.push(_price);
          }
        } else formattedPrices.push(price);
      }
    }

    console.log("Posting message back to main script");
    return { data: formattedPrices, error: null };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export {};
