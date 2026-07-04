import type { Price, Product, Volume } from "@konfi/types";
import type { JsonWorksheetParseResult } from "./json-to-prices";
import {
  parseCombinationValues,
  type CombinationAttribute,
} from "./combination-parsing";

export type MatrixGridCellValue = number | string | boolean | undefined;

export interface MatrixGridRow {
  combination: string;
  [volume: string]: MatrixGridCellValue;
}

type MatrixWorksheetCellValue = string | number | boolean | undefined;
type MatrixWorksheetDataRow = MatrixWorksheetCellValue[];

export type MatrixWorksheetBuildInput = {
  attributeDependencies?: Product["attributeDependencies"];
  combinationAttributes?: CombinationAttribute[];
  combinations: string[];
  optionsValueLabelPairs: Record<string, string>;
  prices: Price[];
  volumes: Omit<Volume, "deliveryTime">[];
};

export type MatrixGridRowsSnapshot = {
  pricesRows: MatrixGridRow[];
  thresholdsRows: MatrixGridRow[];
  deliveryTimesRows: MatrixGridRow[];
  activeRows: MatrixGridRow[];
  volumes: Omit<Volume, "deliveryTime">[];
};

export type MatrixWorksheetBuildResult = {
  pricesRowData: MatrixWorksheetDataRow[];
  thresholdRowData: MatrixWorksheetDataRow[];
  deliveryTimesRowData: MatrixWorksheetDataRow[];
  activRowData: MatrixWorksheetDataRow[];
} & Omit<MatrixGridRowsSnapshot, "volumes">;

function getMatrixCellKey(
  combinationId: string,
  volumeValue: Volume["value"],
): string {
  return `${combinationId}::${Number(volumeValue)}`;
}

function getWorksheetActiveValue(price: Price | undefined): string {
  if (price?.value === null) {
    return "FALSE";
  }

  return (price?.combination?.active ?? true) ? "TRUE" : "FALSE";
}

function createMatrixGridRows(
  data: MatrixWorksheetDataRow[],
  volumes: Omit<Volume, "deliveryTime">[],
): MatrixGridRow[] {
  return data.flatMap((row) => {
    if (row[0] === "combination") {
      return [];
    }

    const combination = row[0] as string;
    const gridRow: MatrixGridRow = { combination };

    volumes.forEach((volume, index) => {
      gridRow[String(volume.value)] = row[index + 1] as MatrixGridCellValue;
    });

    return [gridRow];
  });
}

function serializeWorksheetCell(
  cellPrices: Price[],
  getValue: (price: Price | undefined) => string | number | undefined,
  fallbackValue: string | number,
): string | number {
  if (cellPrices.length > 1) {
    return cellPrices
      .map((price) => {
        const value = getValue(price);
        return value != null ? value : fallbackValue;
      })
      .join(",");
  }

  const value = getValue(cellPrices[0]);
  return value != null ? value : fallbackValue;
}

type SerializedMatrixCellValues = {
  active: string;
  deliveryTime: string | number;
  price: string | number;
  threshold: string | number;
};

function getSerializedMatrixCellValues(
  cellPrices: Price[],
): SerializedMatrixCellValues {
  return {
    active:
      cellPrices.length > 1
        ? cellPrices.map((price) => getWorksheetActiveValue(price)).join(",")
        : getWorksheetActiveValue(cellPrices[0]),
    deliveryTime: serializeWorksheetCell(
      cellPrices,
      (price) =>
        price?.volume?.deliveryTime != null
          ? price.volume.deliveryTime
          : undefined,
      2,
    ),
    price: serializeWorksheetCell(
      cellPrices,
      (price) => (price?.value != null ? price.value : undefined),
      "NULL",
    ),
    threshold: serializeWorksheetCell(
      cellPrices,
      (price) => (price?.threshold != null ? price.threshold : undefined),
      "NULL",
    ),
  };
}

