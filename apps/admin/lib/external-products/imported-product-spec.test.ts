import type { ExternalAttribute } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { buildImportedProductSpec } from "./imported-product-spec";
import { inferExternalRangedDimensions } from "./ranged-dimensions";

describe("buildImportedProductSpec", () => {
  it("keeps imported products image-free", () => {
    expect(
      buildImportedProductSpec({
        defaultOrder: 25,
      }),
    ).toEqual({
      images: [],
      defaultOrder: 25,
      minimumOrder: 25,
      maximumOrder: 10000,
      step: 1,
    });
  });

  it("adds ranged dimension fields without reusing external images", () => {
    const dimensions = inferExternalRangedDimensions([
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
    ] satisfies ExternalAttribute[]);

    expect(dimensions).not.toBeNull();
    expect(
      buildImportedProductSpec({
        defaultOrder: 100,
        rangedDimensions: dimensions,
      }),
    ).toEqual({
      images: [],
      defaultOrder: 100,
      minimumOrder: 100,
      maximumOrder: 10000,
      step: 1,
      minimumWidth: 100,
      maximumWidth: 500,
      widthStep: 200,
      minimumHeight: 50,
      maximumHeight: 250,
      heightStep: 100,
    });
  });
});
