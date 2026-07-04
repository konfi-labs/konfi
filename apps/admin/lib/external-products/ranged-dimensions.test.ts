import { CurrencyEnum, type ExternalAttribute } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  buildRangedDimensionMatrixPrices,
  buildRangedDimensionSpec,
  buildSampledRangedDimensionValues,
  inferExternalRangedDimensions,
} from "./ranged-dimensions";

describe("ranged dimension helpers", () => {
  const attributes: ExternalAttribute[] = [
    {
      id: "shapeWidth",
      name: "Width",
      values: [],
      affectsPricing: true,
      numberConfig: {
        minimum: 100,
        maximum: 500,
        step: 200,
      },
    },
    {
      id: "shapeHeight",
      name: "Height",
      values: [],
      affectsPricing: true,
      numberConfig: {
        minimum: 50,
        maximum: 250,
        step: 100,
      },
    },
    {
      id: "finish",
      name: "Finish",
      values: ["matte", "gloss"],
      affectsPricing: true,
    },
  ];

  it("infers width and height numeric ranges", () => {
    const dimensions = inferExternalRangedDimensions(attributes);

    expect(dimensions).not.toBeNull();
    expect(dimensions?.width.attribute.name).toBe("Width");
    expect(dimensions?.width.minimum).toBe(100);
    expect(dimensions?.width.maximum).toBe(500);
    expect(dimensions?.width.step).toBe(200);
    expect(dimensions?.height.attribute.name).toBe("Height");
    expect(dimensions?.height.minimum).toBe(50);
    expect(dimensions?.height.maximum).toBe(250);
    expect(dimensions?.height.step).toBe(100);
  });

  it("samples numeric width and height values for supplier fetches", () => {
    const dimensions = inferExternalRangedDimensions(attributes);

    expect(dimensions).not.toBeNull();
    expect(
      dimensions ? buildSampledRangedDimensionValues(dimensions.width) : [],
    ).toEqual(["100", "300", "500"]);
    expect(
      dimensions ? buildSampledRangedDimensionValues(dimensions.height) : [],
    ).toEqual(["50", "150", "250"]);
  });

  it("builds custom-size product spec fields from inferred dimensions", () => {
    const dimensions = inferExternalRangedDimensions(attributes);

    expect(dimensions).not.toBeNull();
    expect(
      dimensions ? buildRangedDimensionSpec(dimensions) : undefined,
    ).toEqual({
      minimumWidth: 100,
      maximumWidth: 500,
      widthStep: 200,
      minimumHeight: 50,
      maximumHeight: 250,
      heightStep: 100,
    });
  });

  it("converts sampled ranged-dimension configurations into matrix thresholds", () => {
    const dimensions = inferExternalRangedDimensions(attributes);

    expect(dimensions).not.toBeNull();

    const prices = buildRangedDimensionMatrixPrices({
      configurations: [
        {
          configuration: {
            Width: "100",
            Height: "100",
            Finish: "matte",
          },
          priceRanges: [
            {
              deliveryTime: 4,
              quantity: 100,
              price: 55,
            },
            {
              deliveryTime: 5,
              quantity: 200,
              price: 45,
            },
          ],
        },
        {
          configuration: {
            Width: "300",
            Height: "100",
            Finish: "matte",
          },
          priceRanges: [
            {
              deliveryTime: 6,
              quantity: 100,
              price: 150,
            },
          ],
        },
        {
          configuration: {
            Width: "100",
            Height: "100",
            Finish: "gloss",
          },
          priceRanges: [
            {
              deliveryTime: 3,
              quantity: 100,
              price: 60,
            },
          ],
        },
      ],
      currency: CurrencyEnum.PLN,
      dimensions: dimensions!,
      resolveCombinationId: (configuration) => configuration.Finish ?? null,
    });

    expect(
        prices.map((price) => ({
          combination: price.combination?.id,
          customFormat: price.combination?.customFormat,
          deliveryTime: price.volume?.deliveryTime,
          threshold: price.threshold,
          value: price.value,
          volume: price.volume?.value,
        })),
    ).toEqual([
        {
          combination: "gloss",
          customFormat: false,
          deliveryTime: 3,
          threshold: 1,
          value: 6000,
          volume: 100,
        },
        {
          combination: "matte",
          customFormat: false,
          deliveryTime: 4,
          threshold: 1,
          value: 5500,
          volume: 100,
        },
        {
          combination: "matte",
          customFormat: false,
          deliveryTime: 5,
          threshold: 2,
          value: 5000,
          volume: 200,
        },
        {
          combination: "matte",
          customFormat: false,
          deliveryTime: 6,
          threshold: 3,
          value: 5000,
          volume: 100,
      },
    ]);
  });
});