function replaceValuesWithLabels(
  combination: string,
  optionsValueLabelPairs: Record<string, string>,
  combinationAttributes?: CombinationAttribute[],
  attributeDependencies?: Product["attributeDependencies"],
): string {
  if (combinationAttributes && combinationAttributes.length > 0) {
    const parsedCombination = parseCombinationValues({
      attributeDependencies,
      attributes: combinationAttributes,
      combinationId: combination,
    });

    if (parsedCombination) {
      return parsedCombination.values.map((value) => value.label).join(", ");
    }
  }

  return combination
    .split("-")
    .map((value) => optionsValueLabelPairs[value])
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function buildPricesByMatrixCell(prices: Price[]): Map<string, Price[]> {
  const lookup = new Map<string, Price[]>();

  prices.forEach((price) => {
    const combinationId = price.combination?.id;
    const volumeValue = price.volume?.value;

    if (!combinationId || typeof volumeValue === "undefined") {
      return;
    }

    const lookupKey = getMatrixCellKey(combinationId, volumeValue);
    const existingPrices = lookup.get(lookupKey);

    if (existingPrices) {
      existingPrices.push(price);
      return;
    }

    lookup.set(lookupKey, [price]);
  });

  return lookup;
}

export function buildMatrixGridRowsSnapshot({
  attributeDependencies,
  combinationAttributes,
  combinations,
  optionsValueLabelPairs,
  prices,
  volumes,
}: MatrixWorksheetBuildInput): MatrixGridRowsSnapshot {
  const pricesRows: MatrixGridRow[] = [];
  const thresholdsRows: MatrixGridRow[] = [];
  const deliveryTimesRows: MatrixGridRow[] = [];
  const activeRows: MatrixGridRow[] = [];
  const pricesByMatrixCell = buildPricesByMatrixCell(prices);

  combinations.forEach((combination) => {
    const readableCombination = replaceValuesWithLabels(
      combination,
      optionsValueLabelPairs,
      combinationAttributes,
      attributeDependencies,
    );
    const pricesRow: MatrixGridRow = { combination: readableCombination };
    const thresholdsRow: MatrixGridRow = { combination: readableCombination };
    const deliveryTimesRow: MatrixGridRow = {
      combination: readableCombination,
    };
    const activeRow: MatrixGridRow = { combination: readableCombination };

    volumes.forEach((volume) => {
      const cellPrices =
        pricesByMatrixCell.get(getMatrixCellKey(combination, volume.value)) ??
        [];
      const cellValues = getSerializedMatrixCellValues(cellPrices);
      const volumeKey = String(volume.value);

      pricesRow[volumeKey] = cellValues.price as MatrixGridCellValue;
      thresholdsRow[volumeKey] = cellValues.threshold as MatrixGridCellValue;
      deliveryTimesRow[volumeKey] =
        cellValues.deliveryTime as MatrixGridCellValue;
      activeRow[volumeKey] = cellValues.active;
    });

    pricesRows.push(pricesRow);
    thresholdsRows.push(thresholdsRow);
    deliveryTimesRows.push(deliveryTimesRow);
    activeRows.push(activeRow);
  });

  return {
    pricesRows,
    thresholdsRows,
    deliveryTimesRows,
    activeRows,
    volumes,
  };
}

export function buildMatrixWorksheetData({
  attributeDependencies,
  combinationAttributes,
  combinations,
  optionsValueLabelPairs,
  prices,
  volumes,
}: MatrixWorksheetBuildInput): MatrixWorksheetBuildResult {
  const headerRow: (string | number)[] = [
    "combination",
    ...volumes.map((volume) => volume.value),
  ];
  const pricesRowData: MatrixWorksheetDataRow[] = [headerRow];
  const thresholdRowData: MatrixWorksheetDataRow[] = [headerRow];
  const deliveryTimesRowData: MatrixWorksheetDataRow[] = [headerRow];
  const activRowData: MatrixWorksheetDataRow[] = [headerRow];
  const pricesByMatrixCell = buildPricesByMatrixCell(prices);

  combinations.forEach((combination) => {
    const readableCombination = replaceValuesWithLabels(
      combination,
      optionsValueLabelPairs,
      combinationAttributes,
      attributeDependencies,
    );
    const priceRow: MatrixWorksheetDataRow = [readableCombination];
    const thresholdRow: MatrixWorksheetDataRow = [readableCombination];
    const deliveryTimeRow: MatrixWorksheetDataRow = [readableCombination];
    const activeRow: MatrixWorksheetDataRow = [readableCombination];

    volumes.forEach((volume) => {
      const cellPrices =
        pricesByMatrixCell.get(getMatrixCellKey(combination, volume.value)) ??
        [];
      const cellValues = getSerializedMatrixCellValues(cellPrices);

      priceRow.push(cellValues.price);
      thresholdRow.push(cellValues.threshold);
      deliveryTimeRow.push(cellValues.deliveryTime);
      activeRow.push(cellValues.active);
    });

    pricesRowData.push(priceRow);
    thresholdRowData.push(thresholdRow);
    deliveryTimesRowData.push(deliveryTimeRow);
    activRowData.push(activeRow);
  });

  return {
    pricesRowData,
    thresholdRowData,
    deliveryTimesRowData,
    activRowData,
    pricesRows: createMatrixGridRows(pricesRowData, volumes),
    thresholdsRows: createMatrixGridRows(thresholdRowData, volumes),
    deliveryTimesRows: createMatrixGridRows(deliveryTimesRowData, volumes),
    activeRows: createMatrixGridRows(activRowData, volumes),
  };
}

function serializeGridRows(
  rows: MatrixGridRow[],
  volumes: Omit<Volume, "deliveryTime">[],
): JsonWorksheetParseResult["prices"] {
  return rows.map((row) => {
    const serializedRow: JsonWorksheetParseResult["prices"][number] = {
      combination: row.combination,
    };

    volumes.forEach((volume) => {
      serializedRow[String(volume.value)] = row[String(volume.value)];
    });

    return serializedRow;
  });
}

export function gridRowsToXlsxParseResult({
  activeRows,
  deliveryTimesRows,
  pricesRows,
  thresholdsRows,
  volumes,
}: MatrixGridRowsSnapshot): JsonWorksheetParseResult {
  return {
    prices: serializeGridRows(pricesRows, volumes),
    thresholds: serializeGridRows(thresholdsRows, volumes),
    deliveryTimes: serializeGridRows(deliveryTimesRows, volumes),
    active: serializeGridRows(activeRows, volumes),
  };
}
