import { jsonToPrices } from "@/lib/json-to-prices";
import {
  Attribute,
  AttributeInputTypeEnum,
  PriceTypeEnum,
} from "@konfi/types";
import { calcPrice } from "@konfi/utils";
import { Timestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MEMBER = {
  id: "member-1",
  name: "Admin",
};

const NOW = Timestamp.now();

function createAttribute(options?: {
  attributeId?: string;
  attributeName?: string;
  format?: boolean;
  optionLabel?: string;
  optionValue?: string;
  optionCustomFormat?: boolean;
}): Attribute {
  return {
    id: options?.attributeId ?? "format",
    name: options?.attributeName ?? "Format",
    active: true,
    calculated: true,
    createdAt: NOW,
    createdBy: MEMBER,
    format: options?.format ?? false,
    keywords: [],
    options: [
      {
        customFormat: options?.optionCustomFormat ?? false,
        hidden: false,
        label: options?.optionLabel ?? "DL",
        value: options?.optionValue ?? "dl",
      },
    ],
    required: false,
    trackStock: false,
    type: AttributeInputTypeEnum.DROPDOWN,
    updatedAt: NOW,
    updatedBy: MEMBER,
  };
}

describe("jsonToPrices", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forces inactive single matrix entries when the price cell is NULL", () => {
    const result = jsonToPrices({
      attributes: [createAttribute()],
      memoizedCombinations: ["dl"],
      optionsLabelValuePairs: {
        DL: "dl",
      },
      volumes: [{ value: 100 }],
      watchAttributes: ["format"],
      xlsxParseResult: {
        active: [{ 100: true, combination: "DL" }],
        deliveryTimes: [{ 100: 3, combination: "DL" }],
        prices: [{ 100: "NULL", combination: "DL" }],
        thresholds: [{ 100: "NULL", combination: "DL" }],
      },
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      combination: {
        active: false,
        id: "dl",
      },
      value: null,
    });
  });

  it("forces inactive only for null entries inside multi-value cells", () => {
    const result = jsonToPrices({
      attributes: [createAttribute()],
      memoizedCombinations: ["dl"],
      optionsLabelValuePairs: {
        DL: "dl",
      },
      volumes: [{ value: 100 }],
      watchAttributes: ["format"],
      xlsxParseResult: {
        active: [{ 100: "true,true,true", combination: "DL" }],
        deliveryTimes: [{ 100: "2,3,4", combination: "DL" }],
        prices: [{ 100: "10,NULL,30", combination: "DL" }],
        thresholds: [{ 100: "1,100,200", combination: "DL" }],
      },
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(3);
    expect(result.data.map((price) => price.value)).toEqual([10, null, 30]);
    expect(result.data.map((price) => price.combination?.active)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("keeps matrix thresholds undefined when the worksheet threshold cell is NULL", () => {
    const result = jsonToPrices({
      attributes: [createAttribute()],
      memoizedCombinations: ["dl"],
      optionsLabelValuePairs: {
        DL: "dl",
      },
      volumes: [{ value: 100 }, { value: 200 }],
      watchAttributes: ["format"],
      xlsxParseResult: {
        active: [{ 100: true, 200: true, combination: "DL" }],
        deliveryTimes: [{ 100: 3, 200: 4, combination: "DL" }],
        prices: [{ 100: 1500, 200: 2400, combination: "DL" }],
        thresholds: [{ 100: "NULL", 200: "NULL", combination: "DL" }],
      },
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
    expect(result.data.map((price) => price.threshold)).toEqual([
      undefined,
      undefined,
    ]);

    const priceResult = calcPrice(
      1,
      result.data,
      PriceTypeEnum.MATRIX,
      0,
      "dl",
      200,
      false,
      0,
      0,
      1,
    );

    expect(priceResult.error).toBeUndefined();
    expect(priceResult.result).toBeGreaterThan(0);
  });

  it("preserves thresholded custom-format matrix values instead of zeroing them", () => {
    const result = jsonToPrices({
      attributeDependencies: {},
      combinationAttributes: [
        {
          id: "format",
          calculated: true,
          options: [
            {
              value: "custom",
              label: "Custom",
              customFormat: true,
            },
          ],
        },
      ],
      attributes: [
        createAttribute({
          format: true,
          optionLabel: "Custom",
          optionValue: "custom",
          optionCustomFormat: true,
        }),
      ],
      memoizedCombinations: ["custom"],
      optionsLabelValuePairs: {
        Custom: "custom",
      },
      volumes: [{ value: 100 }],
      watchAttributes: ["format"],
      xlsxParseResult: {
        active: [{ 100: "true,true,true", combination: "Custom" }],
        deliveryTimes: [{ 100: "2,3,4", combination: "Custom" }],
        prices: [{ 100: "10000,8000,6000", combination: "Custom" }],
        thresholds: [{ 100: "0,100,200", combination: "Custom" }],
      },
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(3);
    expect(
      result.data.map((price) => ({
        active: price.combination?.active,
        customFormat: price.combination?.customFormat,
        deliveryTime: price.volume?.deliveryTime,
        threshold: price.threshold,
        value: price.value,
      })),
    ).toEqual([
      {
        active: true,
        customFormat: true,
        deliveryTime: 2,
        threshold: 0,
        value: 10000,
      },
      {
        active: true,
        customFormat: true,
        deliveryTime: 3,
        threshold: 100,
        value: 8000,
      },
      {
        active: true,
        customFormat: true,
        deliveryTime: 4,
        threshold: 200,
        value: 6000,
      },
    ]);
  });
});
