import { jsonToPrices } from "@/lib/json-to-prices";
import { buildCombinationAttributes } from "@/lib/combination-parsing";
import {
  buildMatrixGridRowsSnapshot,
  buildMatrixWorksheetData,
  gridRowsToXlsxParseResult,
} from "@/lib/matrix-price-worksheets";
import { Attribute, AttributeInputTypeEnum, CurrencyEnum } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

const MEMBER = {
  id: "member-1",
  name: "Admin",
};

const TIMESTAMP = Timestamp.now();

const createAttribute = ({
  id,
  optionValues,
  optionLabels,
}: {
  id: string;
  optionLabels?: string[];
  optionValues: string[];
}): Attribute => ({
  active: true,
  calculated: true,
  createdAt: TIMESTAMP,
  createdBy: MEMBER,
  format: false,
  id,
  keywords: [],
  name: id,
  options: optionValues.map((value, index) => ({
    customFormat: false,
    hidden: false,
    label: optionLabels?.[index] ?? value,
    value,
  })),
  required: false,
  trackStock: false,
  type: AttributeInputTypeEnum.DROPDOWN,
  updatedAt: TIMESTAMP,
  updatedBy: MEMBER,
});

describe("buildMatrixWorksheetData", () => {
  it("builds grid rows snapshots without worksheet export payloads", () => {
    const snapshot = buildMatrixGridRowsSnapshot({
      combinations: ["matte", "gloss"],
      optionsValueLabelPairs: {
        gloss: "Gloss",
        matte: "Matte",
      },
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "matte",
          },
          currency: CurrencyEnum.PLN,
          threshold: 0,
          value: 1200,
          volume: { deliveryTime: 3, value: 50 },
        },
        {
          combination: {
            active: true,
            customFormat: false,
            id: "gloss",
          },
          currency: CurrencyEnum.PLN,
          threshold: 200,
          value: 1800,
          volume: { deliveryTime: 5, value: 100 },
        },
      ],
      volumes: [{ value: 50 }, { value: 100 }],
    });

    expect(snapshot.pricesRows).toEqual([
      { "50": 1200, "100": "NULL", combination: "Matte" },
      { "50": "NULL", "100": 1800, combination: "Gloss" },
    ]);
    expect(snapshot.deliveryTimesRows).toEqual([
      { "50": 3, "100": 2, combination: "Matte" },
      { "50": 2, "100": 5, combination: "Gloss" },
    ]);
  });

  it("keeps threshold cells NULL for matrix prices without an explicit threshold", () => {
    const snapshot = buildMatrixGridRowsSnapshot({
      combinations: ["matte"],
      optionsValueLabelPairs: {
        matte: "Matte",
      },
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "matte",
          },
          currency: CurrencyEnum.PLN,
          value: 1200,
          volume: { deliveryTime: 3, value: 50 },
        },
      ],
      volumes: [{ value: 50 }],
    });

    expect(snapshot.thresholdsRows).toEqual([
      { "50": "NULL", combination: "Matte" },
    ]);
  });

  it("renders readable labels for hyphenated option values", () => {
    const snapshot = buildMatrixGridRowsSnapshot({
      attributeDependencies: {},
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish"],
        attributeOptions: {
          finish: ["gloss-front"],
          paper: ["matt-150g"],
        },
        attributes: [
          createAttribute({
            id: "paper",
            optionLabels: ["Matte 150g"],
            optionValues: ["matt-150g"],
          }),
          createAttribute({
            id: "finish",
            optionLabels: ["Gloss front"],
            optionValues: ["gloss-front"],
          }),
        ],
      }),
      combinations: ["matt-150g-gloss-front"],
      optionsValueLabelPairs: {
        "gloss-front": "Gloss front",
        "matt-150g": "Matte 150g",
      },
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "matt-150g-gloss-front",
          },
          currency: CurrencyEnum.PLN,
          threshold: 0,
          value: 1200,
          volume: { deliveryTime: 3, value: 50 },
        },
      ],
      volumes: [{ value: 50 }],
    });

    expect(snapshot.pricesRows).toEqual([
      { "50": 1200, combination: "Matte 150g, Gloss front" },
    ]);
  });

  it("creates worksheet rows for matrix prices without rebuilding them on the main thread", () => {
    const worksheetData = buildMatrixWorksheetData({
      combinations: ["matte", "gloss"],
      optionsValueLabelPairs: {
        gloss: "Gloss",
        matte: "Matte",
      },
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "matte",
          },
          currency: CurrencyEnum.PLN,
          threshold: 0,
          value: 1200,
          volume: { deliveryTime: 3, value: 50 },
        },
        {
          combination: {
            active: false,
            customFormat: false,
            id: "matte",
          },
          currency: CurrencyEnum.PLN,
          value: null,
          volume: { deliveryTime: 4, value: 100 },
        },
        {
          combination: {
            active: true,
            customFormat: false,
            id: "gloss",
          },
          currency: CurrencyEnum.PLN,
          threshold: 100,
          value: 1500,
          volume: { deliveryTime: 2, value: 50 },
        },
        {
          combination: {
            active: true,
            customFormat: false,
            id: "gloss",
          },
          currency: CurrencyEnum.PLN,
          threshold: 200,
          value: 1800,
          volume: { deliveryTime: 5, value: 100 },
        },
      ],
      volumes: [{ value: 50 }, { value: 100 }],
    });

    expect(worksheetData.pricesRowData).toEqual([
      ["combination", 50, 100],
      ["Matte", 1200, "NULL"],
      ["Gloss", 1500, 1800],
    ]);
    expect(worksheetData.activeRows).toEqual([
      { "50": "TRUE", "100": "FALSE", combination: "Matte" },
      { "50": "TRUE", "100": "TRUE", combination: "Gloss" },
    ]);
  });

  it("round-trips generated grid rows back into prices", () => {
    const worksheetData = buildMatrixWorksheetData({
      combinations: ["matte", "gloss"],
      optionsValueLabelPairs: {
        gloss: "Gloss",
        matte: "Matte",
      },
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "matte",
          },
          currency: CurrencyEnum.PLN,
          threshold: 0,
          value: 1200,
          volume: { deliveryTime: 3, value: 50 },
        },
        {
          combination: {
            active: false,
            customFormat: false,
            id: "matte",
          },
          currency: CurrencyEnum.PLN,
          value: null,
          volume: { deliveryTime: 4, value: 100 },
        },
        {
          combination: {
            active: true,
            customFormat: false,
            id: "gloss",
          },
          currency: CurrencyEnum.PLN,
          threshold: 100,
          value: 1500,
          volume: { deliveryTime: 2, value: 50 },
        },
        {
          combination: {
            active: true,
            customFormat: false,
            id: "gloss",
          },
          currency: CurrencyEnum.PLN,
          threshold: 200,
          value: 1800,
          volume: { deliveryTime: 5, value: 100 },
        },
      ],
      volumes: [{ value: 50 }, { value: 100 }],
    });

    const result = jsonToPrices({
      attributes: [],
      memoizedCombinations: ["matte", "gloss"],
      optionsLabelValuePairs: {
        Gloss: "gloss",
        Matte: "matte",
      },
      volumes: [{ value: 50 }, { value: 100 }],
      watchAttributes: [],
      xlsxParseResult: gridRowsToXlsxParseResult({
        activeRows: worksheetData.activeRows,
        deliveryTimesRows: worksheetData.deliveryTimesRows,
        pricesRows: worksheetData.pricesRows,
        thresholdsRows: worksheetData.thresholdsRows,
        volumes: [{ value: 50 }, { value: 100 }],
      }),
    });

    expect(result.error).toBeNull();
    expect(
      result.data.map((price) => ({
        active: price.combination?.active,
        combination: price.combination?.id,
        deliveryTime: price.volume?.deliveryTime,
        threshold: price.threshold,
        value: price.value,
        volume: price.volume?.value,
      })),
    ).toEqual([
      {
        active: true,
        combination: "matte",
        deliveryTime: 3,
        threshold: 0,
        value: 1200,
        volume: 50,
      },
      {
        active: false,
        combination: "matte",
        deliveryTime: 4,
        threshold: undefined,
        value: null,
        volume: 100,
      },
      {
        active: true,
        combination: "gloss",
        deliveryTime: 2,
        threshold: 100,
        value: 1500,
        volume: 50,
      },
      {
        active: true,
        combination: "gloss",
        deliveryTime: 5,
        threshold: 200,
        value: 1800,
        volume: 100,
      },
    ]);
  });

  it("round-trips generated grid rows when label-to-value mapping is ambiguous", () => {
    const worksheetData = buildMatrixWorksheetData({
      combinations: ["mat150-uvCoating"],
      optionsValueLabelPairs: {
        mat150: "Matte 150",
        uvCoating: "UV",
        uvFoil: "UV",
      },
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "mat150-uvCoating",
          },
          currency: CurrencyEnum.PLN,
          threshold: 50,
          value: 1200,
          volume: { deliveryTime: 3, value: 50 },
        },
      ],
      volumes: [{ value: 50 }],
    });

    const result = jsonToPrices({
      attributes: [],
      memoizedCombinations: ["mat150-uvCoating"],
      optionsLabelValuePairs: {
        "Matte 150": "mat150",
        UV: "uvFoil",
      },
      volumes: [{ value: 50 }],
      watchAttributes: [],
      xlsxParseResult: gridRowsToXlsxParseResult({
        activeRows: worksheetData.activeRows,
        deliveryTimesRows: worksheetData.deliveryTimesRows,
        pricesRows: worksheetData.pricesRows,
        thresholdsRows: worksheetData.thresholdsRows,
        volumes: [{ value: 50 }],
      }),
    });

    expect(result.error).toBeNull();
    expect(
      result.data.map((price) => ({
        active: price.combination?.active,
        combination: price.combination?.id,
        deliveryTime: price.volume?.deliveryTime,
        threshold: price.threshold,
        value: price.value,
        volume: price.volume?.value,
      })),
    ).toEqual([
      {
        active: true,
        combination: "mat150-uvCoating",
        deliveryTime: 3,
        threshold: 50,
        value: 1200,
        volume: 50,
      },
    ]);
  });
});
